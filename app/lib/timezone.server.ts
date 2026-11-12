// ─── Time Zone Resolution ───
// The root layout's inline script writes the browser's IANA zone to the cadence_tz cookie.
// The value is untrusted: validate it with Intl and fall back to "UTC". Never throws.
// Intl.supportedValuesOf("timeZone") is deliberately not used — it omits UTC, Etc/* and aliases.

const TIME_ZONE_COOKIE = "cadence_tz";

const MAX_TIME_ZONE_LENGTH = 64;

export function resolveTimeZone(request: Request): string {
  const raw = readCookie(request.headers.get("Cookie"), TIME_ZONE_COOKIE);
  if (!raw || raw.length > MAX_TIME_ZONE_LENGTH) return "UTC";

  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: raw }).resolvedOptions().timeZone;
  } catch {
    return "UTC"; // RangeError: invalid time zone
  }
}

function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1 || part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return undefined; // malformed percent-encoding
    }
  }
  return undefined;
}
