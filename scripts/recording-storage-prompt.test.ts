import { describe, expect, it } from "vitest";
import { buildPromptEnvUpdate } from "./recording-storage-prompt";

describe("recording storage credential prompt helpers", () => {
  it("updates dotenv text with prompted S3 credentials", () => {
    const next = buildPromptEnvUpdate("NEXT_PUBLIC_APP_URL=https://meet.example.com\n", {
      accessKey: "access",
      secretKey: "secret",
    });

    expect(next).toContain("NEXT_PUBLIC_APP_URL=https://meet.example.com");
    expect(next).toContain("LIVEKIT_RECORDING_S3_BUCKET=recordings");
    expect(next).toContain("LIVEKIT_RECORDING_S3_ACCESS_KEY=access");
    expect(next).toContain("LIVEKIT_RECORDING_S3_SECRET_KEY=secret");
  });

  it("can include optional region and endpoint", () => {
    const next = buildPromptEnvUpdate("", {
      accessKey: "access",
      secretKey: "secret",
      region: "ap-northeast-2",
      endpoint: "https://s3.example.com",
    });

    expect(next).toContain("LIVEKIT_RECORDING_S3_REGION=ap-northeast-2");
    expect(next).toContain("LIVEKIT_RECORDING_S3_ENDPOINT=https://s3.example.com");
  });
});
