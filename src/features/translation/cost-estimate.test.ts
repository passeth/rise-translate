import { describe, expect, it } from "vitest";
import { estimateRealtimeTranslationCost, formatTranslationCostEstimate } from "./cost-estimate";

describe("Realtime translation cost estimate", () => {
  it("estimates a 60 minute one-lane meeting at the supplied OpenAI rate", () => {
    expect(estimateRealtimeTranslationCost({ minutes: 60, lanes: 1, ratePerMinuteUsd: 0.034 })).toMatchObject({
      estimatedUsd: 2.04,
    });
  });

  it("scales by active translation lane count", () => {
    expect(estimateRealtimeTranslationCost({ minutes: 60, lanes: 2, ratePerMinuteUsd: 0.034 }).estimatedUsd).toBe(4.08);
    expect(estimateRealtimeTranslationCost({ minutes: 60, lanes: 3, ratePerMinuteUsd: 0.034 }).estimatedUsd).toBe(6.12);
  });

  it("formats the assumptions and exclusions", () => {
    const output = formatTranslationCostEstimate(
      estimateRealtimeTranslationCost({ minutes: 60, lanes: 2, ratePerMinuteUsd: 0.034 }),
    );

    expect(output).toContain("$4.08");
    expect(output).toContain("one source-language → one listening-language track is one lane");
    expect(output).toContain("excludes LiveKit");
  });

  it("rejects invalid meeting duration or lane counts", () => {
    expect(() => estimateRealtimeTranslationCost({ minutes: 0, lanes: 1 })).toThrow("minutes");
    expect(() => estimateRealtimeTranslationCost({ minutes: 60, lanes: 0 })).toThrow("lanes");
  });
});
