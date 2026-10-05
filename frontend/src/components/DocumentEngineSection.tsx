import { useState } from "react";
import { api, ApiError } from "../api";

export function DocumentEngineSection() {
  const [docType, setDocType] = useState("result_card");
  const [referenceId, setReferenceId] = useState("");
  const [payload, setPayload] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleFetchPayload(e: React.FormEvent) {
    e.preventDefault();
    if (!referenceId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getDocumentPayload(docType, referenceId.trim());
      setPayload(res.payload);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not fetch document payload.");
    } finally {
      setLoading(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <section className="card">
      <h2 className="card-title">Document & Print Center</h2>
      <p className="text-sm text-muted">
        Generate official school-branded A4 PDF / Print documents, certificates, report cards, receipts, and statements.
      </p>

      {error && <p role="alert" className="alert alert-danger">{error}</p>}

      <form onSubmit={handleFetchPayload} className="flex gap-2 flex-wrap" style={{ marginBottom: 16 }}>
        <select className="input" value={docType} onChange={(e) => setDocType(e.target.value)}>
          <option value="result_card">Report Card / Result Card</option>
          <option value="fee_receipt">Fee Payment Receipt</option>
          <option value="transfer_certificate">Transfer / Leaving Certificate</option>
          <option value="fee_statement">Fee Account Statement</option>
          <option value="attendance_report">Attendance Log & Report</option>
        </select>
        <input
          className="input"
          placeholder="Student Profile ID or Payment ID (UUID)"
          value={referenceId}
          onChange={(e) => setReferenceId(e.target.value)}
          style={{ flex: 1, minWidth: 240 }}
          required
        />
        <button type="submit" disabled={loading} className="btn btn-primary">
          {loading ? "Generating..." : "Generate Document"}
        </button>
      </form>

      {/* A4 Document Preview Card */}
      {payload && (
        <div style={{ border: "1px solid var(--border)", padding: 20, borderRadius: 6, background: "var(--surface)" }}>
          <div className="flex justify-between items-center" style={{ marginBottom: 16, borderBottom: "2px solid var(--border)", paddingBottom: 12 }}>
            <div>
              <h3 style={{ margin: 0, color: "var(--primary)" }}>{payload.header?.schoolName}</h3>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>{payload.header?.schoolUrduName}</div>
              <div style={{ fontSize: 12 }}>{payload.header?.boardRegistration}</div>
            </div>
            <button onClick={handlePrint} className="btn btn-primary btn-sm">
              🖨️ Print / Save A4 PDF
            </button>
          </div>

          <div style={{ textAlign: "center", margin: "16px 0", fontWeight: "bold", fontSize: 16 }}>
            {payload.title}
          </div>

          <div style={{ fontSize: 13, marginBottom: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div><strong>Document No:</strong> {payload.docNumber}</div>
            <div><strong>Issue Date:</strong> {payload.issueDate}</div>
            {payload.entity && Object.entries(payload.entity).map(([k, v]) => (
              <div key={k}>
                <strong>{k}:</strong> {String(v)}
              </div>
            ))}
          </div>

          {payload.statement && (
            <p style={{ fontSize: 13, fontStyle: "italic", margin: "12px 0" }}>{payload.statement}</p>
          )}

          {payload.records && payload.records.length > 0 && (
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", marginBottom: 20 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                  {Object.keys(payload.records[0]).map((col) => (
                    <th key={col}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payload.records.map((r: any, idx: number) => (
                  <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                    {Object.values(r).map((val: any, vIdx: number) => (
                      <td key={vIdx}>{String(val)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {payload.signatures && (
            <div className="flex justify-between" style={{ marginTop: 40, paddingTop: 16 }}>
              {payload.signatures.map((sig: any, idx: number) => (
                <div key={idx} style={{ textAlign: "center", fontSize: 12 }}>
                  <div>{sig.name}</div>
                  <strong>{sig.title}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
