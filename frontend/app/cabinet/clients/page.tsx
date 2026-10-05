"use client";

import { PracticePartiesPage } from "@/modules/practice/pages/parties";

export default function Page() {
  return (
    <PracticePartiesPage
      kind="client"
      homeHref="/cabinet"
      moduleLabel="Cabinet Flow"
      hideCommerce
      openHref={(id) => `/cabinet/clients/file?id=${id}`}
      blurb="Same clients as Work Flow. Open a card for the job library. Quotes and invoices stay on the Work Flow desk."
    />
  );
}
