import { getClientEnv } from "@/lib/env";

type SmokeTarget = {
  label: string;
  url: URL;
  expectJson?: boolean;
};

export async function runDeploymentSmoke(baseUrl = getClientEnv().NEXT_PUBLIC_APP_URL) {
  assertPublicHttpsUrl(baseUrl);

  const targets: SmokeTarget[] = [
    { label: "health", url: new URL("/api/health", baseUrl), expectJson: true },
    { label: "login page", url: new URL("/login", baseUrl) },
  ];

  for (const target of targets) {
    const response = await fetch(target.url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`${target.label} smoke failed with HTTP ${response.status} at ${target.url.toString()}`);
    }

    if (target.expectJson) {
      const payload = await response.json() as { status?: string; service?: string };
      if (payload.status !== "ok" || payload.service !== "rise-translate") {
        throw new Error(`${target.label} smoke returned an unexpected payload.`);
      }
    }

    console.log(`- [ok] ${target.label}: ${target.url.toString()}`);
  }
}

export function assertPublicHttpsUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("NEXT_PUBLIC_APP_URL is invalid.");
  }

  if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error("NEXT_PUBLIC_APP_URL must be the deployed public HTTPS origin, not localhost.");
  }

  if (url.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_APP_URL must use HTTPS for deployment smoke checks.");
  }
}

async function main() {
  console.log("Deployment smoke: checking public app URL.");
  await runDeploymentSmoke();
  console.log("Deployment smoke: OK");
}

if (process.argv[1]?.endsWith("deployment-smoke.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Deployment smoke failed.");
    process.exitCode = 1;
  });
}
