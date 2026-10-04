import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api";
import { useAuth } from "../AuthContext";
import { useLanguage } from "../i18n.js";

export function ChangePasswordSection() {
  const { logout } = useAuth();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (next.length < 10) return setError("Your new password needs at least 10 characters.");
    if (next !== confirm) return setError("The two new passwords don't match.");

    setSaving(true);
    try {
      await api.changePassword(current, next);
      alert("Password changed. Please sign in again with your new password.");
      await logout();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not change your password.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <p className="mt-4 text-sm">
        <button onClick={() => setOpen(true)} className="btn btn-ghost btn-sm">
          {t("password.btn")}
        </button>
      </p>
    );
  }

  return (
    <section className="card">
      <h2 className="card-title">{t("password.sectionTitle")}</h2>
      <form onSubmit={handleSubmit} className="flex-col gap-2" style={{ maxWidth: 320 }}>
        <input
          className="input"
          type="password"
          placeholder={t("password.current")}
          aria-label={t("password.current")}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
          autoComplete="current-password"
        />
        <input
          className="input"
          type="password"
          placeholder={t("password.new")}
          aria-label={t("password.new")}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
          minLength={10}
          autoComplete="new-password"
        />
        <input
          className="input"
          type="password"
          placeholder={t("password.repeatNew")}
          aria-label={t("password.repeatNew")}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          autoComplete="new-password"
        />
        {error && (
          <p role="alert" className="alert alert-danger" style={{ margin: 0 }}>
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? "…" : t("password.change")}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="btn btn-secondary">
            {t("password.cancel")}
          </button>
        </div>
      </form>
    </section>
  );
}
