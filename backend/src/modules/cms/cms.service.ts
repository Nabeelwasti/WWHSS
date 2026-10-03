import { prisma } from "../../db/client.js";

// ---------- PAGES ----------

export async function upsertPage(input: { slug: string; title: string; content: string; updatedByUserId: string }) {
  return prisma.cmsPage.upsert({
    where: { slug: input.slug },
    update: { title: input.title, content: input.content, updatedByUserId: input.updatedByUserId },
    create: { ...input, isPublished: false },
  });
}

export async function setPagePublished(slug: string, isPublished: boolean, updatedByUserId: string) {
  const page = await prisma.cmsPage.update({ where: { slug }, data: { isPublished } });
  await prisma.auditLog.create({
    data: {
      userId: updatedByUserId,
      action: isPublished ? "cms:publish_page" : "cms:unpublish_page",
      resource: `cms_page:${slug}`,
    },
  });
  return page;
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
  const notice = await prisma.notice.create({ data: input });
  await prisma.auditLog.create({
    data: {
      userId: input.publishedByUserId,
      action: "cms:create_notice",
      resource: `notice:${notice.id}`,
      metadata: { audience: input.audience },
    },
  });
  return notice;
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
