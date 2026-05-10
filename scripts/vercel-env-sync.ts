import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { RUNTIME_ENV_MANIFEST, type RuntimeEnvManifestEntry } from "@/server/operations/runtime-env-manifest";

export type EnvMap = Record<string, string>;

export type VercelEnvSyncPlanItem = {
  name: string;
  secret: boolean;
  required: boolean;
  present: boolean;
  fingerprint?: string;
};

export function parseDotenv(text: string): EnvMap {
  const env: EnvMap = {};

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    env[key] = parseDotenvValue(rawValue ?? "");
  }

  return env;
}

export function buildVercelEnvSyncPlan(
  env: EnvMap,
  manifest: RuntimeEnvManifestEntry[] = RUNTIME_ENV_MANIFEST,
): VercelEnvSyncPlanItem[] {
  return manifest.map((entry) => {
    const value = env[entry.name];
    const present = typeof value === "string" && value.trim().length > 0;
    return {
      name: entry.name,
      secret: entry.secret,
      required: !entry.optional,
      present,
      fingerprint: present ? fingerprintEnvValue(value) : undefined,
    };
  });
}

export function missingRequiredVercelEnv(plan: VercelEnvSyncPlanItem[]) {
  return plan.filter((item) => item.required && !item.present).map((item) => item.name);
}

export function fingerprintEnvValue(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export function formatVercelEnvSyncPlan(plan: VercelEnvSyncPlanItem[]) {
  return [
    "Vercel production env sync plan",
    ...plan.map((item) => {
      const visibility = item.secret ? "secret" : "non-secret";
      const requirement = item.required ? "required" : "optional";
      const status = item.present ? `present fp=${item.fingerprint}` : "missing";
      return `- ${item.name} (${visibility}; ${requirement}): ${status}`;
    }),
  ].join("\n");
}

function parseDotenvValue(raw: string) {
  const value = raw.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).replace(/\\n/g, "\n");
  }
  return value;
}

function readLocalEnv(path: string) {
  return parseDotenv(readFileSync(path, "utf8"));
}

function runVercelEnvUpdate(name: string, value: string, environment: string) {
  const update = spawnSync("vercel", ["env", "update", name, environment, "--value", value, "--yes"], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    env: process.env,
  });

  if (update.status === 0) return "updated" as const;

  const combined = `${update.stdout}\n${update.stderr}`;
  if (/not found|doesn'?t exist|could not find/i.test(combined)) {
    const add = spawnSync("vercel", ["env", "add", name, environment, "--value", value, "--yes"], {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      env: process.env,
    });

    if (add.status === 0) return "added" as const;
    throw new Error(`${name}: vercel env add failed.`);
  }

  throw new Error(`${name}: vercel env update failed.`);
}

function maybeWriteRedactedEnvFile(env: EnvMap, path: string) {
  const lines = RUNTIME_ENV_MANIFEST
    .filter((entry) => env[entry.name])
    .map((entry) => `${entry.name}=${entry.secret ? `<secret:${fingerprintEnvValue(env[entry.name])}>` : env[entry.name]}`);
  writeFileSync(path, `${lines.join("\n")}\n`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const envPathArg = process.argv.find((arg) => arg.startsWith("--env-file="));
  const environmentArg = process.argv.find((arg) => arg.startsWith("--environment="));
  const redactedOutArg = process.argv.find((arg) => arg.startsWith("--write-redacted="));
  const envPath = envPathArg?.slice("--env-file=".length) || ".env.local";
  const environment = environmentArg?.slice("--environment=".length) || "production";
  const apply = args.has("--apply");

  const env = readLocalEnv(envPath);
  const plan = buildVercelEnvSyncPlan(env);
  const missing = missingRequiredVercelEnv(plan);
  console.log(formatVercelEnvSyncPlan(plan));

  if (redactedOutArg) {
    maybeWriteRedactedEnvFile(env, redactedOutArg.slice("--write-redacted=".length));
  }

  if (missing.length > 0) {
    console.error(`Missing required env values: ${missing.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to update Vercel env values via --value.");
    return;
  }

  for (const item of plan.filter((entry) => entry.present)) {
    const result = runVercelEnvUpdate(item.name, env[item.name], environment);
    console.log(`- ${item.name}: ${result}`);
  }
}

if (process.argv[1]?.endsWith("vercel-env-sync.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Vercel env sync failed.");
    process.exitCode = 1;
  });
}
