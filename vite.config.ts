import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Images live in public/ and are served straight from disk by Express (/img),
  // so copying them into dist/ would duplicate ~2 GB on every build.
  publicDir: false,
  server: {
    port: 3000,
    proxy: {
      "/api": "http://localhost:4000",
      "/img": "http://localhost:4000",
    },
  },
});
