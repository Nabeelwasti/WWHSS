import { useState, type FormEvent } from "react";
import { useAuth } from "../AuthContext";
import { useLanguage, LanguageToggle } from "../i18n";

export function LoginPage() {
  const { login, loading, error } = useAuth();
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await login(email, password);
    } catch {
      // error is already captured in auth state; nothing further to do
    }
  }

  return (
    <div className="page page-narrow" style={{ marginTop: "8vh" }}>
      <div className="flex justify-between items-center">
        <h1 style={{ fontSize: 22, margin: 0, color: "var(--navy)" }}>WWHS Digital Campus</h1>
        <LanguageToggle />
      </div>
      <p className="text-muted text-sm">{t("login.subtitle")}</p>

      <form onSubmit={handleSubmit} className="card">
        <label className="field">
          {t("login.email")}
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            autoFocus
          />
        </label>
        <label className="field">
          {t("login.password")}
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="current-password"
          />
        </label>

        {/* A real error from the server — never a generic placeholder,
            and never hidden when something actually went wrong. */}
        {error && (
          <p role="alert" className="alert alert-danger">
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className="btn btn-primary btn-block mt-2">
          {loading ? t("login.submitting") : t("login.submit")}
        </button>
      </form>
    </div>
  );
}
