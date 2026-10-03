import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api";
import { useAuth } from "../AuthContext";

export function AiChatWidget() {
  const { user } = useAuth();
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
      // A real 503 here means no AI provider is genuinely configured on
      // this deployment — shown honestly, not disguised as a canned reply.
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
      // A real page reload is the simplest honest way to reflect the new
      // consent state everywhere without threading a refetch through every
      // component that reads `user`.
      window.location.reload();
    } catch {
      setConsentBusy(false);
    }
  }

  return (
    <section className="card">
      <h2 className="card-title">Campus AI</h2>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          className="input"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ask a general academic question…"
        />
        <button type="submit" disabled={loading || !message.trim()} className="btn btn-primary">
          {loading ? "…" : "Ask"}
        </button>
      </form>

      {error && (
        <p role="alert" className="alert alert-danger">
          {error}
        </p>
      )}
      {reply && (
        <p className="text-sm mt-2" style={{ whiteSpace: "pre-wrap" }}>
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
          Let the assistant see my own real attendance streak and recent results, to give more
          personal answers. You can turn this off anytime — it's never used without your say-so.
        </label>
      )}

      <p className="text-xs text-muted mt-2">
        It won't look up records you haven't allowed it to see. Ask it general academic questions or,
        if you've turned personalization on above, things like "how am I doing?"
      </p>
    </section>
  );
}
