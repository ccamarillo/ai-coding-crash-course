import { Suspense, type CSSProperties } from "react";
import { Await, useSearchParams } from "react-router";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  DASHBOARD_RANGES,
  DEFAULT_DASHBOARD_RANGE,
  type DashboardRange,
} from "~/lib/dashboard-range";
import { widgets, type WidgetLayoutItem } from "~/widgets/registry";

const ALL_COURSES = "all";

type WidgetDashboardProps = {
  range: DashboardRange;
  courseId: number | null;
  courseOptions: { id: number; title: string }[];
  layout: WidgetLayoutItem[];
  widgetData: Record<string, Promise<unknown>>;
};

export function WidgetDashboard({
  range,
  courseId,
  courseOptions,
  layout,
  widgetData,
}: WidgetDashboardProps) {
  // Reading order for the stacked single-column layout on narrow screens.
  const ordered = [...layout].sort((a, b) => a.y - b.y || a.x - b.x);

  return (
    <section className="mb-10">
      <DashboardFilters
        range={range}
        courseId={courseId}
        courseOptions={courseOptions}
      />
      <div className="grid grid-cols-1 gap-4 md:auto-rows-[5.5rem] md:grid-cols-12">
        {ordered.map((item) => (
          <div
            key={item.widgetId}
            className="md:[grid-column:var(--grid-column)] md:[grid-row:var(--grid-row)]"
            style={
              {
                "--grid-column": `${item.x + 1} / span ${item.w}`,
                "--grid-row": `${item.y + 1} / span ${item.h}`,
              } as CSSProperties
            }
          >
            <WidgetTile
              item={item}
              data={widgetData[item.widgetId]}
              range={range}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function DashboardFilters({
  range,
  courseId,
  courseOptions,
}: Pick<WidgetDashboardProps, "range" | "courseId" | "courseOptions">) {
  const [, setSearchParams] = useSearchParams();

  function setFilter(name: string, value: string, defaultValue: string) {
    setSearchParams(
      (params) => {
        if (value === defaultValue) params.delete(name);
        else params.set(name, value);
        return params;
      },
      { preventScrollReset: true }
    );
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <Select
        value={range}
        onValueChange={(value) =>
          setFilter("range", value, DEFAULT_DASHBOARD_RANGE)
        }
      >
        <SelectTrigger className="w-40" aria-label="Time range">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DASHBOARD_RANGES.map((r) => (
            <SelectItem key={r.value} value={r.value}>
              {r.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={courseId === null ? ALL_COURSES : String(courseId)}
        onValueChange={(value) => setFilter("course", value, ALL_COURSES)}
      >
        <SelectTrigger className="w-64" aria-label="Course">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_COURSES}>All courses</SelectItem>
          {courseOptions.map((course) => (
            <SelectItem key={course.id} value={String(course.id)}>
              {course.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function WidgetTile({
  item,
  data,
  range,
}: {
  item: WidgetLayoutItem;
  data: Promise<unknown> | undefined;
  range: DashboardRange;
}) {
  const widget = widgets[item.widgetId];
  const size = { w: item.w, h: item.h };

  return (
    <Card className="h-full gap-3 overflow-hidden py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {widget.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 px-4">
        <Suspense fallback={<TileSkeleton />}>
          <Await resolve={data} errorElement={<TileError />}>
            {(resolved) => (
              <widget.Tile data={resolved as never} size={size} range={range} />
            )}
          </Await>
        </Suspense>
      </CardContent>
    </Card>
  );
}

function TileSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-4 w-32" />
    </div>
  );
}

function TileError() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <AlertTriangle className="size-4 shrink-0" />
      <span>This widget couldn't load. Try refreshing the page.</span>
    </div>
  );
}
