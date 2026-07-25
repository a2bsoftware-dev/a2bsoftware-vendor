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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { API_BASE_URL, apiFetch } from "@/lib/api";

interface SurveyQuestion {
  id: string;
  question: string;
  questionType: string;
  options: string[] | null;
  required: boolean;
  helpText: string | null;
  allowOther: boolean;
  minValue: number | null;
  maxValue: number | null;
}

type AnswerValue = string | string[];
type Status = "loading" | "form" | "redirecting" | "error" | "blocked";

// Sentinel stored in `answers` while "Other" is selected for a choice-type
// question - swapped out for the respondent's actual typed text (from
// `otherText`) right before submitting, so the backend only ever sees real
// answer text, never this internal marker.
const OTHER_VALUE = "__other__";

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
  // Free text typed for an "Other" selection, keyed by question id - kept
  // separate from `answers` (which holds the OTHER_VALUE sentinel while
  // selected) so the input's own value survives toggling other options on a
  // multi-select question.
  const [otherText, setOtherText] = useState<Record<string, string>>({});
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

  // An optional question (required === false) never blocks submission,
  // whether or not it's been touched. Otherwise, selecting "Other" also
  // requires the free-text specification to be non-empty - the OTHER_VALUE
  // sentinel alone isn't a real answer.
  const isAnswered = (q: SurveyQuestion) => {
    if (q.required === false) return true;
    const value = answers[q.id];
    const selectedOther = q.allowOther
      && (value === OTHER_VALUE || (Array.isArray(value) && value.includes(OTHER_VALUE)));
    if (selectedOther && !otherText[q.id]?.trim()) return false;
    if (Array.isArray(value)) return value.length > 0;
    return typeof value === "string" && value.trim().length > 0;
  };

  // Swaps the OTHER_VALUE sentinel for the respondent's actual typed text -
  // the backend (and anyone reading the stored answers later) should only
  // ever see real answer text, never this internal marker.
  const buildSubmittableAnswers = (): Record<string, AnswerValue> => {
    const result: Record<string, AnswerValue> = {};
    for (const q of questions) {
      const value = answers[q.id];
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        result[q.id] = value
          .map((v) => (v === OTHER_VALUE ? (otherText[q.id] || "").trim() : v))
          .filter((v) => v.length > 0);
      } else if (value === OTHER_VALUE) {
        result[q.id] = (otherText[q.id] || "").trim();
      } else {
        result[q.id] = value;
      }
    }
    return result;
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
        body: JSON.stringify({
          pid: pid ?? "",
          vendorId: vendorId ?? "",
          uid: uid ?? "",
          answers: buildSubmittableAnswers(),
        }),
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
          {questions.map((q, index) => {
            const otherChecked = q.allowOther
              && (answers[q.id] === OTHER_VALUE
                || (Array.isArray(answers[q.id]) && (answers[q.id] as string[]).includes(OTHER_VALUE)));

            return (
              <div key={q.id} className="flex flex-col gap-2">
                <Label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  {index + 1}. {q.question}
                  {q.required === false && (
                    <span className="ml-1.5 text-xs font-normal text-zinc-400">(optional)</span>
                  )}
                </Label>
                {q.helpText && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 -mt-1">{q.helpText}</p>
                )}

                {q.questionType === "text" && (
                  <Textarea
                    value={(answers[q.id] as string) || ""}
                    onChange={(e) => setTextAnswer(q.id, e.target.value)}
                    rows={3}
                    placeholder="Type your answer"
                  />
                )}

                {q.questionType === "number" && (
                  <Input
                    type="number"
                    value={(answers[q.id] as string) || ""}
                    onChange={(e) => setTextAnswer(q.id, e.target.value)}
                    min={q.minValue ?? undefined}
                    max={q.maxValue ?? undefined}
                    placeholder="Enter a number"
                  />
                )}

                {q.questionType === "date" && (
                  <Input
                    type="date"
                    value={(answers[q.id] as string) || ""}
                    onChange={(e) => setTextAnswer(q.id, e.target.value)}
                    className="w-full sm:w-56"
                  />
                )}

                {q.questionType === "rating" && (
                  <div className="flex flex-wrap gap-2">
                    {Array.from(
                      { length: (q.maxValue ?? 5) - (q.minValue ?? 1) + 1 },
                      (_, i) => (q.minValue ?? 1) + i
                    ).map((n) => {
                      const selected = answers[q.id] === String(n);
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setTextAnswer(q.id, String(n))}
                          className={`h-9 w-9 rounded-full border text-sm font-semibold transition-colors ${
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                          }`}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                )}

                {q.questionType === "dropdown" && (
                  <Select
                    items={[
                      ...(q.options || []).map((option) => ({ value: option, label: option })),
                      ...(q.allowOther ? [{ value: OTHER_VALUE, label: "Other" }] : []),
                    ]}
                    value={(answers[q.id] as string) || ""}
                    onValueChange={(value) => setTextAnswer(q.id, value ?? "")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select an option" />
                    </SelectTrigger>
                    <SelectContent>
                      {(q.options || []).map((option) => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                      {q.allowOther && <SelectItem value={OTHER_VALUE}>Other</SelectItem>}
                    </SelectContent>
                  </Select>
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
                    {q.allowOther && (
                      <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                        <RadioGroupItem value={OTHER_VALUE} />
                        Other
                      </label>
                    )}
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
                    {q.allowOther && (
                      <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                        <Checkbox
                          checked={otherChecked}
                          onCheckedChange={(checked) => toggleMultipleChoice(q.id, OTHER_VALUE, checked === true)}
                        />
                        Other
                      </label>
                    )}
                  </div>
                )}

                {q.allowOther && otherChecked && (
                  <Input
                    value={otherText[q.id] || ""}
                    onChange={(e) => setOtherText((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    placeholder="Please specify"
                  />
                )}
              </div>
            );
          })}
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
