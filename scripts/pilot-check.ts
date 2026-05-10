import { spawnSync } from "node:child_process";

export type PilotGate = {
  id: string;
  label: string;
  command: string[];
};

export type PilotGateResult = PilotGate & {
  exitCode: number;
};

export function getPilotGates(): PilotGate[] {
  return [
    { id: "verify", label: "Code verification", command: ["pnpm", "verify"] },
    { id: "deployment-smoke", label: "Deployment smoke", command: ["pnpm", "deployment:smoke"] },
    { id: "livekit-smoke", label: "LiveKit API smoke", command: ["pnpm", "livekit:smoke"] },
    { id: "openai-smoke", label: "OpenAI Realtime smoke", command: ["pnpm", "openai:smoke"] },
    { id: "supabase-schema-smoke", label: "Supabase schema smoke", command: ["pnpm", "supabase:schema:smoke"] },
    { id: "translation-worker-smoke", label: "Translation worker smoke", command: ["pnpm", "translation:worker:smoke"] },
    { id: "translation-worker-status", label: "Long-running translation worker", command: ["pnpm", "translation:worker:status"] },
  ];
}

export function summarizePilotResults(results: PilotGateResult[]) {
  const failed = results.filter((result) => result.exitCode !== 0);
  return {
    status: failed.length === 0 ? ("pilot-ready" as const) : ("blocked" as const),
    passed: results.length - failed.length,
    total: results.length,
    failed,
  };
}

export function formatPilotSummary(results: PilotGateResult[]) {
  const summary = summarizePilotResults(results);
  const lines = [
    "",
    "Internal pilot readiness summary",
    `Status: ${summary.status.toUpperCase()}`,
    `Passed: ${summary.passed}/${summary.total}`,
    "Scope: translation meeting pilot without recording completion and without replacing the formal Live QA checklist.",
  ];

  if (summary.failed.length > 0) {
    lines.push("", "Failed pilot gates:");
    for (const gate of summary.failed) {
      lines.push(`- ${gate.label} (${gate.id}) exited ${gate.exitCode}`);
    }
  } else {
    lines.push(
      "",
      "Pilot can proceed for internal translation meetings if the host accepts recording as disabled until Supabase S3 keys are configured.",
    );
  }

  return lines.join("\n");
}

function runGate(gate: PilotGate): PilotGateResult {
  console.log(`\n=== ${gate.label} ===`);
  console.log(`$ ${gate.command.join(" ")}`);
  const result = spawnSync(gate.command[0]!, gate.command.slice(1), {
    cwd: process.cwd(),
    env: gate.id === "verify" ? scrubAppRuntimeEnv(process.env) : process.env,
    stdio: "inherit",
    encoding: "utf8",
  });
  return { ...gate, exitCode: typeof result.status === "number" ? result.status : 1 };
}

export function scrubAppRuntimeEnv(input: Record<string, string | undefined>) {
  const output: NodeJS.ProcessEnv = { ...process.env, ...input };
  for (const key of Object.keys(output)) {
    if (
      key.startsWith("NEXT_PUBLIC_") ||
      key.startsWith("LIVEKIT_") ||
      key.startsWith("OPENAI_") ||
      key.startsWith("SUPABASE_") ||
      key.startsWith("TRANSLATION_") ||
      key.startsWith("INTERNAL_") ||
      key.startsWith("CRON_") ||
      key === "HOST_SESSION_SECRET" ||
      key === "MEETING_PASSWORD_ENCRYPTION_KEY"
    ) {
      delete output[key];
    }
  }
  return output;
}

function main() {
  const results = getPilotGates().map(runGate);
  const summary = summarizePilotResults(results);
  console.log(formatPilotSummary(results));
  process.exitCode = summary.status === "pilot-ready" ? 0 : 1;
}

if (process.argv[1]?.endsWith("pilot-check.ts")) {
  main();
}
