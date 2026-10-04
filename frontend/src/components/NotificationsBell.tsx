import { useEffect, useState } from "react";
import { api, type NotificationSummary } from "../api";
import { useLanguage } from "../i18n.js";

export function NotificationsBell() {
  const { t } = useLanguage();
  const [notifications, setNotifications] = useState<NotificationSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await api.myNotifications();
      setNotifications(res.notifications);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load notifications.");
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  async function handleOpen() {
    setOpen((o) => !o);
  }

  async function handleMarkRead(id: string) {
    try {
      await api.markNotificationRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not mark as read.");
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={handleOpen}
        aria-label={t("notifications.header")}
        aria-expanded={open}
        aria-haspopup="true"
        className="btn btn-ghost btn-sm"
        style={{ position: "relative" }}
      >
        {t("notifications.header")}
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              background: "var(--danger)",
              color: "#fff",
              borderRadius: 10,
              fontSize: 10,
              padding: "1px 5px",
            }}
          >
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t("notifications.header")}
          style={{
            position: "absolute",
            right: 0,
            top: "110%",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            width: 280,
            maxHeight: 320,
            overflowY: "auto",
            zIndex: 10,
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
          }}
        >
          {error && (
            <p role="alert" className="alert alert-danger" style={{ fontSize: 12, padding: 8, margin: 8 }}>
              {error}
            </p>
          )}
          {notifications.length === 0 && !error && (
            <p className="text-muted text-sm" style={{ padding: 12, margin: 0 }}>
              {t("notifications.empty")}
            </p>
          )}
          {notifications.map((n) => (
            <div
              key={n.id}
              role="menuitem"
              tabIndex={0}
              onClick={() => !n.isRead && handleMarkRead(n.id)}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && !n.isRead) handleMarkRead(n.id);
              }}
              style={{
                padding: 10,
                borderBottom: "1px solid var(--border)",
                fontSize: 13,
                background: n.isRead ? "transparent" : "var(--surface-2)",
                cursor: n.isRead ? "default" : "pointer",
              }}
            >
              <strong>{n.title}</strong>
              <div className="text-muted">{n.body}</div>
              <div className="text-muted text-xs mt-1">
                {new Date(n.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
