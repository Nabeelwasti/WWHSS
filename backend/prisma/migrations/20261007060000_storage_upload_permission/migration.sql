INSERT INTO "permissions" ("id", "key")
VALUES (md5('wwhss:storage:upload'), 'storage:upload')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."key" IN ('super_admin', 'principal', 'teacher', 'class_teacher')
  AND p."key" = 'storage:upload'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
