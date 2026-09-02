import { Suspense } from "react";
import { PracticeSupplierFilePage } from "@/modules/practice/pages/supplier-file";

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Opening supplier statement…</p>}>
      <PracticeSupplierFilePage />
    </Suspense>
  );
}
