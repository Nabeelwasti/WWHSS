CREATE TABLE "leave_requests" (
  "id" TEXT NOT NULL,
  "staffProfileId" TEXT NOT NULL,
  "leaveType" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "days" DECIMAL(6,2) NOT NULL,
  "reason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "approvedByUserId" TEXT,
  "decisionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "leave_requests_staffProfileId_startDate_endDate_idx" ON "leave_requests"("staffProfileId","startDate","endDate");
CREATE TABLE "payroll_periods" (
  "id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payroll_periods_startDate_endDate_key" ON "payroll_periods"("startDate","endDate");
CREATE TABLE "payroll_records" (
  "id" TEXT NOT NULL,
  "payrollPeriodId" TEXT NOT NULL,
  "staffProfileId" TEXT NOT NULL,
  "basicSalary" DECIMAL(12,2) NOT NULL,
  "allowances" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "deductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "netSalary" DECIMAL(12,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "paidAt" TIMESTAMP(3),
  "paymentReference" TEXT,
  "notes" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payroll_records_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payroll_records_payrollPeriodId_staffProfileId_key" ON "payroll_records"("payrollPeriodId","staffProfileId");
CREATE TABLE "admission_leads" (
  "id" TEXT NOT NULL,
  "applicantName" TEXT NOT NULL,
  "guardianName" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "desiredClass" TEXT,
  "source" TEXT,
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "notes" TEXT,
  "assignedToUserId" TEXT,
  "convertedStudentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "admission_leads_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "admission_leads_convertedStudentId_key" ON "admission_leads"("convertedStudentId");
CREATE INDEX "admission_leads_status_createdAt_idx" ON "admission_leads"("status","createdAt");
CREATE TABLE "transport_vehicles" (
  "id" TEXT NOT NULL,
  "registrationNo" TEXT NOT NULL,
  "capacity" INTEGER NOT NULL,
  "driverName" TEXT,
  "driverPhone" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "transport_vehicles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "transport_vehicles_registrationNo_key" ON "transport_vehicles"("registrationNo");
CREATE TABLE "transport_routes" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "pickupPoints" JSONB NOT NULL,
  "monthlyFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "vehicleId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "transport_routes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "transport_routes_name_key" ON "transport_routes"("name");
CREATE TABLE "transport_assignments" (
  "id" TEXT NOT NULL,
  "studentProfileId" TEXT NOT NULL,
  "routeId" TEXT NOT NULL,
  "pickupPoint" TEXT,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "transport_assignments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "transport_assignments_studentProfileId_routeId_startDate_key" ON "transport_assignments"("studentProfileId","routeId","startDate");
CREATE TABLE "inventory_items" (
  "id" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "reorderLevel" INTEGER NOT NULL DEFAULT 0,
  "unit" TEXT NOT NULL DEFAULT 'unit',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inventory_items_sku_key" ON "inventory_items"("sku");
CREATE INDEX "inventory_items_category_name_idx" ON "inventory_items"("category","name");
CREATE TABLE "inventory_transactions" (
  "id" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitCost" DECIMAL(12,2),
  "reference" TEXT,
  "notes" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "inventory_transactions_itemId_createdAt_idx" ON "inventory_transactions"("itemId","createdAt");
CREATE TABLE "ptm_meetings" (
  "id" TEXT NOT NULL,
  "studentProfileId" TEXT NOT NULL,
  "parentUserId" TEXT,
  "teacherUserId" TEXT,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "durationMinutes" INTEGER NOT NULL DEFAULT 15,
  "mode" TEXT NOT NULL DEFAULT 'IN_PERSON',
  "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "agenda" TEXT,
  "notes" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ptm_meetings_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ptm_meetings_scheduledAt_status_idx" ON "ptm_meetings"("scheduledAt","status");
CREATE INDEX "ptm_meetings_studentProfileId_scheduledAt_idx" ON "ptm_meetings"("studentProfileId","scheduledAt");
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payroll_records" ADD CONSTRAINT "payroll_records_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "payroll_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_records" ADD CONSTRAINT "payroll_records_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "staff_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_records" ADD CONSTRAINT "payroll_records_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "admission_leads" ADD CONSTRAINT "admission_leads_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "admission_leads" ADD CONSTRAINT "admission_leads_convertedStudentId_fkey" FOREIGN KEY ("convertedStudentId") REFERENCES "student_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "transport_vehicles" ADD CONSTRAINT "transport_vehicles_dummy" CHECK ("capacity" > 0);
ALTER TABLE "transport_routes" ADD CONSTRAINT "transport_routes_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "transport_vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "transport_assignments" ADD CONSTRAINT "transport_assignments_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transport_assignments" ADD CONSTRAINT "transport_assignments_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "transport_routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ptm_meetings" ADD CONSTRAINT "ptm_meetings_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ptm_meetings" ADD CONSTRAINT "ptm_meetings_parentUserId_fkey" FOREIGN KEY ("parentUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ptm_meetings" ADD CONSTRAINT "ptm_meetings_teacherUserId_fkey" FOREIGN KEY ("teacherUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ptm_meetings" ADD CONSTRAINT "ptm_meetings_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;