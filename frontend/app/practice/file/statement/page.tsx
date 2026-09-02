import { Suspense } from "react";
import { PracticeStatementPage } from "@/modules/practice/pages/statement";

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Pulling statement…</p>}>
      <PracticeStatementPage />
    </Suspense>
  );
}
