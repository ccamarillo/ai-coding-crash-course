// Hex equivalents of the light theme's --chart-1 … --chart-5 in app/app.css.
// canvas-confetti only accepts hex, so keep these in sync with the stylesheet.
const CONFETTI_COLORS = [
  "#f54900",
  "#009689",
  "#104e64",
  "#ffb900",
  "#fe9a00",
];

export async function fireConfetti(): Promise<void> {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const { default: confetti } = await import("canvas-confetti");

  // A single downward burst from the top centre; ~120 ticks is about two
  // seconds at 60fps.
  confetti({
    origin: { x: 0.5, y: 0 },
    angle: 270,
    spread: 90,
    startVelocity: 35,
    particleCount: 120,
    ticks: 120,
    colors: CONFETTI_COLORS,
  });
}
