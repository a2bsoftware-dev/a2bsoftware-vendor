"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Ban, ClipboardList, Loader2, TriangleAlert } from "lucide-react";
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
type Status = "loading" | "form" | "redirecting" | "error" | "blocked";

// Where a blocked respondent lands when there's no vendor-specific
// complete/disqualify/quotaFull/securityTerm link configured to send them
// to instead - a relative path, so it resolves against whichever origin
// this page itself is running on (never a fixed/hardcoded domain).
const BLOCKED_REDIRECT_PATH = "/projects";
const BLOCKED_REDIRECT_SECONDS = 3;

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

  // Missing/invalid pid, vendorId, or uid is NOT handled client-side - the
  // backend treats a malformed link as disqualified (recording it against
  // the project when one is resolvable) and returns the same {blocked:true}
  // shape as any other outcome, so it's still worth calling with whatever's
  // present (empty string for anything absent).
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [submitting, setSubmitting] = useState(false);
  const [blockedSecondsLeft, setBlockedSecondsLeft] = useState(BLOCKED_REDIRECT_SECONDS);

  const goTo = (url: string) => {
    setStatus("redirecting");
    window.location.href = url;
  };

  // A "blocked" response (quota full / already completed / disqualified
  // twice / security-terminated) is a well-formed outcome, not a failure -
  // if the vendor has their own postback link configured for it, go there
  // directly; otherwise show a dedicated card and bounce back to this
  // vendor's own project list, since there's nowhere better to send them.
  const handleBlocked = (data: { redirectUrl?: string; message?: string }) => {
    if (data.redirectUrl) {
      goTo(data.redirectUrl);
      return;
    }
    setErrorMessage(data.message || "You're not eligible to take this survey.");
    setBlockedSecondsLeft(BLOCKED_REDIRECT_SECONDS);
    setStatus("blocked");
  };

  // Used both when the questions endpoint reports this attempt already has
  // stored answers, and when there are no questions to ask at all - either
  // way the respondent shouldn't be stuck looking at an empty/duplicate form.
  const continueToSurvey = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/public/survey/continue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pid: pid ?? "", vendorId: vendorId ?? "", uid: uid ?? "" }),
        trackActivity: false,
      });
      const data = await res.json();
      if (data.blocked) {
        handleBlocked(data);
      } else if (data.success && data.redirectUrl) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid, vendorId, uid]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({ pid: pid ?? "", vendorId: vendorId ?? "", uid: uid ?? "" });
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

        if (data.blocked) {
          handleBlocked(data);
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

  // Ticks the blocked-state countdown down to 0, then leaves for this
  // vendor's own project list - a plain relative navigation, so it resolves
  // against whatever origin this page is actually running on.
  useEffect(() => {
    if (status !== "blocked") return;
    if (blockedSecondsLeft <= 0) {
      window.location.href = BLOCKED_REDIRECT_PATH;
      return;
    }
    const timer = setTimeout(() => setBlockedSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [status, blockedSecondsLeft]);

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
        body: JSON.stringify({ pid: pid ?? "", vendorId: vendorId ?? "", uid: uid ?? "", answers }),
        trackActivity: false,
      });
      const data = await res.json();
      if (data.blocked) {
        handleBlocked(data);
      } else if (data.success && data.redirectUrl) {
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

  if (status === "blocked") {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <span className="mx-auto text-xl font-bold bg-gradient-to-r from-zinc-700 to-zinc-900 bg-clip-text text-transparent dark:from-zinc-200 dark:to-zinc-50">
            A2B SURVEY
          </span>
          <CardTitle className="mt-2">Not eligible to continue</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <Ban />
            <AlertTitle>{errorMessage}</AlertTitle>
            <AlertDescription>
              Redirecting to your projects in {blockedSecondsLeft}s...
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
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
