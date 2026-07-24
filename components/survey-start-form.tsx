"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ClipboardList, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { API_BASE_URL, apiFetch } from "@/lib/api";

interface SurveyQuestion {
  id: string;
  question: string;
  questionType: string;
  options: string[] | null;
}

type AnswerValue = string | string[];
type Status = "loading" | "form" | "redirecting" | "error";

// Gate shown when a respondent opens a vendor's personalized portal link -
// see SurveyRouterController.startProjectForVendor (backend), which redirects
// here with pid/vendorId/uid before the actual survey start. Answers get
// stored against exactly that (project, vendor, uid) triple, then the backend
// hands back wherever the respondent should go next (the client's real
// survey link, or the vendor's own block link if they're not eligible).
export function SurveyStartForm() {
  const searchParams = useSearchParams();
  const pid = searchParams.get("pid");
  const vendorId = searchParams.get("vendorId");
  const uid = searchParams.get("uid");

  const missingParams = !pid || !vendorId || !uid;

  // Computed once at mount from URL params, not set reactively in the effect
  // below - there's nothing to "synchronize with an external system" here,
  // it's a pure derived value already known at render time.
  const [status, setStatus] = useState<Status>(() => (missingParams ? "error" : "loading"));
  const [errorMessage, setErrorMessage] = useState(() =>
    missingParams ? "This link is missing required information. Please request a new link." : ""
  );
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [submitting, setSubmitting] = useState(false);

  const goTo = (url: string) => {
    setStatus("redirecting");
    window.location.href = url;
  };

  // Used both when the questions endpoint reports this attempt already has
  // stored answers, and when there are no questions to ask at all - either
  // way the respondent shouldn't be stuck looking at an empty/duplicate form.
  const continueToSurvey = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/public/survey/continue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pid, vendorId, uid }),
        trackActivity: false,
      });
      const data = await res.json();
      if (data.success && data.redirectUrl) {
        goTo(data.redirectUrl);
      } else {
        setErrorMessage(data.message || "Unable to continue to the survey.");
        setStatus("error");
      }
    } catch (err) {
      console.error("Error continuing to survey", err);
      setErrorMessage("Error connecting to the server.");
      setStatus("error");
    }
  }, [pid, vendorId, uid]);

  useEffect(() => {
    if (missingParams) return;

    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({ pid, vendorId, uid });
        const res = await apiFetch(`${API_BASE_URL}/api/public/survey/questions?${params.toString()}`, {
          trackActivity: false,
        });
        const data = await res.json();
        if (cancelled) return;

        if (!data.success) {
          setErrorMessage(data.message || "Unable to load this survey.");
          setStatus("error");
          return;
        }

        const loadedQuestions: SurveyQuestion[] = data.questions || [];
        if (data.alreadyAnswered || loadedQuestions.length === 0) {
          await continueToSurvey();
          return;
        }

        setQuestions(loadedQuestions);
        setStatus("form");
      } catch (err) {
        if (cancelled) return;
        console.error("Error loading survey questions", err);
        setErrorMessage("Error connecting to the server.");
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid, vendorId, uid]);

  const setTextAnswer = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const toggleMultipleChoice = (questionId: string, option: string, checked: boolean) => {
    setAnswers((prev) => {
      const current = Array.isArray(prev[questionId]) ? (prev[questionId] as string[]) : [];
      const next = checked ? [...current, option] : current.filter((o) => o !== option);
      return { ...prev, [questionId]: next };
    });
  };

  const isAnswered = (q: SurveyQuestion) => {
    const value = answers[q.id];
    if (Array.isArray(value)) return value.length > 0;
    return typeof value === "string" && value.trim().length > 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (questions.some((q) => !isAnswered(q))) {
      toast.error("Please answer every question before continuing.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/public/survey/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pid, vendorId, uid, answers }),
        trackActivity: false,
      });
      const data = await res.json();
      if (data.success && data.redirectUrl) {
        goTo(data.redirectUrl);
      } else {
        toast.error(data.message || "Failed to submit your answers.");
        setSubmitting(false);
      }
    } catch (err) {
      console.error("Error submitting survey answers", err);
      toast.error("Error connecting to the server.");
      setSubmitting(false);
    }
  };

  if (status === "loading" || status === "redirecting") {
    return (
      <div className="flex flex-col items-center gap-3 text-zinc-500">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="text-sm font-medium">
          {status === "redirecting" ? "Redirecting you to the survey..." : "Loading..."}
        </span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <span className="mx-auto text-xl font-bold bg-gradient-to-r from-zinc-700 to-zinc-900 bg-clip-text text-transparent dark:from-zinc-200 dark:to-zinc-50">
            A2B SURVEY
          </span>
          <CardTitle className="mt-2">Something went wrong</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>Unable to continue</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader className="text-center">
        <span className="mx-auto text-xl font-bold bg-gradient-to-r from-zinc-700 to-zinc-900 bg-clip-text text-transparent dark:from-zinc-200 dark:to-zinc-50">
          A2B SURVEY
        </span>
        <CardTitle className="mt-2 flex items-center justify-center gap-2">
          <ClipboardList className="h-5 w-5 text-zinc-500" />
          Before you continue
        </CardTitle>
        <CardDescription>Please answer the following questions to proceed to the survey.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="flex flex-col gap-6">
          {questions.map((q, index) => (
            <div key={q.id} className="flex flex-col gap-2">
              <Label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                {index + 1}. {q.question}
              </Label>

              {q.questionType === "text" && (
                <Textarea
                  value={(answers[q.id] as string) || ""}
                  onChange={(e) => setTextAnswer(q.id, e.target.value)}
                  rows={3}
                  placeholder="Type your answer"
                />
              )}

              {q.questionType === "single_choice" && (
                <RadioGroup
                  value={(answers[q.id] as string) || ""}
                  onValueChange={(value) => setTextAnswer(q.id, String(value))}
                >
                  {(q.options || []).map((option) => (
                    <label key={option} className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                      <RadioGroupItem value={option} />
                      {option}
                    </label>
                  ))}
                </RadioGroup>
              )}

              {q.questionType === "multiple_choice" && (
                <div className="flex flex-col gap-2">
                  {(q.options || []).map((option) => {
                    const selected =
                      Array.isArray(answers[q.id]) && (answers[q.id] as string[]).includes(option);
                    return (
                      <label key={option} className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                        <Checkbox
                          checked={selected}
                          onCheckedChange={(checked) => toggleMultipleChoice(q.id, option, checked === true)}
                        />
                        {option}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={submitting} className="w-full flex items-center gap-1.5">
            {submitting && <Loader2 size={14} className="animate-spin" />}
            <span>Continue to Survey</span>
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
