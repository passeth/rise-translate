import { formatRuntimeEnvManifest, type RuntimeProcessName } from "@/server/operations/runtime-env-manifest";

const processName = parseProcessArg(process.argv[2]);

console.log(`Runtime environment manifest${processName ? ` (${processName})` : ""}`);
console.log(formatRuntimeEnvManifest(processName));

function parseProcessArg(value: string | undefined): RuntimeProcessName | undefined {
  if (!value) return undefined;
  if (value === "web" || value === "worker") return value;
  throw new Error("Usage: pnpm env:manifest [web|worker]");
}
