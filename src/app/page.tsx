import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const context = await getRequestContext();
  redirect(context?.companyId ? "/dashboard" : context ? "/platform" : "/login");
}
