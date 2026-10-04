-- Add CHECK constraints on user_roles and student_profiles to enforce that sectionId requires classId
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_section_requires_class_check" CHECK ("sectionId" IS NULL OR "classId" IS NOT NULL);

ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_section_requires_class_check" CHECK ("sectionId" IS NULL OR "classId" IS NOT NULL);
