import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/theme.css";
import { AuthProvider } from "./AuthContext";
import { LanguageProvider } from "./i18n";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LanguageProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </LanguageProvider>
  </StrictMode>
);

// Register the offline-shell service worker in production builds only, so
// development hot-reloading isn't fought by a cache. Failure to register is
// harmless — the app simply works online-only.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      // Browsers only check for a new service worker on navigation by
      // default, which could mean someone with a tab left open for hours
      // doesn't see a new version until they happen to reload. Checking
      // every 30 minutes closes that gap without hammering the server.
      setInterval(() => reg.update().catch(() => undefined), 30 * 60 * 1000);
    }).catch(() => undefined);
  });
}
