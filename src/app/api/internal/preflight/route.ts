import { NextResponse, type NextRequest } from "next/server";
import { isInternalWorkerAuthorized } from "@/server/operations/internal-auth";
import { getProductionReadinessChecks, summarizeProductionReadiness } from "@/server/operations/preflight";

export const dynamic = "force-dynamic";

type SafeReadinessCheck = {
  id: string;
  label: string;
  severity: "ok" | "warning" | "blocked";
  message: string;
  action?: string;
};

export async function GET(request: NextRequest) {
  if (!isInternalWorkerAuthorized({
    authorizationHeader: request.headers.get("authorization"),
    expectedToken: process.env.INTERNAL_WORKER_TOKEN,
  })) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const checks = getProductionReadinessChecks().map(toSafeCheck);
  const summary = summarizeProductionReadiness(checks);

  return NextResponse.json({
    ok: summary.severity !== "blocked",
    summary,
    checks,
  });
}

function toSafeCheck(check: SafeReadinessCheck): SafeReadinessCheck {
  return {
    id: check.id,
    label: check.label,
    severity: check.severity,
    message: check.message,
    action: check.action,
  };
}
