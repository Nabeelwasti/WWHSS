import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../api";

export function CmsManagementSection() {
  const [pages, setPages] = useState<any[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshPages() {
    try {
      const res = await api.listCmsAdminPages();
      setPages(res.pages);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load CMS pages.");
    }
  }

  useEffect(() => {
    refreshPages();
  }, []);

  async function handleCreateNotice(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await api.createNotice({
        title: String(form.get("title")),
        body: String(form.get("body")),
        audience: String(form.get("audience")),
      });
      setNotice("Notice published successfully.");
      e.currentTarget.reset();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not publish notice.");
    }
  }

  async function handleCreateEvent(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await api.createEvent({
        title: String(form.get("title")),
        description: String(form.get("description") || "") || undefined,
        startAt: String(form.get("startAt")),
        location: String(form.get("location") || "") || undefined,
      });
      setNotice("Event scheduled successfully.");
      e.currentTarget.reset();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not schedule event.");
    }
  }

  async function handleCreatePage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await api.createCmsPage({
        slug: String(form.get("slug")),
        title: String(form.get("title")),
        content: String(form.get("content")),
      });
      setNotice("CMS Page saved.");
      e.currentTarget.reset();
      refreshPages();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save CMS page.");
    }
  }

  async function handleTogglePublish(slug: string, currentPublished: boolean) {
    try {
      if (currentPublished) {
        await api.unpublishCmsPage(slug);
      } else {
        await api.publishCmsPage(slug);
      }
      setNotice(`Page '${slug}' ${currentPublished ? "unpublished" : "published"}.`);
      refreshPages();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update page publish status.");
    }
  }

  return (
    <section className="card">
      <h2 className="card-title">CMS & Website Management</h2>

      {notice && <p role="status" className="alert alert-success">{notice}</p>}
      {error && <p role="alert" className="alert alert-danger">{error}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        {/* Create Notice Form */}
        <div style={{ border: "1px solid var(--border)", padding: 12, borderRadius: 6 }}>
          <h4 style={{ margin: "0 0 8px 0" }}>Publish Notice</h4>
          <form onSubmit={handleCreateNotice} className="flex-col gap-2">
            <input className="input" name="title" placeholder="Notice Title" required />
            <textarea className="input" name="body" placeholder="Notice Body" rows={3} required />
            <select className="input" name="audience" defaultValue="public">
              <option value="public">Public (Everyone)</option>
              <option value="students">Students Only</option>
              <option value="teachers">Teachers Only</option>
              <option value="parents">Parents Only</option>
              <option value="staff">Staff Only</option>
            </select>
            <button type="submit" className="btn btn-primary btn-sm">Publish Notice</button>
          </form>
        </div>

        {/* Schedule Event Form */}
        <div style={{ border: "1px solid var(--border)", padding: 12, borderRadius: 6 }}>
          <h4 style={{ margin: "0 0 8px 0" }}>Schedule Event</h4>
          <form onSubmit={handleCreateEvent} className="flex-col gap-2">
            <input className="input" name="title" placeholder="Event Title" required />
            <textarea className="input" name="description" placeholder="Description" rows={2} />
            <input className="input" name="startAt" type="datetime-local" required />
            <input className="input" name="location" placeholder="Location / Auditorium" />
            <button type="submit" className="btn btn-primary btn-sm">Schedule Event</button>
          </form>
        </div>

        {/* Create CMS Page Form */}
        <div style={{ border: "1px solid var(--border)", padding: 12, borderRadius: 6 }}>
          <h4 style={{ margin: "0 0 8px 0" }}>Create/Edit CMS Page</h4>
          <form onSubmit={handleCreatePage} className="flex-col gap-2">
            <input className="input" name="slug" placeholder="Slug (e.g. about-us)" required />
            <input className="input" name="title" placeholder="Page Title" required />
            <textarea className="input" name="content" placeholder="HTML / Markdown Content" rows={3} required />
            <button type="submit" className="btn btn-primary btn-sm">Save Page</button>
          </form>
        </div>
      </div>

      {/* Pages List */}
      <h4 style={{ margin: "16px 0 8px 0" }}>CMS Pages</h4>
      {pages.length === 0 ? (
        <p className="text-sm text-muted">No CMS pages created yet.</p>
      ) : (
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
              <th>Title</th>
              <th>Slug</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {pages.map((p: any) => (
              <tr key={p.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td>{p.title}</td>
                <td><code>/{p.slug}</code></td>
                <td><span className="badge">{p.isPublished ? "PUBLISHED" : "DRAFT"}</span></td>
                <td>
                  <button
                    onClick={() => handleTogglePublish(p.slug, p.isPublished)}
                    className="btn btn-ghost btn-sm"
                  >
                    {p.isPublished ? "Unpublish" : "Publish"}
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
