import { Suspense } from "react";
import { PracticeClientFilePage } from "@/modules/practice/pages/client-file";

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Opening client file…</p>}>
      <PracticeClientFilePage />
    </Suspense>
  );
}
