# Prototype: dashboard streak card (cadence-a4b.1.3)

**Question:** what does the dashboard streak card look like in each state, and where does it sit in `app/routes/dashboard.tsx`?

Throwaway UI prototype on the real `/dashboard` route. Streak numbers are stubbed; the loader is unchanged.

## Run it

1. In the spec worktree: `npm ci`, then `npm run dev`.
2. Pick any user in the DevUI panel and open `/dashboard`.
3. Use the floating bar at the bottom: the arrows (or ← / →) cycle `?variant=`, the buttons pick `?streak=`.

## Variants (placement)

| `?variant=` | Placement |
|---|---|
| `A` | Full-width banner card between the heading and "In Progress": current and longest side by side, hint on the right |
| `B` | Compact card in the heading row, right of "My Dashboard": `🔥 5 day Streak · longest 12`, hint underneath |
| `C` | Right-hand column beside the course grid: big current number, longest below, hint at the bottom (stacks first on narrow screens) |

## States (`?streak=`)

| State | Stub | Hint line |
|---|---|---|
| `today` | current 5, longest 12, studied today | ✓ "Today is a Study day" |
| `at-risk` | current 5, longest 12, not yet today | "Complete a lesson today to keep your 5-day Streak" (amber) |
| `broken` | current 0, longest 12 | "Complete a lesson to start a new Streak" (flame greyed) |
| `empty` | no completions | "Complete a lesson to start a streak" (no numbers) |
| `record` | current 12 = longest 12 | `C` marks longest "(now)"; `A`/`B` show nothing extra |

## Files

- `app/components/streak-card.prototype.tsx`: the three card variants and stub data.
- `app/components/prototype-switcher.tsx`: the floating bar (hidden in production builds).
- `app/routes/dashboard.tsx`: mounts the chosen variant; marked `PROTOTYPE`.

None of this ships: once a variant is picked, the spec describes the card and these files come off the spec branch.
