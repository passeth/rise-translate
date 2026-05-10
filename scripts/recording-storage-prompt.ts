import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { buildRecordingStorageEnvPatch, fingerprint, upsertDotenvValues } from "./recording-storage-configure";

type PromptInput = {
  accessKey: string;
  secretKey: string;
  region?: string;
  endpoint?: string;
};

export function buildPromptEnvUpdate(currentEnv: string, values: PromptInput) {
  return upsertDotenvValues(
    currentEnv,
    buildRecordingStorageEnvPatch({
      accessKey: values.accessKey,
      secretKey: values.secretKey,
      region: values.region,
      endpoint: values.endpoint,
    }),
  );
}

function parseArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function promptSecret(question: string) {
  if (!input.isTTY || !output.isTTY) {
    throw new Error("Secret prompt requires an interactive TTY. Use environment variables with pnpm recording:storage:configure instead.");
  }

  output.write(question);
  input.setRawMode(true);
  let value = "";

  await new Promise<void>((resolve) => {
    const onData = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      if (text === "\u0003") {
        input.setRawMode(false);
        input.off("data", onData);
        output.write("\n");
        process.exit(130);
      }
      if (text === "\r" || text === "\n") {
        input.setRawMode(false);
        input.off("data", onData);
        output.write("\n");
        resolve();
        return;
      }
      if (text === "\u007f") {
        value = value.slice(0, -1);
        return;
      }
      value += text;
    };
    input.on("data", onData);
  });

  return value.trim();
}

async function main() {
  const envFile = parseArg("env-file") || ".env.local";
  const rl = createInterface({ input, output });

  try {
    console.log("Paste Supabase Storage S3 credentials. Values are not printed back.");
    const accessKey = await promptSecret("Access Key ID: ");
    const secretKey = await promptSecret("Secret access key: ");
    const region = (await rl.question("Region (optional, default auto): ")).trim() || undefined;
    const endpoint = (await rl.question("Endpoint (optional, derived from Supabase URL): ")).trim() || undefined;

    if (!accessKey || !secretKey) {
      throw new Error("Access Key ID and Secret access key are required.");
    }

    const current = readFileSync(envFile, "utf8");
    writeFileSync(envFile, buildPromptEnvUpdate(current, { accessKey, secretKey, region, endpoint }));

    console.log(`Recording storage env updated in ${envFile}.`);
    console.log(`- LIVEKIT_RECORDING_S3_ACCESS_KEY: present fp=${fingerprint(accessKey)}`);
    console.log(`- LIVEKIT_RECORDING_S3_SECRET_KEY: present fp=${fingerprint(secretKey)}`);
    console.log("Next: pnpm recording:storage:finalize");
  } finally {
    rl.close();
  }
}

if (process.argv[1]?.endsWith("recording-storage-prompt.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Unable to save recording storage credentials.");
    process.exitCode = 1;
  });
}
