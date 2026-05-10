import { createSupabaseAdminClient } from "@/server/supabase/admin";

export type OperationalFeatureArea =
  | "meeting"
  | "translation"
  | "captions"
  | "recording"
  | "notes"
  | "cleanup"
  | "livekit";

export type OperationalSeverity = "info" | "warning" | "error";

export type OperationalEventInput = {
  meetingId?: string | null;
  roomName?: string | null;
  featureArea: OperationalFeatureArea;
  eventType: string;
  severity?: OperationalSeverity;
  errorType?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: string;
  supabase?: OperationalSupabaseClient;
};

type Insertable = {
  insert: (row: Record<string, unknown>) => PromiseLike<{ error?: { message?: string } | null }>;
};

export type OperationalSupabaseClient = {
  from: (table: "rt_operational_events") => Insertable;
};

const SECRET_KEY_PATTERN = /(?:password|secret|token|authorization|api[_-]?key|service[_-]?role|jwt|cookie)/i;
const MAX_METADATA_DEPTH = 4;
const MAX_STRING_LENGTH = 500;

export function toOperationalErrorType(error: unknown): string {
  if (error instanceof Error) {
    return error.name === "Error" ? "application_error" : error.name;
  }

  if (typeof error === "string") {
    return "string_error";
  }

  return "unknown_error";
}

export function getOperationalErrorMessage(error: unknown, fallback = "Operation failed."): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return fallback;
}

export function sanitizeOperationalMetadata(value: unknown, depth = 0): unknown {
  if (depth > MAX_METADATA_DEPTH) {
    return "[MaxDepth]";
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…` : value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeOperationalMetadata(item, depth + 1));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 50)
        .map(([key, item]) => [
          key,
          SECRET_KEY_PATTERN.test(key) ? "[REDACTED]" : sanitizeOperationalMetadata(item, depth + 1),
        ]),
    );
  }

  return String(value);
}

export function buildOperationalLogRecord(input: OperationalEventInput) {
  const occurredAt = input.occurredAt ?? new Date().toISOString();

  return {
    timestamp: occurredAt,
    meetingId: input.meetingId ?? null,
    roomName: input.roomName ?? null,
    featureArea: input.featureArea,
    eventType: input.eventType,
    severity: input.severity ?? "info",
    errorType: input.errorType ?? null,
    message: input.message ?? null,
    metadata: sanitizeOperationalMetadata(input.metadata ?? {}) as Record<string, unknown>,
  };
}

export async function logOperationalEvent(input: OperationalEventInput): Promise<void> {
  const record = buildOperationalLogRecord(input);
  const logLine = JSON.stringify({ app: "rise-translate", ...record });

  if (record.severity === "error") {
    console.error(logLine);
  } else if (record.severity === "warning") {
    console.warn(logLine);
  } else {
    console.info(logLine);
  }

  try {
    const supabase = input.supabase ?? createSupabaseAdminClient();
    const { error } = await supabase.from("rt_operational_events").insert({
      meeting_id: record.meetingId,
      room_name: record.roomName,
      feature_area: record.featureArea,
      event_type: record.eventType,
      severity: record.severity,
      error_type: record.errorType,
      message: record.message,
      metadata: record.metadata,
      occurred_at: record.timestamp,
    });

    if (error) {
      console.warn(
        JSON.stringify({
          app: "rise-translate",
          timestamp: new Date().toISOString(),
          featureArea: "cleanup",
          eventType: "operational_event_persist_failed",
          severity: "warning",
          errorType: "supabase_error",
          message: error.message ?? "Unable to persist operational event.",
        }),
      );
    }
  } catch (error) {
    console.warn(
      JSON.stringify({
        app: "rise-translate",
        timestamp: new Date().toISOString(),
        featureArea: "cleanup",
        eventType: "operational_event_persist_failed",
        severity: "warning",
        errorType: toOperationalErrorType(error),
        message: getOperationalErrorMessage(error, "Unable to persist operational event."),
      }),
    );
  }
}
