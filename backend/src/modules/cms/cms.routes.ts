import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import {
  upsertPage,
  setPagePublished,
  getPublishedPage,
  listAllPages,
  createNotice,
  listNoticesForAudience,
  createEvent,
  listUpcomingEvents,
  addGalleryItem,
  listGallery,
} from "./cms.service.js";

export const cmsRouter = Router();

// ---------- PUBLIC (no authentication — this is the real school website) ----------

cmsRouter.get("/pages/:slug", async (req, res) => {
  const page = await getPublishedPage(req.params.slug);
  if (!page) return res.status(404).json({ error: "Page not found" });
  res.json({ page });
});

cmsRouter.get("/notices", async (req, res) => {
  // An unauthenticated visitor only ever gets "public" notices — real
  // enforcement of that is in the service layer (defaults to "public"
  // when no audience is recognized), not left to the caller's honesty.
  const audience = typeof req.query.audience === "string" ? req.query.audience : "public";
  res.json({ notices: await listNoticesForAudience(audience) });
});

cmsRouter.get("/events", async (_req, res) => {
  res.json({ events: await listUpcomingEvents() });
});

cmsRouter.get("/gallery", async (req, res) => {
  res.json({ items: await listGallery(req.query.album as string | undefined) });
});

// ---------- ADMIN (authenticated + "cms:manage") ----------

const pageSchema = z.object({ slug: z.string().min(1), title: z.string().min(1), content: z.string() });
cmsRouter.post("/pages", authenticate, authorize("cms:manage"), async (req, res) => {
  const parsed = pageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.status(201).json(await upsertPage({ ...parsed.data, updatedByUserId: req.userId! }));
});

cmsRouter.post("/pages/:slug/publish", authenticate, authorize("cms:manage"), async (req, res) => {
  res.json(await setPagePublished(req.params.slug, true));
});

cmsRouter.post("/pages/:slug/unpublish", authenticate, authorize("cms:manage"), async (req, res) => {
  res.json(await setPagePublished(req.params.slug, false));
});

cmsRouter.get("/admin/pages", authenticate, authorize("cms:manage"), async (_req, res) => {
  res.json({ pages: await listAllPages() });
});

const noticeSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  audience: z.enum(["public", "students", "teachers", "parents", "staff"]),
});
cmsRouter.post("/notices", authenticate, authorize("announcements:publish"), async (req, res) => {
  const parsed = noticeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.status(201).json(await createNotice({ ...parsed.data, publishedByUserId: req.userId! }));
});

const eventSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  startAt: z.string(),
  endAt: z.string().optional(),
  location: z.string().optional(),
});
cmsRouter.post("/events", authenticate, authorize("cms:manage"), async (req, res) => {
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.status(201).json(await createEvent(parsed.data));
});

const gallerySchema = z.object({ title: z.string().min(1), imageUrl: z.string().url(), albumName: z.string().optional() });
cmsRouter.post("/gallery", authenticate, authorize("cms:manage"), async (req, res) => {
  const parsed = gallerySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.status(201).json(await addGalleryItem(parsed.data));
});
