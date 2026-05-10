import { describe, expect, it } from "vitest";
import {
  createMeetingSchema,
  MEETING_BUYER_COMPANY_MAX_LENGTH,
  MEETING_MEMO_MAX_LENGTH,
  MEETING_TITLE_MAX_LENGTH,
} from "./create-validation";

describe("createMeetingSchema", () => {
  it("trims accepted meeting fields", () => {
    expect(
      createMeetingSchema.parse({
        title: " Buyer call ",
        scheduledStartAt: "2026-05-09T12:00",
        buyerCompany: " ACME ",
        memo: " memo ",
      }),
    ).toMatchObject({ title: "Buyer call", buyerCompany: "ACME", memo: "memo" });
  });

  it("rejects oversized fields", () => {
    expect(() =>
      createMeetingSchema.parse({
        title: "x".repeat(MEETING_TITLE_MAX_LENGTH + 1),
        scheduledStartAt: "2026-05-09T12:00",
        buyerCompany: "ACME",
      }),
    ).toThrow();
    expect(() =>
      createMeetingSchema.parse({
        title: "Buyer call",
        scheduledStartAt: "2026-05-09T12:00",
        buyerCompany: "x".repeat(MEETING_BUYER_COMPANY_MAX_LENGTH + 1),
      }),
    ).toThrow();
    expect(() =>
      createMeetingSchema.parse({
        title: "Buyer call",
        scheduledStartAt: "2026-05-09T12:00",
        buyerCompany: "ACME",
        memo: "x".repeat(MEETING_MEMO_MAX_LENGTH + 1),
      }),
    ).toThrow();
  });
});
