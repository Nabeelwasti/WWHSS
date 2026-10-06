-- CreateTable
CREATE TABLE "school_profiles" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "schoolName" TEXT NOT NULL,
    "schoolUrduName" TEXT,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "logoUrl" TEXT,
    "boardRegistration" TEXT,
    "campusInfo" TEXT,
    "principalName" TEXT,
    "currentAcademicYear" TEXT,
    "documentPrefix" TEXT DEFAULT 'WWHSS',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_sequences" (
    "id" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "campus" TEXT NOT NULL DEFAULT 'MAIN',
    "nextVal" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_files" (
    "id" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "classId" TEXT,
    "sectionId" TEXT,
    "subjectId" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "storage_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_sequences_docType_academicYear_campus_key" ON "document_sequences"("docType", "academicYear", "campus");

-- CreateIndex
CREATE UNIQUE INDEX "storage_files_storageKey_key" ON "storage_files"("storageKey");

-- CreateIndex
CREATE INDEX "storage_files_ownerUserId_idx" ON "storage_files"("ownerUserId");

-- CreateIndex
CREATE INDEX "storage_files_entityType_entityId_idx" ON "storage_files"("entityType", "entityId");
