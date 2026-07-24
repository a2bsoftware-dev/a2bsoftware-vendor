import { Suspense } from "react";
import { SurveyStartForm } from "@/components/survey-start-form";

export default function SurveyStartPage() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-zinc-50 p-4 dark:bg-zinc-950">
      <Suspense fallback={null}>
        <SurveyStartForm />
      </Suspense>
    </div>
  );
}
