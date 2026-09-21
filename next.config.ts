import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // embeddings.json is read via fs, not imported, so Next's file tracing
  // can't see it and it would be missing from the function bundle on Vercel.
  outputFileTracingIncludes: {
    "/api/search": ["./lib/data/embed/embeddings.json"],
  },
};

export default nextConfig;
