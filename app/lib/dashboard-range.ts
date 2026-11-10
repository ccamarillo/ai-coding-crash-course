// ─── Dashboard Range ───
// The time range filter shared by every instructor dashboard widget.
// Client-safe: the filter controls import the options from here.

export const DASHBOARD_RANGES = [
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "90d", label: "Last 90 days", days: 90 },
  { value: "1y", label: "Last year", days: 365 },
  { value: "all", label: "All time", days: null },
] as const;

export type DashboardRange = (typeof DASHBOARD_RANGES)[number]["value"];

export const DEFAULT_DASHBOARD_RANGE: DashboardRange = "30d";

function findDashboardRange(value: string | null) {
  return DASHBOARD_RANGES.find((range) => range.value === value);
}

export function parseDashboardRange(value: string | null): DashboardRange {
  return findDashboardRange(value)?.value ?? DEFAULT_DASHBOARD_RANGE;
}

export function getDashboardRangeLabel(range: DashboardRange) {
  return findDashboardRange(range)!.label;
}

/**
 * The inclusive start of the range as an ISO timestamp, or null for "all".
 */
export function getDashboardRangeStart(range: DashboardRange, now: Date) {
  const days = findDashboardRange(range)!.days;
  if (days === null) return null;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}
