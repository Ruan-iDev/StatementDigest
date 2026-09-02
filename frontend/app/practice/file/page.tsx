import { Suspense } from "react";
import { PracticeProjectFilePage } from "@/modules/practice/pages/project-file";

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Opening project file…</p>}>
      <PracticeProjectFilePage />
    </Suspense>
  );
}
