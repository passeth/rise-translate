import { describe, expect, it } from "vitest";
import {
  buildVercelEnvSyncPlan,
  fingerprintEnvValue,
  formatVercelEnvSyncPlan,
  missingRequiredVercelEnv,
  parseDotenv,
} from "./vercel-env-sync";

describe("vercel env sync helpers", () => {
  it("parses dotenv values without adding trailing newlines", () => {
    expect(parseDotenv(`A=one\nB="two"\nC=three\n`)).toEqual({ A: "one", B: "two", C: "three" });
  });

  it("builds a secret-safe plan with fingerprints instead of values", () => {
    const plan = buildVercelEnvSyncPlan(
      {
        NEXT_PUBLIC_APP_URL: "https://meet.example.com",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
      },
      [
        {
          name: "NEXT_PUBLIC_APP_URL",
          requiredBy: ["web"],
          secret: false,
          purpose: "url",
        },
        {
          name: "SUPABASE_SERVICE_ROLE_KEY",
          requiredBy: ["web"],
          secret: true,
          purpose: "secret",
        },
      ],
    );

    const formatted = formatVercelEnvSyncPlan(plan);
    expect(formatted).toContain(`fp=${fingerprintEnvValue("service-role-secret")}`);
    expect(formatted).not.toContain("service-role-secret");
  });

  it("reports missing required values before applying", () => {
    const plan = buildVercelEnvSyncPlan(
      { OPTIONAL_VALUE: "ok" },
      [
        { name: "REQUIRED_VALUE", requiredBy: ["web"], secret: true, purpose: "required" },
        { name: "OPTIONAL_VALUE", requiredBy: ["web"], secret: false, optional: true, purpose: "optional" },
      ],
    );

    expect(missingRequiredVercelEnv(plan)).toEqual(["REQUIRED_VALUE"]);
  });
});
