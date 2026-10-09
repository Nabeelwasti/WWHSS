import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

function swVersionPlugin(): Plugin {
  return {
    name: "sw-version-plugin",
    closeBundle() {
      const swPath = path.resolve(__dirname, "dist/sw.js");
      if (fs.existsSync(swPath)) {
        let content = fs.readFileSync(swPath, "utf-8");
        const buildVersion = process.env.BUILD_VERSION || "local";
        content = content.replace(/const VERSION = "[^"]+";/, `const VERSION = "${buildVersion}";`);
        fs.writeFileSync(swPath, content);
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  // Vercel injects configured environment variables into the build process.
  // Prefer that process environment and fall back to Vite's .env-file loader.
  // This avoids incorrectly rejecting a variable that exists in the host
  // environment but is not returned by loadEnv for the current mode.
  const env = loadEnv(mode, process.cwd(), "");
  const apiBaseUrl = (process.env.VITE_API_BASE_URL ?? env.VITE_API_BASE_URL ?? "").trim();

  if (process.env.VERCEL_ENV && !apiBaseUrl) {
    throw new Error(
      "VITE_API_BASE_URL is missing from this Vercel deployment's build environment. " +
        "Set it for the matching Production/Preview environment and redeploy. " +
        "Hosted production must point to the Cloud Run backend."
    );
  }

  return {
    plugins: [react(), swVersionPlugin()],
    server: {
      proxy: {
        "/api": {
          target: env.VITE_API_TARGET ?? "http://localhost:4000",
          changeOrigin: true,
        },
      },
    },
  };
});
