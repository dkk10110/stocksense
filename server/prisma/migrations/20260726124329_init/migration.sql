-- CreateEnum
CREATE TYPE "SignalType" AS ENUM ('compression', 'catalyst', 'fallen', 'earnings', 'volume');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('forward_signal', 'catalyst_7day', 'catalyst_1day', 'rsi_reversal', 'gain_2', 'gain_5', 'gain_10', 'stop_loss', 'day12_time', 'earnings_day');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "phone" TEXT,
    "broker" TEXT,
    "riskPref" TEXT NOT NULL DEFAULT 'balanced',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "type" "SignalType" NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "entryLow" DECIMAL(12,2) NOT NULL,
    "entryHigh" DECIMAL(12,2) NOT NULL,
    "target" DECIMAL(12,2) NOT NULL,
    "stop" DECIMAL(12,2) NOT NULL,
    "days" INTEGER NOT NULL,
    "confidence" INTEGER NOT NULL,
    "upside" DECIMAL(5,2) NOT NULL,
    "rsi" INTEGER NOT NULL,
    "headline" TEXT NOT NULL,
    "insight" TEXT NOT NULL,
    "indicators" JSONB NOT NULL,
    "catalysts" TEXT[],
    "probBasis" INTEGER NOT NULL,
    "rr" DECIMAL(5,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchlistItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "signalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "watchlistItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "broker" TEXT NOT NULL,
    "buyPrice" DECIMAL(12,2) NOT NULL,
    "qty" INTEGER NOT NULL,
    "buyDate" TIMESTAMP(3) NOT NULL,
    "alertLevels" INTEGER[],
    "alertsHit" INTEGER[],
    "daysHeld" INTEGER NOT NULL DEFAULT 0,
    "stop" DECIMAL(12,2) NOT NULL,
    "currentPrice" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gainPct" DECIMAL(6,2) NOT NULL,
    "pl" DECIMAL(12,2) NOT NULL,
    "soldDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "alertsConfig" JSONB NOT NULL,
    "swingWindow" INTEGER NOT NULL DEFAULT 15,
    "profitTarget" TEXT NOT NULL DEFAULT 'balanced',

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Signal_type_active_idx" ON "Signal"("type", "active");

-- CreateIndex
CREATE INDEX "WatchlistItem_userId_idx" ON "WatchlistItem"("userId");

-- CreateIndex
CREATE INDEX "Position_userId_status_idx" ON "Position"("userId", "status");

-- CreateIndex
CREATE INDEX "TradeHistory_userId_idx" ON "TradeHistory"("userId");

-- CreateIndex
CREATE INDEX "Alert_userId_dismissed_idx" ON "Alert"("userId", "dismissed");

-- CreateIndex
CREATE UNIQUE INDEX "Settings_userId_key" ON "Settings"("userId");

-- AddForeignKey
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_watchlistItemId_fkey" FOREIGN KEY ("watchlistItemId") REFERENCES "WatchlistItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeHistory" ADD CONSTRAINT "TradeHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settings" ADD CONSTRAINT "Settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
