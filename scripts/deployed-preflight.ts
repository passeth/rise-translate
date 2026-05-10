import { getClientEnv } from "@/lib/env";

export type DeployedPreflightPayload = {
  ok?: boolean;
  summary?: {
    severity?: string;
    message?: string;
  };
  checks?: Array<{
    id: string;
    label: string;
    severity: string;
    message: string;
    action?: string;
  }>;
  error?: string;
};

export async function runDeployedPreflight(baseUrl = getClientEnv().NEXT_PUBLIC_APP_URL, token = process.env.INTERNAL_WORKER_TOKEN) {
  if (!token) {
    throw new Error("INTERNAL_WORKER_TOKEN is required to run deployed preflight.");
  }

  const url = new URL("/api/internal/preflight", baseUrl);
  const response = await fetch(url, {
    cache: "no-store",
    headers: { authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Deployed preflight failed with HTTP ${response.status} at ${url.toString()}`);
  }

  const payload = (await response.json()) as DeployedPreflightPayload;
  if (!payload.summary || !Array.isArray(payload.checks)) {
    throw new Error("Deployed preflight returned an unexpected payload.");
  }

  console.log(`Deployed preflight: ${payload.summary.severity?.toUpperCase() ?? "UNKNOWN"}`);
  console.log(payload.summary.message ?? "No summary message.");

  for (const check of payload.checks) {
    if (check.severity === "blocked" || check.severity === "warning") {
      console.log(`- [${check.severity}] ${check.label}: ${check.message}`);
      if (check.action) console.log(`  Next: ${check.action}`);
    }
  }

  if (payload.summary.severity === "blocked") {
    throw new Error("Deployed preflight has production readiness blockers.");
  }

  return payload;
}

async function main() {
  await runDeployedPreflight();
}

if (process.argv[1]?.endsWith("deployed-preflight.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Deployed preflight failed.");
    process.exitCode = 1;
  });
}
