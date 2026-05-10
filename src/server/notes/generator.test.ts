import { describe, expect, it } from "vitest";
import { getMarkdownFilename, summarizeTranscript } from "./generator";

describe("meeting notes generator helpers", () => {
  it("creates safe markdown filenames", () => {
    expect(getMarkdownFilename("Buyer / EVAS: 가격 협의", "2026-05-09T02:05:00.000Z")).toBe(
      "2026-05-09-buyer-evas-가격-협의.md",
    );
  });

  it("falls back to transcript-only notes summary when the OpenAI summary call fails", async () => {
    const openai = {
      responses: {
        create: async () => {
          throw new Error("model unavailable");
        },
      },
    };

    await expect(
      summarizeTranscript(
        [
          {
            sequence: 1,
            startedAt: "2026-05-09T01:00:00.000Z",
            endedAt: null,
            speakerName: "Ivan",
            speakerCompany: "BuyerCo",
            sourceLanguage: "ru",
            sourceText: "Цена слишком высокая.",
            koreanText: "가격이 너무 높습니다.",
          },
        ],
        openai as never,
      ),
    ).resolves.toMatchObject({
      summaryKo: expect.stringContaining("원문/한국어 transcript만 보존"),
      openQuestions: ["자동 요약을 다시 생성해야 합니다."],
    });
  });

});
