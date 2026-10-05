import { Suspense } from "react";
import { CabinetClientFilePage } from "@/modules/cabinet/pages/client-file";

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Opening client…</p>}>
      <CabinetClientFilePage />
    </Suspense>
  );
}
