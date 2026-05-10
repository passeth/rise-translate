import { describe, expect, it } from "vitest";
import { applyCommandEvidence, scrubAppRuntimeEnv, updateChecklistRow } from "./live-qa-evidence-commands";

const checklist = `| Check | Expected evidence | Result | Notes |
| --- | --- | --- | --- |
| \`pnpm verify\` | lint, typecheck, tests, production build pass | ☐ Pass ☐ Fail | |
| \`pnpm deployment:smoke\` | deployed HTTPS origin serves \`/api/health\` and \`/login\` | ☐ Pass ☐ Fail | old note |
| Human observation | must be seen in browser | ☐ Pass ☐ Fail | |
`;

describe("live QA command evidence sync", () => {
  it("marks only the matching command row as pass or fail", () => {
    const updated = updateChecklistRow(checklist, "`pnpm verify`", true, "2026-05-10 pnpm verify exited 0");

    expect(updated).toContain("| `pnpm verify` | lint, typecheck, tests, production build pass | ☑ Pass ☐ Fail | 2026-05-10 pnpm verify exited 0 |");
    expect(updated).toContain("| Human observation | must be seen in browser | ☐ Pass ☐ Fail | |");
  });

  it("preserves existing notes and writes failed command evidence", () => {
    const updated = applyCommandEvidence(checklist, [
      {
        check: "`pnpm deployment:smoke`",
        command: ["pnpm", "deployment:smoke"],
        exitCode: 1,
        note: "2026-05-10 pnpm deployment:smoke exited 1",
      },
    ]);

    expect(updated).toContain("| `pnpm deployment:smoke` | deployed HTTPS origin serves `/api/health` and `/login` | ☐ Pass ☑ Fail | old note; 2026-05-10 pnpm deployment:smoke exited 1 |");
  });

  it("replaces stale evidence for the same command with the latest result", () => {
    const staleChecklist = checklist.replace(
      "| `pnpm verify` | lint, typecheck, tests, production build pass | ☐ Pass ☐ Fail | |",
      "| `pnpm verify` | lint, typecheck, tests, production build pass | ☐ Pass ☑ Fail | 2026-05-09T00:00:00.000Z pnpm verify exited 1 (17s) |",
    );

    const updated = updateChecklistRow(
      staleChecklist,
      "`pnpm verify`",
      true,
      "2026-05-10T00:00:00.000Z pnpm verify exited 0 (19s)",
    );

    expect(updated).toContain("| `pnpm verify` | lint, typecheck, tests, production build pass | ☑ Pass ☐ Fail | 2026-05-10T00:00:00.000Z pnpm verify exited 0 (19s) |");
    expect(updated).not.toContain("pnpm verify exited 1");
  });

  it("keeps manual notes while replacing stale command evidence", () => {
    const staleChecklist = checklist.replace(
      "| `pnpm deployment:smoke` | deployed HTTPS origin serves `/api/health` and `/login` | ☐ Pass ☐ Fail | old note |",
      "| `pnpm deployment:smoke` | deployed HTTPS origin serves `/api/health` and `/login` | ☐ Pass ☑ Fail | old note; 2026-05-09T00:00:00.000Z pnpm deployment:smoke exited 1 (1s) |",
    );

    const updated = updateChecklistRow(
      staleChecklist,
      "`pnpm deployment:smoke`",
      true,
      "2026-05-10T00:00:00.000Z pnpm deployment:smoke exited 0 (1s)",
    );

    expect(updated).toContain("old note; 2026-05-10T00:00:00.000Z pnpm deployment:smoke exited 0 (1s)");
    expect(updated).not.toContain("pnpm deployment:smoke exited 1");
  });

  it("scrubs app runtime env for pnpm verify so unit tests do not inherit production credentials", () => {
    const scrubbed = scrubAppRuntimeEnv({
      PATH: "/bin",
      NEXT_PUBLIC_APP_URL: "https://example.com",
      LIVEKIT_URL: "wss://example.livekit.cloud",
      OPENAI_API_KEY: "secret",
      SUPABASE_SERVICE_ROLE_KEY: "secret",
      TRANSLATION_WORKER_ADAPTER: "livekit-node",
      INTERNAL_WORKER_TOKEN: "secret",
      HOST_SESSION_SECRET: "secret",
    });

    expect(scrubbed.PATH).toBe("/bin");
    expect(scrubbed.NEXT_PUBLIC_APP_URL).toBeUndefined();
    expect(scrubbed.LIVEKIT_URL).toBeUndefined();
    expect(scrubbed.OPENAI_API_KEY).toBeUndefined();
    expect(scrubbed.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    expect(scrubbed.TRANSLATION_WORKER_ADAPTER).toBeUndefined();
    expect(scrubbed.INTERNAL_WORKER_TOKEN).toBeUndefined();
    expect(scrubbed.HOST_SESSION_SECRET).toBeUndefined();
  });
});
