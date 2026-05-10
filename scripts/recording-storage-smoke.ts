import { smokeRecordingStorage } from "@/server/recordings/storage-smoke";

async function main() {
  const result = await smokeRecordingStorage();

  console.log("Recording storage smoke: OK");
  console.log(`- bucket: ${result.bucket}`);
  console.log(`- endpoint: ${result.endpoint}`);
  console.log(`- object key: ${result.objectKey}`);
  console.log(`- put/head/delete: ${result.putStatus}/${result.headStatus}/${result.deleteStatus}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Recording storage smoke failed.");
  process.exitCode = 1;
});
