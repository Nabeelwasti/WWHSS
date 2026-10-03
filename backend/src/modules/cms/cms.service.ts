import { prisma } from "../../db/client.js";

// ---------- PAGES ----------

export async function upsertPage(input: { slug: string; title: string; content: string; updatedByUserId: string }) {
  return prisma.cmsPage.upsert({
    where: { slug: input.slug },
    update: { title: input.title, content: input.content, updatedByUserId: input.updatedByUserId },
    create: { ...input, isPublished: false },
  });
}

export async function setPagePublished(slug: string, isPublished: boolean) {
  return prisma.cmsPage.update({ where: { slug }, data: { isPublished } });
}

// Public read — only ever returns pages that are actually marked
// published. A draft is genuinely invisible here, not just hidden by the
// frontend.
export async function getPublishedPage(slug: string) {
  return prisma.cmsPage.findFirst({ where: { slug, isPublished: true } });
}

export async function listAllPages() {
  // Admin-side listing includes drafts — used by the CMS editor, never by
  // the public site.
  return prisma.cmsPage.findMany({ orderBy: { updatedAt: "desc" } });
}

// ---------- NOTICES ----------

export async function createNotice(input: { title: string; body: string; audience: string; publishedByUserId: string }) {
  return prisma.notice.create({ data: input });
}

// A real audience filter: "public" is always included so the school
// website can show general notices to visitors who aren't logged in at
// all, alongside whatever audience-specific notices apply to a logged-in
// viewer.
export async function listNoticesForAudience(audience: string) {
  return prisma.notice.findMany({
    where: { audience: { in: [audience, "public"] } },
    orderBy: { publishedAt: "desc" },
    take: 50,
  });
}

// ---------- EVENTS ----------

export async function createEvent(input: { title: string; description?: string; startAt: string; endAt?: string; location?: string }) {
  return prisma.eventItem.create({
    data: {
      title: input.title,
      description: input.description,
      startAt: new Date(input.startAt),
      endAt: input.endAt ? new Date(input.endAt) : undefined,
      location: input.location,
    },
  });
}

export async function listUpcomingEvents() {
  return prisma.eventItem.findMany({
    where: { startAt: { gte: new Date() } },
    orderBy: { startAt: "asc" },
    take: 50,
  });
}

// ---------- GALLERY ----------

export async function addGalleryItem(input: { title: string; imageUrl: string; albumName?: string }) {
  return prisma.galleryItem.create({ data: input });
}

export async function listGallery(albumName?: string) {
  return prisma.galleryItem.findMany({
    where: albumName ? { albumName } : undefined,
    orderBy: { uploadedAt: "desc" },
    take: 100,
  });
}
