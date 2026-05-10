import { checkRuntimeEnv, getRuntimeEnvManifest, type RuntimeProcessName } from "@/server/operations/runtime-env-manifest";

const processName = parseProcessArg(process.argv[2]);
const result = checkRuntimeEnv(processName);

console.log(`Runtime environment check (${processName})`);
console.log(`Checked variables: ${result.checked}`);

if (result.ok) {
  console.log("Status: OK");
  process.exitCode = 0;
} else {
  console.log("Status: BLOCKED");
  console.log("Missing required variables:");
  for (const name of result.missing) {
    const entry = getRuntimeEnvManifest(processName).find((item) => item.name === name);
    const secretLabel = entry?.secret ? "secret" : "non-secret";
    console.log(`- ${name} (${secretLabel})`);
  }
  process.exitCode = 1;
}

function parseProcessArg(value: string | undefined): RuntimeProcessName {
  if (value === "web" || value === "worker") return value;
  throw new Error("Usage: pnpm env:check <web|worker>");
}
