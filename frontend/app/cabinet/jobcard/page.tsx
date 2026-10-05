import { Suspense } from "react";
import { CabinetJobcardPage } from "@/modules/cabinet/pages/jobcard";

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Opening jobcard…</p>}>
      <CabinetJobcardPage />
    </Suspense>
  );
}
