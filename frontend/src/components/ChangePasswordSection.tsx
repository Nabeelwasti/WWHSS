import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api";
import { useAuth } from "../AuthContext";

export function ChangePasswordSection() {
  const { logout } = useAuth();
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
      // The server ends every session on a password change, so the honest
      // next step is to sign in again with the new password.
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
          Change my password
        </button>
      </p>
    );
  }

  return (
    <section className="card">
      <h2 className="card-title">Change password</h2>
      <form onSubmit={handleSubmit} className="flex-col gap-2" style={{ maxWidth: 320 }}>
        <input className="input" type="password" placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
        <input className="input" type="password" placeholder="New password (10+ characters)" value={next} onChange={(e) => setNext(e.target.value)} required minLength={10} autoComplete="new-password" />
        <input className="input" type="password" placeholder="Repeat new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
        {error && (
          <p role="alert" className="alert alert-danger" style={{ margin: 0 }}>
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="btn btn-primary">{saving ? "Saving…" : "Change password"}</button>
          <button type="button" onClick={() => setOpen(false)} className="btn btn-secondary">Cancel</button>
        </div>
      </form>
    </section>
  );
}
