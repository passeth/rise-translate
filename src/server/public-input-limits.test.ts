import { describe, expect, it } from "vitest";
import { PUBLIC_CHAT_MESSAGE_MAX_LENGTH, trimAndLimitPublicText } from "./public-input-limits";

describe("trimAndLimitPublicText", () => {
  it("trims valid text", () => {
    expect(trimAndLimitPublicText(" hello ", PUBLIC_CHAT_MESSAGE_MAX_LENGTH)).toEqual({ ok: true, value: "hello" });
  });

  it("rejects missing, blank, and oversized text", () => {
    expect(trimAndLimitPublicText(undefined, 10)).toMatchObject({ ok: false, reason: "missing" });
    expect(trimAndLimitPublicText("   ", 10)).toMatchObject({ ok: false, reason: "blank" });
    expect(trimAndLimitPublicText("x".repeat(11), 10)).toMatchObject({ ok: false, reason: "too_long" });
  });
});
