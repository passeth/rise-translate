import { smokeOpenAIAuth } from "@/server/openai/smoke";

async function main() {
  const result = await smokeOpenAIAuth();

  console.log("OpenAI smoke: OK");
  console.log(`- translation model: ${result.translationModel}`);
  console.log(`- transcription model: ${result.transcriptionModel}`);
  console.log(`- notes model: ${result.notesModel}`);
  console.log(`- checked models: ${result.checkedModels.join(", ")}`);
  console.log(`- visible models: ${result.visibleModelCount}`);
  console.log(`- realtime translation client secret: ${result.realtimeTranslationClientSecret.sessionType}`);
  console.log(
    `- realtime translation websocket session update: ${result.realtimeTranslationWebSocket.sessionUpdated ? "ok" : "failed"}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "OpenAI smoke failed.");
  process.exitCode = 1;
});
