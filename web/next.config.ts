import type { NextConfig } from "next";

// Every surface is authenticated and reads the session cookie, so this app
// renders dynamically and does not use Cache Components.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    remotePatterns: [{ protocol: "http", hostname: "127.0.0.1" }],
  },
};

export default nextConfig;
