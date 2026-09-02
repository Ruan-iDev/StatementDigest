import { Suspense } from "react";
import { PracticeConfigurationPage } from "@/modules/practice/pages/configuration";

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading configuration…</p>}>
      <PracticeConfigurationPage />
    </Suspense>
  );
}
