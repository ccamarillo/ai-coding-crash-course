import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  Await,
  useFetcher,
  useRevalidator,
  useSearchParams,
} from "react-router";
import { DropdownMenu } from "radix-ui";
import { AlertTriangle, Check, Plus, Settings2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
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
import {
  getHiddenWidgetIds,
  GRID_GAP_PX,
  GRID_ROW_HEIGHT_PX,
  inReadingOrder,
  placeWidget,
  type LayoutChange,
} from "~/widgets/layout";
import {
  widgets,
  type WidgetId,
  type WidgetLayoutItem,
} from "~/widgets/registry";

// Customize mode only: keeps react-grid-layout out of the normal page bundle.
const DashboardEditor = lazy(() => import("./dashboard-editor"));

const ALL_COURSES = "all";

/** What the layout action receives. `change` tells the route whether to reload widget data. */
export type LayoutSubmission = {
  layout: WidgetLayoutItem[];
  change: LayoutChange;
};

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
  layout: serverLayout,
  widgetData,
}: WidgetDashboardProps) {
  const [customizing, setCustomizing] = useState(false);
  const { layout, saveLayout } = useSavedLayout(serverLayout);

  function renderTile(item: WidgetLayoutItem) {
    return (
      <WidgetTile item={item} data={widgetData[item.widgetId]} range={range} />
    );
  }

  // The last tile can't be removed: an empty layout would read back as the default.
  function renderEditableTile(item: WidgetLayoutItem) {
    const remove = () =>
      saveLayout(
        layout.filter((i) => i.widgetId !== item.widgetId),
        "remove"
      );
    return (
      <WidgetTile
        item={item}
        data={widgetData[item.widgetId]}
        range={range}
        onRemove={layout.length > 1 ? remove : undefined}
      />
    );
  }

  const staticGrid = <StaticGrid layout={layout} renderTile={renderTile} />;

  return (
    <section className="mb-10">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <DashboardFilters
          range={range}
          courseId={courseId}
          courseOptions={courseOptions}
        />
        <div className="ml-auto hidden items-center gap-2 md:flex">
          {customizing && (
            <AddWidgetMenu
              hiddenWidgetIds={getHiddenWidgetIds(layout)}
              onAdd={(widgetId) =>
                saveLayout([...layout, placeWidget(layout, widgetId)], "add")
              }
            />
          )}
          <Button
            variant={customizing ? "default" : "outline"}
            onClick={() => setCustomizing((c) => !c)}
          >
            {customizing ? (
              <Check className="mr-2 size-4" />
            ) : (
              <Settings2 className="mr-2 size-4" />
            )}
            {customizing ? "Done" : "Customize"}
          </Button>
        </div>
      </div>

      {customizing ? (
        <>
          {/* Customize is desktop-only; narrow screens keep the stacked view. */}
          <div className="md:hidden">{staticGrid}</div>
          <div className="hidden md:block">
            <Suspense fallback={staticGrid}>
              <DashboardEditor
                layout={layout}
                onLayoutChange={saveLayout}
                renderTile={renderEditableTile}
              />
            </Suspense>
          </div>
        </>
      ) : (
        staticGrid
      )}
    </section>
  );
}

/**
 * The layout shown on screen, saved through the route action. Changes show
 * immediately; a failed save restores the last saved layout with a toast.
 */
function useSavedLayout(serverLayout: WidgetLayoutItem[]) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const revalidator = useRevalidator();
  const [layout, setLayout] = useState(serverLayout);
  const savedLayout = useRef(serverLayout);
  const pendingLayout = useRef<WidgetLayoutItem[] | null>(null);

  // A new layout from the loader (reload, filter change) is the saved one.
  useEffect(() => {
    setLayout(serverLayout);
    savedLayout.current = serverLayout;
  }, [serverLayout]);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data || !pendingLayout.current) {
      return;
    }
    if (fetcher.data.ok) {
      savedLayout.current = pendingLayout.current;
    } else {
      setLayout(savedLayout.current);
      toast.error(
        `Your dashboard change wasn't saved. ${fetcher.data.error ?? ""}`.trim()
      );
      // A quick earlier edit may have been saved even though its request was
      // cancelled by this one, so reload the layout the server actually has.
      revalidator.revalidate();
    }
    pendingLayout.current = null;
  }, [fetcher.state, fetcher.data]);

  function saveLayout(next: WidgetLayoutItem[], change: LayoutChange) {
    setLayout(next);
    pendingLayout.current = next;
    const submission: LayoutSubmission = { layout: next, change };
    fetcher.submit(submission, { method: "post", encType: "application/json" });
  }

  return { layout, saveLayout };
}

function StaticGrid({
  layout,
  renderTile,
}: {
  layout: WidgetLayoutItem[];
  renderTile: (item: WidgetLayoutItem) => React.ReactNode;
}) {
  return (
    <div
      className="grid grid-cols-1 gap-(--grid-gap) md:auto-rows-(--grid-row-height) md:grid-cols-12"
      style={
        {
          "--grid-gap": `${GRID_GAP_PX}px`,
          "--grid-row-height": `${GRID_ROW_HEIGHT_PX}px`,
        } as CSSProperties
      }
    >
      {inReadingOrder(layout).map((item) => (
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
          {renderTile(item)}
        </div>
      ))}
    </div>
  );
}

function AddWidgetMenu({
  hiddenWidgetIds,
  onAdd,
}: {
  hiddenWidgetIds: WidgetId[];
  onAdd: (widgetId: WidgetId) => void;
}) {
  if (hiddenWidgetIds.length === 0) return null;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="outline">
          <Plus className="mr-2 size-4" />
          Add widget
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-56 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {hiddenWidgetIds.map((id) => (
            <DropdownMenu.Item
              key={id}
              onSelect={() => onAdd(id)}
              className="cursor-default rounded-sm px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground"
            >
              <div className="font-medium">{widgets[id].title}</div>
              <div className="text-xs text-muted-foreground">
                {widgets[id].description}
              </div>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
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
    <>
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
    </>
  );
}

function WidgetTile({
  item,
  data,
  range,
  onRemove,
}: {
  item: WidgetLayoutItem;
  // Undefined for a just-added widget until the loader fetches its data.
  data: Promise<unknown> | undefined;
  range: DashboardRange;
  onRemove?: () => void;
}) {
  const widget = widgets[item.widgetId];
  const size = { w: item.w, h: item.h };

  return (
    <Card className="h-full gap-3 overflow-hidden py-4">
      <CardHeader className="flex flex-row items-center justify-between px-4">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {widget.title}
        </CardTitle>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${widget.title}`}
            className="dashboard-no-drag -my-1 rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </CardHeader>
      <CardContent className="min-h-0 flex-1 px-4">
        {data === undefined ? (
          <TileSkeleton />
        ) : (
          <Suspense fallback={<TileSkeleton />}>
            <Await resolve={data} errorElement={<TileError />}>
              {(resolved) => (
                <widget.Tile
                  data={resolved as never}
                  size={size}
                  range={range}
                />
              )}
            </Await>
          </Suspense>
        )}
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
