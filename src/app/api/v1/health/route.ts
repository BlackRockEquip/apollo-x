import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ application: "Flo X Integrations", status: "ok", version: "0.1.0" });
}
