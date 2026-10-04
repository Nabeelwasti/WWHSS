import { useEffect, useState } from "react";
import { useLanguage } from "../i18n.js";

export function UpdateToast() {
  const [updateReady, setUpdateReady] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let waitingWorker: ServiceWorker | null = null;

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;

      if (reg.waiting) {
        waitingWorker = reg.waiting;
        setUpdateReady(true);
      }

      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            waitingWorker = installing;
            setUpdateReady(true);
          }
        });
      });
    });

    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });

    (window as unknown as { __wwhsApplyUpdate?: () => void }).__wwhsApplyUpdate = () => {
      waitingWorker?.postMessage({ type: "SKIP_WAITING" });
    };
  }, []);

  if (!updateReady) return null;

  return (
    <div className="toast" role="status" aria-live="polite">
      <span>{t("update.ready")}</span>
      <button
        className="btn btn-sm btn-primary"
        onClick={() => (window as unknown as { __wwhsApplyUpdate?: () => void }).__wwhsApplyUpdate?.()}
        aria-label={t("update.refresh")}
      >
        {t("update.refresh")}
      </button>
    </div>
  );
}
