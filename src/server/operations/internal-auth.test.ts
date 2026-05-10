import { describe, expect, it } from "vitest";
import { isInternalWorkerAuthorized } from "./internal-auth";

describe("isInternalWorkerAuthorized", () => {
  it("requires the configured bearer token", () => {
    expect(
      isInternalWorkerAuthorized({
        authorizationHeader: "Bearer secret",
        expectedToken: "secret",
        production: true,
      }),
    ).toBe(true);
    expect(
      isInternalWorkerAuthorized({
        authorizationHeader: "Bearer wrong",
        expectedToken: "secret",
        production: true,
      }),
    ).toBe(false);
  });

  it("fails closed in production when no token is configured", () => {
    expect(isInternalWorkerAuthorized({ authorizationHeader: null, production: true })).toBe(false);
  });

  it("allows local development when no token is configured", () => {
    expect(isInternalWorkerAuthorized({ authorizationHeader: null, production: false })).toBe(true);
  });
});
