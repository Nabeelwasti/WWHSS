INSERT INTO "permissions" ("id", "key")
VALUES
  (md5('wwhss:ai-assessment:submit'), 'ai_assessment:submit'),
  (md5('wwhss:ai-assessment:submit-own'), 'ai_assessment:submit:own')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."key" IN ('super_admin', 'teacher', 'class_teacher')
  AND p."key" = 'ai_assessment:submit'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."key" = 'student'
  AND p."key" = 'ai_assessment:submit:own'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
