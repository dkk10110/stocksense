-- AlterTable
ALTER TABLE "Position" ADD COLUMN     "day12AlertSent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "earningsAlertSent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stopAlertSent" BOOLEAN NOT NULL DEFAULT false;
