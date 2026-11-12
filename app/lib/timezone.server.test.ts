import { describe, it, expect } from "vitest";
import { resolveTimeZone } from "./timezone.server";

function makeRequest(cookie?: string): Request {
  return new Request("http://localhost:3000", {
    headers: cookie === undefined ? {} : { Cookie: cookie },
  });
}

function withTz(value: string): Request {
  return makeRequest(`cadence_tz=${encodeURIComponent(value)}`);
}

describe("resolveTimeZone", () => {
  // ─── Fallback to UTC ───

  it("returns UTC when there is no Cookie header", () => {
    expect(resolveTimeZone(makeRequest())).toBe("UTC");
  });

  it("returns UTC when cadence_tz is absent", () => {
    expect(resolveTimeZone(makeRequest("cadence_session=abc"))).toBe("UTC");
  });

  it("returns UTC when cadence_tz is empty", () => {
    expect(resolveTimeZone(makeRequest("cadence_tz="))).toBe("UTC");
  });

  it("returns UTC when cadence_tz is over 64 characters", () => {
    expect(resolveTimeZone(withTz(`America/${"A".repeat(60)}`))).toBe("UTC");
  });

  it("returns UTC for an unknown zone", () => {
    expect(resolveTimeZone(withTz("Mars/Olympus"))).toBe("UTC");
  });

  it("returns UTC for a path traversal value", () => {
    expect(resolveTimeZone(withTz("../../etc/passwd"))).toBe("UTC");
  });

  it("returns UTC for a malformed percent-encoding", () => {
    expect(resolveTimeZone(makeRequest("cadence_tz=%E0%A4%A"))).toBe("UTC");
  });

  // ─── Accepted zones ───

  it("accepts a regular IANA zone", () => {
    expect(resolveTimeZone(withTz("America/New_York"))).toBe("America/New_York");
  });

  it("accepts an unencoded cookie value", () => {
    expect(resolveTimeZone(makeRequest("cadence_tz=Europe/Berlin"))).toBe(
      "Europe/Berlin",
    );
  });

  // V8 returns ICU/CLDR canonical names, which may be the older IANA spelling.
  it("accepts Asia/Kolkata and returns its canonical name", () => {
    expect(["Asia/Kolkata", "Asia/Calcutta"]).toContain(
      resolveTimeZone(withTz("Asia/Kolkata")),
    );
  });

  it("accepts Europe/Kyiv and returns its canonical name", () => {
    expect(["Europe/Kyiv", "Europe/Kiev"]).toContain(
      resolveTimeZone(withTz("Europe/Kyiv")),
    );
  });

  it("canonicalises a link zone", () => {
    expect(resolveTimeZone(withTz("US/Eastern"))).toBe("America/New_York");
  });

  it("canonicalises UTC aliases to UTC", () => {
    expect(resolveTimeZone(withTz("Etc/UTC"))).toBe("UTC");
  });

  it("accepts UTC", () => {
    expect(resolveTimeZone(withTz("UTC"))).toBe("UTC");
  });

  it("accepts an Etc/* zone", () => {
    expect(resolveTimeZone(withTz("Etc/GMT+5"))).toBe("Etc/GMT+5");
  });

  it("returns the canonical casing of a zone", () => {
    expect(resolveTimeZone(withTz("america/new_york"))).toBe("America/New_York");
  });

  it("reads cadence_tz among other cookies", () => {
    expect(
      resolveTimeZone(
        makeRequest(`cadence_session=abc; cadence_tz=${encodeURIComponent("Asia/Tokyo")}; theme=dark`),
      ),
    ).toBe("Asia/Tokyo");
  });
});
