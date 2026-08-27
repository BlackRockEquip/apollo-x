"use client";

import { useRouter } from "next/navigation";

export function SupportExitButton() {
  const router = useRouter();
  async function exit() {
    const response = await fetch("/api/v1/platform/support-context", { method: "DELETE" });
    const body = await response.json();
    router.replace(body.destination ?? "/platform");
    router.refresh();
  }
  return <button className="support-exit" onClick={exit}>Exit company context</button>;
}
