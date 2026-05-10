import { spawnSync } from "node:child_process";

export type FinalizeStep = {
  id: string;
  label: string;
  command: string;
  args: string[];
};

export type FinalizeStepResult = FinalizeStep & {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
};

export const RECORDING_STORAGE_FINALIZE_STEPS: FinalizeStep[] = [
  {
    id: "web-env-check",
    label: "Check local web runtime env",
    command: "pnpm",
    args: ["env:check", "web"],
  },
  {
    id: "recording-storage-smoke",
    label: "Smoke-test recording storage",
    command: "pnpm",
    args: ["recording:storage:smoke"],
  },
  {
    id: "vercel-env-sync",
    label: "Sync env to Vercel production",
    command: "pnpm",
    args: ["vercel:env:sync", "--", "--apply"],
  },
  {
    id: "vercel-deploy",
    label: "Redeploy Vercel production",
    command: "vercel",
    args: ["deploy", "--prod", "--yes"],
  },
  {
    id: "deployment-smoke",
    label: "Smoke-test deployed app",
    command: "pnpm",
    args: ["deployment:smoke"],
  },
  {
    id: "deployed-preflight",
    label: "Check deployed internal preflight",
    command: "pnpm",
    args: ["deployed:preflight"],
  },
  {
    id: "readiness-next",
    label: "Print remaining readiness actions",
    command: "pnpm",
    args: ["readiness:next"],
  },
];

export function formatFinalizePlan(steps: FinalizeStep[] = RECORDING_STORAGE_FINALIZE_STEPS) {
  return [
    "Recording storage finalize plan",
    ...steps.map((step, index) => `${index + 1}. ${step.label}\n   $ ${step.command} ${step.args.join(" ")}`),
  ].join("\n");
}

export function runFinalizeSteps({
  steps = RECORDING_STORAGE_FINALIZE_STEPS,
  runner = defaultRunner,
}: {
  steps?: FinalizeStep[];
  runner?: (step: FinalizeStep) => FinalizeStepResult;
} = {}) {
  const results: FinalizeStepResult[] = [];

  for (const step of steps) {
    console.log(`\n=== ${step.label} ===`);
    console.log(`$ ${step.command} ${step.args.join(" ")}`);
    const result = runner(step);
    results.push(result);
    if (result.exitCode !== 0) {
      console.error(`Step failed: ${step.label} (${result.exitCode ?? result.signal ?? "unknown"})`);
      break;
    }
  }

  return results;
}

export function summarizeFinalizeResults(results: FinalizeStepResult[], steps: FinalizeStep[] = RECORDING_STORAGE_FINALIZE_STEPS) {
  const failed = results.find((result) => result.exitCode !== 0);
  return {
    ok: !failed && results.length === steps.length,
    completed: results.filter((result) => result.exitCode === 0).length,
    total: steps.length,
    failed,
  };
}

function defaultRunner(step: FinalizeStep): FinalizeStepResult {
  const child = spawnSync(step.command, step.args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    shell: false,
  });

  return { ...step, exitCode: child.status, signal: child.signal };
}

function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(formatFinalizePlan());

  if (dryRun) {
    console.log("Dry run only. Re-run without --dry-run after recording S3 credentials are configured.");
    return;
  }

  const results = runFinalizeSteps();
  const summary = summarizeFinalizeResults(results);
  console.log(`\nRecording storage finalize summary: ${summary.ok ? "OK" : "BLOCKED"} (${summary.completed}/${summary.total})`);
  if (summary.failed) {
    console.log(`Blocked at: ${summary.failed.label}`);
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("recording-storage-finalize.ts")) {
  main();
}
