import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type StaffSummary, type UserSummary } from "../api";

export function StaffManagementSection() {
  const [staff, setStaff] = useState<StaffSummary[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const [staffResult, usersResult] = await Promise.all([api.listStaff(), api.listUsers()]);
      setStaff(staffResult.staff);
      setUsers(usersResult.users);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load staff administration.");
    }
  }
  useEffect(() => { refresh(); }, []);

  async function createStaff(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await api.createStaff({
        userId: String(form.get("userId")),
        employeeId: String(form.get("employeeId")),
        designation: String(form.get("designation")),
        qualification: String(form.get("qualification") || "") || undefined,
        joiningDate: String(form.get("joiningDate") || "") || undefined,
        status: String(form.get("status")),
        emergencyContact: String(form.get("emergencyContact") || "") || undefined,
      });
      e.currentTarget.reset();
      setNotice("Staff profile created.");
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create staff profile.");
    }
  }

  return (
    <section className="card">
      <h2 className="card-title">Staff & Teacher Management</h2>
      {notice && <p role="status" className="alert alert-success">{notice}</p>}
      {error && <p role="alert" className="alert alert-danger">{error}</p>}
      <form onSubmit={createStaff} className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", marginBottom: 16 }}>
        <select className="input" name="userId" aria-label="User" required defaultValue="">
          <option value="" disabled>Select user</option>
          {users.filter((u) => !staff.some((s) => s.userId === u.id)).map((u) => <option key={u.id} value={u.id}>{u.fullName} ({u.email})</option>)}
        </select>
        <input className="input" name="employeeId" placeholder="Employee ID" aria-label="Employee ID" required />
        <input className="input" name="designation" placeholder="Designation" aria-label="Designation" required />
        <input className="input" name="qualification" placeholder="Qualification" aria-label="Qualification" />
        <input className="input" name="joiningDate" type="date" aria-label="Joining date" />
        <select className="input" name="status" aria-label="Status" defaultValue="ACTIVE"><option>ACTIVE</option><option>ON_LEAVE</option><option>RESIGNED</option><option>RETIRED</option></select>
        <input className="input" name="emergencyContact" placeholder="Emergency contact" aria-label="Emergency contact" />
        <button className="btn btn-primary" type="submit">Create Staff Profile</button>
      </form>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr><th scope="col">Employee ID</th><th scope="col">Name</th><th scope="col">Designation</th><th scope="col">Department</th><th scope="col">Status</th></tr></thead>
          <tbody>{staff.map((s) => <tr key={s.id}><td>{s.employeeId}</td><td>{s.user.fullName}</td><td>{s.designation}</td><td>{s.department?.name || "—"}</td><td>{s.status}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}
