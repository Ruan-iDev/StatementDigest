"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Bank setup lives on Upload → Step 1 (“Select your bank”).
 * This route is kept so old bookmarks do not 404.
 */
export default function BankProfilesPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/upload");
  }, [router]);

  return (
    <p className="text-sm text-muted-foreground">
      Redirecting to Upload — choose your bank there…
    </p>
  );
}
