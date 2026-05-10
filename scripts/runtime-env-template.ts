import { formatRuntimeEnvTemplate, type RuntimeProcessName } from "@/server/operations/runtime-env-manifest";

const processName = parseProcessArg(process.argv[2]);

console.log(`# ${processName} runtime environment template`);
console.log("# Fill values in your deployment provider. Do not commit filled secret values.");
console.log(formatRuntimeEnvTemplate(processName));

function parseProcessArg(value: string | undefined): RuntimeProcessName {
  if (value === "web" || value === "worker") return value;
  throw new Error("Usage: pnpm env:template <web|worker>");
}
