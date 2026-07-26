/*
  Warnings:

  - Added the required column `symbol` to the `Signal` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Signal" ADD COLUMN     "symbol" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "WatchlistItem" ADD COLUMN     "symbol" TEXT;

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "open" DECIMAL(12,2) NOT NULL,
    "high" DECIMAL(12,2) NOT NULL,
    "low" DECIMAL(12,2) NOT NULL,
    "close" DECIMAL(12,2) NOT NULL,
    "volume" BIGINT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceHistory_symbol_idx" ON "PriceHistory"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "PriceHistory_symbol_date_key" ON "PriceHistory"("symbol", "date");
