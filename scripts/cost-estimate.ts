import {
  DEFAULT_REALTIME_TRANSLATION_AUDIO_RATE_PER_MINUTE_USD,
  estimateRealtimeTranslationCost,
  formatTranslationCostEstimate,
} from "@/features/translation/cost-estimate";

function getNumberArg(name: string, fallback: number) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`--${name} must be a number.`);
  }
  return value;
}

function main() {
  const estimate = estimateRealtimeTranslationCost({
    minutes: getNumberArg("minutes", 60),
    lanes: getNumberArg("lanes", 2),
    ratePerMinuteUsd: getNumberArg("rate", DEFAULT_REALTIME_TRANSLATION_AUDIO_RATE_PER_MINUTE_USD),
  });
  console.log(formatTranslationCostEstimate(estimate));
}

if (process.argv[1]?.endsWith("cost-estimate.ts")) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Unable to estimate cost.");
    process.exitCode = 1;
  }
}
