import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";

export const dynamic = "force-dynamic";

// 2026-09-22 — public page a "forgot password" email link lands on. Mirrors
// /login's layout (a plain centered card) rather than reusing the full
// two-column login page, since there's no marketing copy to show here.
// ResetPasswordForm needs useSearchParams (to read ?token=), which Next
// requires to sit under a Suspense boundary even on a force-dynamic page.
export default function ResetPasswordPage() {
  return (
    <main className="login-panel" style={{ minHeight: "100vh" }}>
      <div className="login-card">
        <p className="eyebrow">Apollo X</p>
        <h2>Reset your password</h2>
        <p className="muted">Choose a new password for your account.</p>
        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}
