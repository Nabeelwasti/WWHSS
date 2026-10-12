import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../api";

type StudentOption = { id: string; admissionNo: string; user?: { fullName?: string }; class?: { name?: string } | null; section?: { name?: string } | null };
type InvoiceRow = { id: string; invoiceNumber: string; studentProfileId: string; amountDue: number | string; dueDate: string; status: string; student?: { user?: { fullName?: string }; admissionNo?: string; class?: { name?: string } | null; section?: { name?: string } | null }; feeStructure?: { name?: string }; payments?: { amount: number | string; status?: string; adjustments?: { kind: string; amount: number | string }[] }[]; feeWaivers?: { amount: number | string }[] };
type FeeStructure = { id: string; name: string; amount: number | string; classId: string; academicYearId: string; class?: { name?: string }; academicYear?: { label?: string } };
const money = (value: unknown) => "PKR " + Number(value ?? 0).toLocaleString("en-PK", { maximumFractionDigits: 2 });
const studentLabel = (student: StudentOption) => (student.user?.fullName || "Unnamed student") + " — " + student.admissionNo + (student.class?.name ? " · " + student.class.name : "") + (student.section?.name ? "-" + student.section.name : "");
const invoiceLabel = (invoice: InvoiceRow) => invoice.invoiceNumber + " — " + (invoice.student?.user?.fullName || invoice.student?.admissionNo || "Student") + " — " + money(invoice.amountDue) + " (" + invoice.status + ")";

