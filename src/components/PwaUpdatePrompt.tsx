import { useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";

export function PwaUpdatePrompt() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration>();
  const [updateError, setUpdateError] = useState(false);
  const lastCheck = useRef(0);
  const checking = useRef(false);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker
  } = useRegisterSW({
    onRegisteredSW: (_url, registered) => setRegistration(registered),
    onRegisterError: () => setUpdateError(true)
  });

  async function checkForUpdate(force = false) {
    if (!registration || registration.installing || checking.current || !navigator.onLine || document.visibilityState === "hidden") return;
    if (!force && Date.now() - lastCheck.current < 60_000) return;
    checking.current = true;
    lastCheck.current = Date.now();
    try {
      await registration.update();
      if (registration.waiting) setNeedRefresh(true);
      setUpdateError(false);
    } catch {
      setUpdateError(true);
    } finally {
      checking.current = false;
    }
  }

  useEffect(() => {
    if (!registration) return;
    if (registration.waiting) setNeedRefresh(true);
    const check = () => { void checkForUpdate(); };
    check();
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    document.addEventListener("visibilitychange", check);
    const interval = window.setInterval(check, 5 * 60_000);
    return () => {
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
      document.removeEventListener("visibilitychange", check);
      window.clearInterval(interval);
    };
  }, [registration]);

  if (!needRefresh && !offlineReady && !updateError) return null;

  return (
    <aside className="pwa-update" role="status" aria-live="polite">
      <div>
        <strong>{needRefresh ? "New version ready" : updateError ? "Update check unavailable" : "Offline shell ready"}</strong>
        <span>
          {needRefresh
            ? "Refresh when you are clear of any form in progress."
            : updateError
              ? registration
                ? "Your work is safe. Retry checking for the latest website version."
                : "Reload when you are clear of any form in progress to retry."
              : "Public pages remain readable offline. Booking and check-in still require a connection."}
        </span>
      </div>
      {needRefresh && (
        <button
          className="icon-button"
          type="button"
          title="Update now"
          onClick={() => void updateServiceWorker(true).catch(() => setUpdateError(true))}
        >
          <RefreshCw aria-hidden="true" />
          <span className="sr-only">Update now</span>
        </button>
      )}
      {updateError && registration && (
        <button className="icon-button" type="button" onClick={() => void checkForUpdate(true)}>
          Retry update check
        </button>
      )}
      <button
        className="icon-button"
        type="button"
        title="Dismiss"
        onClick={() => {
          setNeedRefresh(false);
          setOfflineReady(false);
          setUpdateError(false);
        }}
      >
        <X aria-hidden="true" />
        <span className="sr-only">Dismiss update notice</span>
      </button>
    </aside>
  );
}
