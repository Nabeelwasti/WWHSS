-- Dedicated high-privilege permissions prevent whole-database backup/export
-- from being implicitly granted by users:manage and give official document
-- access an explicit capability boundary.

INSERT INTO "permissions" ("id", "key")
VALUES
  (md5('wwhss:backup:view'), 'backup:view'),
  (md5('wwhss:backup:create'), 'backup:create'),
  (md5('wwhss:backup:download'), 'backup:download'),
  (md5('wwhss:backup:restore'), 'backup:restore'),
  (md5('wwhss:backup:delete'), 'backup:delete'),
  (md5('wwhss:documents:view'), 'documents:view'),
  (md5('wwhss:documents:create'), 'documents:create'),
  (md5('wwhss:documents:print'), 'documents:print'),
  (md5('wwhss:documents:view:own'), 'documents:view:own')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."key" = 'super_admin'
  AND p."key" IN (
    'backup:view',
    'backup:create',
    'backup:download',
    'backup:restore',
    'backup:delete',
    'documents:view',
    'documents:create',
    'documents:print',
    'documents:view:own'
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."key" = 'principal'
  AND p."key" IN ('documents:view', 'documents:create', 'documents:print')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."key" IN ('teacher', 'class_teacher', 'accountant')
  AND p."key" IN ('documents:view', 'documents:print')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."key" IN ('student', 'parent')
  AND p."key" = 'documents:view:own'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