export function FinanceManagementSection() {
  const [categories, setCategories] = useState<{ id: string; name: string; code: string; isDefault: boolean }[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [academicYears, setAcademicYears] = useState<{ id: string; label: string; isActive: boolean }[]>([]);
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [summary, setSummary] = useState<any | null>(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceStatus, setInvoiceStatus] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  async function refreshData() {
    setLoading(true);
    setError(null);
    const results = await Promise.allSettled([
      api.listFundingCategories(),
      api.getFinancialSummary(),
      api.listFinanceOptions(),
      api.listFeeStructures(),
      api.listFinanceInvoices({ limit: 100 }),
      api.searchFinanceStudents({ limit: 100 }),
    ]);
    const failures: string[] = [];
    if (results[0].status === "fulfilled") setCategories(results[0].value.categories);
    else failures.push("Funding categories could not be loaded.");
    if (results[1].status === "fulfilled") setSummary(results[1].value);
    else failures.push("Financial summary could not be loaded.");
    if (results[2].status === "fulfilled") {
      setClasses(results[2].value.classes);
      setAcademicYears(results[2].value.academicYears);
    } else failures.push("Class and academic-year options are unavailable to this account.");
    if (results[3].status === "fulfilled") setFeeStructures(results[3].value.feeStructures as FeeStructure[]);
    else failures.push("Fee structures could not be loaded.");
    if (results[4].status === "fulfilled") setInvoices(results[4].value.invoices as InvoiceRow[]);
    else failures.push("Invoice register could not be loaded.");
    if (results[5].status === "fulfilled") setStudents(results[5].value.students as StudentOption[]);
    else failures.push("Student search is unavailable to this account.");
    if (failures.length) setError(failures.join(" "));
    setLoading(false);
  }

  useEffect(() => { void refreshData(); }, []);

  async function runAction(key: string, successMessage: string, action: () => Promise<unknown>, form?: HTMLFormElement) {
    setSaving(key);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(successMessage);
      form?.reset();
      await refreshData();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e instanceof Error ? e.message : "The finance operation failed."));
    } finally {
      setSaving(null);
    }
  }

  async function handleCreateCategory(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    await runAction("category", "Funding category created.", () => api.createFundingCategory({
      name: String(data.get("name")).trim(),
      code: String(data.get("code")).trim().toUpperCase(),
      description: String(data.get("description") || "").trim() || undefined,
      isDefault: data.get("isDefault") === "on",
    }), form);
  }

  async function handleAssignFunding(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const startDate = String(data.get("startDate"));
    const endDate = String(data.get("endDate") || "");
    const feePolicy = String(data.get("feePolicy")) as "FULLY_WAIVED" | "PARTIALLY_WAIVED" | "STANDARD" | "CUSTOM";
    await runAction("funding", "Funding record assigned and recorded in the audit trail.", () => api.assignStudentFunding({
      studentProfileId: String(data.get("studentProfileId")),
      fundingCategoryId: String(data.get("fundingCategoryId")),
      programName: String(data.get("programName") || "").trim() || undefined,
      startDate,
      endDate: endDate || undefined,
      evidenceRef: String(data.get("evidenceRef") || "").trim() || undefined,
      approvalAuthority: String(data.get("approvalAuthority") || "").trim() || undefined,
      feePolicy,
      waiverPercentage: data.get("waiverPercentage") ? Number(data.get("waiverPercentage")) : undefined,
      customFeeAmount: data.get("customFeeAmount") ? Number(data.get("customFeeAmount")) : undefined,
      notes: String(data.get("notes") || "").trim() || undefined,
    }), form);
  }

  async function handleCreateFeeStructure(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    await runAction("structure", "Fee structure created.", () => api.createFeeStructure({
      classId: String(data.get("classId")),
      academicYearId: String(data.get("academicYearId")),
      name: String(data.get("name")).trim(),
      amount: Number(data.get("amount")),
      feeType: String(data.get("feeType") || "").trim() || undefined,
      fundingCategoryId: String(data.get("fundingCategoryId") || "") || undefined,
    }), form);
  }

  async function handleGenerateInvoices(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const start = String(data.get("billingPeriodStart") || "");
    const end = String(data.get("billingPeriodEnd") || "");
    if (Boolean(start) !== Boolean(end)) {
      setError("Enter both billing-period dates, or leave both empty.");
      return;
    }
    await runAction("invoices", "Invoice generation completed. Existing invoices for the same billing period are not duplicated.", async () => {
      const result = await api.generateInvoices({
        feeStructureId: String(data.get("feeStructureId")),
        dueDate: String(data.get("dueDate")),
        billingPeriodStart: start || undefined,
        billingPeriodEnd: end || undefined,
      });
      setNotice("Generated " + result.generated + " invoice(s).");
      return result;
    }, form);
  }

  async function handleRecordPayment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    await runAction("payment", "Payment recorded. Check the invoice register for the updated balance.", () => api.recordPayment({
      invoiceId: String(data.get("invoiceId")),
      amount: Number(data.get("amount")),
      method: String(data.get("method")),
    }), form);
  }

  async function handleApplyWaiver(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const invoice = invoices.find((item) => item.id === String(data.get("invoiceId")));
    if (!invoice) {
      setError("Select a current invoice before applying a waiver.");
      return;
    }
    await runAction("waiver", "Fee waiver applied and recorded.", () => api.applyFeeWaiver({
      invoiceId: invoice.id,
      studentProfileId: invoice.studentProfileId,
      amount: Number(data.get("amount")),
      reason: String(data.get("reason")).trim(),
    }), form);
  }

  async function handleStudentSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await api.searchFinanceStudents({ query: studentSearch.trim(), limit: 100 });
      setStudents(result.students as StudentOption[]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Student search failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleInvoiceSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await api.listFinanceInvoices({ query: invoiceSearch.trim() || undefined, status: invoiceStatus || undefined, limit: 100 });
      setInvoices(result.invoices as InvoiceRow[]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Invoice search failed.");
    } finally {
      setLoading(false);
    }
  }

  const overall = summary?.overall ?? summary ?? {};
  const activeInvoices = invoices.filter((invoice) => !["paid", "waived", "cancelled", "void", "written_off", "refunded"].includes(invoice.status));
  const selectedInvoiceOptions = invoices.filter((invoice) => !["paid", "waived", "cancelled", "void", "written_off", "refunded"].includes(invoice.status));

  return (
    <section className="finance-workspace">
      <header className="finance-workspace-header">
        <div><span className="section-eyebrow">SCHOOL OPERATIONS</span><h2 className="card-title">Finance & Funding</h2><p className="text-muted text-sm">Funding decisions, fee rules, billing and payments in one auditable workspace.</p></div>
        <button type="button" className="btn btn-secondary" onClick={() => void refreshData()} disabled={loading}>{loading ? "Refreshing…" : "Refresh data"}</button>
      </header>
      {notice && <p role="status" className="alert alert-success">{notice}</p>}
      {error && <p role="alert" className="alert alert-danger">{error}</p>}

      <div className="finance-metric-grid" aria-label="Financial overview">
        <article className="finance-metric"><span>Total billed</span><strong>{money(overall.totalBilled)}</strong></article>
        <article className="finance-metric"><span>Collected</span><strong>{money(overall.totalPaid)}</strong></article>
        <article className="finance-metric"><span>Waived</span><strong>{money(overall.totalWaived)}</strong></article>
        <article className="finance-metric"><span>Outstanding</span><strong>{money(overall.outstanding)}</strong></article>
      </div>

      <div className="finance-card-grid">
        <section className="card finance-card">
          <h3>Create funding category</h3><p className="text-muted text-sm">Define an approved welfare, scholarship, private or other funding program.</p>
          <form onSubmit={handleCreateCategory} className="finance-form">
            <label>Category name<input className="input" name="name" maxLength={120} required placeholder="Workers Welfare Fund" /></label>
            <label>Unique code<input className="input" name="code" maxLength={40} required placeholder="WWF_FUNDED" /></label>
            <label>Description<input className="input" name="description" maxLength={500} placeholder="Eligibility or program notes" /></label>
            <label className="finance-check"><input type="checkbox" name="isDefault" /> Default category for new student records</label>
            <button type="submit" className="btn btn-primary" disabled={saving !== null}>{saving === "category" ? "Creating…" : "Create category"}</button>
          </form>
          {categories.length > 0 && <div className="finance-list"><strong>Configured categories</strong>{categories.map((category) => <div key={category.id}><span>{category.name}{category.isDefault ? " · Default" : ""}</span><small>{category.code}</small></div>)}</div>}
        </section>

        <section className="card finance-card">
          <h3>Assign funding to a student</h3><p className="text-muted text-sm">Store the program, dates, evidence, approval and fee policy—not just a funding checkbox.</p>
          <form onSubmit={handleStudentSearch} className="finance-inline-search"><label>Find a student<input className="input" value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder="Name, admission number, guardian or phone" /></label><button className="btn btn-secondary" type="submit" disabled={loading}>Find</button></form>
          <form onSubmit={handleAssignFunding} className="finance-form">
            <label>Student<select className="input" name="studentProfileId" required defaultValue=""><option value="" disabled>Select a student</option>{students.map((student) => <option key={student.id} value={student.id}>{studentLabel(student)}</option>)}</select></label>
            <label>Funding category<select className="input" name="fundingCategoryId" required defaultValue=""><option value="" disabled>Select a category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <label>Program / scheme<input className="input" name="programName" maxLength={160} placeholder="Workers welfare / merit scholarship" /></label>
            <div className="finance-two-col"><label>Effective from<input className="input" type="date" name="startDate" required /></label><label>Expires on (optional)<input className="input" type="date" name="endDate" /></label></div>
            <div className="finance-two-col"><label>Evidence / reference<input className="input" name="evidenceRef" maxLength={160} placeholder="Approval or document reference" /></label><label>Approval authority<input className="input" name="approvalAuthority" maxLength={160} placeholder="Approving officer / committee" /></label></div>
            <label>Fee policy<select className="input" name="feePolicy" defaultValue="STANDARD"><option value="STANDARD">Standard fee</option><option value="FULLY_WAIVED">Fully waived</option><option value="PARTIALLY_WAIVED">Partial waiver</option><option value="CUSTOM">Custom fee</option></select></label>
            <div className="finance-two-col"><label>Waiver percentage<input className="input" type="number" name="waiverPercentage" min="0" max="100" step="0.01" placeholder="0–100" /></label><label>Custom fee (PKR)<input className="input" type="number" name="customFeeAmount" min="0" step="0.01" placeholder="Optional custom amount" /></label></div>
            <label>Notes<textarea className="input" name="notes" maxLength={2000} rows={2} placeholder="Decision notes and eligibility context" /></label>
            <button type="submit" className="btn btn-primary" disabled={saving !== null || categories.length === 0 || students.length === 0}>{saving === "funding" ? "Saving…" : "Assign funding record"}</button>
          </form>
        </section>

        <section className="card finance-card">
          <h3>Fee structures</h3><p className="text-muted text-sm">Create fee rules using real class and academic-year records.</p>
          <form onSubmit={handleCreateFeeStructure} className="finance-form">
            <label>Fee name<input className="input" name="name" required maxLength={160} placeholder="Monthly tuition" /></label>
            <div className="finance-two-col"><label>Class<select className="input" name="classId" required defaultValue=""><option value="" disabled>Select class</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Academic year<select className="input" name="academicYearId" required defaultValue=""><option value="" disabled>Select year</option>{academicYears.map((year) => <option key={year.id} value={year.id}>{year.label}</option>)}</select></label></div>
            <label>Amount (PKR)<input className="input" name="amount" type="number" min="0.01" step="0.01" required /></label>
            <label>Fee type<input className="input" name="feeType" maxLength={80} placeholder="Tuition, transport, exam" /></label>
            <label>Funding category (optional)<select className="input" name="fundingCategoryId" defaultValue=""><option value="">All eligible students</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <button type="submit" className="btn btn-primary" disabled={saving !== null || classes.length === 0 || academicYears.length === 0}>{saving === "structure" ? "Creating…" : "Create fee structure"}</button>
          </form>
          {feeStructures.length > 0 && <div className="finance-list"><strong>Current structures</strong>{feeStructures.map((fee) => <div key={fee.id}><span>{fee.name} · {fee.class?.name || "Class"} · {fee.academicYear?.label || "Year"}</span><small>{money(fee.amount)}</small></div>)}</div>}
        </section>

        <section className="card finance-card">
          <h3>Generate invoices</h3><p className="text-muted text-sm">Generate a class fee batch for a due date and optional explicit billing period.</p>
          <form onSubmit={handleGenerateInvoices} className="finance-form">
            <label>Fee structure<select className="input" name="feeStructureId" required defaultValue=""><option value="" disabled>Select fee structure</option>{feeStructures.map((fee) => <option key={fee.id} value={fee.id}>{fee.name} · {fee.class?.name || "Class"} · {money(fee.amount)}</option>)}</select></label>
            <label>Due date<input className="input" name="dueDate" type="date" required /></label>
            <div className="finance-two-col"><label>Billing period starts<input className="input" name="billingPeriodStart" type="date" /></label><label>Billing period ends<input className="input" name="billingPeriodEnd" type="date" /></label></div>
            <p className="text-muted text-sm">If you set a billing period, enter both dates. Re-running the same period is designed not to duplicate invoices.</p>
            <button type="submit" className="btn btn-primary" disabled={saving !== null || feeStructures.length === 0}>{saving === "invoices" ? "Generating…" : "Generate invoices"}</button>
          </form>
        </section>

        <section className="card finance-card">
          <h3>Record a payment</h3><p className="text-muted text-sm">Payments are validated against the remaining invoice balance by the backend.</p>
          <form onSubmit={handleRecordPayment} className="finance-form">
            <label>Outstanding invoice<select className="input" name="invoiceId" required defaultValue=""><option value="" disabled>Select invoice</option>{selectedInvoiceOptions.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoiceLabel(invoice)}</option>)}</select></label>
            <label>Payment amount (PKR)<input className="input" name="amount" type="number" min="0.01" step="0.01" required /></label>
            <label>Payment method<select className="input" name="method" required defaultValue="cash"><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="online">Online</option></select></label>
            <button type="submit" className="btn btn-primary" disabled={saving !== null || selectedInvoiceOptions.length === 0}>{saving === "payment" ? "Recording…" : "Record payment"}</button>
          </form>
        </section>

        <section className="card finance-card">
          <h3>Apply a fee waiver</h3><p className="text-muted text-sm">The selected invoice determines the student record; the server validates the waiver against the outstanding amount.</p>
          <form onSubmit={handleApplyWaiver} className="finance-form">
            <label>Invoice<select className="input" name="invoiceId" required defaultValue=""><option value="" disabled>Select invoice</option>{selectedInvoiceOptions.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoiceLabel(invoice)}</option>)}</select></label>
            <label>Waiver amount (PKR)<input className="input" name="amount" type="number" min="0.01" step="0.01" required /></label>
            <label>Reason<input className="input" name="reason" minLength={3} maxLength={500} required placeholder="Approved welfare / hardship / merit decision" /></label>
            <button type="submit" className="btn btn-primary" disabled={saving !== null || selectedInvoiceOptions.length === 0}>{saving === "waiver" ? "Applying…" : "Apply waiver"}</button>
          </form>
        </section>
      </div>

      <section className="card finance-invoice-register">
        <div className="finance-register-header"><div><h3>Invoice register</h3><p className="text-muted text-sm">Search by invoice number, student name or admission number.</p></div><span className="section-meta">{activeInvoices.length} outstanding in current results</span></div>
        <form onSubmit={handleInvoiceSearch} className="finance-inline-search">
          <label>Search invoices<input className="input" value={invoiceSearch} onChange={(e) => setInvoiceSearch(e.target.value)} placeholder="Invoice number, student or admission number" /></label>
          <label>Status<select className="input" value={invoiceStatus} onChange={(e) => setInvoiceStatus(e.target.value)}><option value="">All statuses</option>{["draft","issued","partial","pending","paid","overdue","waived","cancelled","void","written_off","refunded"].map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
          <button type="submit" className="btn btn-secondary" disabled={loading}>Search invoices</button>
        </form>
        {loading && <p role="status" className="text-muted text-sm">Loading finance records…</p>}
        {!loading && invoices.length === 0 && <p className="text-muted text-sm">No invoices match these filters.</p>}
        {invoices.length > 0 && <div className="finance-table-wrap"><table className="finance-table"><thead><tr><th>Invoice</th><th>Student</th><th>Class</th><th>Due date</th><th>Amount</th><th>Status</th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id}><td>{invoice.invoiceNumber}</td><td>{invoice.student?.user?.fullName || invoice.student?.admissionNo || "Student"}</td><td>{invoice.student?.class?.name || "—"}{invoice.student?.section?.name ? "-" + invoice.student.section.name : ""}</td><td>{new Date(invoice.dueDate).toLocaleDateString()}</td><td>{money(invoice.amountDue)}</td><td><span className="badge">{invoice.status}</span></td></tr>)}</tbody></table></div>}
      </section>
    </section>
  );
}
