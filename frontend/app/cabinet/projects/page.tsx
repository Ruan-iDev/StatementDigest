"use client";

import { PracticeProjectsPage } from "@/modules/practice/pages/projects";

export default function Page() {
  return (
    <PracticeProjectsPage
      homeHref="/cabinet"
      moduleLabel="Cabinet Flow"
      fileHref={(id) => `/cabinet/projects/file?id=${id}`}
      blurb="Same project folders as Work Flow. Open one to see the jobs assigned to it. The money trail stays on the Work Flow file."
    />
  );
}
