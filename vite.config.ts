import fs from "fs"
import path from "path"
import react from "@vitejs/plugin-react"
import { loadEnv, type Plugin } from "vite"
import { defineConfig } from "vitest/config"

/**
 * Build-time client config that a *deployable* bundle cannot be correct without.
 *
 * Vite inlines `import.meta.env.VITE_*` at build time, so a missing value does
 * not fail the build — it compiles the feature out. Built without
 * `VITE_SUPABASE_URL`, `isSupabaseConfigured` folds to `false` and every
 * visitor gets "the backend isn't configured yet" with sign-in and cloud sync
 * dead; without `VITE_ANALYTICS_URL`, `analyticsEnabled()` folds to
 * `return false` and no event, error or web vital is ever sent. Both bundles
 * look perfectly healthy from the outside.
 *
 * Both have reached production. `.env` is gitignored, so any build run from a
 * checkout that lacks it — a fresh clone, an agent worktree — produces one
 * silently. `.github/workflows/deploy.yml` already guards this, but every real
 * deploy has been a manual `npm run build && npx wrangler deploy`, which that
 * workflow never observes. This is the same guard at the one point both paths
 * share. `npm run verify:production` stays the post-deploy backstop.
 */
const REQUIRED_FOR_DEPLOYABLE_BUILD = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_ANALYTICS_URL",
] as const;

/**
 * Absent, or present but obviously not a real credential — an unedited copy of
 * `.env.example` (`YOUR-PROJECT-ref`) or the placeholder constants from
 * `src/lib/supabaseConfig.ts`, both of which produce the same dead bundle as an
 * empty value while looking configured.
 */
const isNotRealCredential = (value: string | undefined): boolean =>
  !value || value.includes("YOUR-") || value.includes("placeholder");

function assertDeployableClientConfig(mode: string): void {
  // Builds that are compile/behaviour checks rather than deployable artifacts
  // opt out explicitly: CI's build step and the Playwright e2e bundle (both in
  // .github/workflows/ci.yml), plus forks running without a backend. Explicit
  // beats inferring intent from whether secrets happen to be present — that
  // inference is exactly what shipped the broken bundle.
  if (process.env.FX_ALLOW_UNCONFIGURED_BUILD === "1") return;

  // loadEnv reads .env/.env.[mode] and already gives precedence to matching
  // VITE_* vars in process.env, so this covers both local and CI-style config.
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const missing = REQUIRED_FOR_DEPLOYABLE_BUILD.filter((key) =>
    isNotRealCredential(env[key]),
  );
  if (missing.length === 0) return;

  throw new Error(
    `\nBuild aborted — missing build-time client config:\n` +
      missing.map((key) => `  • ${key}`).join("\n") +
      `\n\nThese are inlined at build time, so this bundle would deploy with sign-in,` +
      `\ncloud sync and analytics silently disabled for every visitor.` +
      `\n\nFix: copy .env.example to .env and fill it in (see SETUP.md).` +
      `\nBuilding deliberately without a backend?` +
      ` FX_ALLOW_UNCONFIGURED_BUILD=1 npm run build\n`,
  );
}

/**
 * Stamp the service worker with a per-build identity.
 *
 * `public/sw.js` is copied verbatim into `dist`, which would make it
 * byte-identical on every deploy — and a byte-identical worker is one the
 * browser considers unchanged, so a new build's shell would never be picked
 * up. Replacing the placeholder is what makes updates land at all; it also
 * namespaces the caches per build, so `activate` can drop the previous one.
 */
function stampServiceWorker(): Plugin {
  return {
    name: "fx-stamp-service-worker",
    apply: "build",
    closeBundle() {
      const file = path.resolve(__dirname, "dist/sw.js");
      if (!fs.existsSync(file)) return;
      const version = `${Date.now().toString(36)}`;
      fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/__FX_SW_VERSION__/g, version));
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  if (command === "build") assertDeployableClientConfig(mode);

  return {
    base: '/',
    plugins: [react(), stampServiceWorker()],
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
      // Above the 4s Testing Library `asyncUtilTimeout` set in
      // src/test/setup.ts, so a query that never matches fails with TL's
      // "unable to find element" output (which prints the DOM) instead of
      // being cut short by a bare test-timeout error that says nothing about
      // why. The 5s default sat below it and would have inverted that.
      // A real hang still fails; it is nowhere near 15s.
      testTimeout: 15_000,
      // Playwright specs live in ./e2e and use @playwright/test, not vitest —
      // keep them out of the unit runner (they match the default *.spec glob).
      // `**/e2e/**` (not `e2e/**`) also covers agent git worktrees checked out
      // under .claude/, which otherwise make `npm test` fail locally on a clean
      // tree while CI — which checks out fresh — stays green.
      exclude: ["node_modules/**", "dist/**", "dist-verify/**", "**/e2e/**", ".claude/**"],
    },
  };
});
