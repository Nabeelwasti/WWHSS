import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { api, ApiError, type StaffSummary, type UserSummary } from "../api";

type Row = Record<string, any>;
type Tab = "hr" | "payroll" | "admissions" | "transport" | "inventory" | "assets" | "ptm";
type PayrollAction = "period" | "record";
type TransportAction = "vehicle" | "route";
type InventoryAction = "item" | "transaction";

const tabs: [Tab, string][] = [
  ["hr", "HR & Leave"], ["payroll", "Payroll"], ["admissions", "Admissions"],
  ["transport", "Transport"], ["inventory", "Inventory"], ["assets", "Assets"], ["ptm", "Parent Meetings"],
];

const recordLabel = (row: Row) =>
  row.user?.fullName || row.student?.user?.fullName || row.label || row.applicantName ||
  row.name || row.leaveType || row.registrationNo || row.assetTag || "School record";

const personLabel = (row: Row) =>
  row.user?.fullName || row.fullName || row.name || row.admissionNo || "Unnamed person";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="ops-field"><span>{label}</span>{children}</label>;
}

export function EnterpriseOperationsSection() {
  const [tab, setTab] = useState<Tab>("hr");
  const loadSequence = useRef(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [staff, setStaff] = useState<StaffSummary[]>([]);
  const [students, setStudents] = useState<Row[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [vehicles, setVehicles] = useState<Row[]>([]);
  const [inventoryItems, setInventoryItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [payrollAction, setPayrollAction] = useState<PayrollAction>("period");
  const [transportAction, setTransportAction] = useState<TransportAction>("vehicle");
  const [inventoryAction, setInventoryAction] = useState<InventoryAction>("item");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError(null);
    try {
      const data: any =
        tab === "hr" ? await api.listLeaveRequests() :
        tab === "payroll" ? await api.listPayrollPeriods() :
        tab === "admissions" ? await api.listAdmissionLeads() :
        tab === "transport" ? await api.listTransportRoutes() :
        tab === "inventory" ? await api.listInventoryItems() :
        tab === "assets" ? await api.listAssets() :
        await api.listPtmMeetings();

      const nextRows = (data.leaves || data.periods || data.leads || data.routes || data.items || data.assets || data.meetings || []) as Row[];
      if (sequence !== loadSequence.current) return;
      setRows(nextRows);

      if (tab === "hr" || tab === "payroll" || tab === "assets") {
        const result = await api.listStaff();
        if (sequence !== loadSequence.current) return;
        setStaff(result.staff);
      }
      if (tab === "assets" || tab === "ptm") {
        const result = await api.searchStudents({ limit: 100 });
        if (sequence !== loadSequence.current) return;
        setStudents(result.students as Row[]);
      }
      if (tab === "ptm") {
        const result = await api.listUsers();
        if (sequence !== loadSequence.current) return;
        setUsers(result.users);
      }
      if (tab === "transport") {
        const result = await api.listTransportVehicles();
        if (sequence !== loadSequence.current) return;
        setVehicles(result.vehicles as Row[]);
      }
      if (tab === "inventory") {
        const result = await api.listInventoryItems();
        if (sequence !== loadSequence.current) return;
        setInventoryItems(result.items as Row[]);
      }
    } catch (e) {
      if (sequence === loadSequence.current) setError(e instanceof ApiError ? e.message : "Could not load operations data.");
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }

  useEffect(() => {
    setNotice(null);
    void load();
  }, [tab]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    const formElement = e.currentTarget;
    const f = new FormData(formElement);
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      if (tab === "hr") {
        const startDate = new Date(String(f.get("startDate")));
        const endDate = new Date(String(f.get("endDate")));
        if (endDate < startDate) throw new Error("Leave end date cannot be before its start date.");
        await api.createLeaveRequest({
          staffProfileId: String(f.get("staffProfileId")), leaveType: String(f.get("leaveType")),
          startDate: startDate.toISOString(), endDate: endDate.toISOString(),
          days: Number(f.get("days")), reason: String(f.get("reason") || "") || undefined,
        });
      } else if (tab === "payroll") {
        if (payrollAction === "period") {
          const startDate = new Date(String(f.get("startDate")));
          const endDate = new Date(String(f.get("endDate")));
          if (endDate < startDate) throw new Error("Payroll period end date cannot be before its start date.");
          await api.createPayrollPeriod({
            label: String(f.get("label")), startDate: startDate.toISOString(), endDate: endDate.toISOString(),
          });
        } else {
          await api.createPayrollRecord({
            payrollPeriodId: String(f.get("payrollPeriodId")),
            staffProfileId: String(f.get("staffProfileId")),
            basicSalary: Number(f.get("basicSalary")),
            allowances: Number(f.get("allowances") || 0),
            deductions: Number(f.get("deductions") || 0),
            notes: String(f.get("notes") || "") || undefined,
          });
        }
      } else if (tab === "admissions") {
        await api.createAdmissionLead({
          applicantName: String(f.get("applicantName")), guardianName: String(f.get("guardianName") || "") || undefined,
          phone: String(f.get("phone") || "") || undefined, email: String(f.get("email") || "") || undefined,
          desiredClass: String(f.get("desiredClass") || "") || undefined, source: String(f.get("source") || "") || undefined,
        });
      } else if (tab === "transport") {
        if (transportAction === "vehicle") {
          await api.createTransportVehicle({
            registrationNo: String(f.get("registrationNo")), capacity: Number(f.get("capacity")),
            driverName: String(f.get("driverName") || "") || undefined,
            driverPhone: String(f.get("driverPhone") || "") || undefined,
          });
        } else {
          await api.createTransportRoute({
            name: String(f.get("routeName")),
            pickupPoints: String(f.get("pickupPoints") || "").split("\n").map(name => ({ name: name.trim() })).filter(x => x.name),
            monthlyFee: Number(f.get("monthlyFee") || 0),
            vehicleId: String(f.get("vehicleId") || "") || undefined,
          });
        }
      } else if (tab === "inventory") {
        if (inventoryAction === "item") {
          await api.createInventoryItem({
            sku: String(f.get("sku")), name: String(f.get("name")), category: String(f.get("category")),
            quantity: Number(f.get("quantity") || 0), reorderLevel: Number(f.get("reorderLevel") || 0),
            unit: String(f.get("unit") || "unit"),
          });
        } else {
          await api.createInventoryTransaction({
            itemId: String(f.get("itemId")), type: String(f.get("type")),
            quantity: Number(f.get("transactionQuantity")),
            unitCost: Number(f.get("unitCost") || 0) || undefined,
            reference: String(f.get("reference") || "") || undefined,
            notes: String(f.get("notes") || "") || undefined,
          });
        }
      } else if (tab === "assets") {
        await api.assignAsset({
          assetTag: String(f.get("assetTag")), assetType: String(f.get("assetType")),
          condition: String(f.get("condition") || "GOOD"),
          staffProfileId: String(f.get("staffProfileId") || "") || undefined,
          studentProfileId: String(f.get("studentProfileId") || "") || undefined,
          notes: String(f.get("notes") || "") || undefined,
        });
      } else {
        await api.createPtmMeeting({
          studentProfileId: String(f.get("studentProfileId")),
          teacherUserId: String(f.get("teacherUserId") || "") || undefined,
          parentUserId: String(f.get("parentUserId") || "") || undefined,
          scheduledAt: new Date(String(f.get("scheduledAt"))).toISOString(),
          durationMinutes: Number(f.get("durationMinutes") || 15),
          mode: String(f.get("mode") || "IN_PERSON"), agenda: String(f.get("agenda") || "") || undefined,
        });
      }
      setNotice("Saved successfully.");
      formElement.reset();
      if (tab === "payroll") setPayrollAction("period");
      if (tab === "transport") setTransportAction("vehicle");
      if (tab === "inventory") setInventoryAction("item");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function decideLeave(id: string, status: "APPROVED" | "REJECTED") {
    if (!window.confirm(`${status === "APPROVED" ? "Approve" : "Reject"} this leave request?`)) return;
    try {
      setSaving(true); setError(null); setNotice(null);
      await api.decideLeaveRequest(id, { status });
      setNotice("Leave " + status.toLowerCase() + "."); await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not update leave."); }
    finally { setSaving(false); }
  }

  async function payrollActionFor(id: string, action: "approve" | "pay") {
    if (action === "approve" && !window.confirm("Approve this payroll period? Review the payroll records before continuing.")) return;
    if (action === "pay" && !window.confirm("Confirm that payment has been made and mark this payroll period as paid?")) return;
    try {
      setSaving(true); setError(null); setNotice(null);
      if (action === "approve") await api.approvePayrollPeriod(id);
      else {
        const enteredReference = window.prompt("Payment reference (optional):");
        if (enteredReference === null) return;
        const reference = enteredReference.trim() || undefined;
        await api.payPayrollPeriod(id, reference ? { paymentReference: reference } : {});
      }
      setNotice(action === "approve" ? "Payroll period approved." : "Payroll period paid."); await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not update payroll."); }
    finally { setSaving(false); }
  }

  async function convertLead(row: Row) {
    if (!window.confirm(`Convert ${row.applicantName || "this admission lead"} into a student account?`)) return;
    const email = window.prompt("Student email", row.email || "");
    const admissionNo = window.prompt("Admission number");
    if (!email || !admissionNo) return;
    try {
      setSaving(true); setError(null); setNotice(null);
      const result: any = await api.convertAdmissionLead(row.id, { email, admissionNo });
      setNotice("Student account created. Deliver the one-time password securely to the student/guardian."); 
      if (result.temp) window.alert("One-time password (shown once): " + result.temp);
      await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not convert admission."); }
    finally { setSaving(false); }
  }

  async function returnAsset(id: string) {
    if (!window.confirm("Mark this assigned asset as returned?")) return;
    try {
      setSaving(true); setError(null); setNotice(null);
      await api.returnAsset(id); setNotice("Asset returned."); await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not return asset."); }
    finally { setSaving(false); }
  }

  const selectPlaceholder = (label: string) => <option value="">{label}</option>;
  const form = tab === "hr" ? (
    <>
      <Field label="Staff member"><select className="input" name="staffProfileId" required>{selectPlaceholder("Choose staff member…")}{staff.map(s => <option key={s.id} value={s.id}>{s.employeeId} — {s.user.fullName}</option>)}</select></Field>
      <Field label="Leave type"><select className="input" name="leaveType" required defaultValue=""><option value="">Choose leave type…</option>{["Annual","Sick","Casual","Unpaid","Maternity/Paternity","Other"].map(x => <option key={x} value={x}>{x}</option>)}</select></Field>
      <Field label="Start date"><input className="input" name="startDate" type="date" required /></Field>
      <Field label="End date"><input className="input" name="endDate" type="date" required /></Field>
      <Field label="Days requested"><input className="input" name="days" type="number" step="0.5" min="0.5" required placeholder="e.g. 1.5" /></Field>
      <Field label="Reason (optional)"><input className="input" name="reason" placeholder="Reason for leave" /></Field>
    </>
  ) : tab === "payroll" ? (
    <>
      <Field label="Payroll action"><select className="input" value={payrollAction} onChange={e => setPayrollAction(e.target.value as PayrollAction)}><option value="period">Create payroll period</option><option value="record">Add staff payroll record</option></select></Field>
      {payrollAction === "period" ? <>
        <Field label="Payroll period name"><input className="input" name="label" placeholder="October 2026 Payroll" required /></Field>
        <Field label="Start date"><input className="input" name="startDate" type="date" required /></Field>
        <Field label="End date"><input className="input" name="endDate" type="date" required /></Field>
      </> : <>
        <Field label="Draft payroll period"><select className="input" name="payrollPeriodId" required>{selectPlaceholder("Choose draft period…")}{rows.filter(r => r.status === "DRAFT").map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></Field>
        <Field label="Staff member"><select className="input" name="staffProfileId" required>{selectPlaceholder("Choose staff member…")}{staff.map(s => <option key={s.id} value={s.id}>{s.employeeId} — {s.user.fullName}</option>)}</select></Field>
        <Field label="Basic salary (PKR)"><input className="input" name="basicSalary" type="number" min="0" step="0.01" required placeholder="0.00" /></Field>
        <Field label="Allowances (PKR)"><input className="input" name="allowances" type="number" min="0" step="0.01" defaultValue="0" /></Field>
        <Field label="Deductions (PKR)"><input className="input" name="deductions" type="number" min="0" step="0.01" defaultValue="0" /></Field>
        <Field label="Payroll notes"><input className="input" name="notes" placeholder="Optional notes" /></Field>
      </>}
    </>
  ) : tab === "admissions" ? (
    <>
      <Field label="Applicant name"><input className="input" name="applicantName" required placeholder="Full name" /></Field>
      <Field label="Guardian name"><input className="input" name="guardianName" placeholder="Parent / guardian" /></Field>
      <Field label="Phone"><input className="input" name="phone" type="tel" placeholder="Contact number" /></Field>
      <Field label="Email"><input className="input" name="email" type="email" placeholder="name@example.com" /></Field>
      <Field label="Desired class"><input className="input" name="desiredClass" placeholder="e.g. Grade 9" /></Field>
      <Field label="Lead source"><select className="input" name="source" defaultValue=""><option value="">Choose source…</option>{["Walk-in","Phone","Website","Referral","School visit","Other"].map(x => <option key={x} value={x}>{x}</option>)}</select></Field>
    </>
  ) : tab === "transport" ? (
    <>
      <Field label="Transport action"><select className="input" value={transportAction} onChange={e => setTransportAction(e.target.value as TransportAction)}><option value="vehicle">Register vehicle</option><option value="route">Create route</option></select></Field>
      {transportAction === "vehicle" ? <>
        <Field label="Vehicle registration"><input className="input" name="registrationNo" required placeholder="Registration number" /></Field>
        <Field label="Seating capacity"><input className="input" name="capacity" type="number" min="1" required placeholder="Number of seats" /></Field>
        <Field label="Driver name"><input className="input" name="driverName" placeholder="Driver name" /></Field>
        <Field label="Driver phone"><input className="input" name="driverPhone" type="tel" placeholder="Contact number" /></Field>
      </> : <>
        <Field label="Route name"><input className="input" name="routeName" required placeholder="e.g. Canal Road Route" /></Field>
        <Field label="Pickup points"><textarea className="input" name="pickupPoints" required placeholder="One pickup point per line" rows={3} /></Field>
        <Field label="Monthly fee (PKR)"><input className="input" name="monthlyFee" type="number" min="0" step="0.01" defaultValue="0" /></Field>
        <Field label="Assigned vehicle (optional)"><select className="input" name="vehicleId">{selectPlaceholder("No vehicle assigned")}{vehicles.map(v => <option key={v.id} value={v.id}>{v.registrationNo} — capacity {v.capacity}</option>)}</select></Field>
      </>}
    </>
  ) : tab === "inventory" ? (
    <>
      <Field label="Inventory action"><select className="input" value={inventoryAction} onChange={e => setInventoryAction(e.target.value as InventoryAction)}><option value="item">Register inventory item</option><option value="transaction">Record stock movement</option></select></Field>
      {inventoryAction === "item" ? <>
        <Field label="SKU / item code"><input className="input" name="sku" required placeholder="Unique stock code" /></Field>
        <Field label="Item name"><input className="input" name="name" required placeholder="Item name" /></Field>
        <Field label="Category"><input className="input" name="category" required placeholder="e.g. Stationery" /></Field>
        <Field label="Opening quantity"><input className="input" name="quantity" type="number" min="0" defaultValue="0" /></Field>
        <Field label="Reorder threshold"><input className="input" name="reorderLevel" type="number" min="0" defaultValue="0" /></Field>
        <Field label="Unit"><input className="input" name="unit" placeholder="e.g. pieces, boxes" defaultValue="unit" /></Field>
      </> : <>
        <Field label="Inventory item"><select className="input" name="itemId" required>{selectPlaceholder("Choose item…")}{inventoryItems.map(item => <option key={item.id} value={item.id}>{item.sku} — {item.name}</option>)}</select></Field>
        <Field label="Movement type"><select className="input" name="type" defaultValue="RECEIVE"><option value="RECEIVE">Receive stock</option><option value="ISSUE">Issue stock</option><option value="ADJUST">Adjust stock</option></select></Field>
        <Field label="Quantity"><input className="input" name="transactionQuantity" type="number" min="1" required placeholder="Quantity" /></Field>
        <Field label="Unit cost (PKR)"><input className="input" name="unitCost" type="number" min="0" step="0.01" placeholder="Optional unit cost" /></Field>
        <Field label="Reference"><input className="input" name="reference" placeholder="Invoice / requisition reference" /></Field>
        <Field label="Notes"><input className="input" name="notes" placeholder="Optional notes" /></Field>
      </>}
    </>
  ) : tab === "assets" ? (
    <>
      <Field label="Asset tag"><input className="input" name="assetTag" required placeholder="Unique asset identifier" /></Field>
      <Field label="Asset type"><input className="input" name="assetType" required placeholder="e.g. Laptop, projector" /></Field>
      <Field label="Condition"><select className="input" name="condition" defaultValue="GOOD"><option value="GOOD">Good</option><option value="FAIR">Fair</option><option value="POOR">Needs repair</option></select></Field>
      <Field label="Assign to staff (optional)"><select className="input" name="staffProfileId">{selectPlaceholder("Unassigned")}{staff.map(s => <option key={s.id} value={s.id}>{s.employeeId} — {s.user.fullName}</option>)}</select></Field>
      <Field label="Assign to student (optional)"><select className="input" name="studentProfileId">{selectPlaceholder("Unassigned")}{students.map(s => <option key={s.id} value={s.id}>{s.admissionNo || s.rollNumber || s.id} — {personLabel(s)}</option>)}</select></Field>
      <Field label="Notes"><input className="input" name="notes" placeholder="Optional custody notes" /></Field>
    </>
  ) : (
    <>
      <Field label="Student"><select className="input" name="studentProfileId" required>{selectPlaceholder("Choose student…")}{students.map(s => <option key={s.id} value={s.id}>{s.admissionNo || s.rollNumber || s.id} — {personLabel(s)}</option>)}</select></Field>
      <Field label="Teacher"><select className="input" name="teacherUserId" defaultValue="">{selectPlaceholder("Choose teacher (optional)")}{users.filter(u => u.userRoles.some(r => ["teacher", "class_teacher"].includes(r.role.key))).map(u => <option key={u.id} value={u.id}>{u.fullName}</option>)}</select></Field>
      <Field label="Parent / guardian"><select className="input" name="parentUserId" defaultValue="">{selectPlaceholder("Choose guardian (optional)")}{users.filter(u => u.userRoles.some(r => ["parent", "guardian"].includes(r.role.key))).map(u => <option key={u.id} value={u.id}>{u.fullName}</option>)}</select></Field>
      <Field label="Meeting date and time"><input className="input" name="scheduledAt" type="datetime-local" required /></Field>
      <Field label="Duration (minutes)"><input className="input" name="durationMinutes" type="number" min="5" max="180" defaultValue="15" required /></Field>
      <Field label="Meeting mode"><select className="input" name="mode" defaultValue="IN_PERSON"><option value="IN_PERSON">In person</option><option value="ONLINE">Online</option><option value="PHONE">Phone</option></select></Field>
      <Field label="Agenda"><input className="input" name="agenda" placeholder="Meeting agenda" /></Field>
    </>
  );

  const attentionCount = rows.filter(r => ["PENDING", "DRAFT"].includes(String(r.status || "").toUpperCase())).length;
  const currentLabel = tabs.find(x => x[0] === tab)?.[1] ?? "Operations";
  const hasNoOptions = (tab === "hr" || (tab === "payroll" && payrollAction === "record")) && staff.length === 0;

  return (
    <section className="operations-workspace" aria-label="Enterprise operations">
      <div className="ops-tab-strip" role="tablist" aria-label="Operations modules">
        {tabs.map(([key, label]) => <button type="button" role="tab" aria-selected={tab === key} key={key} className={"btn " + (tab === key ? "btn-primary" : "btn-ghost")} onClick={() => setTab(key)}>{label}</button>)}
      </div>

      <div className="ops-overview-grid">
        <article className="ops-overview-card"><span className="ops-overview-icon">▦</span><div><span>Active module</span><strong>{currentLabel}</strong></div></article>
        <article className="ops-overview-card"><span className="ops-overview-icon">◎</span><div><span>Records loaded</span><strong>{loading ? "…" : rows.length}</strong></div></article>
        <article className="ops-overview-card"><span className="ops-overview-icon">◷</span><div><span>Needs attention</span><strong>{loading ? "…" : attentionCount}</strong></div></article>
      </div>

      {error && <p role="alert" className="alert alert-danger">{error}</p>}
      {notice && <p role="status" className="alert alert-success">{notice}</p>}

      <section className="card ops-form-card">
        <div className="ops-section-heading"><div><span className="section-eyebrow">WORKFLOW</span><h2>{currentLabel}</h2><p>Enter validated details and save them to the school record.</p></div><span className="ops-live-indicator"><span /> Live data</span></div>
        {hasNoOptions && !loading && !error && <p role="status" className="alert alert-info">No staff profiles are available yet. Add staff profiles before submitting this workflow.</p>}
        <form onSubmit={submit} className="ops-form-grid">
          {form}
          <div className="ops-form-actions"><button className="btn btn-primary" type="submit" disabled={saving || loading || hasNoOptions}>{saving ? "Saving…" : loading ? "Loading…" : "Save record"}</button><span>Changes are recorded by the school system.</span></div>
        </form>
      </section>

      <section className="card ops-records-card">
        <div className="ops-section-heading"><div><span className="section-eyebrow">REGISTER</span><h2>Current records</h2><p>Live records for {currentLabel.toLowerCase()}.</p></div><button className="btn btn-secondary btn-sm" type="button" onClick={() => void load()} disabled={loading || saving}>{loading ? "Refreshing…" : "Refresh records"}</button></div>
        {loading ? <div className="ops-loading" role="status"><span className="ops-spinner" /> Loading records and available references…</div> :
          rows.length === 0 ? <div className="ops-empty"><span aria-hidden="true">◎</span><strong>No records found</strong><p>Records created through this workflow will appear here.</p></div> :
          <div className="ops-table-wrap"><table className="ops-table">
            <thead><tr><th scope="col">Record</th><th scope="col">Status</th><th scope="col">Details and actions</th></tr></thead>
            <tbody>{rows.map(row => (
              <tr key={row.id}>
                <td><div className="ops-record-name">{recordLabel(row)}</div><small>{row.employeeId || row.admissionNo || (row.id ? String(row.id).slice(0, 8) : "—")}</small></td>
                <td><span className={"ops-status-chip status-" + String(row.status || "unknown").toLowerCase().replace(/[^a-z0-9-]/g, "-")}>{row.status || "Not set"}</span></td>
                <td>
                  <div className="ops-record-details">{row.leaveType || row.registrationNo || row.assetTag || row.desiredClass || row.startDate?.slice?.(0, 10) || row.scheduledAt?.slice?.(0, 16).replace("T", " ") || row.category || "—"}</div>
                  <div className="ops-row-actions">
                    {tab === "hr" && row.status === "PENDING" && <><button type="button" className="btn btn-ghost btn-sm" disabled={saving} onClick={() => void decideLeave(row.id, "APPROVED")}>Approve</button><button type="button" className="btn btn-ghost btn-sm" disabled={saving} onClick={() => void decideLeave(row.id, "REJECTED")}>Reject</button></>}
                    {tab === "payroll" && row.status === "DRAFT" && <button type="button" className="btn btn-ghost btn-sm" disabled={saving} onClick={() => void payrollActionFor(row.id, "approve")}>Approve period</button>}
                    {tab === "payroll" && row.status === "APPROVED" && <button type="button" className="btn btn-ghost btn-sm" disabled={saving} onClick={() => void payrollActionFor(row.id, "pay")}>Mark paid…</button>}
                    {tab === "admissions" && !row.convertedStudentId && <button type="button" className="btn btn-ghost btn-sm" disabled={saving} onClick={() => void convertLead(row)}>Convert to student…</button>}
                    {tab === "assets" && row.status !== "RETURNED" && <button type="button" className="btn btn-ghost btn-sm" disabled={saving} onClick={() => void returnAsset(row.id)}>Mark returned…</button>}
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table></div>}
      </section>
    </section>
  );
}
