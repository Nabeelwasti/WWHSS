CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "users_fullName_trgm_idx" ON "users" USING GIN ("fullName" gin_trgm_ops);
CREATE INDEX "users_email_trgm_idx" ON "users" USING GIN ("email" gin_trgm_ops);
CREATE INDEX "users_phone_trgm_idx" ON "users" USING GIN ("phone" gin_trgm_ops);

CREATE INDEX "student_profiles_admissionNo_trgm_idx" ON "student_profiles" USING GIN ("admissionNo" gin_trgm_ops);
CREATE INDEX "student_profiles_rollNumber_trgm_idx" ON "student_profiles" USING GIN ("rollNumber" gin_trgm_ops);
CREATE INDEX "student_profiles_registrationNo_trgm_idx" ON "student_profiles" USING GIN ("registrationNo" gin_trgm_ops);
CREATE INDEX "student_profiles_fatherName_trgm_idx" ON "student_profiles" USING GIN ("fatherName" gin_trgm_ops);
CREATE INDEX "student_profiles_motherName_trgm_idx" ON "student_profiles" USING GIN ("motherName" gin_trgm_ops);
CREATE INDEX "student_profiles_guardianName_trgm_idx" ON "student_profiles" USING GIN ("guardianName" gin_trgm_ops);
CREATE INDEX "student_profiles_guardianPhone_trgm_idx" ON "student_profiles" USING GIN ("guardianPhone" gin_trgm_ops);
CREATE INDEX "student_profiles_boardRegistrationNo_trgm_idx" ON "student_profiles" USING GIN ("boardRegistrationNo" gin_trgm_ops);
