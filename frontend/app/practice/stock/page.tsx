"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Old Stock URL — send people to Products. */
export default function Page() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/practice/products");
  }, [router]);
  return null;
}

