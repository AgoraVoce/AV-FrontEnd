/**
 * Keep local Chromium/API tests on same-origin /api routes; in a hosted build
 * requests may use the explicit, public HTTPS API origin.
 *
 * This setting is public (embedded in the Vite bundle), never place credentials
 * or database URLs here. Backend access remains subject to Bearer authorization.
 */
const configuredOrigin = (import.meta.env.VITE_AV_API_ORIGIN || "").trim().replace(/\/+$/, "");

export function apiEndpoint(path: string): string {
  if (!path.startsWith("/api/v1/")) {
    throw new Error("API endpoint must start with /api/v1/");
  }
  return configuredOrigin + path;
}
