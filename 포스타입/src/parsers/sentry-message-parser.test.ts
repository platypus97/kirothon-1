import { describe, it, expect } from "vitest";
import {
  isSentryUrl,
  extractProblemUrl,
  parseSentryAlert,
} from "./sentry-message-parser";

describe("isSentryUrl", () => {
  it("returns true for sentry.io URLs", () => {
    expect(isSentryUrl("https://sentry.io/issues/123")).toBe(true);
    expect(isSentryUrl("https://myorg.sentry.io/issues/456")).toBe(true);
    expect(isSentryUrl("https://app.sentry.io/dashboard")).toBe(true);
  });

  it("returns false for non-Sentry URLs", () => {
    expect(isSentryUrl("https://example.com/api/users")).toBe(false);
    expect(isSentryUrl("https://api.myservice.io/health")).toBe(false);
    expect(isSentryUrl("https://notsentry.io/page")).toBe(false);
  });

  it("returns false for invalid URLs", () => {
    expect(isSentryUrl("not-a-url")).toBe(false);
    expect(isSentryUrl("")).toBe(false);
  });
});

describe("extractProblemUrl", () => {
  it("extracts non-Sentry URL from mixed message", () => {
    const msg =
      "Alert: Error on https://api.myapp.com/users - see https://myorg.sentry.io/issues/123";
    expect(extractProblemUrl(msg)).toBe("https://api.myapp.com/users");
  });

  it("returns null when only Sentry URLs are present", () => {
    const msg = "Check https://myorg.sentry.io/issues/789 for details";
    expect(extractProblemUrl(msg)).toBeNull();
  });

  it("returns null when no URLs are present", () => {
    expect(extractProblemUrl("No URLs here")).toBeNull();
  });

  it("returns first non-Sentry URL when multiple exist", () => {
    const msg =
      "Errors on https://api.myapp.com/orders and https://api.myapp.com/users";
    expect(extractProblemUrl(msg)).toBe("https://api.myapp.com/orders");
  });

  it("handles Slack-formatted URLs with angle brackets", () => {
    const msg =
      "<@U123> Alert: <https://api.myapp.com/health> <https://myorg.sentry.io/issues/1>";
    expect(extractProblemUrl(msg)).toBe("https://api.myapp.com/health");
  });
});

describe("parseSentryAlert", () => {
  it("extracts problemUrl, errorType, and errorMessage from a typical alert", () => {
    const msg = `TypeError: Cannot read property 'id' of undefined
      https://api.myapp.com/users/123
      https://myorg.sentry.io/issues/456`;

    const result = parseSentryAlert(msg);
    expect(result.problemUrl).toBe("https://api.myapp.com/users/123");
    expect(result.errorType).toBe("TypeError");
    expect(result.rawText).toBe(msg);
  });

  it("returns null problemUrl when no service URL exists", () => {
    const msg = "Error at https://myorg.sentry.io/issues/789";
    const result = parseSentryAlert(msg);
    expect(result.problemUrl).toBeNull();
  });

  it("extracts HTTP error types", () => {
    const msg =
      "500 Internal Server Error on https://api.myapp.com/checkout";
    const result = parseSentryAlert(msg);
    expect(result.errorType).toBe("500 Internal Server Error");
    expect(result.problemUrl).toBe("https://api.myapp.com/checkout");
  });

  it("extracts error message from quoted text", () => {
    const msg = `ReferenceError: "x is not defined" at https://myapp.com/page`;
    const result = parseSentryAlert(msg);
    expect(result.errorMessage).toBe("x is not defined");
  });

  it("extracts error message after colon pattern", () => {
    const msg =
      "Error: Connection refused to database at https://api.myapp.com/db";
    const result = parseSentryAlert(msg);
    expect(result.errorMessage).toBe(
      "Connection refused to database at https://api.myapp.com/db"
    );
  });

  it("returns null for errorType and errorMessage when not found", () => {
    const msg = "Something happened at https://myapp.com/page";
    const result = parseSentryAlert(msg);
    expect(result.problemUrl).toBe("https://myapp.com/page");
    expect(result.errorType).toBeNull();
    expect(result.errorMessage).toBeNull();
  });

  it("always includes rawText", () => {
    const msg = "any text";
    const result = parseSentryAlert(msg);
    expect(result.rawText).toBe(msg);
  });
});
