"use client";

import { m } from "framer-motion";
import { EXAMPLES } from "../../lib/ui/search.ts";
import { spring, springSoft, STAGGER } from "../../lib/ui/motion.ts";

type Props = { onPick: (query: string) => void };

export function Hero({ onPick }: Props) {
  return (
    <m.section
      key="hero"
      className="relative flex grow flex-col items-center justify-center overflow-hidden px-5 text-center"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -28, scale: 0.98 }}
      transition={springSoft}
    >
      {/* Outer layer: Motion owns enter/exit. Inner layer: CSS owns the slow
          breathing. Split so the two never fight over `transform`. */}
      <m.div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 m-auto size-[28rem] sm:size-[36rem]"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 1.3 }}
        transition={{ ...springSoft, delay: 0.1 }}
      >
        <div className="hero-glow size-full rounded-full" />
      </m.div>

      <m.p
        className="max-w-xl text-2xl font-medium leading-snug tracking-tight text-balance sm:text-3xl"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.05 }}
      >
        Search 29 lease agreements and get the original clauses back, not an
        LLM answer.
      </m.p>

      <ul className="mt-8 flex flex-wrap justify-center gap-2">
        {EXAMPLES.map((example, i) => (
          <m.li
            key={example}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.15 + i * STAGGER }}
          >
            <m.button
              type="button"
              onClick={() => onPick(example)}
              className="rounded-full border border-milk/15 px-3.5 py-1.5 font-mono text-xs text-milk/60 hover:border-milk/40 hover:text-milk"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.96 }}
              transition={spring}
            >
              {example}
            </m.button>
          </m.li>
        ))}
      </ul>
    </m.section>
  );
}
