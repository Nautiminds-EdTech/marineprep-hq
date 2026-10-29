import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Blog editor image uploads (compressed to WebP in the browser first; Vercel caps bodies at 4.5 MB).
    serverActions: { bodySizeLimit: "4mb" },
  },
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
