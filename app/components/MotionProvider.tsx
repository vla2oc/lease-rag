"use client";

import { LazyMotion, MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

const loadFeatures = () =>
  import("../../lib/ui/motion-features.ts").then((mod) => mod.default);

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    // strict: fail loudly if someone imports the full `motion` component
    // instead of the lightweight `m`, which would defeat lazy loading.
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
