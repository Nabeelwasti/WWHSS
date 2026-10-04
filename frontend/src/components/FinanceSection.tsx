import { useEffect, useState } from "react";
import { api, ApiError, type InvoiceSummary } from "../api";
import { useLanguage } from "../i18n.js";

export function FinanceSection({ studentProfileId }: { studentProfileId: string }) {
  const { t } = useLanguage();
  const [invoices, setInvoices] = useState<InvoiceSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .myInvoices(studentProfileId)
      .then((res) => setInvoices(res.invoices))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load fee invoices."));
  }, [studentProfileId]);

  return (
    <section className="card">
      <h2 className="card-title">{t("finance.fees")}</h2>
      {error && (
        <p role="alert" className="alert alert-danger">
          {error}
        </p>
      )}
      {invoices === null && !error && <p className="text-muted text-sm">{t("common.loading")}</p>}
      {invoices?.length === 0 && <p className="text-muted text-sm">{t("finance.noInvoices")}</p>}
      {invoices && invoices.length > 0 && (
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
              <th scope="col">{t("finance.fee")}</th>
              <th scope="col">{t("finance.amountDue")}</th>
              <th scope="col">{t("finance.dueDate")}</th>
              <th scope="col">{t("finance.status")}</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} style={{ borderBottom: "1px solid var(--border)" }}>
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
