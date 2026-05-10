import { describe, expect, it } from "vitest";
import { estimateRealtimeTranslationCost, formatTranslationCostEstimate } from "@/features/translation/cost-estimate";

describe("Realtime translation cost estimate CLI helpers", () => {
  it("keeps the 60 minute two-lane meeting estimate visible to operators", () => {
    const output = formatTranslationCostEstimate(
      estimateRealtimeTranslationCost({ minutes: 60, lanes: 2, ratePerMinuteUsd: 0.034 }),
    );

    expect(output).toContain("$4.08");
    expect(output).toContain("active translation lanes: 2");
  });
});
