import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const SCANNED_ROOTS = ["docs", ".scratch", "src"];
const SECRET_PATTERNS = [
  new RegExp("sk-" + "proj-[A-Za-z0-9_-]{20,}"),
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
  /sb_(?:secret|publishable)_[A-Za-z0-9_-]{20,}/,
  /LIVEKIT_API_SECRET=(?!\s*$|<redacted>)[^\s]+/,
  /SUPABASE_SERVICE_ROLE_KEY=(?!\s*$|<redacted>)[^\s]+/,
  /OPENAI_API_KEY=(?!\s*$|<redacted>)[^\s]+/,
];

describe("secret hygiene", () => {
  it("does not keep provider secrets in source, docs, or scratch artifacts", () => {
    const offenders = listTextFiles(SCANNED_ROOTS).filter((file) => {
      const text = readFileSync(file, "utf8");
      return SECRET_PATTERNS.some((pattern) => pattern.test(text));
    });

    expect(offenders).toEqual([]);
  });
});

function listTextFiles(roots: string[]) {
  const files: string[] = [];

  for (const root of roots) {
    collect(root, files);
  }

  return files.filter(
    (file) =>
      !file.endsWith("secret-hygiene.test.ts") &&
      !file.endsWith(".png") &&
      !file.endsWith(".jpg") &&
      !file.endsWith(".jpeg"),
  );
}

function collect(path: string, files: string[]) {
  const stats = statSync(path, { throwIfNoEntry: false });
  if (!stats) return;

  if (stats.isFile()) {
    files.push(path);
    return;
  }

  if (!stats.isDirectory()) return;

  for (const child of readdirSync(path)) {
    collect(join(path, child), files);
  }
}
