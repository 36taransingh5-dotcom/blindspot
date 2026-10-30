import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright, axe and serverless Chromium ship native/browser assets that must not be bundled.
  serverExternalPackages: ["playwright-core", "@axe-core/playwright", "axe-core", "@sparticuz/chromium"],
  // The compressed Chromium binaries are read from disk at runtime, so make sure Vercel ships them.
  outputFileTracingIncludes: {
    "/api/run": ["./node_modules/@sparticuz/chromium/bin/**", "./node_modules/axe-core/axe.min.js"],
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
