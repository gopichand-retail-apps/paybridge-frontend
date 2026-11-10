export const DEFAULT_IS_MOCK = true;

export function resolveIsMock(value: string | undefined): boolean {
  if (value === undefined) return DEFAULT_IS_MOCK;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error('VITE_IS_MOCK must be exactly "true" or "false".');
}

export const IS_MOCK = resolveIsMock(import.meta.env.VITE_IS_MOCK);

export interface ApiModeConfiguration {
  isMock: boolean;
  isDevelopment: boolean;
  mockApiBaseUrl?: string;
  realApiBaseUrl?: string;
  legacyApiBaseUrl?: string;
}

export const apiModeConfiguration: ApiModeConfiguration = {
  isMock: IS_MOCK,
  isDevelopment: import.meta.env.DEV,
  mockApiBaseUrl: import.meta.env.VITE_MOCK_API_BASE_URL,
  realApiBaseUrl: import.meta.env.VITE_REAL_API_BASE_URL,
  legacyApiBaseUrl: import.meta.env.VITE_API_BASE_URL,
};

export interface ApiRequestTarget {
  url: string;
  credentials: RequestCredentials;
}

function configuredOrigin(
  value: string,
  setting: string,
): { origin: string; isLoopback: boolean } {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`${setting} must be an absolute HTTP(S) API origin.`);
  }

  const isLoopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(
    url.hostname,
  );
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    (url.pathname !== "" && url.pathname !== "/")
  ) {
    throw new Error(
      `${setting} must be an HTTP(S) origin without a path, credentials, query, or fragment.`,
    );
  }
  if (url.protocol === "http:" && !isLoopback) {
    throw new Error(
      `${setting} must use HTTPS unless it targets a loopback host.`,
    );
  }
  return { origin: url.origin, isLoopback };
}

function selectedApiOrigin(
  configuration: ApiModeConfiguration,
): string | undefined {
  if (configuration.isMock) {
    const mockBaseUrl = configuration.mockApiBaseUrl?.trim();
    if (mockBaseUrl)
      return configuredOrigin(mockBaseUrl, "VITE_MOCK_API_BASE_URL").origin;

    const legacyBaseUrl = configuration.legacyApiBaseUrl?.trim();
    if (legacyBaseUrl) {
      const legacyOrigin = configuredOrigin(legacyBaseUrl, "VITE_API_BASE_URL");
      if (!configuration.isDevelopment || !legacyOrigin.isLoopback) {
        throw new Error(
          "Use VITE_MOCK_API_BASE_URL for mock mode; VITE_API_BASE_URL is live-only.",
        );
      }
      return legacyOrigin.origin;
    }

    if (configuration.isDevelopment) return undefined;
    throw new Error(
      "VITE_MOCK_API_BASE_URL is required for mock mode outside local development.",
    );
  }

  const realBaseUrl =
    configuration.realApiBaseUrl?.trim() ||
    configuration.legacyApiBaseUrl?.trim();
  if (!realBaseUrl) {
    throw new Error(
      "VITE_REAL_API_BASE_URL is required when VITE_IS_MOCK=false.",
    );
  }
  const setting = configuration.realApiBaseUrl?.trim()
    ? "VITE_REAL_API_BASE_URL"
    : "VITE_API_BASE_URL";
  return configuredOrigin(realBaseUrl, setting).origin;
}

export function resolveApiRequest(
  path: string,
  configuration: ApiModeConfiguration = apiModeConfiguration,
): ApiRequestTarget {
  if (
    !path.startsWith("/api/") ||
    path.startsWith("//") ||
    path.includes("\\")
  ) {
    throw new Error("API requests must use a same-origin /api/ path.");
  }

  const origin = selectedApiOrigin(configuration);
  return {
    url: origin ? `${origin}${path}` : path,
    credentials: "include",
  };
}
