import { Suspense } from "react";
import { CabinetProjectFilePage } from "@/modules/cabinet/pages/project-file";

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Opening project…</p>}>
      <CabinetProjectFilePage />
    </Suspense>
  );
}
