import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type UserSummary, type RoleSummary, type ClassSummary } from "../api";

// Every list here starts empty and is only ever populated by a real
// response from the backend. There is no seeded sample roster baked into
// this file — an admin using a fresh install sees a genuinely empty state
// until they create real accounts and classes.

export function AdminPage() {
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
      // A 403 here is a real, expected outcome for anyone without
      // "users:manage" — shown honestly, not hidden.
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
      // Requires a real AcademicYear to already exist — enforced by the
      // backend's foreign key, not glossed over here.
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
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 24, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 18 }}>Administration</h1>

      {error && (
        <p role="alert" style={{ color: "#a32d2d" }}>
          {error}
        </p>
      )}
      {notice && <p style={{ color: "#1a7d3a" }}>{notice}</p>}

      <section style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: 14, color: "#666", textTransform: "uppercase" }}>Create a user</h2>
        <form onSubmit={handleCreateUser} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input name="fullName" placeholder="Full name" required />
          <input name="email" type="email" placeholder="Email" required />
          <button type="submit">Create</button>
        </form>
        <p style={{ fontSize: 12, color: "#777" }}>
          A one-time password is generated server-side and shown once — it is never a fixed default like
          the seeded admin account.
        </p>
      </section>

      <section style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: 14, color: "#666", textTransform: "uppercase" }}>Assign a role</h2>
        <form onSubmit={handleAssignRole} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select name="userId" required defaultValue="">
            <option value="" disabled>
              Select user
            </option>
            {users?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName} ({u.email})
              </option>
            ))}
          </select>
          <select name="roleKey" required defaultValue="">
            <option value="" disabled>
              Select role
            </option>
            {roles?.map((r) => (
              <option key={r.id} value={r.key}>
                {r.name}
              </option>
            ))}
          </select>
          <select name="classId" defaultValue="">
            <option value="">No class scope (school-wide)</option>
            {classes?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button type="submit">Assign</button>
        </form>
      </section>

      <section style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: 14, color: "#666", textTransform: "uppercase" }}>Create a class</h2>
        <form onSubmit={handleCreateClass} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input name="name" placeholder="e.g. Grade 10" required />
          <input name="academicYearId" placeholder="Academic year ID" required />
          <button type="submit">Create</button>
        </form>
        <p style={{ fontSize: 12, color: "#777" }}>
          Create an academic year directly via the API first (
          <code>POST /api/academics/academic-years</code>) — a picker for this belongs in a future pass,
          not faked here as a dropdown with invented years.
        </p>
      </section>

      <section style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: 14, color: "#666", textTransform: "uppercase" }}>Current users</h2>
        {users === null && <p>Loading…</p>}
        {users?.length === 0 && <p style={{ color: "#555" }}>No users yet besides your own account.</p>}
        {users && users.length > 0 && (
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                <th>Name</th>
                <th>Email</th>
                <th>Roles</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td>{u.fullName}</td>
                  <td>{u.email}</td>
                  <td>{u.userRoles.map((ur) => ur.role.name).join(", ") || "—"}</td>
                  <td>{u.isActive ? "Active" : "Deactivated"}</td>
                  <td>
                    <button onClick={() => handleResetPassword(u)}>Reset password</button>
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
