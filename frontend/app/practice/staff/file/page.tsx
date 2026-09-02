import { Suspense } from "react";
import { PracticeStaffFilePage } from "@/modules/practice/pages/staff-file";

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Opening staff file…</p>}>
      <PracticeStaffFilePage />
    </Suspense>
  );
}
