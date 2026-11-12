# cadence-a4b.1.1: Turning `completedAt` into Study days with built-in `Intl`

Research ticket: can Node 24's built-in `Intl` map a UTC ISO-8601 `lessonProgress.completedAt` to a calendar date in the student's IANA timezone, DST included? Can it work out "today" and "yesterday" there? How should the server validate the untrusted `cadence_tz` cookie?

Environment checked: Node v24.14.0, `process.versions.icu` 78.2, tz 2025c, Unicode 17.0, official nvm binary.

## Answer

**Yes.** `Intl.DateTimeFormat` with a `timeZone` option, read through `formatToParts`, gives correct local calendar dates in any IANA zone. This includes DST changes, 30- and 45-minute offsets, Lord Howe's 30-minute DST, and Apia's skipped day in 2011. No date library is needed.

- **Validate the cookie by constructing a formatter, not by checking a list.** Wrap `new Intl.DateTimeFormat('en-US', { timeZone })` in `try/catch`. Any `RangeError` falls back to `"UTC"`. Store or use `resolvedOptions().timeZone` as the canonical form.
  - Do **not** check membership in `Intl.supportedValuesOf('timeZone')`. On this Node it leaves out `UTC`, every `Etc/*` zone, `Asia/Kolkata` and `Europe/Kyiv`.
  - Reject anything that is not a string, is empty, or is longer than 64 characters before calling `Intl`.
- **Get the local date from `formatToParts`, not from `toLocaleDateString`.** Use one cached formatter per zone, with `calendar: 'gregory'` and `numberingSystem: 'latn'` pinned.
- **Work out "yesterday" with calendar arithmetic.** Turn `YYYY-MM-DD` into an epoch day number with `Date.UTC(y, m-1, d) / 86_400_000`, then subtract 1. Never use `now - 24h`.
- **Two Study days are consecutive when their epoch day numbers differ by exactly 1.** A Streak is a run of such days.
- **Do not use `Temporal` on Node 24.** It exists only behind `--harmony-temporal`, which is experimental. It is on by default from Node 26, so it is a good thing to migrate to later.

```ts
const MAX_TZ_LENGTH = 64;
const DAY_MS = 86_400_000;
const dayFormatters = new Map<string, Intl.DateTimeFormat>();

/** Untrusted cookie value -> canonical zone ID, or "UTC". Never throws. */
export function resolveTimeZone(raw: string | undefined): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_TZ_LENGTH) return "UTC";
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: raw }).resolvedOptions().timeZone;
  } catch {
    return "UTC"; // RangeError: invalid time zone
  }
}

function dayFormatter(tz: string): Intl.DateTimeFormat {
  let f = dayFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, calendar: "gregory", numberingSystem: "latn",
      year: "numeric", month: "2-digit", day: "2-digit",
    });
    dayFormatters.set(tz, f); // key by resolveTimeZone() output, so the map stays bounded (~600 IDs)
  }
  return f;
}

/** UTC instant -> local calendar date "YYYY-MM-DD" in tz (tz must already be resolved). */
export function studyDay(instant: string | Date, tz: string): string {
  const parts = dayFormatter(tz).formatToParts(typeof instant === "string" ? new Date(instant) : instant);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export const toEpochDay = (d: string) =>
  Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / DAY_MS;
export const fromEpochDay = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);

export function todayAndYesterday(tz: string, now: Date = new Date()) {
  const today = studyDay(now, tz);
  return { today, yesterday: fromEpochDay(toEpochDay(today) - 1) };
}
```

`studyDay` throws `RangeError: Invalid time value` if `completedAt` cannot be parsed. Data in the database should always be valid, so let it throw rather than hiding the problem.

## Findings

1. **Node's official binaries ship full ICU.** The Node docs list `--with-intl=full-icu` as the default build mode. They say: "The official binaries are also built in this mode." The other modes are `none`, `small-icu` and `system-icu`. With `system-icu`, `Intl.DateTimeFormat` "may be fully or partially supported, depending on the completeness of the ICU data installed on the system" [node-intl]. Full ICU became the release default in v13.0.0 [node-13].
   - Distro packages (for example Debian/Ubuntu `nodejs` built against system ICU) or custom Alpine builds may use `system-icu`. Their timezone data then follows the OS ICU, not Node's. Run the docs' `hasFullICU` check, or log `process.versions.icu`/`tz` at boot, if the deploy target is unusual.
   - Locally: `process.config.variables.icu_small === false`, and the `'es'` month check returns `enero` (full ICU).
