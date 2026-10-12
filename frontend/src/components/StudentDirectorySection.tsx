import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../api";
import { useLanguage } from "../i18n";

export function StudentDirectorySection() {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [academicYearId, setAcademicYearId] = useState("");
  const [fundingCategoryId, setFundingCategoryId] = useState("");
  const [gender, setGender] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [classes, setClasses] = useState<{ id: string; name: string; sections: { id: string; name: string }[] }[]>([]);
  const [academicYears, setAcademicYears] = useState<{ id: string; label: string; isActive: boolean }[]>([]);
  const [fundingCategories, setFundingCategories] = useState<{ id: string; name: string }[]>([]);
  const [filtersError, setFiltersError] = useState<string | null>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchStudents(page = 1) {
    setLoading(true);
    setError(null);
    try {
      const res = await api.searchStudents({ query, status, classId, sectionId, academicYearId, fundingCategoryId, gender, dateOfBirth, page, limit: 10 });
      setStudents(res.students);
      setPagination(res.pagination);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load student directory.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.listClasses(),
      api.listAcademicYears(),
      api.listFundingCategories(),
    ]).then(([classResult, yearResult, fundingResult]) => {
      if (cancelled) return;
      setClasses(classResult.classes);
      setAcademicYears(yearResult.academicYears);
      setFundingCategories(fundingResult.categories);
    }).catch((e) => {
      if (!cancelled) setFiltersError(e instanceof ApiError ? e.message : "Some student filters could not be loaded.");
    });
    fetchStudents(1);
    return () => { cancelled = true; };
  }, []);

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    fetchStudents(1);
  }

  async function clearFilters() {
    setQuery("");
    setStatus("");
    setClassId("");
    setSectionId("");
    setAcademicYearId("");
    setFundingCategoryId("");
    setGender("");
    setDateOfBirth("");
    setLoading(true);
    setError(null);
    try {
      const res = await api.searchStudents({ page: 1, limit: 10 });
      setStudents(res.students);
      setPagination(res.pagination);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not reset student search.");
    } finally {
      setLoading(false);
    }
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

      <form onSubmit={handleSearch} className="student-search-form" style={{ marginBottom: 16 }}>
        <label className="student-search-query">
          <span>Search student records</span>
          <input className="input" placeholder="Name, father's/guardian's name, admission, roll, registration or phone" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="student-filter-grid">
          <label><span>Academic year</span>
            <select className="input" value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)}>
              <option value="">All academic years</option>
              {academicYears.map((year) => <option key={year.id} value={year.id}>{year.label}{year.isActive ? " (Active)" : ""}</option>)}
            </select>
          </label>
          <label><span>Class</span>
            <select className="input" value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(""); }}>
              <option value="">All classes</option>
              {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label><span>Section</span>
            <select className="input" value={sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={!classId}>
              <option value="">All sections</option>
              {classes.find((item) => item.id === classId)?.sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
            </select>
          </label>
          <label><span>Funding category</span>
            <select className="input" value={fundingCategoryId} onChange={(e) => setFundingCategoryId(e.target.value)}>
              <option value="">All funding categories</option>
              {fundingCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label><span>Gender</span>
            <select className="input" value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">Any gender</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option>
            </select>
          </label>
          <label><span>Date of birth</span><input className="input" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} /></label>
          <label><span>Status</span>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option><option value="PROMOTED">Promoted</option><option value="TRANSFERRED">Transferred</option>
              <option value="WITHDRAWN">Withdrawn</option><option value="SUSPENDED">Suspended</option><option value="GRADUATED">Graduated</option>
            </select>
          </label>
        </div>
        {filtersError && <p className="text-muted text-sm" role="status">{filtersError}</p>}
        <div className="flex gap-2 flex-wrap">
          <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? "Searching…" : "Search students"}</button>
          <button type="button" className="btn btn-secondary" onClick={() => void clearFilters()}>Clear filters</button>
        </div>
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
          role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedStudent(null); }}
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
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-master-profile-title"
            className="card"
            style={{ width: "90%", maxWidth: 650, maxHeight: "85vh", overflowY: "auto", margin: 0, background: "var(--surface)" }}
          >
            <div className="flex justify-between items-center" style={{ marginBottom: 12 }}>
              <h3 id="student-master-profile-title" style={{ margin: 0 }}>Student Master Profile</h3>
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
