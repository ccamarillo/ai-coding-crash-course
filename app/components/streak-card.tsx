import { CheckCircle2, Flame, Trophy } from "lucide-react";
import { Card, CardContent } from "~/components/ui/card";
import { cn } from "~/lib/utils";
import type { Streak } from "~/services/progressService";

function days(n: number) {
  return `${n} ${n === 1 ? "day" : "days"}`;
}

function StreakHint({ streak, className }: { streak: Streak; className?: string }) {
  switch (streak.state) {
    case "today":
      return (
        <p className={cn("flex items-center gap-1.5 text-sm text-muted-foreground", className)}>
          <CheckCircle2 className="size-4 text-green-600" />
          Today is a Study day
        </p>
      );
    case "at-risk":
      return (
        <p className={cn("text-sm font-medium text-amber-600", className)}>
          Complete a lesson today to keep your {streak.current}-day Streak
        </p>
      );
    case "broken":
      return (
        <p className={cn("text-sm text-muted-foreground", className)}>
          Complete a lesson to start a new Streak
        </p>
      );
    case "empty":
      return (
        <p className={cn("text-sm text-muted-foreground", className)}>
          Complete a lesson to start a streak
        </p>
      );
  }
}

function StreakStat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3">
      {icon}
      <div>
        <div className="text-2xl font-bold leading-none">{days(value)}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

// Full-width card: current and longest Streak side by side, hint on the right.
export function StreakCard({ streak }: { streak: Streak }) {
  return (
    <Card className="mb-8 py-4">
      <CardContent className="flex flex-wrap items-center gap-x-10 gap-y-3">
        {streak.state === "empty" ? (
          <div className="flex items-center gap-3">
            <Flame className="size-8 text-muted-foreground/40" />
            <StreakHint streak={streak} />
          </div>
        ) : (
          <>
            <StreakStat
              icon={
                <Flame
                  className={cn(
                    "size-8",
                    streak.current > 0 ? "text-orange-500" : "text-muted-foreground/40"
                  )}
                />
              }
              value={streak.current}
              label="Current Streak"
            />
            <StreakStat
              icon={<Trophy className="size-8 text-yellow-500" />}
              value={streak.longest}
              label="Longest Streak"
            />
            <StreakHint streak={streak} className="sm:ml-auto" />
          </>
        )}
      </CardContent>
    </Card>
  );
}
