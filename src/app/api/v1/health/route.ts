import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ application: "Apollo X", status: "ok", version: "0.1.0" });
}
