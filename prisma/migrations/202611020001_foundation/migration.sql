-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'FACILITY_ADMIN', 'DOCTOR', 'PATIENT');

-- CreateEnum
CREATE TYPE "Availability" AS ENUM ('OFFLINE', 'ONLINE', 'RINGING', 'BUSY', 'BREAK');

-- CreateEnum
CREATE TYPE "CallState" AS ENUM ('PENDING', 'RINGING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'TIMEOUT', 'MEETING_CREATING', 'MEETING_READY', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Facility" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "facilityId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'PATIENT',
    "specialty" TEXT,
    "availability" "Availability" NOT NULL DEFAULT 'OFFLINE',
    "heartbeatAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Call" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "facilityId" UUID NOT NULL,
    "doctorId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "state" "CallState" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consultation" (
    "id" UUID NOT NULL,
    "callId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Consultation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZoomMeeting" (
    "id" UUID NOT NULL,
    "consultationId" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "externalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZoomMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Facility_id_tenantId_key" ON "Facility"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_tenantId_facilityId_role_availability_idx" ON "User"("tenantId", "facilityId", "role", "availability");

-- CreateIndex
CREATE UNIQUE INDEX "User_id_tenantId_facilityId_key" ON "User"("id", "tenantId", "facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Call_state_expiresAt_idx" ON "Call"("state", "expiresAt");

-- CreateIndex
CREATE INDEX "Call_tenantId_facilityId_idx" ON "Call"("tenantId", "facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "Call_patientId_idempotencyKey_key" ON "Call"("patientId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Consultation_callId_key" ON "Consultation"("callId");

-- CreateIndex
CREATE UNIQUE INDEX "ZoomMeeting_consultationId_key" ON "ZoomMeeting"("consultationId");

-- CreateIndex
CREATE UNIQUE INDEX "ZoomMeeting_externalId_key" ON "ZoomMeeting"("externalId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "Facility" ADD CONSTRAINT "Facility_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_facilityId_tenantId_fkey" FOREIGN KEY ("facilityId", "tenantId") REFERENCES "Facility"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_facilityId_tenantId_fkey" FOREIGN KEY ("facilityId", "tenantId") REFERENCES "Facility"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_doctorId_tenantId_facilityId_fkey" FOREIGN KEY ("doctorId", "tenantId", "facilityId") REFERENCES "User"("id", "tenantId", "facilityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_patientId_tenantId_facilityId_fkey" FOREIGN KEY ("patientId", "tenantId", "facilityId") REFERENCES "User"("id", "tenantId", "facilityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZoomMeeting" ADD CONSTRAINT "ZoomMeeting_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One active reservation per participant, including pending meeting setup.
CREATE UNIQUE INDEX "Call_one_active_doctor" ON "Call" ("doctorId") WHERE state IN ('PENDING','RINGING','ACCEPTED','MEETING_CREATING','MEETING_READY','IN_PROGRESS');
CREATE UNIQUE INDEX "Call_one_active_patient" ON "Call" ("patientId") WHERE state IN ('PENDING','RINGING','ACCEPTED','MEETING_CREATING','MEETING_READY','IN_PROGRESS');
