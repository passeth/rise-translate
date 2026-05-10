import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupervisorPaths, parsePid, readWorkerStatus } from "./translation-worker-supervisor";

const tmpDirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("translation worker supervisor helpers", () => {
  it("parses only positive integer pids", () => {
    expect(parsePid("123\n")).toBe(123);
    expect(parsePid("0")).toBeNull();
    expect(parsePid("abc")).toBeNull();
  });

  it("resolves configurable pid and log paths", () => {
    expect(
      getSupervisorPaths({
        TRANSLATION_WORKER_PID_FILE: "/tmp/worker.pid",
        TRANSLATION_WORKER_LOG_FILE: "/tmp/worker.log",
      }),
    ).toEqual({ pidFile: "/tmp/worker.pid", logFile: "/tmp/worker.log" });
  });

  it("reports stale pids without treating them as healthy", () => {
    const dir = mkdtempSync(join(tmpdir(), "rise-worker-"));
    tmpDirs.push(dir);
    const paths = { pidFile: join(dir, "worker.pid"), logFile: join(dir, "worker.log") };
    writeFileSync(paths.pidFile, "999999999\n");
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw new Error("missing");
    });

    expect(readWorkerStatus(paths)).toEqual({ running: false, pid: 999999999, logFile: paths.logFile, reason: "stale-pid" });
  });
});
