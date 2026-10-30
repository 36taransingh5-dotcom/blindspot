import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright and axe ship native/browser assets that must not be bundled.
  serverExternalPackages: ["playwright-core", "@axe-core/playwright", "axe-core"],
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
