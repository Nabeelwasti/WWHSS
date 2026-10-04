import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type UserSummary, type RoleSummary, type ClassSummary } from "../api";
import { useLanguage } from "../i18n.js";

export function AdminPage() {
  const { t } = useLanguage();
  const [users, setUsers] = useState<UserSummary[] | null>(null);
  const [roles, setRoles] = useState<RoleSummary[] | null>(null);
  const [classes, setClasses] = useState<ClassSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    try {
      const [u, r, c] = await Promise.all([api.listUsers(), api.listRoles(), api.listClasses()]);
      setUsers(u.users);
      setRoles(r.roles);
      setClasses(c.classes);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load admin data.");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCreateUser(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      const result = await api.createUser({
        email: String(form.get("email")),
        fullName: String(form.get("fullName")),
      });
      setNotice(
        result.temporaryPassword
          ? `Created ${result.user.fullName}. One-time password: ${result.temporaryPassword} — relay this to them directly; it will not be shown again.`
          : `Created ${result.user.fullName}.`
      );
      e.currentTarget.reset();
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create user.");
    }
  }

  async function handleResetPassword(user: UserSummary) {
    if (!confirm(`Reset the password for ${user.fullName}? Their current password will stop working immediately.`)) return;
    try {
      const result = await api.resetUserPassword(user.id);
      setNotice(
        `New one-time password for ${user.fullName}: ${result.temporaryPassword} — tell them in person or by phone; it will not be shown again.`
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not reset the password.");
    }
  }

  async function handleAssignRole(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const userId = String(form.get("userId"));
    const roleKey = String(form.get("roleKey"));
    const classId = String(form.get("classId") || "") || undefined;
    try {
      await api.assignRole(userId, { roleKey, classId });
      setNotice("Role assigned.");
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not assign role.");
    }
  }

  async function handleCreateClass(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await api.createClass({
        name: String(form.get("name")),
        academicYearId: String(form.get("academicYearId")),
      });
      setNotice("Class created.");
      e.currentTarget.reset();
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create class. Does an academic year exist yet?");
    }
  }

  return (
    <div className="page" style={{ maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, margin: "0 0 16px 0" }}>{t("admin.title")}</h1>

      {error && (
        <p role="alert" className="alert alert-danger">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="alert alert-success">
          {notice}
        </p>
      )}

      <section className="card">
        <h2 className="card-title">{t("admin.createUser")}</h2>
        <form onSubmit={handleCreateUser} className="flex gap-2 flex-wrap">
          <input className="input" name="fullName" placeholder={t("admin.fullName")} aria-label={t("admin.fullName")} required />
          <input className="input" name="email" type="email" placeholder={t("admin.email")} aria-label={t("admin.email")} required />
          <button type="submit" className="btn btn-primary">
            {t("admin.create")}
          </button>
        </form>
      </section>

      <section className="card">
        <h2 className="card-title">{t("admin.assignRole")}</h2>
        <form onSubmit={handleAssignRole} className="flex gap-2 flex-wrap">
          <select className="input" name="userId" required defaultValue="" aria-label={t("admin.selectUser")}>
            <option value="" disabled>
              {t("admin.selectUser")}
            </option>
            {users?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName} ({u.email})
              </option>
            ))}
          </select>
          <select className="input" name="roleKey" required defaultValue="" aria-label={t("admin.selectRole")}>
            <option value="" disabled>
              {t("admin.selectRole")}
            </option>
            {roles?.map((r) => (
              <option key={r.id} value={r.key}>
                {r.name}
              </option>
            ))}
          </select>
          <select className="input" name="classId" defaultValue="" aria-label="Class Scope">
            <option value="">{t("admin.noScope")}</option>
            {classes?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-primary">
            {t("admin.assign")}
          </button>
        </form>
      </section>

      <section className="card">
        <h2 className="card-title">{t("admin.createClass")}</h2>
        <form onSubmit={handleCreateClass} className="flex gap-2 flex-wrap">
          <input className="input" name="name" placeholder={t("admin.className")} aria-label={t("admin.className")} required />
          <input className="input" name="academicYearId" placeholder={t("admin.academicYearId")} aria-label={t("admin.academicYearId")} required />
          <button type="submit" className="btn btn-primary">
            {t("admin.create")}
          </button>
        </form>
      </section>

      <section className="card">
        <h2 className="card-title">{t("admin.currentUsers")}</h2>
        {users === null && <p className="text-muted text-sm">{t("common.loading")}</p>}
        {users?.length === 0 && <p className="text-muted text-sm">No users yet besides your own account.</p>}
        {users && users.length > 0 && (
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                <th scope="col">{t("admin.name")}</th>
                <th scope="col">{t("admin.email")}</th>
                <th scope="col">{t("admin.roles")}</th>
                <th scope="col">{t("admin.status")}</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td>{u.fullName}</td>
                  <td>{u.email}</td>
                  <td>{u.userRoles.map((ur) => ur.role.name).join(", ") || "—"}</td>
                  <td>{u.isActive ? t("admin.active") : t("admin.deactivated")}</td>
                  <td>
                    <button onClick={() => handleResetPassword(u)} className="btn btn-ghost btn-sm">
                      {t("admin.resetPassword")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
