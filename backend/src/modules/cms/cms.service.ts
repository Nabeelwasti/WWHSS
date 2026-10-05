import { prisma } from "../../db/client.js";

export class CmsValidationError extends Error {}

// ---------- PAGES ----------

export async function upsertPage(input: { slug: string; title: string; content: string; updatedByUserId: string }) {
  return prisma.$transaction(async (tx) => {
    const page = await tx.cmsPage.upsert({
      where: { slug: input.slug },
      update: { title: input.title, content: input.content, updatedByUserId: input.updatedByUserId },
      create: { ...input, isPublished: false },
    });

    await tx.auditLog.create({
      data: {
        userId: input.updatedByUserId,
        action: "cms:upsert_page",
        resource: `cms_page:${input.slug}`,
        metadata: { title: input.title },
      },
    });

    return page;
  });
}

export async function setPagePublished(slug: string, isPublished: boolean, updatedByUserId: string) {
  return prisma.$transaction(async (tx) => {
    const page = await tx.cmsPage.update({ where: { slug }, data: { isPublished } });
    await tx.auditLog.create({
      data: {
        userId: updatedByUserId,
        action: isPublished ? "cms:publish_page" : "cms:unpublish_page",
        resource: `cms_page:${slug}`,
      },
    });
    return page;
  });
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
  return prisma.$transaction(async (tx) => {
    const notice = await tx.notice.create({ data: input });
    await tx.auditLog.create({
      data: {
        userId: input.publishedByUserId,
        action: "cms:create_notice",
        resource: `notice:${notice.id}`,
        metadata: { audience: input.audience },
      },
    });
    return notice;
  });
}

export async function getUserPermittedAudiences(userId: string): Promise<Set<string>> {
  const permitted = new Set<string>(["public"]);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userRoles: { include: { role: { include: { rolePermissions: { include: { permission: true } } } } } },
      studentProfile: true,
      guardianOf: true,
    },
  });

  if (!user) return permitted;

  const roleKeys = new Set(user.userRoles.map((ur) => ur.role.key));
  const permKeys = new Set(
    user.userRoles.flatMap((ur) => ur.role.rolePermissions.map((rp) => rp.permission.key))
  );

  // Admin / Principal / Announcement Publishers have access to all audiences
  if (roleKeys.has("super_admin") || roleKeys.has("principal") || permKeys.has("cms:manage") || permKeys.has("announcements:publish")) {
    return new Set(["public", "students", "teachers", "parents", "staff"]);
  }

  if (user.studentProfile || roleKeys.has("student")) {
    permitted.add("students");
  }

  if (user.guardianOf.length > 0 || roleKeys.has("parent")) {
    permitted.add("parents");
    permitted.add("students");
  }

  if (roleKeys.has("teacher") || roleKeys.has("class_teacher")) {
    permitted.add("teachers");
    permitted.add("staff");
    permitted.add("students");
  }

  if (roleKeys.has("accountant") || roleKeys.has("librarian")) {
    permitted.add("staff");
  }

  return permitted;
}

export async function listNoticesForAudiences(audiences: string[]) {
  return prisma.notice.findMany({
    where: { audience: { in: audiences } },
    orderBy: { publishedAt: "desc" },
    take: 50,
  });
}

// ---------- EVENTS ----------

export async function createEvent(
  input: { title: string; description?: string; startAt: string; endAt?: string; location?: string },
  actorId?: string
) {
  const start = new Date(input.startAt);
  if (Number.isNaN(start.getTime())) throw new CmsValidationError("Invalid event startAt date");

  let end: Date | undefined;
  if (input.endAt) {
    end = new Date(input.endAt);
    if (Number.isNaN(end.getTime())) throw new CmsValidationError("Invalid event endAt date");
    if (start >= end) throw new CmsValidationError("Event startAt must be before endAt");
  }

  return prisma.$transaction(async (tx) => {
    const event = await tx.eventItem.create({
      data: {
        title: input.title,
        description: input.description,
        startAt: start,
        endAt: end,
        location: input.location,
      },
    });

    if (actorId) {
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: "cms:create_event",
          resource: `event:${event.id}`,
          metadata: { title: input.title, startAt: input.startAt },
        },
      });
    }

    return event;
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

export async function addGalleryItem(input: { title: string; imageUrl: string; albumName?: string }, actorId?: string) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.galleryItem.create({ data: input });
    if (actorId) {
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: "cms:add_gallery_item",
          resource: `gallery:${item.id}`,
          metadata: { title: input.title, albumName: input.albumName },
        },
      });
    }
    return item;
  });
}

export async function listGallery(albumName?: string) {
  return prisma.galleryItem.findMany({
    where: albumName ? { albumName } : undefined,
    orderBy: { uploadedAt: "desc" },
    take: 100,
  });
}
