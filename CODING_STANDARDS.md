# Coding standards

House rules for judgement calls. Where a rule here covers a case, it settles it: reviewers cite the rule instead of leaving the call to the implementer.

## Duplicated JSX blocks in one component

Extract a local component in the same change that introduces the duplication, and give it a name for what it renders.

**Why:** the streak card's Flame and Trophy stat blocks were flagged, deferred as a judgement call, then extracted as `StreakStat` in the final review anyway — deferring only moved the work later.

## Time-dependent services take `now`

A service whose result depends on the current time takes `now: Date` as a parameter, and likewise takes any clock or time zone it depends on. Callers pass `new Date()`.

This applies to new and changed code only. Existing services that call `new Date()` internally need no retrofit; leave untouched code as it is.

**Why:** the streak work injected `now: Date` and a reviewer flagged it as departing from house idiom with no written rule to settle it — this is the idiom, and it keeps time-dependent logic testable without mocking the clock.

## Strings shared by client and server code

A string both client and server code depend on (cookie names, header names) is defined once, in a non-`.server` module under `app/lib/`, and both sides import it.

**Why:** the `cadence_tz` cookie name was duplicated between the root layout and the server time zone helper, so renaming one side would silently break the other.

## Domain names

Name domain concepts with the domain glossary's terms (`GLOSSARY.md`, when present). Helpers that operate on any instant, not just a domain concept, get neutral names.

**Why:** `toStudyDay` was renamed to `toLocalEpochDay` because it converts any instant, not only a study day; glossary terms belong on the code that models the domain.
