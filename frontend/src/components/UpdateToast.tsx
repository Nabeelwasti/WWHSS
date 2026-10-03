import { useEffect, useState } from "react";

// How "auto-update" really works for a web app (explained here so it's
// clear this isn't a limitation, it's how the web works everywhere):
// the moment you deploy a new version to your server, EVERY visitor gets
// the new code the next time they load the page — there's no app-store
// approval, no per-device install step, nothing for you to push out
// manually. The one wrinkle is a tab that's already open: this component
// notices a new version arrived in the background and offers a one-tap
// refresh, rather than silently reloading and possibly losing something
// a teacher was halfway through typing (like marking attendance).
export function UpdateToast() {
  const [updateReady, setUpdateReady] = useState(false);

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
    <div className="toast" role="status">
      <span>A new version is ready.</span>
      <button
        className="btn btn-sm btn-primary"
        onClick={() => (window as unknown as { __wwhsApplyUpdate?: () => void }).__wwhsApplyUpdate?.()}
      >
        Refresh
      </button>
    </div>
  );
}
