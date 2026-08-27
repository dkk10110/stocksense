-- AlterEnum
ALTER TYPE "AlertType" ADD VALUE 'earnings_exit';

-- AlterTable
ALTER TABLE "Position" ADD COLUMN     "catalyst1dAlertSent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "catalyst7dAlertSent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "catalystDate" TIMESTAMP(3),
ADD COLUMN     "earningsExitAlertSent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "signalType" "SignalType";

-- AlterTable
ALTER TABLE "Signal" ADD COLUMN     "catalystDate" TIMESTAMP(3),
ADD COLUMN     "catalystLabel" TEXT;

-- AlterTable
ALTER TABLE "TradeHistory" ADD COLUMN     "daysHeld" INTEGER,
ADD COLUMN     "signalType" "SignalType";

-- CreateTable
CREATE TABLE "PaperTrade" (
    "id" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "type" "SignalType" NOT NULL,
    "entryPrice" DECIMAL(12,2) NOT NULL,
    "target" DECIMAL(12,2) NOT NULL,
    "stop" DECIMAL(12,2) NOT NULL,
    "confidence" INTEGER NOT NULL,
    "swingDays" INTEGER NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'open',
    "exitPrice" DECIMAL(12,2),
    "exitReason" TEXT,
    "closedAt" TIMESTAMP(3),
    "daysToOutcome" INTEGER,
    "peakGainPct" DECIMAL(6,2),

    CONSTRAINT "PaperTrade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaperTrade_status_idx" ON "PaperTrade"("status");

-- CreateIndex
CREATE INDEX "PaperTrade_type_status_idx" ON "PaperTrade"("type", "status");

-- AddForeignKey
ALTER TABLE "PaperTrade" ADD CONSTRAINT "PaperTrade_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
