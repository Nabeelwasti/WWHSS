import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { verifyAccessToken } from "../identity/tokens.js";
import {
  upsertPage,
  setPagePublished,
  getPublishedPage,
  listAllPages,
  createNotice,
  getUserPermittedAudiences,
  listNoticesForAudiences,
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
  // Check for authentication token if present
  let userId: string | null = null;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const payload = verifyAccessToken(authHeader.slice("Bearer ".length));
      userId = payload.sub;
    } catch {
      // Invalid/expired token treats requester as unauthenticated
      userId = null;
    }
  }

  // Anonymous / unauthenticated visitors ALWAYS get ONLY "public" notices.
  if (!userId) {
    const notices = await listNoticesForAudiences(["public"]);
    return res.json({ notices });
  }

  // Authenticated user: derive permitted audiences
  const permittedAudiences = await getUserPermittedAudiences(userId);
  const requestedAudience = typeof req.query.audience === "string" ? req.query.audience : undefined;

  if (requestedAudience) {
    if (!permittedAudiences.has(requestedAudience)) {
      return res.status(403).json({ error: `Forbidden: not authorized for notice audience '${requestedAudience}'` });
    }
    const notices = await listNoticesForAudiences([requestedAudience, "public"]);
    return res.json({ notices });
  }

  const notices = await listNoticesForAudiences(Array.from(permittedAudiences));
  return res.json({ notices });
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
  if (!req.userId) return res.status(401).json({ error: "Unauthenticated" });
  const parsed = pageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.status(201).json(await upsertPage({ ...parsed.data, updatedByUserId: req.userId }));
});

cmsRouter.post("/pages/:slug/publish", authenticate, authorize("cms:manage"), async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthenticated" });
  res.json(await setPagePublished(req.params.slug, true, req.userId));
});

cmsRouter.post("/pages/:slug/unpublish", authenticate, authorize("cms:manage"), async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthenticated" });
  res.json(await setPagePublished(req.params.slug, false, req.userId));
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
  if (!req.userId) return res.status(401).json({ error: "Unauthenticated" });
  const parsed = noticeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.status(201).json(await createNotice({ ...parsed.data, publishedByUserId: req.userId }));
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
