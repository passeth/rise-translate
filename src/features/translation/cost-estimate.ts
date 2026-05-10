export const DEFAULT_REALTIME_TRANSLATION_AUDIO_RATE_PER_MINUTE_USD = 0.034;

export type TranslationCostEstimateInput = {
  minutes: number;
  lanes: number;
  ratePerMinuteUsd?: number;
};

export type TranslationCostEstimate = {
  minutes: number;
  lanes: number;
  ratePerMinuteUsd: number;
  estimatedUsd: number;
};

export function estimateRealtimeTranslationCost({
  minutes,
  lanes,
  ratePerMinuteUsd = DEFAULT_REALTIME_TRANSLATION_AUDIO_RATE_PER_MINUTE_USD,
}: TranslationCostEstimateInput): TranslationCostEstimate {
  assertPositiveNumber("minutes", minutes);
  assertPositiveNumber("lanes", lanes);
  assertPositiveNumber("ratePerMinuteUsd", ratePerMinuteUsd);

  return {
    minutes,
    lanes,
    ratePerMinuteUsd,
    estimatedUsd: roundCurrency(minutes * lanes * ratePerMinuteUsd),
  };
}

export function formatTranslationCostEstimate(estimate: TranslationCostEstimate) {
  return [
    "Realtime translation audio cost estimate",
    `- minutes: ${estimate.minutes}`,
    `- active translation lanes: ${estimate.lanes}`,
    `- rate: $${estimate.ratePerMinuteUsd.toFixed(3)} / minute / lane`,
    `- estimated OpenAI translation audio cost: $${estimate.estimatedUsd.toFixed(2)}`,
    "",
    "Rule of thumb: one source-language → one listening-language track is one lane. Multiple listeners sharing the same target language should reuse the same lane.",
    "This excludes LiveKit, recording storage, transcript/notes model calls, and any future pricing changes.",
  ].join("\n");
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function assertPositiveNumber(name: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
}
