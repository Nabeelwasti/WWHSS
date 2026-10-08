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
  const env = loadEnv(mode, process.cwd(), "");
  plugins: [react(), swVersionPlugin()],
  server: {
    proxy: {
      "/api": {
        target: env.VITE_API_TARGET ?? "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
