import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Fonts, logo and grain for blog header images (read from disk at runtime, src/lib/seo/header-image.tsx).
  outputFileTracingIncludes: {
    "/api/seo/**": ["./assets/blog-header/**"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
