import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const tmdbKey = env.TMDB_API_KEY || env.VITE_TMDB_API_KEY || "f8f5486ab69dc4ecf1a3775310cf14da";

  return {
    plugins: [react()],
    define: {
      "import.meta.env.VITE_TMDB_API_KEY": JSON.stringify(tmdbKey),
    },
  };
});

