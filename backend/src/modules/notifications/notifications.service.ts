import { prisma } from "../../db/client.js";

export async function listMyNotifications(userId: string) {
  return prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
}

export async function markAsRead(notificationId: string, userId: string) {
  // updateMany + userId in the WHERE, not findUnique-then-update: this is
  // the real enforcement that a user can only mark their OWN notification
  // read, not just a UI assumption — someone else's id here matches zero
  // rows rather than silently succeeding.
  return prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { isRead: true },
  });
}

export async function notifyUser(input: { userId: string; title: string; body: string; type: string }) {
  return prisma.notification.create({ data: input });
}

// Resolves a StudentProfile id to the real User id that should receive a
// notification. This is the fix for the bug I flagged earlier: grading
// code must never write StudentProfile.id into Notification.userId.
export async function getUserIdForStudentProfile(studentProfileId: string): Promise<string | null> {
  const profile = await prisma.studentProfile.findUnique({
    where: { id: studentProfileId },
    select: { userId: true },
  });
  return profile?.userId ?? null;
}
