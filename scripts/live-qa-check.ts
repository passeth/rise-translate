import { readFileSync } from "fs";

const DEFAULT_CHECKLIST_PATH = ".scratch/realtime-translation-meeting-app/qa/LIVE-QA-CHECKLIST.md";

export type LiveQaCheckSummary = {
  metadataMissing: string[];
  passedRows: number;
  failedRows: string[];
  pendingRows: string[];
  readySelected: boolean;
  notReadySelected: boolean;
  blockers: string[];
};

type ChecklistRow = {
  check: string;
  result: string;
};

export function evaluateLiveQaChecklist(markdown: string): LiveQaCheckSummary {
  const metadataMissing = requiredMetadataFields().filter((field) => !hasFilledMetadata(markdown, field));
  const rows = extractChecklistRows(markdown);
  const failedRows: string[] = [];
  const pendingRows: string[] = [];
  let passedRows = 0;

  for (const row of rows) {
    const result = normalizeResult(row.result);
    if (result === "pass") {
      passedRows += 1;
    } else if (result === "fail") {
      failedRows.push(row.check);
    } else {
      pendingRows.push(row.check);
    }
  }

  const readySelected = /^-\s*(?:☑|✅|\[x\])\s*Ready for internal buyer pilot/im.test(markdown);
  const notReadySelected = /^-\s*(?:☑|✅|\[x\])\s*Not ready/im.test(markdown);
  const blockers = extractBlockers(markdown);

  return {
    metadataMissing,
    passedRows,
    failedRows,
    pendingRows,
    readySelected,
    notReadySelected,
    blockers,
  };
}

export function assertLiveQaReady(summary: LiveQaCheckSummary) {
  const problems: string[] = [];

  if (summary.metadataMissing.length > 0) {
    problems.push(`Missing metadata: ${summary.metadataMissing.join(", ")}`);
  }
  if (summary.pendingRows.length > 0) {
    problems.push(`Pending checks: ${summary.pendingRows.length}`);
  }
  if (summary.failedRows.length > 0) {
    problems.push(`Failed checks: ${summary.failedRows.join(", ")}`);
  }
  if (!summary.readySelected) {
    problems.push("Readiness decision is not marked Ready for internal buyer pilot.");
  }
  if (summary.notReadySelected) {
    problems.push("Readiness decision is marked Not ready.");
  }
  if (summary.blockers.length > 0) {
    problems.push(`Blockers are listed: ${summary.blockers.join("; ")}`);
  }

  if (problems.length > 0) {
    throw new Error(problems.join("\n"));
  }
}

function requiredMetadataFields() {
  return ["Date", "Tester", "Environment URL", "Supabase project", "LiveKit project/region"];
}

function hasFilledMetadata(markdown: string, field: string) {
  const match = markdown.match(new RegExp(`^${escapeRegExp(field)}:\\s*(.+)$`, "im"));
  if (!match) return false;
  const value = match[1]?.trim() ?? "";
  return value.length > 0 && !/^_+$/.test(value);
}

function extractChecklistRows(markdown: string): ChecklistRow[] {
  return markdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.endsWith("|"))
    .filter((line) => !line.includes("| ---"))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => cells.length >= 4 && cells[0] !== "Check")
    .filter((cells) => /\bPass\b/.test(cells[2] ?? "") && /\bFail\b/.test(cells[2] ?? ""))
    .map((cells) => ({ check: cells[0] ?? "Unnamed check", result: cells[2] ?? "" }));
}

function normalizeResult(result: string): "pass" | "fail" | "pending" {
  const passMarked = /(?:☑|✅|\[x\])\s*Pass/i.test(result);
  const failMarked = /(?:☑|✅|\[x\])\s*Fail/i.test(result);
  if (passMarked && !failMarked) return "pass";
  if (failMarked) return "fail";
  return "pending";
}

function extractBlockers(markdown: string) {
  const blockersSection = markdown.split(/^Blockers:\s*$/im)[1] ?? "";
  return blockersSection
    .split("\n")
    .map((line) => line.trim())
    .map((line) => line.match(/^\d+\.\s*(.+)$/)?.[1]?.trim())
    .filter((value): value is string => Boolean(value));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function main() {
  const checklistPath = process.argv[2] ?? DEFAULT_CHECKLIST_PATH;
  const markdown = readFileSync(checklistPath, "utf8");
  const summary = evaluateLiveQaChecklist(markdown);

  console.log("Live QA evidence check");
  console.log(`- passed rows: ${summary.passedRows}`);
  console.log(`- pending rows: ${summary.pendingRows.length}`);
  console.log(`- failed rows: ${summary.failedRows.length}`);

  try {
    assertLiveQaReady(summary);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Live QA checklist is not ready.");
    process.exitCode = 1;
    return;
  }

  console.log("Live QA evidence check: OK");
}

if (process.argv[1]?.endsWith("live-qa-check.ts")) {
  void main();
}
