-- AlterTable
ALTER TABLE "User" ADD COLUMN     "resetTokenExpiry" TIMESTAMP(3),
ADD COLUMN     "resetTokenHash" TEXT;

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'running',
    "summary" TEXT,
    "error" TEXT,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobRun_jobName_startedAt_idx" ON "JobRun"("jobName", "startedAt");
