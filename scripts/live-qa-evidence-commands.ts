import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const DEFAULT_CHECKLIST_PATH = ".scratch/realtime-translation-meeting-app/qa/LIVE-QA-CHECKLIST.md";

export type CommandEvidence = {
  check: string;
  command: string[];
  exitCode: number;
  note: string;
};

export const MACHINE_EVIDENCE_COMMANDS: Array<{ check: string; command: string[]; cleanAppEnv?: boolean }> = [
  { check: "`pnpm verify`", command: ["pnpm", "verify"], cleanAppEnv: true },
  { check: "`pnpm deployment:smoke`", command: ["pnpm", "deployment:smoke"] },
  { check: "`pnpm livekit:smoke`", command: ["pnpm", "livekit:smoke"] },
  { check: "`pnpm openai:smoke`", command: ["pnpm", "openai:smoke"] },
  { check: "`pnpm supabase:schema:smoke`", command: ["pnpm", "supabase:schema:smoke"] },
  { check: "`pnpm translation:worker:smoke`", command: ["pnpm", "translation:worker:smoke"] },
  { check: "`pnpm translation:worker:status`", command: ["pnpm", "translation:worker:status"] },
  { check: "Long-running worker", command: ["pnpm", "translation:worker:status"] },
];

export function applyCommandEvidence(markdown: string, evidence: CommandEvidence[]) {
  let updated = markdown;
  for (const item of evidence) {
    updated = updateChecklistRow(updated, item.check, item.exitCode === 0, item.note);
  }
  return updated;
}

export function updateChecklistRow(markdown: string, check: string, passed: boolean, note: string) {
  const lines = markdown.split("\n");
  const nextLines = lines.map((line) => {
    const row = parseMarkdownTableRow(line);
    if (!row || row.cells.length < 4 || row.cells[0] !== check) return line;

    const result = passed ? "☑ Pass ☐ Fail" : "☐ Pass ☑ Fail";
    const notes = mergeNotes(row.cells[3] ?? "", note);
    const cells = [row.cells[0], row.cells[1], result, notes, ...row.cells.slice(4)];
    return `| ${cells.join(" | ")} |`;
  });

  return nextLines.join("\n");
}

function parseMarkdownTableRow(line: string) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return null;
  if (trimmed.includes("| ---")) return null;

  return { cells: trimmed.split("|").slice(1, -1).map((cell) => cell.trim()) };
}

function mergeNotes(existing: string, note: string) {
  const command = extractCommandFromEvidenceNote(note);
  const retainedNotes = existing
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => !command || !entry.includes(`${command} exited `));

  if (retainedNotes.includes(note)) {
    return retainedNotes.join("; ");
  }

  return [...retainedNotes, note].join("; ");
}

function extractCommandFromEvidenceNote(note: string) {
  return note.match(/^\S+\s+(.+)\s+exited\s+\d+/)?.[1] ?? null;
}

function runEvidenceCommand(command: string[], observedAt: string, cleanAppEnv = false): CommandEvidence {
  console.log(`\n$ ${command.join(" ")}`);
  const startedAt = Date.now();
  const result = spawnSync(command[0]!, command.slice(1), {
    cwd: process.cwd(),
    env: cleanAppEnv ? scrubAppRuntimeEnv(process.env) : process.env,
    encoding: "utf8",
    stdio: "inherit",
  });
  const durationSeconds = Math.round((Date.now() - startedAt) / 1000);
  const exitCode = typeof result.status === "number" ? result.status : 1;
  return {
    check: "",
    command,
    exitCode,
    note: `${observedAt} ${command.join(" ")} exited ${exitCode} (${durationSeconds}s)`,
  };
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
  const path = getArg("path") ?? DEFAULT_CHECKLIST_PATH;
  const dryRun = process.argv.includes("--dry-run");
  const observedAt = new Date().toISOString();
  const evidence: CommandEvidence[] = [];

  for (const item of MACHINE_EVIDENCE_COMMANDS) {
    const commandEvidence = runEvidenceCommand(item.command, observedAt, item.cleanAppEnv);
    evidence.push({ ...commandEvidence, check: item.check });
  }

  const markdown = readFileSync(path, "utf8");
  const updated = applyCommandEvidence(markdown, evidence);

  if (dryRun) {
    console.log(updated);
    return;
  }

  writeFileSync(path, updated);
  const failed = evidence.filter((item) => item.exitCode !== 0);
  console.log(`\nUpdated machine-verifiable Live QA evidence rows: ${path}`);
  console.log(`Passed command rows: ${evidence.length - failed.length}/${evidence.length}`);
  if (failed.length > 0) {
    console.log("Failed command rows:");
    for (const item of failed) {
      console.log(`- ${item.check}: ${item.command.join(" ")} exited ${item.exitCode}`);
    }
  }
}

function getArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

if (process.argv[1]?.endsWith("live-qa-evidence-commands.ts")) {
  main();
}