2. **The `DateTimeFormat` constructor is the spec's validator.** In ECMA-402 CreateDateTimeFormat (§11.1.2):
   - An offset string goes through `IsTimeZoneOffsetString`, and offsets with seconds throw.
   - Anything else goes through `GetAvailableNamedTimeZoneIdentifier`, and "if timeZoneIdentifierRecord is empty, throw a RangeError exception". Otherwise the format's time zone becomes the record's `[[PrimaryIdentifier]]` [ecma402].
   - Matching is "an ASCII-case-insensitive match" (§6.5.2, §6.1). Returned IDs "must use the casing found in the IANA Time Zone Database" (§6.5).
3. **`supportedValuesOf` is the wrong tool for validation.** `Intl.supportedValuesOf('timeZone')` returns `AvailablePrimaryTimeZoneIdentifiers()` (§8.3.2, §6.5.3), which is primary IDs only, so aliases are left out by design. The spec says `"UTC"` must be primary (§6.5), but V8/Node 24 leaves it out anyway: neither `UTC` nor any `Etc/*` appears among the 418 entries. Membership checks would wrongly reject `UTC`, `Asia/Kolkata`, `Europe/Kyiv`, `US/Eastern` and `Etc/GMT+5`, all of which the constructor accepts.
4. **V8 uses CLDR/ICU canonical names, which differ from the current spec.** `Asia/Kolkata` resolves to `Asia/Calcutta`, and `Europe/Kyiv` to `Europe/Kiev` (observed). The spec text implies IANA Zone names are primary. This is harmless because both names give the same offsets. Never compare raw zone strings for equality; compare `resolveTimeZone()` outputs.
5. **Offset time zones are allowed by the spec (§11.1.2), and Node accepts them.** `+05:00`, `+05` and `-0800` normalise to `±HH:MM`. A browser's `resolvedOptions().timeZone` will not produce these, but a forged cookie can. They are harmless: a fixed offset with no DST.
6. **Temporal works on Node 24 only behind a flag.** `typeof Temporal === 'undefined'` without flags. `node --v8-options` lists `--harmony-temporal (enable "Temporal" (in progress / experimental))`. Node 26.0.0 (2026-05-05, V8 14.6) says: "The Temporal API is now enabled by default" [node-26]. Temporal has reached TC39 Stage 4 [temporal]. When the repo moves to Node 26, `Temporal.Instant.from(iso).toZonedDateTimeISO(tz).toPlainDate()` and `PlainDate.subtract({ days: 1 })` will replace the helpers above.

## Pitfalls

- **`toLocaleDateString()` output depends on the locale and calendar.** Observed for 2026-03-08: `3/8/2026` (en-US/default), `08/03/2026` (en-GB), `8.3.2026` (de), Arabic-Indic digits (ar-EG), `۱۴۰۴/۱۲/۱۷` (fa-IR, Persian calendar), `8/3/2569` (th-TH, Buddhist year), `R8/3/8` (Japanese calendar).
  - `en-CA` happens to give `YYYY-MM-DD`, but locale data can change between ICU versions.
  - Read the parts with `formatToParts`, and pin `calendar`/`numberingSystem`, so a `-u-ca-`/`-u-nu-` default cannot slip in.
- **`now - 24h` gives the wrong "yesterday" around DST.** DST days are 23 or 25 hours long. Observed:
  - New York 2026-03-09 00:30 EDT: naive gives 03-07 (correct is 03-08).
  - New York 2026-11-01 23:30 EST: naive gives 11-01, the same day as today.
  - London 2026-03-30 00:30 BST: naive gives 03-28.
  - Calendar arithmetic on the epoch day number is correct in all of these.
