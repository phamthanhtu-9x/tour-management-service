-- AlterTable
ALTER TABLE "players" ADD COLUMN     "phone" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "players_userId_phone_key" ON "players"("userId", "phone");
