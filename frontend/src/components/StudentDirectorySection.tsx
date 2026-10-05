import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../api";
import { useLanguage } from "../i18n";

export function StudentDirectorySection() {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [students, setStudents] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchStudents(page = 1) {
    setLoading(true);
    setError(null);
    try {
      const res = await api.searchStudents({ query, status, page, limit: 10 });
      setStudents(res.students);
      setPagination(res.pagination);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load student directory.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStudents(1);
  }, [status]);

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    fetchStudents(1);
  }

  async function viewStudentProfile(id: string) {
    try {
      const res = await api.getStudentProfile(id);
      setSelectedStudent(res.profile);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load student profile.");
    }
  }

  return (
    <section className="card">
      <h2 className="card-title">Student Directory & Master Profiles</h2>

      {error && (
        <p role="alert" className="alert alert-danger">
          {error}
        </p>
      )}

      <form onSubmit={handleSearch} className="flex gap-2 flex-wrap" style={{ marginBottom: 16 }}>
        <input
          className="input"
          placeholder="Search by name, roll no, admission no, CNIC/B-form, phone..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="PROMOTED">PROMOTED</option>
          <option value="TRANSFERRED">TRANSFERRED</option>
          <option value="WITHDRAWN">WITHDRAWN</option>
          <option value="SUSPENDED">SUSPENDED</option>
          <option value="GRADUATED">GRADUATED</option>
        </select>
        <button type="submit" className="btn btn-primary">
          Search
        </button>
      </form>

      {loading ? (
        <p className="text-muted text-sm">{t("common.loading")}</p>
      ) : students.length === 0 ? (
        <p className="text-muted text-sm">No students match your search criteria.</p>
      ) : (
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
              <th>Admission No</th>
              <th>Name</th>
              <th>Class</th>
              <th>Roll No</th>
              <th>Funding</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s: any) => (
              <tr key={s.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td>{s.admissionNo}</td>
                <td>{s.user?.fullName}</td>
                <td>{s.class?.name || "—"}</td>
                <td>{s.rollNumber || "—"}</td>
                <td>{s.fundingCategory?.name || "Standard"}</td>
                <td>
                  <span className="badge" style={{ fontSize: 11 }}>
                    {s.status}
                  </span>
                </td>
                <td>
                  <button onClick={() => viewStudentProfile(s.id)} className="btn btn-ghost btn-sm">
                    View Profile
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Pagination Controls */}
      {pagination.totalPages > 1 && (
        <div className="flex justify-between items-center" style={{ marginTop: 12 }}>
          <button
            disabled={pagination.page <= 1}
            onClick={() => fetchStudents(pagination.page - 1)}
            className="btn btn-ghost btn-sm"
          >
            Previous
          </button>
          <span className="text-xs text-muted">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} students)
          </span>
          <button
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => fetchStudents(pagination.page + 1)}
            className="btn btn-ghost btn-sm"
          >
            Next
          </button>
        </div>
      )}

      {/* Student Profile Modal */}
      {selectedStudent && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            className="card"
            style={{ width: "90%", maxWidth: 650, maxHeight: "85vh", overflowY: "auto", margin: 0, background: "var(--surface)" }}
          >
            <div className="flex justify-between items-center" style={{ marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Student Master Profile</h3>
              <button onClick={() => setSelectedStudent(null)} className="btn btn-ghost btn-sm">
                ✕ Close
              </button>
            </div>
            <div className="flex-col gap-2" style={{ fontSize: 14 }}>
              <div>
                <strong>Name:</strong> {selectedStudent.user?.fullName} ({selectedStudent.user?.email})
              </div>
              <div>
                <strong>Admission No:</strong> {selectedStudent.admissionNo} | <strong>Registration No:</strong>{" "}
                {selectedStudent.registrationNo || "N/A"}
              </div>
              <div>
                <strong>Class & Section:</strong> {selectedStudent.class?.name || "N/A"} / {selectedStudent.section?.name || "N/A"}
              </div>
              <div>
                <strong>Father's Name:</strong> {selectedStudent.fatherName || "N/A"} | <strong>Guardian Phone:</strong>{" "}
                {selectedStudent.guardianPhone || "N/A"}
              </div>
              <div>
                <strong>Emergency Contact:</strong> {selectedStudent.emergencyContact || "N/A"}
              </div>
              <div>
                <strong>Gender / DOB:</strong> {selectedStudent.gender || "N/A"} /{" "}
                {selectedStudent.dateOfBirth ? new Date(selectedStudent.dateOfBirth).toLocaleDateString() : "N/A"}
              </div>
              <div>
                <strong>Funding Category:</strong> {selectedStudent.fundingCategory?.name || "Standard / Private"}
              </div>
              <div>
                <strong>Status:</strong> {selectedStudent.status}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
