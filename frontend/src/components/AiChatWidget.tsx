import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api";
import { useAuth } from "../AuthContext";
import { useLanguage } from "../i18n.js";

export function AiChatWidget() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [consentBusy, setConsentBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setReply(null);
    try {
      const res = await api.askAI(message);
      setReply(res.reply);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The assistant is unavailable right now.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleConsent() {
    if (!user) return;
    setConsentBusy(true);
    try {
      await api.setAiConsent(!user.aiPersonalizationConsent);
      window.location.reload();
    } catch {
      setConsentBusy(false);
    }
  }

  return (
    <section className="card">
      <h2 className="card-title">{t("ai.title")}</h2>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          className="input"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("ai.askPlaceholder")}
          aria-label={t("ai.askPlaceholder")}
        />
        <button type="submit" disabled={loading || !message.trim()} className="btn btn-primary">
          {loading ? "…" : t("ai.askBtn")}
        </button>
      </form>

      {error && (
        <p role="alert" className="alert alert-danger">
          {error}
        </p>
      )}
      {reply && (
        <p role="status" className="text-sm mt-2" style={{ whiteSpace: "pre-wrap" }}>
          {reply}
        </p>
      )}

      {user?.studentProfile && (
        <label className="flex items-center gap-2 text-xs text-muted mt-2" style={{ cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={user.aiPersonalizationConsent}
            onChange={toggleConsent}
            disabled={consentBusy}
          />
          {t("ai.consentLabel")}
        </label>
      )}
    </section>
  );
}
