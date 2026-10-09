// Shared spring presets so every moving element feels like the same material.
export const spring = {
  type: "spring",
  stiffness: 320,
  damping: 30,
  mass: 0.8,
} as const;

export const springSoft = {
  type: "spring",
  stiffness: 200,
  damping: 26,
} as const;

export const springSnappy = {
  type: "spring",
  stiffness: 520,
  damping: 34,
} as const;

// Stagger step for lists that enter one item after another.
export const STAGGER = 0.05;
