# Coding standards

House rules for judgement calls. Where a rule here covers a case, it settles it: reviewers cite the rule instead of leaving the call to the implementer.

## Duplicated JSX blocks in one component

Extract a local component in the same change; the duplication is fixed now, not deferred to a later review.

**Why:** the streak card's Flame and Trophy stat blocks were flagged, deferred, then extracted as `StreakStat` in the final review anyway.

## Time-dependent services take `now`

A service whose result depends on the current time takes `now: Date` as a parameter, and likewise any clock or time zone it depends on. Callers pass `new Date()`.

Applies to new and changed code only; untouched services that call `new Date()` internally stay as they are.

**Why:** a reviewer flagged the streak service's injected `now: Date` as departing from house idiom, with no written rule to settle it; this is the idiom.

## Strings shared by client and server code

A string both client and server code depend on (cookie names, header names) is defined once, in a non-`.server` module under `app/lib/`, and both sides import it.

**Why:** the `cadence_tz` cookie name was duplicated between the root layout and the server time zone helper, so renaming one side would silently break the other.

## Domain names

Name domain concepts with the domain glossary's terms (`GLOSSARY.md`, when present). Helpers that operate on any instant get neutral names that describe the computation, not a domain concept.

**Why:** `toStudyDay` was renamed to `toLocalEpochDay` because it converts any instant, not only a study day.
