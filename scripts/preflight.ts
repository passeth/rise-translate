import { getProductionReadinessChecks, summarizeProductionReadiness } from "@/server/operations/preflight";

const checks = getProductionReadinessChecks();
const summary = summarizeProductionReadiness(checks);
const issues = checks.filter((check) => check.severity !== "ok");

console.log(`Production preflight: ${summary.severity.toUpperCase()}`);
console.log(summary.message);

if (issues.length > 0) {
  console.log("\nIssues:");
  for (const issue of issues) {
    console.log(`- [${issue.severity}] ${issue.label}: ${issue.message}`);
    if (issue.action) {
      console.log(`  Next: ${issue.action}`);
    }
  }
} else {
  console.log("\nAll checks are OK.");
}

process.exitCode = summary.severity === "blocked" ? 1 : 0;
