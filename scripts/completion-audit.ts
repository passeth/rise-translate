import { readFileSync } from "node:fs";
import { formatReadinessSummary, summarizeReadinessResults, type ReadinessGateResult } from "./readiness-report";

export type CompletionAuditRequirement = {
  id: string;
  criterion: string;
  evidence: string;
  status: "covered" | "blocked";
};

export function buildCompletionAudit(results: ReadinessGateResult[]): CompletionAuditRequirement[] {
  const failedIds = new Set(summarizeReadinessResults(results).failed.map((result) => result.id));

  return [
    {
      id: "code-quality",
      criterion: "Code is linted, typechecked, tested, and production-buildable.",
      evidence: "pnpm verify",
      status: failedIds.has("verify") ? "blocked" : "covered",
    },
    {
      id: "production-env",
      criterion: "Local and deployed production environments are complete and safe for buyer invitation links and media permissions.",
      evidence: "pnpm preflight, pnpm env:check web, pnpm env:check worker, pnpm deployment:smoke, pnpm deployed:preflight",
      status:
        failedIds.has("preflight") ||
        failedIds.has("web-env-check") ||
        failedIds.has("worker-env-check") ||
        failedIds.has("deployment-smoke") ||
        failedIds.has("deployed-preflight")
          ? "blocked"
          : "covered",
    },
    {
      id: "provider-access",
      criterion: "LiveKit, OpenAI Realtime Translation, and Supabase schema are reachable with configured credentials.",
      evidence: "pnpm livekit:smoke, pnpm openai:smoke, pnpm supabase:schema:smoke",
      status:
        failedIds.has("livekit-smoke") || failedIds.has("openai-smoke") || failedIds.has("supabase-schema-smoke")
          ? "blocked"
          : "covered",
    },
    {
      id: "recording",
      criterion: "Recording storage accepts S3 write/read/delete before LiveKit Egress QA.",
      evidence: "pnpm recording:storage:smoke",
      status: failedIds.has("recording-storage-smoke") ? "blocked" : "covered",
    },
    {
      id: "server-translation-worker",
      criterion: "Server translation worker starts in livekit-node mode and a long-running worker process is active for LiveKit sessions.",
      evidence: "pnpm translation:worker:smoke, pnpm translation:worker:status",
      status: failedIds.has("translation-worker-smoke") || failedIds.has("translation-worker-status") ? "blocked" : "covered",
    },
    {
      id: "live-buyer-meeting-evidence",
      criterion: "Two-device LiveKit QA proves real translated audio, captions, notes, recording, and cleanup.",
      evidence: "pnpm liveqa:check",
      status: failedIds.has("liveqa-check") ? "blocked" : "covered",
    },
  ];
}

export function formatCompletionAudit(results: ReadinessGateResult[]) {
  const readiness = summarizeReadinessResults(results);
  const requirements = buildCompletionAudit(results);
  const blocked = requirements.filter((requirement) => requirement.status === "blocked");
  const lines = [
    "Completion audit — realtime translation meeting app",
    `Decision: ${blocked.length === 0 && readiness.status === "ready" ? "COMPLETE" : "NOT COMPLETE"}`,
    formatReadinessSummary(results),
    "",
    "Requirement coverage:",
  ];

  for (const requirement of requirements) {
    lines.push(`- [${requirement.status}] ${requirement.criterion}`);
    lines.push(`  Evidence: ${requirement.evidence}`);
  }

  if (blocked.length > 0) {
    lines.push("", "Blocked requirements:");
    for (const requirement of blocked) {
      lines.push(`- ${requirement.id}: ${requirement.criterion}`);
    }
  }

  return lines.join("\n");
}

if (process.argv[1]?.endsWith("completion-audit.ts")) {
  const jsonPath = process.argv[2];
  if (!jsonPath) {
    console.error("Usage: pnpm completion:audit <readiness-results.json>");
    process.exitCode = 2;
  } else {
    const payload = JSON.parse(readFileSync(jsonPath, "utf8")) as { results?: ReadinessGateResult[] };
    const results = payload.results ?? [];
    const formatted = formatCompletionAudit(results);
    console.log(formatted);
    process.exitCode = summarizeReadinessResults(results).status === "ready" ? 0 : 1;
  }
}
