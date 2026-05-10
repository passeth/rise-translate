import { describe, expect, it } from "vitest";
import { assertPublicHttpsUrl } from "./deployment-smoke";

describe("deployment smoke URL validation", () => {
  it("allows public HTTPS origins", () => {
    expect(() => assertPublicHttpsUrl("https://meet.example.com")).not.toThrow();
  });

  it("rejects localhost", () => {
    expect(() => assertPublicHttpsUrl("http://localhost:3000")).toThrow("not localhost");
  });

  it("rejects non-HTTPS public URLs", () => {
    expect(() => assertPublicHttpsUrl("http://meet.example.com")).toThrow("HTTPS");
  });
});
