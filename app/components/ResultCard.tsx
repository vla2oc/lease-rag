"use client";

import { m } from "framer-motion";
import { useState } from "react";
import type { Result } from "../../lib/ui/search.ts";
import { spring, STAGGER } from "../../lib/ui/motion.ts";

type Props = { result: Result; index: number };

export function ResultCard({ result, index }: Props) {
  const [open, setOpen] = useState(false);
  const first = result.paragraphIds[0];
  const last = result.paragraphIds.at(-1);

  return (
    <m.li
      layout
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay: index * STAGGER }}
      whileHover={{ y: -2 }}
      onClick={() => setOpen((value) => !value)}
      className="cursor-pointer rounded-xl border border-milk/10 bg-milk/[0.03] p-4 hover:border-milk/25"
    >
      <m.div
        layout="position"
        className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px]"
      >
        <span className="text-milk/40">{String(index + 1).padStart(2, "0")}</span>
        <span className="font-sans text-xs font-medium text-milk">{result.doc}</span>
        <span className="text-milk/40">
          {first}
          {last !== first && `–${last}`}
        </span>
        <span className="ml-auto text-milk/50">{result.score.toFixed(3)}</span>
      </m.div>
      <m.p
        layout="position"
        className={`mt-2.5 text-sm leading-relaxed whitespace-pre-line text-milk/75 ${
          open ? "" : "line-clamp-5"
        }`}
      >
        {result.text}
      </m.p>
    </m.li>
  );
}
