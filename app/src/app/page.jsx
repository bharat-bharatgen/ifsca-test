"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Redirect all users to /global-chat
    router.push("/global-chat");
  }, [router]);

  return null;
}
