import { useEffect, useState } from "react";
import { api, ApiError, type InvoiceSummary } from "../api";

export function FinanceSection({ studentProfileId }: { studentProfileId: string }) {
  const [invoices, setInvoices] = useState<InvoiceSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .myInvoices(studentProfileId)
      .then((res) => setInvoices(res.invoices))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load fee invoices."));
  }, [studentProfileId]);

  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 14, color: "#666", textTransform: "uppercase" }}>Fees</h2>
      {error && (
        <p role="alert" style={{ color: "#a32d2d" }}>
          {error}
        </p>
      )}
      {invoices === null && !error && <p>Loading…</p>}
      {invoices?.length === 0 && <p style={{ color: "#555" }}>No invoices issued yet.</p>}
      {invoices && invoices.length > 0 && (
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th>Fee</th>
              <th>Amount due</th>
              <th>Due date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} style={{ borderBottom: "1px solid #eee" }}>
                <td>{inv.feeStructure.name}</td>
                <td>{inv.amountDue}</td>
                <td>{new Date(inv.dueDate).toLocaleDateString()}</td>
                <td>{inv.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
