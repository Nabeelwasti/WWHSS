import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type UserSummary, type RoleSummary, type ClassSummary } from "../api";
import { useLanguage } from "../i18n";
import { StudentDirectorySection } from "../components/StudentDirectorySection";
import { FinanceManagementSection } from "../components/FinanceManagementSection";
import { AiAssessmentStudioSection } from "../components/AiAssessmentStudioSection";
import { DocumentEngineSection } from "../components/DocumentEngineSection";
import { CmsManagementSection } from "../components/CmsManagementSection";
import { BackupManagementSection } from "../components/BackupManagementSection";
import { LibraryManagementSection } from "../components/LibraryManagementSection";
import { StaffManagementSection } from "../components/StaffManagementSection";

type AdminTab = "users" | "staff" | "students" | "finance" | "library" | "assessment" | "documents" | "cms" | "backups";

export function AdminPage() {
  const { t } = useLanguage();
  const [tab, setTab] = useState<AdminTab>("users");
  const [users, setUsers] = useState<UserSummary[] | null>(null);
  const [roles, setRoles] = useState<RoleSummary[] | null>(null);
  const [classes, setClasses] = useState<ClassSummary[] | null>(null);
  const [subjects, setSubjects] = useState<{ id: string; name: string; code: string | null }[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string; code: string | null }[]>([]);
  const [academicYears, setAcademicYears] = useState<{ id: string; label: string; startDate: string; endDate: string; isActive: boolean }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    try {
      const [u, r, c, s, d, y] = await Promise.all([api.listUsers(), api.listRoles(), api.listClasses(), api.listSubjects(), api.listDepartments(), api.listAcademicYears()]);
      setUsers(u.users);
      setRoles(r.roles);
      setClasses(c.classes);
      setSubjects(s.subjects);
      setDepartments(d.departments);
      setAcademicYears(y.academicYears);
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
    const sectionId = String(form.get("sectionId") || "") || undefined;
    const subjectId = String(form.get("subjectId") || "") || undefined;
    const departmentId = String(form.get("departmentId") || "") || undefined;
    try {
      await api.assignRole(userId, { roleKey, classId, sectionId, subjectId, departmentId });
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

  const tabBtn = (key: AdminTab, label: string) => (
    <button
      className={`btn ${tab === key ? "btn-primary" : "btn-ghost"}`}
      style={{ fontSize: 13, padding: "6px 12px" }}
      onClick={() => setTab(key)}
    >
      {label}
    </button>
  );

  return (
    <div className="page" style={{ maxWidth: 840, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, margin: "0 0 16px 0" }}>{t("admin.title")}</h1>

      <div className="flex gap-2 flex-wrap" style={{ marginBottom: 16 }}>
        {tabBtn("users", "Users & Roles")}
        {tabBtn("staff", "Staff & Teachers")}
        {tabBtn("students", "Student Directory")}
        {tabBtn("finance", "Finance & Funding")}
        {tabBtn("library", "Library")}
        {tabBtn("assessment", "AI Assessment Studio")}
        {tabBtn("documents", "Document Center")}
        {tabBtn("cms", "CMS & Announcements")}
        {tabBtn("backups", "Backups & Recovery")}
      </div>

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

      {tab === "students" && <StudentDirectorySection />}
      {tab === "finance" && <FinanceManagementSection />}
      {tab === "assessment" && <AiAssessmentStudioSection />}
      {tab === "documents" && <DocumentEngineSection />}
      {tab === "cms" && <CmsManagementSection />}
      {tab === "backups" && <BackupManagementSection />}
      {tab === "staff" && <StaffManagementSection />}
      {tab === "library" && <LibraryManagementSection />}

      {tab === "users" && (
        <>
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
                {classes?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select className="input" name="sectionId" defaultValue="" aria-label="Section Scope">
                <option value="">{t("admin.noScope")}</option>
                {classes?.flatMap((c) => c.sections.map((s) => <option key={s.id} value={s.id}>{c.name} — {s.name}</option>))}
              </select>
              <select className="input" name="subjectId" defaultValue="" aria-label="Subject Scope">
                <option value="">{t("admin.noScope")}</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}{s.code ? " (" + s.code + ")" : ""}</option>)}
              </select>
              <select className="input" name="departmentId" defaultValue="" aria-label="Department Scope">
                <option value="">{t("admin.noScope")}</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
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
              <select className="input" name="academicYearId" aria-label={t("admin.academicYearId")} required defaultValue="">
                <option value="" disabled>{t("admin.academicYearId")}</option>
                {academicYears.map((year) => <option key={year.id} value={year.id}>{year.label}{year.isActive ? " (active)" : ""}</option>)}
              </select>
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
        </>
      )}
    </div>
  );
}
