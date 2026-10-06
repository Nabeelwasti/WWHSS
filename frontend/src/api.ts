export type ParentChildDashboard = {
  student: { id: string; admissionNo: string; status: string; user: { fullName: string; email: string; phone?: string | null }; class?: { name: string } | null; section?: { name: string } | null; fundingCategory?: { name: string } | null };
  attendance: { date: string; status: string }[];
  exams: { id: string; marksObtained: number | string; maxMarks: number | string; grade?: string | null; exam: { name: string }; subject: { name: string } }[];
  invoices: { id: string; amountDue: number | string; dueDate: string; status: string; feeStructure: { name: string }; payments: unknown[]; feeWaivers: unknown[] }[];
  timetable: { dayOfWeek: number; startTime: string; endTime: string; subject: { name: string }; teacher: { fullName: string }; room?: { name: string } | null }[];
  notices: { id: string; title: string; body: string; audience: string; publishedAt: string }[];
};

// Every function here calls the real backend over HTTP. There is no mock
// mode and no fabricated fallback data: if the backend is unreachable or
// returns an error, callers get that error and must show it honestly.

let accessToken: string | null = null;
let onSessionExpired: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

// Lets the auth layer find out when the session can no longer be renewed,
// so the UI can return to the sign-in screen instead of showing a wall of
// confusing "token expired" errors.
export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler;
}

