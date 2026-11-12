// PROTOTYPE (wayfinder cadence-a4b.1.3), throwaway.
// Question: what does the dashboard streak card look like in each state, and where does it sit?
// Three placements of the card on the existing /dashboard route, switchable via `?variant=A|B|C`,
// and five states via `?streak=`. Streak numbers are stubbed: nothing here reads lessonProgress.
import { CalendarCheck, Flame, Trophy } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { cn } from "~/lib/utils";

export const STREAK_STATES = ["today", "at-risk", "broken", "empty", "record"] as const;
export type StreakState = (typeof STREAK_STATES)[number];

export const STREAK_VARIANTS = {
  A: "Banner under the heading",
  B: "Compact, beside the heading",
  C: "Right rail beside the courses",
} as const;
export type StreakVariant = keyof typeof STREAK_VARIANTS;

type StreakData = {
  current: number;
  longest: number;
  studiedToday: boolean;
  hasCompletions: boolean;
};

// Stub data per state.
export const STUB: Record<StreakState, StreakData> = {
  // Today is already a Study day.
  today: { current: 5, longest: 12, studiedToday: true, hasCompletions: true },
  // Today isn't a Study day yet; yesterday's Streak still counts until the day ends.
  "at-risk": { current: 5, longest: 12, studiedToday: false, hasCompletions: true },
  // Missed a day: current 0, longest > 0.
  broken: { current: 0, longest: 12, studiedToday: false, hasCompletions: true },
  // No completions ever.
  empty: { current: 0, longest: 0, studiedToday: false, hasCompletions: false },
  // Current Streak is the longest ever.
  record: { current: 12, longest: 12, studiedToday: true, hasCompletions: true },
};

function days(n: number) {
  return `${n} ${n === 1 ? "day" : "days"}`;
}

function hint(s: StreakData): string {
  if (!s.hasCompletions) return "Complete a lesson to start a streak";
  if (s.current === 0) return "Complete a lesson to start a new Streak";
  if (!s.studiedToday) return `Complete a lesson today to keep your ${s.current}-day Streak`;
  return "Today is a Study day";
}

function HintLine({ s, className }: { s: StreakData; className?: string }) {
  const atRisk = s.hasCompletions && s.current > 0 && !s.studiedToday;
  return (
    <p
      className={cn(
        "flex items-center gap-1.5 text-sm",
        atRisk ? "font-medium text-amber-600" : "text-muted-foreground",
        className
      )}
    >
      {s.studiedToday && <CalendarCheck className="size-4 text-green-600" />}
      {hint(s)}
    </p>
  );
}

// A: full-width banner card between the page heading and "In Progress".
export function StreakBanner({ s }: { s: StreakData }) {
  return (
    <Card className="mb-8 py-4">
      <CardContent className="flex flex-wrap items-center gap-x-10 gap-y-3">
        {s.hasCompletions ? (
          <>
            <div className="flex items-center gap-3">
              <Flame className={cn("size-8", s.current > 0 ? "text-orange-500" : "text-muted-foreground/40")} />
              <div>
                <div className="text-2xl font-bold leading-none">{days(s.current)}</div>
                <div className="text-sm text-muted-foreground">Current Streak</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Trophy className="size-8 text-yellow-500" />
              <div>
                <div className="text-2xl font-bold leading-none">{days(s.longest)}</div>
                <div className="text-sm text-muted-foreground">Longest Streak</div>
              </div>
            </div>
            <HintLine s={s} className="sm:ml-auto" />
          </>
        ) : (
          <div className="flex items-center gap-3">
            <Flame className="size-8 text-muted-foreground/40" />
            <HintLine s={s} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// B: small card in the heading row, right of "My Dashboard". Current Streak leads; longest is secondary.
export function StreakCompact({ s }: { s: StreakData }) {
  return (
    <Card className="w-full gap-1 py-3 sm:w-72">
      <CardContent className="px-4">
        {s.hasCompletions ? (
          <>
            <div className="flex items-baseline gap-2">
              <Flame className={cn("size-5 self-center", s.current > 0 ? "text-orange-500" : "text-muted-foreground/40")} />
              <span className="text-xl font-bold">{s.current}</span>
              <span className="text-sm text-muted-foreground">
                day Streak · longest {s.longest}
              </span>
            </div>
            <HintLine s={s} className="mt-1 text-xs" />
          </>
        ) : (
          <div className="flex items-center gap-2">
            <Flame className="size-5 text-muted-foreground/40" />
            <HintLine s={s} className="text-xs" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// C: a taller card in a right-hand column, courses take the rest of the width.
export function StreakRail({ s }: { s: StreakData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flame className={cn("size-5", s.current > 0 ? "text-orange-500" : "text-muted-foreground/40")} />
          Streak
        </CardTitle>
        <CardDescription>Consecutive Study days</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {s.hasCompletions ? (
          <>
            <div className="text-center">
              <div className={cn("text-5xl font-bold", s.current === 0 && "text-muted-foreground")}>{s.current}</div>
              <div className="text-sm text-muted-foreground">{s.current === 1 ? "day" : "days"} current</div>
            </div>
            <div className="flex items-center justify-between border-t pt-3 text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Trophy className="size-4 text-yellow-500" />
                Longest
              </span>
              <span className="font-medium">
                {days(s.longest)}
                {s.current === s.longest && s.current > 0 && " (now)"}
              </span>
            </div>
            <HintLine s={s} />
          </>
        ) : (
          <HintLine s={s} />
        )}
      </CardContent>
    </Card>
  );
}
