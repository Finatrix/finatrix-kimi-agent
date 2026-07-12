import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    // Honour an externally assigned port (e.g. preview harnesses); default 3000.
    port: Number(process.env.PORT) || 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Separate the large, rarely-changing vendors into their own cacheable
    // chunks; route-level code-splitting (React.lazy) handles the rest.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
    // docx/pdf/xlsx/jspdf are already isolated into their own chunks and only
    // ever loaded on-demand (export actions, OCR-adjacent parsing) — they are
    // never part of the initial bundle. The 500kB default warning is noise
    // for these specific, deliberately-lazy vendor chunks.
    chunkSizeWarningLimit: 600,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    css: false,
  },
});
