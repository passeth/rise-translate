import { mkdirSync, readFileSync, rmSync, writeFileSync, openSync, closeSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

export type TranslationWorkerSupervisorPaths = {
  pidFile: string;
  logFile: string;
};

export type TranslationWorkerStatus =
  | { running: true; pid: number; logFile: string }
  | { running: false; pid?: number; logFile: string; reason: "missing-pid" | "stale-pid" };

const DEFAULT_PID_FILE = ".omx/state/translation-worker.pid";
const DEFAULT_LOG_FILE = ".omx/logs/translation-worker.log";

export function getSupervisorPaths(env: Record<string, string | undefined> = process.env): TranslationWorkerSupervisorPaths {
  return {
    pidFile: resolve(env.TRANSLATION_WORKER_PID_FILE || DEFAULT_PID_FILE),
    logFile: resolve(env.TRANSLATION_WORKER_LOG_FILE || DEFAULT_LOG_FILE),
  };
}

export function parsePid(value: string) {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function isProcessRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function readWorkerStatus(paths = getSupervisorPaths()): TranslationWorkerStatus {
  let pid: number | null = null;
  try {
    pid = parsePid(readFileSync(paths.pidFile, "utf8"));
  } catch {
    return { running: false, logFile: paths.logFile, reason: "missing-pid" };
  }

  if (!pid || !isProcessRunning(pid)) {
    return { running: false, pid: pid ?? undefined, logFile: paths.logFile, reason: "stale-pid" };
  }

  return { running: true, pid, logFile: paths.logFile };
}

export function startTranslationWorker(paths = getSupervisorPaths()) {
  const current = readWorkerStatus(paths);
  if (current.running) return current;

  mkdirSync(dirname(paths.pidFile), { recursive: true });
  mkdirSync(dirname(paths.logFile), { recursive: true });
  const logFd = openSync(paths.logFile, "a");
  const child = spawn("pnpm", ["translation:worker"], {
    cwd: process.cwd(),
    env: process.env,
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
  child.unref();
  closeSync(logFd);
  if (!child.pid) {
    throw new Error("Unable to start translation worker: child process pid is missing.");
  }
  writeFileSync(paths.pidFile, `${child.pid}\n`);

  return { running: true as const, pid: child.pid, logFile: paths.logFile };
}

export function stopTranslationWorker(paths = getSupervisorPaths()) {
  const status = readWorkerStatus(paths);
  if (status.running) {
    process.kill(status.pid, "SIGTERM");
  }
  rmSync(paths.pidFile, { force: true });
  return status;
}

function printStatus(status: TranslationWorkerStatus) {
  if (status.running) {
    console.log(`Translation worker is running (pid ${status.pid}).`);
  } else {
    console.log(`Translation worker is not running (${status.reason}).`);
  }
  console.log(`Log file: ${status.logFile}`);
}

function main() {
  const command = process.argv[2];
  const paths = getSupervisorPaths();

  if (command === "start") {
    printStatus(startTranslationWorker(paths));
    return;
  }

  if (command === "status") {
    const status = readWorkerStatus(paths);
    printStatus(status);
    process.exitCode = status.running ? 0 : 1;
    return;
  }

  if (command === "stop") {
    const previous = stopTranslationWorker(paths);
    if (previous.running) {
      console.log(`Sent SIGTERM to translation worker pid ${previous.pid}.`);
    } else {
      console.log("Translation worker was not running.");
    }
    console.log(`Log file: ${previous.logFile}`);
    return;
  }

  console.error("Usage: pnpm translation:worker:supervisor <start|status|stop>");
  process.exitCode = 2;
}

if (process.argv[1]?.endsWith("translation-worker-supervisor.ts")) {
  main();
}
