import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../api";

export function FinanceManagementSection() {
  const [categories, setCategories] = useState<any[]>([]);
  const [summary, setSummary] = useState<any | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshData() {
    try {
      const [cats, sum] = await Promise.all([api.listFundingCategories(), api.getFinancialSummary()]);
      setCategories(cats as any[]);
      setSummary(sum);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load finance administrative data.");
    }
  }

  useEffect(() => {
    refreshData();
  }, []);

  async function handleCreateCategory(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await api.createFundingCategory({
        name: String(form.get("name")),
        code: String(form.get("code")),
        description: String(form.get("description") || "") || undefined,
        isDefault: form.get("isDefault") === "on",
      });
      setNotice("Funding Category created.");
      e.currentTarget.reset();
      refreshData();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create funding category.");
    }
  }

  async function handleCreateFeeStructure(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await api.createFeeStructure({
        classId: String(form.get("classId")),
        academicYearId: String(form.get("academicYearId")),
        name: String(form.get("name")),
        amount: parseFloat(String(form.get("amount"))),
      });
      setNotice("Fee Structure created.");
      e.currentTarget.reset();
      refreshData();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create fee structure.");
    }
  }

  async function handleApplyWaiver(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await api.applyFeeWaiver({
        invoiceId: String(form.get("invoiceId")),
        studentProfileId: String(form.get("studentProfileId")),
        amount: parseFloat(String(form.get("amount"))),
        reason: String(form.get("reason")),
      });
      setNotice("Fee Waiver applied successfully.");
      e.currentTarget.reset();
      refreshData();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not apply fee waiver.");
    }
  }

  return (
    <section className="card">
      <h2 className="card-title">Finance & Funding Administration</h2>

      {notice && <p role="status" className="alert alert-success">{notice}</p>}
      {error && <p role="alert" className="alert alert-danger">{error}</p>}

      {/* Financial Overview Summary */}
      {summary && (
        <div style={{ background: "var(--surface-2)", padding: 12, borderRadius: 6, marginBottom: 16 }}>
          <h4 style={{ margin: "0 0 8px 0" }}>Financial Overview</h4>
          <div className="flex gap-4 flex-wrap text-sm">
            <div><strong>Total Billed:</strong> PKR {summary.overall?.totalBilled || 0}</div>
            <div><strong>Total Collected:</strong> PKR {summary.overall?.totalPaid || 0}</div>
            <div><strong>Total Waived:</strong> PKR {summary.overall?.totalWaived || 0}</div>
            <div><strong>Outstanding:</strong> PKR {summary.overall?.outstanding || 0}</div>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        {/* Create Funding Category */}
        <div style={{ border: "1px solid var(--border)", padding: 12, borderRadius: 6 }}>
          <h4 style={{ margin: "0 0 8px 0" }}>Create Funding Category</h4>
          <form onSubmit={handleCreateCategory} className="flex-col gap-2">
            <input className="input" name="name" placeholder="Name (e.g. Workers Welfare Fund)" required />
            <input className="input" name="code" placeholder="Code (e.g. WWF_FUNDED)" required />
            <input className="input" name="description" placeholder="Description" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isDefault" /> Set as Default Category
            </label>
            <button type="submit" className="btn btn-primary btn-sm">Create Category</button>
          </form>
        </div>

        {/* Create Fee Structure */}
        <div style={{ border: "1px solid var(--border)", padding: 12, borderRadius: 6 }}>
          <h4 style={{ margin: "0 0 8px 0" }}>Create Fee Structure</h4>
          <form onSubmit={handleCreateFeeStructure} className="flex-col gap-2">
            <input className="input" name="name" placeholder="Fee Name (e.g. Term 1 Tuition)" required />
            <input className="input" name="classId" placeholder="Class ID (UUID)" required />
            <input className="input" name="academicYearId" placeholder="Academic Year ID (UUID)" required />
            <input className="input" name="amount" type="number" step="0.01" placeholder="Amount (PKR)" required />
            <button type="submit" className="btn btn-primary btn-sm">Create Fee Structure</button>
          </form>
        </div>

        {/* Apply Fee Waiver */}
        <div style={{ border: "1px solid var(--border)", padding: 12, borderRadius: 6 }}>
          <h4 style={{ margin: "0 0 8px 0" }}>Apply Fee Waiver</h4>
          <form onSubmit={handleApplyWaiver} className="flex-col gap-2">
            <input className="input" name="invoiceId" placeholder="Invoice ID (UUID)" required />
            <input className="input" name="studentProfileId" placeholder="Student Profile ID (UUID)" required />
            <input className="input" name="amount" type="number" step="0.01" placeholder="Waiver Amount (PKR)" required />
            <input className="input" name="reason" placeholder="Reason (e.g. Merit / Hardship)" required />
            <button type="submit" className="btn btn-primary btn-sm">Apply Waiver</button>
          </form>
        </div>
      </div>
    </section>
  );
}
