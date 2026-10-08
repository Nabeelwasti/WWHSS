import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../api";

type Row = Record<string, any>;

export function EnterpriseOperationsSection() {
  const [tab,setTab]=useState<"hr"|"payroll"|"admissions"|"transport"|"inventory"|"ptm">("hr");
  const [rows,setRows]=useState<Row[]>([]);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);

  async function load(){
    try{
      setError(null);
      const data:any=tab==="hr"?await api.listLeaveRequests():tab==="payroll"?await api.listPayrollPeriods():tab==="admissions"?await api.listAdmissionLeads():tab==="transport"?await api.listTransportRoutes():tab==="inventory"?await api.listInventoryItems():await api.listPtmMeetings();
      setRows((data.leaves||data.periods||data.leads||data.routes||data.items||data.meetings||[]) as Row[]);
    }catch(e){setError(e instanceof ApiError?e.message:"Could not load operations data.");}
  }
  useEffect(()=>{load();},[tab]);

\n  async function convertLead(r:Row){ const email=window.prompt("Student email",r.email||""); const admissionNo=window.prompt("Admission number","ADM-"+new Date().getFullYear()+"-"+Math.floor(Math.random()*90000+10000)); if(!email||!admissionNo)return; try{ const result:any=await api.convertAdmissionLead(r.id,{email,admissionNo}); setNotice("Student created. One-time password: "+result.temp); await load(); }catch(e){setError(e instanceof ApiError?e.message:"Could not convert admission.");} }\n\n  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault(); const f=new FormData(e.currentTarget);
    try{
      if(tab==="admissions") await api.createAdmissionLead({applicantName:String(f.get("applicantName")),guardianName:String(f.get("guardianName")||"")||undefined,phone:String(f.get("phone")||"")||undefined,email:String(f.get("email")||"")||undefined,desiredClass:String(f.get("desiredClass")||"")||undefined,source:String(f.get("source")||"")||undefined});
      else if(tab==="transport") await api.createTransportVehicle({registrationNo:String(f.get("registrationNo")),capacity:Number(f.get("capacity")),driverName:String(f.get("driverName")||"")||undefined,driverPhone:String(f.get("driverPhone")||"")||undefined});
      else if(tab==="inventory") await api.createInventoryItem({sku:String(f.get("sku")),name:String(f.get("name")),category:String(f.get("category")),quantity:Number(f.get("quantity")||0),reorderLevel:Number(f.get("reorderLevel")||0),unit:String(f.get("unit")||"unit")});
      else if(tab==="payroll") await api.createPayrollPeriod({label:String(f.get("label")),startDate:new Date(String(f.get("startDate"))).toISOString(),endDate:new Date(String(f.get("endDate"))).toISOString()});
      else if(tab==="ptm") await api.createPtmMeeting({studentProfileId:String(f.get("studentProfileId")),teacherUserId:String(f.get("teacherUserId")||"")||undefined,scheduledAt:new Date(String(f.get("scheduledAt"))).toISOString(),durationMinutes:Number(f.get("durationMinutes")||15),mode:String(f.get("mode")||"IN_PERSON"),agenda:String(f.get("agenda")||"")||undefined});
      else await api.createLeaveRequest({staffProfileId:String(f.get("staffProfileId")),leaveType:String(f.get("leaveType")),startDate:new Date(String(f.get("startDate"))).toISOString(),endDate:new Date(String(f.get("endDate"))).toISOString(),days:Number(f.get("days")),reason:String(f.get("reason")||"")||undefined});
      setNotice("Saved successfully."); e.currentTarget.reset(); await load();
    }catch(e){setError(e instanceof ApiError?e.message:"Could not save.");}
  }

  const tabs=[["hr","HR & Leave"],["payroll","Payroll"],["admissions","Admissions"],["transport","Transport"],["inventory","Inventory"],["ptm","Parent Meetings"]] as const;
  return <section>
    <div className="flex gap-2 flex-wrap" style={{marginBottom:16}}>{tabs.map(([k,l])=><button key={k} className={"btn "+(tab===k?"btn-primary":"btn-ghost")} onClick={()=>setTab(k)}>{l}</button>)}</div>
    {error&&<p role="alert" className="alert alert-danger">{error}</p>}{notice&&<p role="status" className="alert alert-success">{notice}</p>}
    <section className="card">
      <h2 className="card-title">Enterprise Operations — {tabs.find(x=>x[0]===tab)?.[1]}</h2>
      <form onSubmit={submit} className="flex gap-2 flex-wrap">
        {tab==="hr"&&<><input className="input" name="staffProfileId" placeholder="Staff profile ID" required/><input className="input" name="leaveType" placeholder="Leave type" required/><input className="input" name="startDate" type="date" required/><input className="input" name="endDate" type="date" required/><input className="input" name="days" type="number" step="0.5" placeholder="Days" required/><input className="input" name="reason" placeholder="Reason"/></>}
        {tab==="payroll"&&<><input className="input" name="label" placeholder="October 2026 Payroll" required/><input className="input" name="startDate" type="date" required/><input className="input" name="endDate" type="date" required/></>}
        {tab==="admissions"&&<><input className="input" name="applicantName" placeholder="Applicant name" required/><input className="input" name="guardianName" placeholder="Guardian"/><input className="input" name="phone" placeholder="Phone"/><input className="input" name="email" type="email" placeholder="Email"/><input className="input" name="desiredClass" placeholder="Desired class"/><input className="input" name="source" placeholder="Source"/></>}
        {tab==="transport"&&<><input className="input" name="registrationNo" placeholder="Vehicle registration" required/><input className="input" name="capacity" type="number" min="1" placeholder="Capacity" required/><input className="input" name="driverName" placeholder="Driver"/><input className="input" name="driverPhone" placeholder="Driver phone"/></>}
        {tab==="inventory"&&<><input className="input" name="sku" placeholder="SKU" required/><input className="input" name="name" placeholder="Item name" required/><input className="input" name="category" placeholder="Category" required/><input className="input" name="quantity" type="number" min="0" placeholder="Opening stock"/><input className="input" name="reorderLevel" type="number" min="0" placeholder="Reorder level"/><input className="input" name="unit" placeholder="Unit"/></>}
        {tab==="ptm"&&<><input className="input" name="studentProfileId" placeholder="Student profile ID" required/><input className="input" name="teacherUserId" placeholder="Teacher user ID"/><input className="input" name="scheduledAt" type="datetime-local" required/><input className="input" name="durationMinutes" type="number" min="5" max="180" defaultValue="15"/><select className="input" name="mode" defaultValue="IN_PERSON"><option>IN_PERSON</option><option>ONLINE</option><option>PHONE</option></select><input className="input" name="agenda" placeholder="Agenda"/></>}
        <button className="btn btn-primary" type="submit">Create</button>
      </form>
    </section>
    <section className="card">
      <h3 className="card-title">Current records</h3>
      {rows.length===0?<p className="text-muted text-sm">No records yet.</p>:<div style={{overflowX:"auto"}}><table style={{width:"100%",fontSize:13,borderCollapse:"collapse"}}><thead><tr><th style={{textAlign:"left"}}>Record</th><th style={{textAlign:"left"}}>Status</th><th style={{textAlign:"left"}}>Details</th></tr></thead><tbody>{rows.map(r=><tr key={r.id} style={{borderBottom:"1px solid var(--border)"}}><td>{r.id}</td><td>{r.status||"—"}</td><td>{r.label||r.applicantName||r.name||r.leaveType||r.registrationNo||r.scheduledAt||"—"} {tab==="admissions" && !r.convertedStudentId && <button className="btn btn-ghost btn-sm" onClick={()=>convertLead(r)}>Convert</button>}</td></tr>)}</tbody></table></div>}
    </section>
  </section>;
}
