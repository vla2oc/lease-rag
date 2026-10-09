"use client";

import { m } from "framer-motion";
import { useState, type SubmitEvent } from "react";
import { ModeSwitch } from "./ModeSwitch.tsx";
import { MODES, type Mode } from "../../lib/ui/search.ts";
import { spring, springSnappy } from "../../lib/ui/motion.ts";

type Props = {
  query: string;
  mode: Mode;
  loading: boolean;
  onQueryChange: (query: string) => void;
  onModeChange: (mode: Mode) => void;
  onSubmit: () => void;
};

export function SearchBar({
  query,
  mode,
  loading,
  onQueryChange,
  onModeChange,
  onSubmit,
}: Props) {
  const [focused, setFocused] = useState(false);
  const canSubmit = !loading && query.trim().length > 0;
  const hint = MODES.find((item) => item.id === mode)!.hint;

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSubmit) onSubmit();
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-ink via-ink/95 to-transparent pt-10 pb-5">
      <m.form
        onSubmit={handleSubmit}
        className="pointer-events-auto mx-auto w-full max-w-3xl px-5"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: focused ? -3 : 0 }}
        transition={spring}
      >
        <div
          className={`rounded-2xl border bg-ink/80 backdrop-blur transition-colors duration-200 ${
            focused ? "border-milk/50" : "border-milk/15"
          }`}
        >
          <div className="flex items-center gap-2 px-2 pt-2 pl-4">
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              maxLength={300}
              placeholder="Ask about any clause…"
              aria-label="Search query"
              autoComplete="off"
              className="min-w-0 grow bg-transparent py-2 text-[15px] outline-none placeholder:text-milk/35"
            />
            <m.button
              type="submit"
              disabled={!canSubmit}
              aria-label="Search"
              className="grid size-9 shrink-0 place-items-center rounded-xl bg-milk text-ink disabled:cursor-not-allowed"
              animate={{ opacity: canSubmit ? 1 : 0.3, scale: canSubmit ? 1 : 0.92 }}
              whileHover={canSubmit ? { scale: 1.06 } : undefined}
              whileTap={canSubmit ? { scale: 0.9 } : undefined}
              transition={springSnappy}
            >
              {loading ? (
                <m.span
                  className="size-3 rounded-full border-2 border-ink/30 border-t-ink"
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                />
              ) : (
                <ArrowIcon />
              )}
            </m.button>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 pb-2.5">
            <ModeSwitch value={mode} onChange={onModeChange} />
            <span className="font-mono text-[11px] text-milk/40">{hint}</span>
          </div>
        </div>
      </m.form>
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M8 13V3" />
      <path d="M3.5 7.5 8 3l4.5 4.5" />
    </svg>
  );
}
