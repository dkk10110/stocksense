-- CreateEnum
CREATE TYPE "PortfolioAction" AS ENUM ('buy', 'hold', 'average', 'exit', 'book_profit');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AlertType" ADD VALUE 'sector_rotation';
ALTER TYPE "AlertType" ADD VALUE 'book_profit';
ALTER TYPE "AlertType" ADD VALUE 'new_opportunity';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SignalType" ADD VALUE 'institutional';
ALTER TYPE "SignalType" ADD VALUE 'rotation';
ALTER TYPE "SignalType" ADD VALUE 'rs_leader';
ALTER TYPE "SignalType" ADD VALUE 'high_delivery';
ALTER TYPE "SignalType" ADD VALUE 'mtf_breakout';

-- AlterTable
ALTER TABLE "Signal" ADD COLUMN     "fromDiscovery" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "narrative" JSONB,
ADD COLUMN     "riskPenalty" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rsScore" INTEGER,
ADD COLUMN     "scoringModel" TEXT NOT NULL DEFAULT 'v3',
ADD COLUMN     "sectorScore" INTEGER;

-- CreateTable
CREATE TABLE "DiscoveryRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "universeSize" INTEGER NOT NULL DEFAULT 0,
    "scannedCount" INTEGER NOT NULL DEFAULT 0,
    "shortlist" JSONB NOT NULL DEFAULT '[]',
    "sectorRanks" JSONB NOT NULL DEFAULT '[]',
    "breadth" JSONB,
    "note" TEXT,

    CONSTRAINT "DiscoveryRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SectorRank" (
    "id" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "rs" INTEGER,
    "momentum" INTEGER,
    "breakdown" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SectorRank_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscoveryRun_startedAt_idx" ON "DiscoveryRun"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SectorRank_sector_key" ON "SectorRank"("sector");

-- CreateIndex
CREATE INDEX "Signal_active_fromDiscovery_idx" ON "Signal"("active", "fromDiscovery");
