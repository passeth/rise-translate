import { describe, expect, it } from "vitest";
import {
  shouldScheduleTranslationReconnectForConnectionState,
  shouldWaitBeforeReconnectForConnectionState,
} from "./translation-connection-state";

describe("translation connection state policy", () => {
  it("retries terminal failed/closed states immediately", () => {
    expect(shouldScheduleTranslationReconnectForConnectionState("failed")).toBe(true);
    expect(shouldScheduleTranslationReconnectForConnectionState("closed")).toBe(true);
    expect(shouldScheduleTranslationReconnectForConnectionState("connected")).toBe(false);
  });

  it("waits before reconnecting transient disconnected state", () => {
    expect(shouldWaitBeforeReconnectForConnectionState("disconnected")).toBe(true);
    expect(shouldWaitBeforeReconnectForConnectionState("connecting")).toBe(false);
  });
});
