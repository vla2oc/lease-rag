"use client";

import { AnimatePresence, m } from "framer-motion";
import { useEffect, useRef } from "react";
import { ResultCard } from "./ResultCard.tsx";
import type { Turn } from "../../lib/ui/search.ts";
import { spring, springSoft } from "../../lib/ui/motion.ts";

type Props = { turns: Turn[] };

export function Thread({ turns }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  const last = turns.at(-1);

  // Bring the latest turn into view both when it is asked and when it resolves.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [last?.id, last?.results, last?.error]);

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pt-10 pb-44">
      {turns.map((turn) => (
        <article key={turn.id} className="mb-12">
          <m.div
            className="flex justify-end"
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={spring}
          >
            <div className="max-w-[85%] rounded-2xl rounded-br-md bg-milk px-4 py-2.5 text-ink">
              <p className="text-[15px]">{turn.query}</p>
            </div>
          </m.div>

          <div className="mt-6">
            <AnimatePresence mode="wait" initial={false}>
              {turn.results === null && turn.error === null && (
                <Dots key="dots" />
              )}

              {turn.error && (
                <m.p
                  key="error"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={spring}
                  className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
                >
                  {turn.error}
                </m.p>
              )}

              {turn.results && (
                <m.section
                  key="results"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={springSoft}
                >
                  <h2 className="mb-3 font-mono text-[11px] tracking-wide text-milk/40 uppercase">
                    {turn.results.length > 0
                      ? `${turn.results.length} fragments · ${turn.mode}`
                      : "Nothing found"}
                  </h2>
                  <ol className="space-y-2.5">
                    {turn.results.map((result, i) => (
                      <ResultCard
                        key={`${result.doc}-${result.paragraphIds[0]}`}
                        result={result}
                        index={i}
                      />
                    ))}
                  </ol>
                </m.section>
              )}
            </AnimatePresence>
          </div>
        </article>
      ))}
      <div ref={endRef} />
    </div>
  );
}

function Dots() {
  return (
    <m.div
      className="flex gap-1.5 px-1 py-2"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -6 }}
      transition={spring}
      aria-label="Searching"
    >
      {[0, 1, 2].map((i) => (
        <m.span
          key={i}
          className="size-1.5 rounded-full bg-milk/70"
          animate={{ y: [0, -5, 0] }}
          transition={{
            repeat: Infinity,
            duration: 0.9,
            delay: i * 0.12,
            ease: "easeInOut",
          }}
        />
      ))}
    </m.div>
  );
}
