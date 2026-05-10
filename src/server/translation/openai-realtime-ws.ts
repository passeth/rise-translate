import WebSocket from "ws";
import type { OpenAIRealtimeWebSocketRequest } from "@/server/translation/openai-realtime-adapter";
import type { RealtimeJsonConnection } from "@/server/translation/realtime-audio-pump";

export async function connectOpenAIRealtimeWebSocket(
  request: OpenAIRealtimeWebSocketRequest,
): Promise<RealtimeJsonConnection> {
  const socket = new WebSocket(request.url, { headers: request.headers });
  const events = createWebSocketEventIterable(socket);

  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });

  return {
    sendJson: (event) =>
      new Promise<void>((resolve, reject) => {
        socket.send(JSON.stringify(event), (error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
    events,
    close: async () => {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    },
  };
}

function createWebSocketEventIterable(socket: WebSocket): AsyncIterable<unknown> {
  const queue: unknown[] = [];
  const waiters: Array<(value: IteratorResult<unknown>) => void> = [];
  let closed = false;
  let failure: Error | null = null;

  const resolveNext = (value: IteratorResult<unknown>) => {
    const waiter = waiters.shift();
    if (waiter) waiter(value);
    else if (!value.done) queue.push(value.value);
  };

  socket.on("message", (data) => {
    try {
      const text = typeof data === "string" ? data : data.toString();
      resolveNext({ value: JSON.parse(text), done: false });
    } catch (error) {
      failure = error instanceof Error ? error : new Error("Unable to parse realtime event.");
      resolveNext({ value: undefined, done: true });
    }
  });
  socket.on("error", (error) => {
    failure = error instanceof Error ? error : new Error("Realtime WebSocket failed.");
    resolveNext({ value: undefined, done: true });
  });
  socket.on("close", () => {
    closed = true;
    resolveNext({ value: undefined, done: true });
  });

  return {
    [Symbol.asyncIterator]() {
      return {
        next: async () => {
          if (queue.length > 0) return { value: queue.shift(), done: false };
          if (failure) throw failure;
          if (closed) return { value: undefined, done: true };
          return new Promise<IteratorResult<unknown>>((resolve) => waiters.push(resolve));
        },
      };
    },
  };
}
