-- Temporary credentials must be changed before a user can access protected campus features.
ALTER TABLE "users"
ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
