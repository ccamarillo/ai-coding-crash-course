import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

// Import after mock so the module picks up our test db
import {
  getLayout,
  saveLayout,
  type LayoutInput,
} from "./dashboardLayoutService";
import { DEFAULT_LAYOUT, type WidgetLayoutItem } from "~/widgets/registry";

const CUSTOM_LAYOUT: WidgetLayoutItem[] = [
  { widgetId: "gross-sales", x: 0, y: 0, w: 12, h: 2 },
  { widgetId: "quiz-scores", x: 0, y: 2, w: 8, h: 3 },
];

describe("dashboardLayoutService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("getLayout", () => {
    it("returns the default layout when nothing is saved", () => {
      expect(getLayout(base.instructor.id)).toEqual(DEFAULT_LAYOUT);
    });

    it("skips saved widgets that are no longer in the registry", () => {
      saveLayout(base.instructor.id, CUSTOM_LAYOUT);
      testDb
        .insert(schema.instructorDashboardWidgets)
        .values({
          userId: base.instructor.id,
          widgetId: "retired-widget",
          x: 0,
          y: 5,
          w: 4,
          h: 2,
        })
        .run();

      expect(getLayout(base.instructor.id)).toEqual(CUSTOM_LAYOUT);
    });
  });

  describe("saveLayout", () => {
    it("returns the saved layout from getLayout", () => {
      saveLayout(base.instructor.id, CUSTOM_LAYOUT);

      expect(getLayout(base.instructor.id)).toEqual(CUSTOM_LAYOUT);
    });

    it("replaces the previous layout rather than appending to it", () => {
      saveLayout(base.instructor.id, CUSTOM_LAYOUT);
      saveLayout(base.instructor.id, [
        { widgetId: "enrollments", x: 3, y: 1, w: 3, h: 2 },
      ]);

      expect(getLayout(base.instructor.id)).toEqual([
        { widgetId: "enrollments", x: 3, y: 1, w: 3, h: 2 },
      ]);
    });

    it("keeps each user's layout separate", () => {
      saveLayout(base.instructor.id, CUSTOM_LAYOUT);

      expect(getLayout(base.user.id)).toEqual(DEFAULT_LAYOUT);
    });

    describe("rejects an invalid layout and leaves the saved one intact", () => {
      const invalidLayouts: [string, LayoutInput[]][] = [
        ["an empty layout", []],
        [
          "an unknown widget id",
          [{ widgetId: "revenue-forecast", x: 0, y: 0, w: 4, h: 2 }],
        ],
        [
          "a duplicate widget",
          [
            { widgetId: "enrollments", x: 0, y: 0, w: 4, h: 2 },
            { widgetId: "enrollments", x: 4, y: 0, w: 4, h: 2 },
          ],
        ],
        [
          "a negative position",
          [{ widgetId: "enrollments", x: -1, y: 0, w: 4, h: 2 }],
        ],
        [
          "a tile past the 12th column",
          [{ widgetId: "enrollments", x: 9, y: 0, w: 4, h: 2 }],
        ],
        [
          "a non-integer position",
          [{ widgetId: "enrollments", x: 0.5, y: 0, w: 4, h: 2 }],
        ],
        [
          "a size below the widget's minimum",
          [{ widgetId: "enrollments", x: 0, y: 0, w: 2, h: 2 }],
        ],
        [
          "a size above the widget's maximum",
          [{ widgetId: "enrollments", x: 0, y: 0, w: 4, h: 5 }],
        ],
      ];

      it.each(invalidLayouts)("refuses %s", (_, layout) => {
        saveLayout(base.instructor.id, CUSTOM_LAYOUT);

        expect(() => saveLayout(base.instructor.id, layout)).toThrow();
        expect(getLayout(base.instructor.id)).toEqual(CUSTOM_LAYOUT);
      });
    });
  });
});
