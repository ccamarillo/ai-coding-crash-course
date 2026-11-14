import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const confettiMock = vi.hoisted(() => vi.fn());
const moduleLoaded = vi.hoisted(() => vi.fn());

vi.mock("canvas-confetti", () => {
  moduleLoaded();
  return { default: confettiMock };
});

import { fireConfetti, CONFETTI_COLORS } from "./confetti";

function stubWindow(prefersReducedMotion: boolean) {
  vi.stubGlobal("window", {
    matchMedia: vi.fn((query: string) => ({
      matches:
        query === "(prefers-reduced-motion: reduce)" && prefersReducedMotion,
    })),
  });
}

describe("fireConfetti", () => {
  beforeEach(() => {
    confettiMock.mockReset();
    moduleLoaded.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("never loads or calls the library under reduced motion", async () => {
    stubWindow(true);

    await fireConfetti();

    expect(moduleLoaded).not.toHaveBeenCalled();
    expect(confettiMock).not.toHaveBeenCalled();
  });

  it("fires exactly one burst from the top centre in the chart colours", async () => {
    stubWindow(false);

    await fireConfetti();

    expect(confettiMock).toHaveBeenCalledTimes(1);
    const options = confettiMock.mock.calls[0][0];
    expect(options.origin).toEqual({ x: 0.5, y: 0 });
    expect(options.colors).toEqual([
      "#f54900",
      "#009689",
      "#104e64",
      "#ffb900",
      "#fe9a00",
    ]);
    expect(CONFETTI_COLORS).toEqual(options.colors);
  });

  it("does nothing and does not throw when there is no window", async () => {
    vi.stubGlobal("window", undefined);

    await expect(fireConfetti()).resolves.toBeUndefined();

    expect(moduleLoaded).not.toHaveBeenCalled();
    expect(confettiMock).not.toHaveBeenCalled();
  });
});
