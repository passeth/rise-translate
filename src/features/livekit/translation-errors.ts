export class NonRetryableTranslationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableTranslationError";
  }
}

export function isNonRetryableTranslationTokenStatus(status: number) {
  return [400, 401, 403, 404, 409, 429].includes(status);
}
