import { z } from "zod";

export const MEETING_TITLE_MAX_LENGTH = 120;
export const MEETING_BUYER_COMPANY_MAX_LENGTH = 120;
export const MEETING_MEMO_MAX_LENGTH = 2_000;

export const createMeetingSchema = z.object({
  title: z.string().trim().min(1, "Meeting title is required.").max(MEETING_TITLE_MAX_LENGTH),
  scheduledStartAt: z.string().min(1, "Scheduled time is required."),
  buyerCompany: z.string().trim().min(1, "Buyer company is required.").max(MEETING_BUYER_COMPANY_MAX_LENGTH),
  memo: z.string().trim().max(MEETING_MEMO_MAX_LENGTH).optional(),
});

export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;
