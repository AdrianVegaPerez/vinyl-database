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
        headers: {
          "User-Agent": "VinylDatabase/0.1 +https://vinyl-database-zeta.vercel.app",
        },
        rewrite: (path) => {
          const url = new URL(path, "http://localhost");
          const discogsPath = url.searchParams.get("path") || "";
          url.searchParams.delete("path");
          return `/${discogsPath.replace(/^\/+/, "")}${url.search}`;
        },
      },
    },
  },
});
