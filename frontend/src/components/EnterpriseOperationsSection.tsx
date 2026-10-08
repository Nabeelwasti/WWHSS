import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../api";

type Row = Record<string, any>;
type Tab = "hr" | "payroll" | "admissions" | "transport" | "inventory" | "assets" | "ptm";

const tabs: [Tab, string][] = [
  ["hr", "HR & Leave"], ["payroll", "Payroll"], ["admissions", "Admissions"],
  ["transport", "Transport"], ["inventory", "Inventory"], ["assets", "Assets"], ["ptm", "Parent Meetings"],
];

export function EnterpriseOperationsSection() {
  const [tab, setTab] = useState<Tab>("hr");
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      const data: any =
        tab === "hr" ? await api.listLeaveRequests() :
        tab === "payroll" ? await api.listPayrollPeriods() :
        tab === "admissions" ? await api.listAdmissionLeads() :
        tab === "transport" ? await api.listTransportRoutes() :
        tab === "inventory" ? await api.listInventoryItems() :
        tab === "assets" ? await api.listAssets() :
        await api.listPtmMeetings();
      setRows((data.leaves || data.periods || data.leads || data.routes || data.items || data.assets || data.meetings || []) as Row[]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load operations data.");
    }
  }

  useEffect(() => { void load(); }, [tab]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      if (tab === "hr") {
        await api.createLeaveRequest({
          staffProfileId: String(f.get("staffProfileId")), leaveType: String(f.get("leaveType")),
          startDate: new Date(String(f.get("startDate"))).toISOString(), endDate: new Date(String(f.get("endDate"))).toISOString(),
          days: Number(f.get("days")), reason: String(f.get("reason") || "") || undefined,
        });
      } else if (tab === "payroll") {
        await api.createPayrollPeriod({
          label: String(f.get("label")), startDate: new Date(String(f.get("startDate"))).toISOString(),
          endDate: new Date(String(f.get("endDate"))).toISOString(),
        });
      } else if (tab === "admissions") {
        await api.createAdmissionLead({
          applicantName: String(f.get("applicantName")), guardianName: String(f.get("guardianName") || "") || undefined,
          phone: String(f.get("phone") || "") || undefined, email: String(f.get("email") || "") || undefined,
          desiredClass: String(f.get("desiredClass") || "") || undefined, source: String(f.get("source") || "") || undefined,
        });
      } else if (tab === "transport") {
        if (String(f.get("transportAction")) === "vehicle") {
          await api.createTransportVehicle({ registrationNo: String(f.get("registrationNo")), capacity: Number(f.get("capacity")),
            driverName: String(f.get("driverName") || "") || undefined, driverPhone: String(f.get("driverPhone") || "") || undefined });
        } else {
          await api.createTransportRoute({
            name: String(f.get("routeName")),
            pickupPoints: String(f.get("pickupPoints") || "").split("\n").map(name => ({ name: name.trim() })).filter(x => x.name),
            monthlyFee: Number(f.get("monthlyFee") || 0), vehicleId: String(f.get("vehicleId") || "") || undefined,
          });
        }
      } else if (tab === "inventory") {
        if (String(f.get("inventoryAction")) === "item") {
          await api.createInventoryItem({
            sku: String(f.get("sku")), name: String(f.get("name")), category: String(f.get("category")),
            quantity: Number(f.get("quantity") || 0), reorderLevel: Number(f.get("reorderLevel") || 0), unit: String(f.get("unit") || "unit"),
          });
        } else {
          await api.createInventoryTransaction({
            itemId: String(f.get("itemId")), type: String(f.get("type")), quantity: Number(f.get("transactionQuantity")),
            unitCost: Number(f.get("unitCost") || 0) || undefined, reference: String(f.get("reference") || "") || undefined,
            notes: String(f.get("notes") || "") || undefined,
          });
        }
      } else if (tab === "assets") {
        await api.assignAsset({
          assetTag: String(f.get("assetTag")), assetType: String(f.get("assetType")),
          condition: String(f.get("condition") || "GOOD"), staffProfileId: String(f.get("staffProfileId") || "") || undefined,
          studentProfileId: String(f.get("studentProfileId") || "") || undefined, notes: String(f.get("notes") || "") || undefined,
        });
      } else {
        await api.createPtmMeeting({
          studentProfileId: String(f.get("studentProfileId")), teacherUserId: String(f.get("teacherUserId") || "") || undefined,
          scheduledAt: new Date(String(f.get("scheduledAt"))).toISOString(), durationMinutes: Number(f.get("durationMinutes") || 15),
          mode: String(f.get("mode") || "IN_PERSON"), agenda: String(f.get("agenda") || "") || undefined,
        });
      }
      setNotice("Saved successfully."); e.currentTarget.reset(); await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not save."); }
  }

  async function decideLeave(id: string, status: "APPROVED" | "REJECTED") {
    try { await api.decideLeaveRequest(id, { status }); setNotice("Leave " + status.toLowerCase() + "."); await load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Could not update leave."); }
  }

  async function payrollAction(id: string, action: "approve" | "pay") {
    try {
      if (action === "approve") await api.approvePayrollPeriod(id);
      else {
        const reference = window.prompt("Payment reference (optional):") || undefined;
        await api.payPayrollPeriod(id, reference ? { paymentReference: reference } : {});
      }
      setNotice(action === "approve" ? "Payroll period approved." : "Payroll period paid."); await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not update payroll."); }
  }

  async function convertLead(r: Row) {
    const email = window.prompt("Student email", r.email || "");
    const admissionNo = window.prompt("Admission number");
    if (!email || !admissionNo) return;
    try {
      const result: any = await api.convertAdmissionLead(r.id, { email, admissionNo });
      setNotice("Student created. One-time password: " + result.temp); await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not convert admission."); }
  }

  async function returnAsset(id: string) {
    try { await api.returnAsset(id); setNotice("Asset returned."); await load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Could not return asset."); }
  }

  const form = tab === "hr" ? (
    <>
      <input className="input" name="staffProfileId" placeholder="Staff profile ID" required />
      <input className="input" name="leaveType" placeholder="Leave type" required />
      <input className="input" name="startDate" type="date" required />
      <input className="input" name="endDate" type="date" required />
      <input className="input" name="days" type="number" step="0.5" min="0.5" placeholder="Days" required />
      <input className="input" name="reason" placeholder="Reason" />
    </>
  ) : tab === "payroll" ? (
    <>
      <input className="input" name="label" placeholder="October 2026 Payroll" required />
      <input className="input" name="startDate" type="date" required />
      <input className="input" name="endDate" type="date" required />
    </>
  ) : tab === "admissions" ? (
    <>
      <input className="input" name="applicantName" placeholder="Applicant name" required />
      <input className="input" name="guardianName" placeholder="Guardian" />
      <input className="input" name="phone" placeholder="Phone" />
      <input className="input" name="email" type="email" placeholder="Email" />
      <input className="input" name="desiredClass" placeholder="Desired class" />
      <input className="input" name="source" placeholder="Source" />
    </>
  ) : tab === "transport" ? (
    <>
      <select className="input" name="transportAction" defaultValue="vehicle"><option value="vehicle">Add vehicle</option><option value="route">Add route</option></select>
      <input className="input" name="registrationNo" placeholder="Vehicle registration" />
      <input className="input" name="capacity" type="number" min="1" placeholder="Capacity" />
      <input className="input" name="driverName" placeholder="Driver" />
      <input className="input" name="driverPhone" placeholder="Driver phone" />
      <input className="input" name="routeName" placeholder="Route name" />
      <textarea className="input" name="pickupPoints" placeholder="Pickup points, one per line" rows={2} />
      <input className="input" name="monthlyFee" type="number" min="0" placeholder="Monthly fee" />
      <input className="input" name="vehicleId" placeholder="Vehicle ID (optional)" />
    </>
  ) : tab === "inventory" ? (
    <>
      <select className="input" name="inventoryAction" defaultValue="item"><option value="item">Add item</option><option value="transaction">Stock transaction</option></select>
      <input className="input" name="sku" placeholder="SKU" />
      <input className="input" name="name" placeholder="Item name" />
      <input className="input" name="category" placeholder="Category" />
      <input className="input" name="quantity" type="number" min="0" placeholder="Opening stock" />
      <input className="input" name="reorderLevel" type="number" min="0" placeholder="Reorder level" />
      <input className="input" name="unit" placeholder="Unit" />
      <input className="input" name="itemId" placeholder="Item ID for transaction" />
      <select className="input" name="type" defaultValue="RECEIVE"><option>RECEIVE</option><option>ISSUE</option><option>ADJUST</option></select>
      <input className="input" name="transactionQuantity" type="number" min="1" placeholder="Transaction quantity" />
      <input className="input" name="unitCost" type="number" min="0" placeholder="Unit cost" />
    </>
  ) : tab === "assets" ? (
    <>
      <input className="input" name="assetTag" placeholder="Asset tag" required />
      <input className="input" name="assetType" placeholder="Asset type" required />
      <input className="input" name="condition" placeholder="Condition" defaultValue="GOOD" />
      <input className="input" name="staffProfileId" placeholder="Staff profile ID" />
      <input className="input" name="studentProfileId" placeholder="Student profile ID" />
      <input className="input" name="notes" placeholder="Notes" />
    </>
  ) : (
    <>
      <input className="input" name="studentProfileId" placeholder="Student profile ID" required />
      <input className="input" name="teacherUserId" placeholder="Teacher user ID" />
      <input className="input" name="scheduledAt" type="datetime-local" required />
      <input className="input" name="durationMinutes" type="number" min="5" max="180" defaultValue="15" />
      <select className="input" name="mode" defaultValue="IN_PERSON"><option>IN_PERSON</option><option>ONLINE</option><option>PHONE</option></select>
      <input className="input" name="agenda" placeholder="Agenda" />
    </>
  );

  return (
    <section>
      <div className="flex gap-2 flex-wrap" style={{ marginBottom: 16 }}>
        {tabs.map(([key, label]) => <button type="button" key={key} className={"btn " + (tab === key ? "btn-primary" : "btn-ghost")} onClick={() => setTab(key)}>{label}</button>)}
      </div>
      {error && <p role="alert" className="alert alert-danger">{error}</p>}
      {notice && <p role="status" className="alert alert-success">{notice}</p>}
      <section className="card">
        <h2 className="card-title">Enterprise Operations — {tabs.find(x => x[0] === tab)?.[1]}</h2>
        <form onSubmit={submit} className="flex gap-2 flex-wrap">{form}<button className="btn btn-primary" type="submit">Create / Save</button></form>
      </section>
      <section className="card">
        <h3 className="card-title">Current records</h3>
        {rows.length === 0 ? <p className="text-muted text-sm">No records yet.</p> : <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead><tr><th scope="col" style={{ textAlign: "left" }}>Record</th><th scope="col" style={{ textAlign: "left" }}>Status</th><th scope="col" style={{ textAlign: "left" }}>Details / Actions</th></tr></thead>
            <tbody>{rows.map(r => <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
              <td>{r.id}</td>
              <td>{r.status || "—"}</td>
              <td>
                {r.label || r.applicantName || r.name || r.leaveType || r.registrationNo || r.assetTag || r.scheduledAt || "—"}
                {tab === "hr" && r.status === "PENDING" && <span className="flex gap-2" style={{ marginTop: 4 }}><button type="button" className="btn btn-ghost btn-sm" onClick={() => decideLeave(r.id, "APPROVED")}>Approve</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => decideLeave(r.id, "REJECTED")}>Reject</button></span>}
                {tab === "payroll" && r.status === "DRAFT" && <button type="button" className="btn btn-ghost btn-sm" onClick={() => payrollAction(r.id, "approve")}>Approve</button>}
                {tab === "payroll" && r.status === "APPROVED" && <button type="button" className="btn btn-ghost btn-sm" onClick={() => payrollAction(r.id, "pay")}>Pay</button>}
                {tab === "admissions" && !r.convertedStudentId && <button type="button" className="btn btn-ghost btn-sm" onClick={() => convertLead(r)}>Convert</button>}
                {tab === "assets" && r.status !== "RETURNED" && <button type="button" className="btn btn-ghost btn-sm" onClick={() => returnAsset(r.id)}>Return</button>}
              </td>
            </tr>)}</tbody>
          </table>
        </div>}
      </section>
    </section>
  );
}
