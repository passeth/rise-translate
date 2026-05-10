import { smokeLiveKitCredentials } from "@/server/livekit/smoke";

async function main() {
  const result = await smokeLiveKitCredentials();

  console.log("LiveKit smoke: OK");
  console.log(`- url: ${result.url}`);
  console.log(`- active rooms visible: ${result.roomCount}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "LiveKit smoke failed.");
  process.exitCode = 1;
});
