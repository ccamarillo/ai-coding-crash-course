import ReactGridLayout, {
  useContainerWidth,
  type Layout,
} from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import {
  GRID_GAP_PX,
  GRID_ROW_HEIGHT_PX,
  type LayoutChange,
} from "~/widgets/layout";
import {
  GRID_COLUMNS,
  widgets,
  type WidgetLayoutItem,
} from "~/widgets/registry";

// ─── Dashboard Editor ───
// Customize mode's drag-and-resize grid. Loaded lazily by the dashboard, so
// react-grid-layout stays out of the bundle for normal viewing. Row height and
// gaps match the static CSS grid so tiles don't jump when toggling.

type EditorChange = Extract<LayoutChange, "move" | "resize">;

type DashboardEditorProps = {
  layout: WidgetLayoutItem[];
  onLayoutChange: (layout: WidgetLayoutItem[], change: EditorChange) => void;
  renderTile: (item: WidgetLayoutItem) => React.ReactNode;
};

export default function DashboardEditor({
  layout,
  onLayoutChange,
  renderTile,
}: DashboardEditorProps) {
  const { width, containerRef, mounted } = useContainerWidth();

  const gridLayout = layout.map((item) => {
    const { minSize, maxSize } = widgets[item.widgetId];
    return {
      i: item.widgetId,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      minW: minSize.w,
      minH: minSize.h,
      maxW: maxSize.w,
      maxH: maxSize.h,
    };
  });

  // Called on drag stop and resize stop only, so each gesture saves once.
  function handleStop(next: Layout, change: EditorChange) {
    const updated = layout.map((item) => {
      const moved = next.find((n) => n.i === item.widgetId);
      return moved
        ? { ...item, x: moved.x, y: moved.y, w: moved.w, h: moved.h }
        : item;
    });

    const changed = updated.some(
      (item, i) =>
        item.x !== layout[i].x ||
        item.y !== layout[i].y ||
        item.w !== layout[i].w ||
        item.h !== layout[i].h
    );
    if (changed) onLayoutChange(updated, change);
  }

  return (
    <div ref={containerRef}>
      {mounted && (
        <ReactGridLayout
          width={width}
          layout={gridLayout}
          gridConfig={{
            cols: GRID_COLUMNS,
            rowHeight: GRID_ROW_HEIGHT_PX,
            margin: [GRID_GAP_PX, GRID_GAP_PX],
            containerPadding: [0, 0],
          }}
          dragConfig={{ cancel: ".dashboard-no-drag" }}
          onDragStop={(next) => handleStop(next, "move")}
          onResizeStop={(next) => handleStop(next, "resize")}
        >
          {layout.map((item) => (
            // Keep the resize handle above the card, or the card swallows it.
            <div
              key={item.widgetId}
              className="cursor-move [&>.react-resizable-handle]:z-10"
            >
              {renderTile(item)}
            </div>
          ))}
        </ReactGridLayout>
      )}
    </div>
  );
}
