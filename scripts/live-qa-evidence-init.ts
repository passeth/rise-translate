import { readFileSync, writeFileSync } from "node:fs";
import { env } from "node:process";

const DEFAULT_CHECKLIST_PATH = ".scratch/realtime-translation-meeting-app/qa/LIVE-QA-CHECKLIST.md";

export type LiveQaEvidenceInput = {
  markdown: string;
  date: string;
  tester: string;
  environmentUrl: string;
  supabaseUrl: string;
  liveKitUrl: string;
  note?: string;
  observedAt: string;
};

export function deriveSupabaseProject(supabaseUrl: string) {
  try {
    return new URL(supabaseUrl).hostname.split(".")[0] || supabaseUrl;
  } catch {
    return supabaseUrl;
  }
}

export function deriveLiveKitProjectRegion(liveKitUrl: string) {
  try {
    return new URL(liveKitUrl).hostname;
  } catch {
    return liveKitUrl;
  }
}

export function fillLiveQaEvidence(input: LiveQaEvidenceInput) {
  let markdown = input.markdown;
  const replacements: Record<string, string> = {
    Date: input.date,
    Tester: input.tester,
    "Environment URL": input.environmentUrl,
    "Supabase project": deriveSupabaseProject(input.supabaseUrl),
    "LiveKit project/region": deriveLiveKitProjectRegion(input.liveKitUrl),
  };

  for (const [field, value] of Object.entries(replacements)) {
    markdown = replaceMetadata(markdown, field, value);
  }

  if (input.note?.trim()) {
    markdown = appendObservation(markdown, input.observedAt, input.note.trim());
  }

  return markdown;
}

function replaceMetadata(markdown: string, field: string, value: string) {
  const pattern = new RegExp(`^${escapeRegExp(field)}:\\s*.*$`, "m");
  const replacement = `${field}: ${value}`;
  if (pattern.test(markdown)) {
    return markdown.replace(pattern, replacement);
  }
  return `${replacement}\n${markdown}`;
}

function appendObservation(markdown: string, observedAt: string, note: string) {
  const heading = "## Manual observations";
  const entry = `- ${observedAt}: ${note}`;
  if (!markdown.includes(heading)) {
    return `${markdown.trimEnd()}\n\n${heading}\n\n${entry}\n`;
  }
  return markdown.replace(new RegExp(`(${escapeRegExp(heading)}\\n(?:\\n)?)`), `$1${entry}\n`);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function requireValue(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Missing ${name}. Provide --${name}=... or configure the matching environment variable.`);
  }
  return value;
}

function main() {
  const path = getArg("path") ?? DEFAULT_CHECKLIST_PATH;
  const now = new Date();
  const date = getArg("date") ?? formatLocalDate(now);
  const tester = getArg("tester") ?? env.USER ?? "manual-tester";
  const note = getArg("note");
  const dryRun = process.argv.includes("--dry-run");

  const markdown = readFileSync(path, "utf8");
  const filled = fillLiveQaEvidence({
    markdown,
    date,
    tester,
    environmentUrl: requireValue("environment-url", getArg("environment-url") ?? env.NEXT_PUBLIC_APP_URL),
    supabaseUrl: requireValue("supabase-url", getArg("supabase-url") ?? env.NEXT_PUBLIC_SUPABASE_URL),
    liveKitUrl: requireValue("livekit-url", getArg("livekit-url") ?? env.LIVEKIT_URL),
    note,
    observedAt: now.toISOString(),
  });

  if (dryRun) {
    console.log(filled);
    return;
  }

  writeFileSync(path, filled);
  console.log(`Updated Live QA evidence metadata: ${path}`);
  if (note?.trim()) {
    console.log("Added manual observation note. Checklist pass/fail rows were not changed.");
  }
}

export function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

if (process.argv[1]?.endsWith("live-qa-evidence-init.ts")) {
  main();
}