- **Gaps in the local calendar.** Pacific/Apia jumped from 2011-12-29 23:59:59 (−10) straight to 2011-12-31 00:00 (+14), so 12-30 never existed there. Epoch day arithmetic calls 12-30 "yesterday" on 12-31, so a student active on 12-29 and 12-31 would lose their Streak.
  - This is the only kind of case where "consecutive calendar days" and "consecutive days the zone actually had" disagree. It is a historic one-off, so accept it. If it ever matters, define "previous Study day" as `studyDay(startOfLocalToday - 1ms)`.
- **Etc/GMT signs are inverted (POSIX).** `Etc/GMT+5` is UTC−5. It is valid; just don't parse the sign yourself.
- **Missing zone means server zone, not UTC.** With `timeZone: undefined`, Node uses the server's zone (observed `America/Los_Angeles` on this machine). Always pass the resolved zone explicitly. `null` throws `RangeError` (it is stringified to `"null"`).
- **Whitespace and control characters are rejected, not trimmed.** `" UTC"`, `"UTC "` and a trailing `\u0000` all throw. This is fine with fallback-to-UTC; trimming first is optional. The 64-character cap stops pathological input before ICU sees it. The longest real IANA ID is about 30 characters.
- **Constructing formatters is expensive.** Per call on this machine:
  - About 31 µs to construct a `DateTimeFormat` and format, and about 32 µs for `toLocaleDateString` (which builds one internally).
  - About 1.3 µs to format with a cached formatter.
  - Cache by the resolved zone (the set is bounded). `resolveTimeZone` itself costs about 32 µs, so call it once per request, not once per row.
- **The browser and server ICU/tz versions can differ.** An ID that is very new in the browser could be unknown to an older server ICU. It then falls back to UTC rather than crashing. That is acceptable, but worth a log line.
- **The cookie is untrusted.** A forged zone only changes how that student's own Study days are bucketed; it is never used in SQL or file paths. Keep it that way: bucket in JS after the query, or pass only the resolved value onward.

## Empirical checks

Scripts were in `/tmp/intlstudy/{a,b,c}.mjs`, run with `node` v24.14.0.

**Validation (`new Intl.DateTimeFormat('en-US',{timeZone:z}).resolvedOptions().timeZone`, plus whether `z` is in `supportedValuesOf`):**

| Input | In list? | Result |
| --- | --- | --- |
| `UTC`, `Etc/UTC`, `GMT`, `Etc/GMT`, `utc` | false | `UTC` |
| `Asia/Calcutta` | true | `Asia/Calcutta` |
| `Asia/Kolkata` | **false** | `Asia/Calcutta` |
| `Europe/Kyiv` | **false** | `Europe/Kiev` |
| `US/Eastern`, `EST5EDT`, `america/new_york`, `AMERICA/NEW_YORK` | false | `America/New_York` |
| `EST` | false | `America/Panama` |
| `Etc/GMT+5` | false | `Etc/GMT+5` |
| `+05:00` / `+05` / `-0800` | false | `+05:00` / `+05:00` / `-08:00` |
| `Z`, `Local`, `Factory`, `Mars/Olympus`, `""`, `" UTC"`, `"UTC "`, `../../etc/passwd`, 300×`A`, `America/New_York\0`, `null` | false | `RangeError: Invalid time zone specified: …` |

`supportedValuesOf` contains neither `UTC` nor anything starting with `Etc/`. It holds 418 entries.

**`studyDay` at boundary instants (with the full local time for cross-checking):**

