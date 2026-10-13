import { useEffect, useState } from "react";
import { api, ApiError, type RestoreCheckpointSummary } from "../api";
import { useLanguage } from "../i18n";

type RestoreMode = "DRY_RUN" | "MERGE" | "REPLACE";

export function BackupManagementSection() {
  const { t } = useLanguage();
  const [backups, setBackups] = useState<any[]>([]);
  const [checkpoints, setCheckpoints] = useState<RestoreCheckpointSummary[]>([]);
  const [checkpointsLoaded, setCheckpointsLoaded] = useState(false);
  const [checkpointError, setCheckpointError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedRestoreFilename, setSelectedRestoreFilename] = useState("");
  const [restorePreview, setRestorePreview] = useState<any | null>(null);
  const [confirmPhrase, setConfirmPhrase] = useState("");

  async function refreshBackups() {
    try {
      const res = await api.listBackups();
      setBackups(res.backups);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load backups list.");
    }

    try {
      const result = await api.listRestoreCheckpoints(25);
      setCheckpoints(result.checkpoints);
      setCheckpointError(null);
    } catch (e) {
      setCheckpointError(e instanceof ApiError ? e.message : t("backup.checkpoints.error"));
    } finally {
      setCheckpointsLoaded(true);
    }
  }

  useEffect(() => { void refreshBackups(); }, []);

  async function handleCreateBackup() {
    setLoading(true);
    setNotice(null);
    setError(null);
    try {
      const res = await api.createBackup();
      setNotice("Encrypted backup created: " + String((res.backup as any).filename));
      await refreshBackups();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Backup creation failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyBackup(filename: string) {
    setLoading(true);
    setNotice(null);
    setError(null);
    try {
      const res = await api.verifyBackup(filename);
      setNotice("Backup verified: decrypted and parsed " + Object.keys((res.verification as any).summary || {}).length + " database tables.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Backup recovery verification failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDryRun() {
    if (!selectedRestoreFilename) return;
    setLoading(true);
    setNotice(null);
    setError(null);
    setRestorePreview(null);
    setConfirmPhrase("");
    try {
      const res = await api.restoreBackup(selectedRestoreFilename, { mode: "DRY_RUN" });
      const result = res.restore as any;
      if (!result?.success || result?.mode !== "DRY_RUN") throw new Error("The backend did not confirm a successful non-destructive restore preflight.");
      setRestorePreview(result);
      setNotice("DRY_RUN passed for " + selectedRestoreFilename + ". No live data was changed. Review the summary before authorizing a restore.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e instanceof Error ? e.message : "Restore preflight failed."));
    } finally {
      setLoading(false);
    }
  }

  async function handleRestore(mode: Exclude<RestoreMode, "DRY_RUN">) {
    if (!selectedRestoreFilename || !restorePreview?.success || restorePreview?.mode !== "DRY_RUN") {
      setError("Run and pass DRY_RUN for this exact backup before restoring.");
      return;
    }
    const expected = mode === "MERGE" ? "RESTORE_MERGE" : "RESTORE_REPLACE";
    if (confirmPhrase !== expected) {
      setError("Type " + expected + " exactly to authorize this operation.");
      return;
    }
    setLoading(true);
    setNotice(null);
    setError(null);
    try {
      const res = await api.restoreBackup(selectedRestoreFilename, { mode, confirm: expected });
      const result = res.restore as any;
      if (!result?.success || result?.mode !== mode) throw new Error("The backend did not confirm the requested restore mode.");
      setNotice(mode + " restore completed for " + selectedRestoreFilename + ". Verify the application and audit log before resuming normal operations.");
      setRestorePreview(null);
      setConfirmPhrase("");
      setSelectedRestoreFilename("");
      await refreshBackups();
    } catch (e) {
      if (e instanceof ApiError && e.code === "BACKUP_RESTORE_INCOMPLETE") {
        await refreshBackups();
        setError(`${t("backup.restoreIncomplete")} ${t("backup.restoreCheckpointId")} ${e.checkpointId ?? "unavailable"}`);
      } else {
        setError(e instanceof ApiError ? e.message : (e instanceof Error ? e.message : "Backup restore failed."));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card backup-workspace">
      <header className="backup-workspace-header">
        <div><span className="section-eyebrow">RESILIENCE & RECOVERY</span><h2 className="card-title">Encrypted Backups & Recovery</h2><p className="text-sm text-muted">Create encrypted backups, verify their integrity, and require a successful non-destructive preflight before any restore.</p></div>
        <button type="button" onClick={handleCreateBackup} disabled={loading} className="btn btn-primary">{loading ? "Working…" : "Create encrypted backup"}</button>
      </header>
      {notice && <p role="status" className="alert alert-success">{notice}</p>}
      {error && <p role="alert" className="alert alert-danger">{error}</p>}

      <div className="backup-safety-note"><strong>Restore safety</strong><span>DRY_RUN does not change live data. MERGE and REPLACE require a successful DRY_RUN plus a typed confirmation. REPLACE is destructive and should only be used under an approved recovery procedure.</span></div>

      <h3>Backup inventory</h3>
      {backups.length === 0 ? <p className="text-sm text-muted">No backups found in the configured storage provider.</p> : (
        <div className="finance-table-wrap"><table className="finance-table"><thead><tr><th>Backup file</th><th>Created</th><th>Encryption</th><th>Actions</th></tr></thead><tbody>
          {backups.map((backup: any) => <tr key={backup.filename}>
            <td><code>{backup.filename}</code></td><td>{new Date(backup.createdAt).toLocaleString()}</td>
            <td><span className="badge">{backup.encrypted ? "AES-256-GCM" : "Not encrypted"}</span></td>
            <td><div className="flex gap-2 flex-wrap">
              <button type="button" onClick={() => void handleVerifyBackup(backup.filename)} disabled={loading} className="btn btn-secondary btn-sm">Verify backup</button>
              <button type="button" onClick={() => { setSelectedRestoreFilename(backup.filename); setRestorePreview(null); setConfirmPhrase(""); setError(null); setNotice(null); }} disabled={loading} className="btn btn-ghost btn-sm">Prepare restore</button>
            </div></td>
          </tr>)}
        </tbody></table></div>
      )}
      <section className="backup-checkpoints-panel" aria-labelledby="backup-checkpoints-title">
        <h3 id="backup-checkpoints-title">{t("backup.checkpoints.title")}</h3>
        <p className="text-sm text-muted">{t("backup.checkpoints.description")}</p>
        {checkpointError ? <p role="alert" className="alert alert-danger">{checkpointError}</p>
          : !checkpointsLoaded ? <p role="status" className="text-sm text-muted">{t("backup.checkpoints.loading")}</p>
          : checkpoints.length === 0 ? <p className="text-sm text-muted">{t("backup.checkpoints.none")}</p>
          : <div className="finance-table-wrap"><table className="finance-table">
            <thead><tr>
              <th scope="col">{t("backup.checkpoints.id")}</th>
              <th scope="col">{t("backup.checkpoints.backup")}</th>
              <th scope="col">{t("backup.checkpoints.mode")}</th>
              <th scope="col">{t("backup.checkpoints.status")}</th>
              <th scope="col">{t("backup.checkpoints.started")}</th>
              <th scope="col">{t("backup.checkpoints.completed")}</th>
              <th scope="col">{t("backup.checkpoints.diagnostics")}</th>
            </tr></thead>
            <tbody>{checkpoints.map((checkpoint) => <tr key={checkpoint.id}>
              <td><code>{checkpoint.id}</code></td>
              <td><code>{checkpoint.backupId}</code></td>
              <td>{checkpoint.mode}</td>
              <td><span className="badge">{checkpoint.status}</span></td>
              <td>{new Date(checkpoint.startedAt).toLocaleString()}</td>
              <td>{checkpoint.completedAt ? new Date(checkpoint.completedAt).toLocaleString() : "—"}</td>
              <td>{checkpoint.hasError ? t("backup.checkpoints.errorRetained") : t("backup.checkpoints.noError")}</td>
            </tr>)}</tbody>
          </table></div>}
      </section>


      {selectedRestoreFilename && <section className="backup-restore-panel" aria-labelledby="backup-restore-title">
        <div className="flex justify-between gap-3">
          <div><h3 id="backup-restore-title">Restore preparation</h3><p className="text-sm text-muted">Selected backup: <code>{selectedRestoreFilename}</code></p></div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSelectedRestoreFilename(""); setRestorePreview(null); setConfirmPhrase(""); }}>Cancel</button>
        </div>
        <button type="button" className="btn btn-primary" disabled={loading} onClick={() => void handleDryRun()}>{loading ? "Checking…" : "1. Run non-destructive DRY_RUN"}</button>
        {restorePreview && <div className="backup-preview" role="status"><strong>Preflight passed</strong><p className="text-sm">Mode: {restorePreview.mode}. The preflight completed without changing live data. Inspect the returned summary and confirm the target environment before continuing.</p><pre>{JSON.stringify(restorePreview.summary ?? {}, null, 2)}</pre></div>}
        <label className="backup-confirm-label">Typed authorization<input className="input" value={confirmPhrase} onChange={(event) => setConfirmPhrase(event.target.value)} placeholder="Type RESTORE_MERGE or RESTORE_REPLACE" autoComplete="off" /></label>
        <div className="backup-restore-actions">
          <button type="button" className="btn btn-secondary" disabled={loading || !restorePreview?.success || restorePreview?.mode !== "DRY_RUN" || confirmPhrase !== "RESTORE_MERGE"} onClick={() => void handleRestore("MERGE")}>2. Confirm MERGE restore</button>
          <button type="button" className="btn btn-danger" disabled={loading || !restorePreview?.success || restorePreview?.mode !== "DRY_RUN" || confirmPhrase !== "RESTORE_REPLACE"} onClick={() => void handleRestore("REPLACE")}>2. Confirm destructive REPLACE</button>
        </div>
      </section>}
    </section>
  );
}
