"use client";

import { m } from "framer-motion";
import { MODES, type Mode } from "../../lib/ui/search.ts";
import { springSnappy } from "../../lib/ui/motion.ts";

type Props = { value: Mode; onChange: (mode: Mode) => void };

export function ModeSwitch({ value, onChange }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="Search mode"
      className="inline-flex rounded-full border border-milk/15 p-0.5"
    >
      {MODES.map((mode) => {
        const active = mode.id === value;
        return (
          <button
            key={mode.id}
            type="button"
            role="radio"
            aria-checked={active}
            title={mode.hint}
            onClick={() => onChange(mode.id)}
            className={`relative rounded-full px-3 py-1 font-mono text-[11px] transition-colors duration-200 ${
              active ? "text-ink" : "text-milk/55 hover:text-milk"
            }`}
          >
            {active && (
              // Shared layoutId makes the pill slide between options with a spring.
              <m.span
                layoutId="mode-pill"
                className="absolute inset-0 rounded-full bg-milk"
                transition={springSnappy}
              />
            )}
            <span className="relative">{mode.label}</span>
          </button>
        );
      })}
    </div>
  );
}
