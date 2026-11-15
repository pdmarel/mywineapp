import type { NextConfig } from "next";

// App personale dietro login: ogni pagina dipende dall'utente, quindi niente
// cache dei componenti (cacheComponents) — tutto è reso a ogni richiesta.
const nextConfig: NextConfig = {
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
