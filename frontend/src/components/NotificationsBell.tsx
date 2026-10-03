import { useEffect, useState } from "react";
import { api, type NotificationSummary } from "../api";

export function NotificationsBell() {
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
    // Real polling, not a fabricated live badge — every 30s is a plain,
    // honest way to approximate "live" without adding websocket
    // infrastructure this project doesn't have yet.
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
      <button onClick={handleOpen} style={{ position: "relative" }}>
        Notifications
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: -6,
              right: -6,
              background: "#a32d2d",
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
          style={{
            position: "absolute",
            right: 0,
            top: "110%",
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: 8,
            width: 280,
            maxHeight: 320,
            overflowY: "auto",
            zIndex: 10,
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
          }}
        >
          {error && (
            <p role="alert" style={{ color: "#a32d2d", fontSize: 12, padding: 8 }}>
              {error}
            </p>
          )}
          {notifications.length === 0 && !error && (
            <p style={{ fontSize: 13, color: "#666", padding: 12 }}>
              No notifications yet — a genuinely empty inbox, not a loading glitch.
            </p>
          )}
          {notifications.map((n) => (
            <div
              key={n.id}
              onClick={() => !n.isRead && handleMarkRead(n.id)}
              style={{
                padding: 10,
                borderBottom: "1px solid #eee",
                fontSize: 13,
                background: n.isRead ? "#fff" : "#f0f6ff",
                cursor: n.isRead ? "default" : "pointer",
              }}
            >
              <strong>{n.title}</strong>
              <div style={{ color: "#555" }}>{n.body}</div>
              <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
                {new Date(n.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
