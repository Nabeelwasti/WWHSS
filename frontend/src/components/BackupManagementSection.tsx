import { useEffect, useState } from "react";
import { api, ApiError } from "../api";

export function BackupManagementSection() {
  const [backups, setBackups] = useState<any[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function refreshBackups() {
    try {
      const res = await api.listBackups();
      setBackups(res.backups);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load backups list.");
    }
  }

  useEffect(() => {
    refreshBackups();
  }, []);

  async function handleCreateBackup() {
    setLoading(true);
    setNotice(null);
    setError(null);
    try {
      const res = await api.createBackup();
      setNotice(`Encrypted off-host backup created: ${(res.backup as any).filename}`);
      refreshBackups();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Backup creation failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyBackup(filename: string) {
    try {
      const res = await api.verifyBackup(filename);
      setNotice(`Verified recovery for ${filename}: Decrypted and parsed ${Object.keys((res.verification as any).summary || {}).length} database tables successfully.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Backup recovery verification failed.");
    }
  }

  return (
    <section className="card">
      <h2 className="card-title">Encrypted Off-Host Backups & Recovery</h2>
      <p className="text-sm text-muted">
        Create encrypted AES-256-GCM database backups, export JSON data, and run automated recovery drills.
      </p>

      {notice && <p role="status" className="alert alert-success">{notice}</p>}
      {error && <p role="alert" className="alert alert-danger">{error}</p>}

      <div style={{ marginBottom: 16 }}>
        <button onClick={handleCreateBackup} disabled={loading} className="btn btn-primary">
          {loading ? "Creating Backup..." : "🔒 Create Encrypted Backup Now"}
        </button>
      </div>

      <h4 style={{ margin: "16px 0 8px 0" }}>Backup Files</h4>
      {backups.length === 0 ? (
        <p className="text-sm text-muted">No backups found.</p>
      ) : (
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
              <th>Filename</th>
              <th>Created At</th>
              <th>Encrypted</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {backups.map((b: any) => (
              <tr key={b.filename} style={{ borderBottom: "1px solid var(--border)" }}>
                <td><code>{b.filename}</code></td>
                <td>{new Date(b.createdAt).toLocaleString()}</td>
                <td><span className="badge">{b.encrypted ? "AES-256-GCM" : "NO"}</span></td>
                <td>
                  <button onClick={() => handleVerifyBackup(b.filename)} className="btn btn-ghost btn-sm">
                    🧪 Run Recovery Drill
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
