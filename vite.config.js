import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api/upcitemdb": {
        target: "https://api.upcitemdb.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/upcitemdb/, "/prod/trial"),
      },
      "/api/discogs": {
        target: "https://api.discogs.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/discogs/, ""),
      },
    },
  },
});
