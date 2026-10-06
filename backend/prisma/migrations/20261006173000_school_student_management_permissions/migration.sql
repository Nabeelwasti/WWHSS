-- Keep authorization capabilities durable even when deployment does not rerun the seed script.
INSERT INTO "permissions" ("id", "key")
VALUES
  (md5('wwhss:students:manage'), 'students:manage'),
  (md5('wwhss:school:manage'), 'school:manage')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."key" = 'super_admin'
  AND p."key" IN ('students:manage', 'school:manage')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."key" = 'principal'
  AND p."key" IN ('students:manage', 'school:manage')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
