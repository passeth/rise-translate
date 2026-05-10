import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const HANGUL_PATTERN = /[가-힣]/;
const UI_ROOTS = ["src/app", "src/features/livekit"];

describe("UI language policy", () => {
  it("keeps static rendered UI copy in English", () => {
    const offenders = UI_ROOTS.flatMap((root) => collectTsxFiles(root))
      .filter((file) => !file.endsWith(".test.tsx"))
      .flatMap((file) => findHangulLines(file));

    expect(offenders).toEqual([]);
  });
});

function collectTsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return collectTsxFiles(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

function findHangulLines(file: string) {
  return readFileSync(file, "utf8")
    .split("\n")
    .flatMap((line, index) => {
      if (!HANGUL_PATTERN.test(line)) return [];
      return [`${relative(process.cwd(), file)}:${index + 1}: ${line.trim()}`];
    });
}