```
America/New_York  2026-03-08T06:59:59.999Z -> 2026-03-08 | 01:59:59 EST
America/New_York  2026-03-08T07:00:00.000Z -> 2026-03-08 | 03:00:00 EDT   (spring forward)
America/New_York  2026-03-09T03:59:59.999Z -> 2026-03-08 | 23:59:59 EDT
America/New_York  2026-03-09T04:00:00.000Z -> 2026-03-09 | 00:00:00 EDT
America/New_York  2026-11-01T05:30:00.000Z -> 2026-11-01 | 01:30:00 EDT
America/New_York  2026-11-01T06:30:00.000Z -> 2026-11-01 | 01:30:00 EST   (repeated hour)
America/New_York  2026-11-02T04:59:59.999Z -> 2026-11-01 | 23:59:59 EST
Europe/London     2026-03-29T01:00:00.000Z -> 2026-03-29 | 02:00:00 GMT+1
Europe/London     2026-03-29T23:00:00.000Z -> 2026-03-30 | 00:00:00 GMT+1
Australia/Lord_Howe 2026-04-04T14:59:00Z   -> 2026-04-05 | 01:59 GMT+11
Australia/Lord_Howe 2026-04-04T15:00:00Z   -> 2026-04-05 | 01:30 GMT+10:30 (30-min fall back)
Australia/Lord_Howe 2026-04-05T13:30:00Z   -> 2026-04-06 | 00:00 GMT+10:30
Pacific/Apia      2011-12-30T09:59:59Z     -> 2011-12-29 | 23:59:59 GMT-10
Pacific/Apia      2011-12-30T10:00:00Z     -> 2011-12-31 | 00:00:00 GMT+14
Asia/Kolkata      2026-03-08T18:30:00.000Z -> 2026-03-09 | 00:00 GMT+5:30
Asia/Kathmandu    2026-03-08T18:15:00.000Z -> 2026-03-09 | 00:00 GMT+5:45
Pacific/Kiritimati 2026-03-08T10:00Z -> 2026-03-09;  Pacific/Pago_Pago same instant -> 2026-03-07
Apia local dates sampled hourly 2011-12-28..2012-01-01Z: 2011-12-27 28 29 31 2012-01-01 02  (no 12-30)
```

**today/yesterday, calendar arithmetic compared with the naive `now − 24h`:**

```
America/New_York 2026-03-09T04:30Z  {today 2026-03-09, yesterday 2026-03-08}  naive 2026-03-07  WRONG
America/New_York 2026-11-02T04:30Z  {today 2026-11-01, yesterday 2026-10-31}  naive 2026-11-01  WRONG
Europe/London    2026-03-29T23:30Z  {today 2026-03-30, yesterday 2026-03-29}  naive 2026-03-28  WRONG
Pacific/Apia     2011-12-30T10:30Z  today 2011-12-31, calendar yesterday 2011-12-30 (never existed), naive 2011-12-29
toEpochDay('2026-03-08') = 20520, ('2026-03-09') = 20521
```

**Other observations:**

- `typeof Temporal` is `undefined` without flags. `node --harmony-temporal -e "Temporal.Now.plainDateISO('America/New_York')"` printed `2026-11-12`.
- `process.config.variables`: `icu_small: false`, `icu_ver_major: '78'`, `icu_data_in: …icudt78l.dat` (full data).
- Timing, 200k iterations, µs per call:
  - Cached `formatToParts`: 1.33
  - New `DateTimeFormat` + `formatToParts`: 31.1
  - `toLocaleDateString`: 32.5
  - `resolveTimeZone`: 32.0

## Sources

- [node-intl] Node.js docs, "Internationalization support": https://nodejs.org/api/intl.html (build options, default `full-icu`, `system-icu` caveat, `hasFullICU` check)
- [node-13] Node.js v13.0.0 release notes, "make full-icu the default for releases": https://nodejs.org/en/blog/release/v13.0.0
- [node-26] Node.js v26.0.0 release notes, "The Temporal API is now enabled by default", V8 14.6: https://nodejs.org/en/blog/release/v26.0.0
- [ecma402] ECMA-402 (current draft): https://tc39.es/ecma402/ — §6.1 case-insensitivity; §6.5 IANA usage, UTC primary, Etc/GMT aliases; §6.5.2 GetAvailableNamedTimeZoneIdentifier; §6.5.3 AvailablePrimaryTimeZoneIdentifiers; §8.3.2 Intl.supportedValuesOf; §11.1.2 CreateDateTimeFormat (offset strings, RangeError, PrimaryIdentifier)
- [temporal] TC39 Temporal proposal README, "currently Stage 4": https://github.com/tc39/proposal-temporal
- MDN `Intl.DateTimeFormat` / `formatToParts`, used only as a pointer to the spec sections above.
