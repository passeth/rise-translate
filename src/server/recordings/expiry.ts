export type ExpirableRecordingObject = {
  id: string;
  bucket: string | null;
  object_key: string | null;
};

export type RecordingStorageRemovalPlan = {
  bucket: string;
  objectKeys: string[];
  recordingIds: string[];
};

export function buildRecordingStorageRemovalPlan(recordings: ExpirableRecordingObject[]) {
  const byBucket = new Map<string, RecordingStorageRemovalPlan>();

  for (const recording of recordings) {
    if (!recording.bucket || !recording.object_key) continue;
    const plan = byBucket.get(recording.bucket) ?? {
      bucket: recording.bucket,
      objectKeys: [],
      recordingIds: [],
    };
    plan.objectKeys.push(recording.object_key);
    plan.recordingIds.push(recording.id);
    byBucket.set(recording.bucket, plan);
  }

  return [...byBucket.values()];
}
