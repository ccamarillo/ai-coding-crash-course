// PROTOTYPE switcher bar, throwaway. Cycles `?variant=` with the arrows (or ← / →) and picks `?streak=` state.
import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function PrototypeSwitcher({
  variants,
  states,
}: {
  variants: Record<string, string>;
  states: readonly string[];
}) {
  const [params, setParams] = useSearchParams();
  const keys = Object.keys(variants);
  const variant = params.get("variant") ?? keys[0];
  const state = params.get("streak") ?? states[0];

  function set(key: string, value: string) {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true, preventScrollReset: true });
  }

  function cycle(step: number) {
    const i = keys.indexOf(variant);
    set("variant", keys[(i + step + keys.length) % keys.length]);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowLeft") cycle(-1);
      if (e.key === "ArrowRight") cycle(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (import.meta.env.PROD) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2 rounded-2xl bg-zinc-900 px-4 py-2 text-sm text-white shadow-xl">
      <div className="flex items-center gap-3">
        <button onClick={() => cycle(-1)} aria-label="Previous variant">
          <ChevronLeft className="size-4" />
        </button>
        <span>
          {variant} ({variants[variant]})
        </span>
        <button onClick={() => cycle(1)} aria-label="Next variant">
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="flex gap-1">
        {states.map((s) => (
          <button
            key={s}
            onClick={() => set("streak", s)}
            className={s === state ? "rounded bg-white px-2 text-zinc-900" : "rounded px-2 text-zinc-300 hover:text-white"}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