// The login token lasts only 15 minutes by design (a stolen one is useless
// quickly). The long-lived refresh token in an httpOnly cookie quietly
// gets a new one. A single shared in-flight promise means several requests
// failing at the same moment trigger ONE refresh, not a stampede — which
// matters because each refresh rotates (replaces) the cookie.
let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch("/api/auth/refresh", { method: "POST", credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return false;
        const body = (await res.json()) as { accessToken: string };
        accessToken = body.accessToken;
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

// Called once when the app opens: if a valid refresh cookie exists, the
// person is signed straight back in instead of being sent to the login
// page on every reload.
export function restoreSession(): Promise<boolean> {
  return tryRefresh();
}

// Turns whatever the server sent back into one readable sentence. The
// backend returns either a plain string, or zod's structured field errors
// ({ fieldErrors: { email: ["Invalid email"] } }) for bad input.
function describeError(body: unknown, status: number): string {
  const error = (body as { error?: unknown } | null)?.error;
  if (typeof error === "string") return error;

  const fieldErrors = (error as { fieldErrors?: Record<string, string[] | undefined> } | undefined)?.fieldErrors;
  if (fieldErrors) {
    for (const [field, messages] of Object.entries(fieldErrors)) {
      if (messages && messages.length > 0) return `${field}: ${messages[0]}`;
    }
  }
  return `Something went wrong (error ${status}). Please try again.`;
}

async function request<T>(path: string, options: RequestInit = {}, isRetry = false): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    credentials: "include", // sends the httpOnly refresh-token cookie
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  // Expired login token: renew once and retry once. Never for the login /
  // refresh calls themselves (a 401 there just means "wrong credentials").
  const isAuthCall = path.startsWith("/auth/login") || path.startsWith("/auth/refresh");
  if (res.status === 401 && !isRetry && !isAuthCall) {
    if (await tryRefresh()) return request<T>(path, options, true);
    accessToken = null;
    onSessionExpired?.();
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, describeError(body, res.status));
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type Me = {
  id: string;
  email: string;
  fullName: string;
  photoUrl: string | null;
  studentProfile: { id: string; classId: string | null; sectionId: string | null } | null;
  aiPersonalizationConsent: boolean;
  userRoles: {
    classId: string | null;
    sectionId: string | null;
    subjectId: string | null;
    departmentId: string | null;
    role: { key: string; name: string };
  }[];
};

export type UserSummary = {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  userRoles: {
    role: { key: string; name: string };
    classId: string | null;
    sectionId: string | null;
    subjectId: string | null;
    departmentId: string | null;
  }[];
};

export type RoleSummary = { id: string; key: string; name: string };
export type ClassSummary = { id: string; name: string; sections: { id: string; name: string }[] };
export type SubjectSummary = { id: string; name: string; code: string | null };
export type StaffSummary = {
  id: string;
  userId: string;
  employeeId: string;
  designation: string;
  qualification: string | null;
  joiningDate: string | null;
  status: string;
  emergencyContact: string | null;
  user: { id: string; fullName: string; email: string; phone: string | null; isActive: boolean };
  department: { id: string; name: string } | null;
};
export type NotificationSummary = { id: string; title: string; body: string; type: string; isRead: boolean; createdAt: string };
export type StudentInRoster = { id: string; rollNumber: string | null; user: { fullName: string } };
export type ExamResultSummary = {
  id: string;
  marksObtained: number;
  maxMarks: number;
  grade: string | null;
  exam: { name: string; startDate: string };
  subject: { name: string };
};
export type TimetableSlotSummary = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  subject: { name: string };
  class?: { name: string };
  section?: { name: string };
  room: { name: string } | null;
};
export type BookSummary = {
  id: string;
  title: string;
  author: string;
  category: string | null;
  copies: { id: string; barcode: string; available: boolean }[];
};
export type LoanSummary = {
  id: string;
  issuedAt: string;
  dueAt: string;
  returnedAt: string | null;
  fineAmount: number | null;
  bookCopy: { book: { title: string } };
};
export type EngagementSummary = {
  currentStreak: number;
  bestStreak: number;
  attendedDays: number;
  recordedDays: number;
  attendanceRate: number | null;
};
export type InvoiceSummary = {
  id: string;
  amountDue: number;
  dueDate: string;
  status: string;
  feeStructure: { name: string };
  payments: { amount: number; method: string; paidAt: string }[];
};

export const api = {
  login: (email: string, password: string) =>
    request<{ accessToken: string; user: { id: string; email: string; fullName: string } }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  logout: () => request<void>("/auth/logout", { method: "POST" }),

  setAiConsent: (consent: boolean) =>
    request<void>("/auth/ai-consent", { method: "POST", body: JSON.stringify({ consent }) }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  me: () => request<{ user: Me }>("/auth/me"),

  myClasses: () =>
    request<{ classes: unknown[] | null; scopeIsSchoolWide: boolean }>("/academics/my-classes"),

  studentAttendance: (studentProfileId: string) =>
    request<{ records: { date: string; status: string }[] }>(`/attendance/student/${studentProfileId}`),

  engagementSummary: (studentProfileId: string) =>
    request<{ summary: EngagementSummary }>(`/attendance/student/${studentProfileId}/summary`),

  // ---- Admin: users & roles (requires "users:manage" on the backend —
  // the frontend does not duplicate that check, it just surfaces whatever
  // the server genuinely allows or denies) ----

  listUsers: () => request<{ users: UserSummary[] }>("/users"),

  listRoles: () => request<{ roles: RoleSummary[] }>("/users/roles"),
  listDepartments: () => request<{ departments: { id: string; name: string; code: string | null }[] }>("/users/departments"),

  createUser: (input: { email: string; fullName: string; phone?: string }) =>
    request<{ user: { id: string; email: string; fullName: string }; temporaryPassword?: string }>("/users", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  assignRole: (
    userId: string,
    input: { roleKey: string; classId?: string; sectionId?: string; subjectId?: string; departmentId?: string }
  ) =>
    request(`/users/${userId}/roles`, { method: "POST", body: JSON.stringify(input) }),

  deactivateUser: (userId: string) => request(`/users/${userId}/deactivate`, { method: "POST" }),

  resetUserPassword: (userId: string) =>
    request<{ temporaryPassword: string }>(`/users/${userId}/reset-password`, { method: "POST" }),

  // ---- Admin: academic structure (requires "academics:manage") ----

  listClasses: () => request<{ classes: ClassSummary[] }>("/academics/classes"),
  listAcademicYears: () => request<{ academicYears: { id: string; label: string; startDate: string; endDate: string; isActive: boolean }[] }>("/academics/academic-years"),

  listSubjects: () => request<{ subjects: SubjectSummary[] }>("/academics/subjects"),

  createAcademicYear: (input: { label: string; startDate: string; endDate: string }) =>
    request("/academics/academic-years", { method: "POST", body: JSON.stringify(input) }),

  createClass: (input: { name: string; academicYearId: string }) =>
    request("/academics/classes", { method: "POST", body: JSON.stringify(input) }),

  createSection: (input: { name: string; classId: string }) =>
    request("/academics/sections", { method: "POST", body: JSON.stringify(input) }),

  createSubject: (input: { name: string; code?: string }) =>
    request("/academics/subjects", { method: "POST", body: JSON.stringify(input) }),

  enrollStudent: (input: {
    userId: string;
    admissionNo: string;
    classId?: string;
    sectionId?: string;
    rollNumber?: string;
  }) => request("/academics/enroll", { method: "POST", body: JSON.stringify(input) }),

  // ---- LMS ----

  myAssignments: (studentProfileId: string) =>
    request<{
      assignments: {
        id: string;
        title: string;
        dueAt: string;
        maxScore: number;
        course: { subject: { name: string } };
        submissions: { id: string; score: number | null; submittedAt: string }[];
      }[];
    }>(`/lms/my-assignments/${studentProfileId}`),

  submitAssignment: (input: { assignmentId: string; studentProfileId: string; textAnswer?: string }) =>
    request("/lms/submissions", { method: "POST", body: JSON.stringify(input) }),

  myQuizzes: (studentProfileId: string) =>
    request<{
      quizzes: {
        id: string;
        title: string;
        course: { subject: { name: string } };
        attempts: { id: string; score: number }[];
        _count: { questions: number };
      }[];
    }>(`/lms/my-quizzes/${studentProfileId}`),

  getQuiz: (quizId: string, studentProfileId: string) =>
    request<{ id: string; title: string; questions: { id: string; prompt: string; choices: string[] }[] }>(
      `/lms/quizzes/${quizId}?studentProfileId=${studentProfileId}`
    ),

  submitQuizAttempt: (quizId: string, input: { studentProfileId: string; answers: Record<string, number> }) =>
    request<{ score: number }>(`/lms/quizzes/${quizId}/attempts`, { method: "POST", body: JSON.stringify(input) }),

  // ---- Notifications ----

  myNotifications: () => request<{ notifications: NotificationSummary[] }>("/notifications"),

  markNotificationRead: (id: string) => request<void>(`/notifications/${id}/read`, { method: "POST" }),

  // ---- Exams ----

  myExamResults: (studentProfileId: string) =>
    request<{ results: ExamResultSummary[] }>(`/exams/results/student/${studentProfileId}`),

  // ---- Attendance (teacher marking) ----

  studentsInSection: (sectionId: string) =>
    request<{ students: StudentInRoster[] }>(`/academics/sections/${sectionId}/students`),

  markAttendance: (input: {
    classId: string;
    sectionId: string;
    date: string;
    records: { studentProfileId: string; status: "present" | "absent" | "late" | "excused" }[];
  }) => request("/attendance/mark", { method: "POST", body: JSON.stringify(input) }),

  // ---- Timetable ----

  myTeachingSchedule: () => request<{ slots: TimetableSlotSummary[] }>("/timetable/my-schedule"),

  classTimetable: (classId: string, sectionId: string) =>
    request<{ slots: TimetableSlotSummary[] }>(`/timetable/class?classId=${classId}&sectionId=${sectionId}`),

  // ---- Library ----

  searchLibrary: (q: string) => request<{ books: BookSummary[] }>(`/library/search?q=${encodeURIComponent(q)}`),

  myLoans: () => request<{ loans: LoanSummary[] }>("/library/my-loans"),

  // ---- Finance ----

  myInvoices: (studentProfileId: string) =>
    request<{ invoices: InvoiceSummary[] }>(`/finance/student/${studentProfileId}`),

  // ---- AI assistant ----

  askAI: (message: string) => request<{ reply: string }>("/ai/ask", { method: "POST", body: JSON.stringify({ message }) }),

  // ---- Public CMS (no auth required) ----

  publicNotices: () => request<{ notices: { id: string; title: string; body: string; publishedAt: string }[] }>("/cms/notices"),

  publicEvents: () =>
    request<{ events: { id: string; title: string; startAt: string; location: string | null }[] }>("/cms/events"),

  // ---- Admin: Academic & Guardian Extensions ----

  linkGuardian: (input: { parentUserId: string; studentProfileId: string; relation: string }) =>
    request("/academics/link-guardian", { method: "POST", body: JSON.stringify(input) }),

  // ---- Admin: Exams & Results ----

  listExams: () => request<{ exams: { id: string; name: string; startDate: string; endDate: string }[] }>("/exams"),

  createExam: (input: { name: string; academicYearId: string; startDate: string; endDate: string }) =>
    request("/exams", { method: "POST", body: JSON.stringify(input) }),

  recordExamResults: (input: {
    examId: string;
    subjectId: string;
    results: { studentProfileId: string; marksObtained: number; maxMarks: number; grade?: string; remarks?: string }[];
  }) => request("/exams/results", { method: "POST", body: JSON.stringify(input) }),

  // ---- Admin: Finance ----

  createFeeStructure: (input: { classId: string; academicYearId: string; name: string; amount: number }) =>
    request("/finance/fee-structures", { method: "POST", body: JSON.stringify(input) }),

  generateInvoices: (input: { feeStructureId: string; dueDate: string }) =>
    request<{ generated: number }>("/finance/generate-invoices", { method: "POST", body: JSON.stringify(input) }),

  recordPayment: (input: { invoiceId: string; amount: number; method: string }) =>
    request("/finance/payments", { method: "POST", body: JSON.stringify(input) }),

  // ---- Parent Portal ----
  listParentChildren: () => request<{ children: unknown[] }>("/parent/children"),
  getParentChildDashboard: (studentProfileId: string) => request<ParentChildDashboard>(`/parent/children/${studentProfileId}/dashboard`),

  // ---- Admin: Library ----

  createBook: (input: { title: string; author: string; isbn?: string; category?: string }) =>
    request("/library/books", { method: "POST", body: JSON.stringify(input) }),

  createBookCopy: (input: { bookId: string; barcode: string }) =>
    request("/library/copies", { method: "POST", body: JSON.stringify(input) }),

  issueBookLoan: (input: { bookCopyBarcode: string; userId: string; dueDate: string }) =>
    request("/library/issue", { method: "POST", body: JSON.stringify(input) }),

  returnBookLoan: (loanId: string) => request(`/library/loans/${loanId}/return`, { method: "POST" }),

  // ---- Admin: Timetable & Rooms ----

  createRoom: (name: string) => request("/timetable/rooms", { method: "POST", body: JSON.stringify({ name }) }),

  listRooms: () => request<{ rooms: { id: string; name: string }[] }>("/timetable/rooms"),

  createTimetableSlot: (input: {
    classId: string;
    sectionId: string;
    subjectId: string;
    teacherId: string;
    roomId?: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }) => request("/timetable/slots", { method: "POST", body: JSON.stringify(input) }),

  // ---- Admin: CMS & Announcements ----

  createNotice: (input: { title: string; body: string; audience: string }) =>
    request("/cms/notices", { method: "POST", body: JSON.stringify(input) }),

  createEvent: (input: { title: string; description?: string; startAt: string; endAt?: string; location?: string }) =>
    request("/cms/events", { method: "POST", body: JSON.stringify(input) }),

  createCmsPage: (input: { slug: string; title: string; content: string }) =>
    request("/cms/pages", { method: "POST", body: JSON.stringify(input) }),

  publishCmsPage: (slug: string) => request(`/cms/pages/${slug}/publish`, { method: "POST" }),

  unpublishCmsPage: (slug: string) => request(`/cms/pages/${slug}/unpublish`, { method: "POST" }),

  listCmsAdminPages: () => request<{ pages: { id: string; slug: string; title: string; isPublished: boolean }[] }>("/cms/admin/pages"),

  // ---- Student Master Profiles & Search ----
  searchStudents: (params: { query?: string; classId?: string; sectionId?: string; status?: string; gender?: string; page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params.query) q.set("query", params.query);
    if (params.classId) q.set("classId", params.classId);
    if (params.sectionId) q.set("sectionId", params.sectionId);
    if (params.status) q.set("status", params.status);
    if (params.gender) q.set("gender", params.gender);
    if (params.page) q.set("page", params.page.toString());
    if (params.limit) q.set("limit", params.limit.toString());
    return request<{ students: unknown[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>(`/users/students/search?${q.toString()}`);
  },

  getStudentProfile: (id: string) => request<{ profile: unknown }>(`/users/students/${id}`),

  updateStudentProfile: (id: string, input: Record<string, unknown>) =>
    request<{ profile: unknown }>(`/users/students/${id}`, { method: "PUT", body: JSON.stringify(input) }),

  // ---- Staff Profiles ----
  listStaff: () => request<{ staff: StaffSummary[] }>("/users/staff"),

  createStaff: (input: {
    userId: string;
    employeeId: string;
    designation: string;
    qualification?: string;
    joiningDate?: string;
    status?: string;
    emergencyContact?: string;
  }) => request<{ staff: StaffSummary }>("/users/staff", { method: "POST", body: JSON.stringify(input) }),

  // ---- Funding & Fee Extensions ----
  listFundingCategories: () => request<unknown[]>("/finance/funding-categories"),

  createFundingCategory: (input: { name: string; code: string; description?: string; isDefault?: boolean }) =>
    request("/finance/funding-categories", { method: "POST", body: JSON.stringify(input) }),

  assignStudentFunding: (input: Record<string, unknown>) =>
    request("/finance/student-funding", { method: "POST", body: JSON.stringify(input) }),

  applyFeeWaiver: (input: { invoiceId: string; studentProfileId: string; amount: number; reason: string }) =>
    request("/finance/waivers", { method: "POST", body: JSON.stringify(input) }),

  getFinancialSummary: () => request<unknown>("/finance/summary-report"),

  // ---- Document Engine ----
  listDocuments: (docType?: string) =>
    request<{ documents: unknown[] }>(`/documents${docType ? `?docType=${docType}` : ""}`),

  createDocumentRecord: (input: { docType: string; studentProfileId?: string; staffProfileId?: string; metadataJson?: unknown }) =>
    request<{ document: unknown }>("/documents", { method: "POST", body: JSON.stringify(input) }),

  getDocumentPayload: (docType: string, referenceId: string) =>
    request<{ payload: unknown }>(`/documents/payload/${docType}/${referenceId}`),

  // ---- AI Assessment Studio ----
  listAiAssessmentTests: (params?: { classId?: string; subjectId?: string; status?: string }) => {
    const q = new URLSearchParams();
    if (params?.classId) q.set("classId", params.classId);
    if (params?.subjectId) q.set("subjectId", params.subjectId);
    if (params?.status) q.set("status", params.status);
    return request<{ tests: unknown[] }>(`/ai/assessment/tests?${q.toString()}`);
  },

  createAiAssessmentTest: (input: Record<string, unknown>) =>
    request<{ test: unknown }>("/ai/assessment/tests", { method: "POST", body: JSON.stringify(input) }),

  generateAiAssessmentQuestions: (testId: string, numQuestions = 5) =>
    request<{ test: unknown }>(`/ai/assessment/tests/${testId}/generate`, { method: "POST", body: JSON.stringify({ numQuestions }) }),

  approveAiAssessmentTest: (testId: string) =>
    request<{ test: unknown }>(`/ai/assessment/tests/${testId}/approve`, { method: "POST" }),

  submitAiAnswerSheet: (input: Record<string, unknown>) =>
    request<{ answerSheet: unknown }>("/ai/assessment/answer-sheets", { method: "POST", body: JSON.stringify(input) }),

  gradeAiAnswerSheet: (sheetId: string, input: { finalScore: number; teacherFeedback?: string }) =>
    request<{ answerSheet: unknown }>(`/ai/assessment/answer-sheets/${sheetId}/grade`, { method: "POST", body: JSON.stringify(input) }),

  // ---- Backups ----
  listBackups: () => request<{ backups: unknown[] }>("/backup"),

  createBackup: () => request<{ backup: unknown }>("/backup/create", { method: "POST" }),

  verifyBackup: (filename: string) => request<{ verification: unknown }>(`/backup/verify/${filename}`, { method: "POST" }),
};
