import { describe, expect, it, vi } from "vitest";
import { DEFAULT_IS_MOCK, resolveApiRequest, resolveIsMock } from "./config";

describe("API data mode configuration", () => {
  it("defaults to mock mode and accepts only exact true or false values", () => {
    expect(DEFAULT_IS_MOCK).toBe(true);
    expect(resolveIsMock(undefined)).toBe(true);
    expect(resolveIsMock("true")).toBe(true);
    expect(resolveIsMock("false")).toBe(false);
    expect(() => resolveIsMock("FALSE")).toThrow("VITE_IS_MOCK");
    expect(() => resolveIsMock("")).toThrow("VITE_IS_MOCK");
  });

  it("ignores a legacy sessionStorage mode value during build-time configuration", async () => {
    const configuredValue = import.meta.env.VITE_IS_MOCK;
    const buildMode = resolveIsMock(configuredValue);
    const legacyOverride = buildMode ? "false" : "true";
    window.sessionStorage.setItem("isMock", legacyOverride);

    try {
      vi.resetModules();
      const config = await import("./config");
      expect(config.IS_MOCK).toBe(buildMode);
      expect(config.apiModeConfiguration.isMock).toBe(buildMode);
    } finally {
      window.sessionStorage.clear();
      vi.resetModules();
    }
  });

  it("uses the local Vite proxy in development unless a mock API origin is configured", () => {
    expect(
      resolveApiRequest("/api/v1/auth/profiles", {
        isMock: true,
        isDevelopment: true,
      }),
    ).toEqual({ url: "/api/v1/auth/profiles", credentials: "include" });
    expect(
      resolveApiRequest("/api/v1/auth/profiles", {
        isMock: true,
        isDevelopment: true,
        mockApiBaseUrl: "http://127.0.0.1:5604",
      }),
    ).toEqual({
      url: "http://127.0.0.1:5604/api/v1/auth/profiles",
      credentials: "include",
    });
  });

  it("routes server requests to the configured API and retains the legacy base setting", () => {
    expect(
      resolveApiRequest("/api/v1/payment-intents", {
        isMock: false,
        isDevelopment: true,
        mockApiBaseUrl: "http://127.0.0.1:1",
        realApiBaseUrl: "https://api.example.test",
      }),
    ).toEqual({
      url: "https://api.example.test/api/v1/payment-intents",
      credentials: "include",
    });
    expect(
      resolveApiRequest("/api/v1/payment-intents", {
        isMock: false,
        isDevelopment: true,
        legacyApiBaseUrl: "https://legacy-api.example.test",
      }).url,
    ).toBe("https://legacy-api.example.test/api/v1/payment-intents");
  });

  it("fails explicitly for missing, unsafe, or mismatched mode endpoints", () => {
    expect(() =>
      resolveApiRequest("/api/v1/payment-intents", {
        isMock: false,
        isDevelopment: true,
      }),
    ).toThrow("VITE_REAL_API_BASE_URL");
    expect(() =>
      resolveApiRequest("/api/v1/payment-intents", {
        isMock: false,
        isDevelopment: false,
      }),
    ).toThrow("VITE_REAL_API_BASE_URL");
    expect(() =>
      resolveApiRequest("/api/v1/payment-intents", {
        isMock: true,
        isDevelopment: false,
      }),
    ).toThrow("VITE_MOCK_API_BASE_URL");
    expect(() =>
      resolveApiRequest("/api/v1/payment-intents", {
        isMock: true,
        isDevelopment: true,
        legacyApiBaseUrl: "https://legacy-api.example.test",
      }),
    ).toThrow("VITE_MOCK_API_BASE_URL");
    expect(() =>
      resolveApiRequest("/api/v1/payment-intents", {
        isMock: false,
        isDevelopment: true,
        realApiBaseUrl: "http://api.example.test",
      }),
    ).toThrow("HTTPS");
    expect(() =>
      resolveApiRequest("//api.example.test/api/v1/payment-intents", {
        isMock: true,
        isDevelopment: true,
      }),
    ).toThrow("same-origin");
  });

  it("accepts only safe API origins for mock and server configurations", () => {
    const invalidOrigins = [
      ["not an origin", "absolute HTTP(S) API origin"],
      ["ftp://127.0.0.1:5604", "HTTP(S) origin"],
      ["https://user:pass@api.example.test", "without a path, credentials"],
      ["https://api.example.test/payments", "without a path, credentials"],
      ["https://api.example.test?mode=1", "without a path, credentials"],
      ["https://api.example.test#fragment", "without a path, credentials"],
      ["http://api.example.test", "must use HTTPS"],
    ] as const;

    for (const [origin, message] of invalidOrigins) {
      expect(() =>
        resolveApiRequest("/api/v1/overview", {
          isMock: true,
          isDevelopment: true,
          mockApiBaseUrl: origin,
        }),
      ).toThrow(message);
    }

    expect(
      resolveApiRequest("/api/v1/overview", {
        isMock: true,
        isDevelopment: true,
        legacyApiBaseUrl: "http://localhost:5604/",
      }),
    ).toEqual({
      url: "http://localhost:5604/api/v1/overview",
      credentials: "include",
    });
    expect(
      resolveApiRequest("/api/v1/overview", {
        isMock: false,
        isDevelopment: true,
        legacyApiBaseUrl: "https://legacy.example.test",
      }).url,
    ).toBe("https://legacy.example.test/api/v1/overview");
  });

  it("rejects malformed or non-API paths before resolving an origin", () => {
    for (const path of [
      "api/v1/payments",
      "/v1/payments",
      "/api\\v1\\payments",
      "/api/v1/payments\\1",
    ]) {
      expect(() =>
        resolveApiRequest(path, {
          isMock: true,
          isDevelopment: true,
        }),
      ).toThrow("same-origin");
    }
  });
});
