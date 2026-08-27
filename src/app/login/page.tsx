import { redirect } from "next/navigation";
import { Boxes, BriefcaseBusiness, Repeat2, ShieldCheck } from "lucide-react";
import { LoginForm } from "@/components/LoginForm";
import { getRequestContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const context = await getRequestContext();
  if (context) redirect(context.companyId ? "/dashboard" : "/platform");
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="brand-mark">AX</div>
        <p className="eyebrow">Black Rock Equipment</p>
        <h1>Operations and commerce, connected.</h1>
        <p>Workshop, inventory, PEX and commercial workflows in one secure tenant platform.</p>
        <div className="login-capabilities">
          <span><BriefcaseBusiness size={17} /> Jobs & WIP</span>
          <span><Boxes size={17} /> Multi-location inventory</span>
          <span><Repeat2 size={17} /> PEX lifecycle</span>
          <span><ShieldCheck size={17} /> Tenant isolation</span>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <p className="eyebrow">Apollo X</p>
          <h2>Welcome back</h2>
          <p className="muted">Sign in with your company account.</p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
