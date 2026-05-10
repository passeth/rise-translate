import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

export type ReadinessGate = {
  id: string;
  label: string;
  command: string;
  args: string[];
  required: boolean;
};

export type ReadinessGateResult = ReadinessGate & {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
};

export function getReadinessGates(): ReadinessGate[] {
  return [
    {
      id: "verify",
      label: "Code verification",
      command: "pnpm",
      args: ["verify"],
      required: true,
    },
    {
      id: "preflight",
      label: "Production preflight",
      command: "pnpm",
      args: ["preflight"],
      required: true,
    },
    {
      id: "web-env-check",
      label: "Web runtime env check",
      command: "pnpm",
      args: ["env:check", "web"],
      required: true,
    },
    {
      id: "worker-env-check",
      label: "Worker runtime env check",
      command: "pnpm",
      args: ["env:check", "worker"],
      required: true,
    },
    {
      id: "deployment-smoke",
      label: "Deployment smoke",
      command: "pnpm",
      args: ["deployment:smoke"],
      required: true,
    },
    {
      id: "deployed-preflight",
      label: "Deployed internal preflight",
      command: "pnpm",
      args: ["deployed:preflight"],
      required: true,
    },
    {
      id: "livekit-smoke",
      label: "LiveKit API smoke",
      command: "pnpm",
      args: ["livekit:smoke"],
      required: true,
    },
    {
      id: "openai-smoke",
      label: "OpenAI Realtime smoke",
      command: "pnpm",
      args: ["openai:smoke"],
      required: true,
    },
    {
      id: "supabase-schema-smoke",
      label: "Supabase schema smoke",
      command: "pnpm",
      args: ["supabase:schema:smoke"],
      required: true,
    },
    {
      id: "recording-storage-smoke",
      label: "Recording storage smoke",
      command: "pnpm",
      args: ["recording:storage:smoke"],
      required: true,
    },
    {
      id: "translation-worker-smoke",
      label: "Translation worker smoke",
      command: "pnpm",
      args: ["translation:worker:smoke"],
      required: true,
    },
    {
      id: "translation-worker-status",
      label: "Long-running translation worker status",
      command: "pnpm",
      args: ["translation:worker:status"],
      required: true,
    },
    {
      id: "liveqa-check",
      label: "Live QA evidence gate",
      command: "pnpm",
      args: ["liveqa:check"],
      required: true,
    },
  ];
}

export function summarizeReadinessResults(results: ReadinessGateResult[]) {
  const failed = results.filter((result) => result.required && result.exitCode !== 0);
  return {
    status: failed.length === 0 ? "ready" as const : "blocked" as const,
    total: results.length,
    passed: results.length - failed.length,
    failed,
  };
}

export function formatReadinessSummary(results: ReadinessGateResult[]) {
  const summary = summarizeReadinessResults(results);
  const lines = [
    "",
    "Readiness report summary",
    `Status: ${summary.status.toUpperCase()}`,
    `Passed: ${summary.passed}/${summary.total}`,
  ];

  if (summary.failed.length > 0) {
    lines.push("", "Failed required gates:");
    for (const result of summary.failed) {
      lines.push(`- ${result.label} (${result.id}) exited with ${result.exitCode ?? result.signal ?? "unknown"}`);
    }
  } else {
    lines.push("", "All readiness gates passed.");
  }

  return lines.join("\n");
}

export function serializeReadinessResults(results: ReadinessGateResult[]) {
  return JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2);
}

async function runGate(gate: ReadinessGate): Promise<ReadinessGateResult> {
  const startedAt = Date.now();
  console.log(`\n=== ${gate.label} ===`);
  console.log(`$ ${gate.command} ${gate.args.join(" ")}`);

  const { exitCode, signal } = await new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    const child = spawn(gate.command, gate.args, {
      cwd: process.cwd(),
      env: process.env,
      shell: false,
      stdio: "inherit",
    });

    child.on("error", (error) => {
      console.error(error.message);
      resolve({ exitCode: 127, signal: null });
    });
    child.on("close", (exitCode, signal) => resolve({ exitCode, signal }));
  });

  const result = { ...gate, exitCode, signal, durationMs: Date.now() - startedAt };
  const status = exitCode === 0 ? "PASS" : "FAIL";
  console.log(`=== ${gate.label}: ${status} (${Math.round(result.durationMs / 1000)}s) ===`);
  return result;
}

async function main() {
  const results: ReadinessGateResult[] = [];

  for (const gate of getReadinessGates()) {
    results.push(await runGate(gate));
  }

  const summary = summarizeReadinessResults(results);
  console.log(formatReadinessSummary(results));
  const outputArg = process.argv.find((arg) => arg.startsWith("--json="));
  if (outputArg) {
    const outputPath = outputArg.slice("--json=".length);
    writeFileSync(outputPath, serializeReadinessResults(results));
    console.log(`\nWrote readiness JSON: ${outputPath}`);
  }
  process.exitCode = summary.status === "ready" ? 0 : 1;
}

if (process.argv[1]?.endsWith("readiness-report.ts")) {
  void main();
}
