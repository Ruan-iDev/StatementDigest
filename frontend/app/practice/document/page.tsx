import { Suspense } from "react";
import { PracticeDocumentEditorPage } from "@/modules/practice/pages/document-editor";

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Opening document…</p>}>
      <PracticeDocumentEditorPage />
    </Suspense>
  );
}
