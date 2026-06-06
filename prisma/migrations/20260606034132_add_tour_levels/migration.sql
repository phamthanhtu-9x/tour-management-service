-- CreateEnum
CREATE TYPE "LevelType" AS ENUM ('BLIND', 'BREAK');

-- CreateTable
CREATE TABLE "tour_levels" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "type" "LevelType" NOT NULL,
    "idx" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL,
    "smallBlind" INTEGER,
    "bigBlind" INTEGER,
    "ante" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tourId" INTEGER NOT NULL,

    CONSTRAINT "tour_levels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tour_levels_tourId_idx_key" ON "tour_levels"("tourId", "idx");

-- AddForeignKey
ALTER TABLE "tour_levels" ADD CONSTRAINT "tour_levels_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "tours"("id") ON DELETE CASCADE ON UPDATE CASCADE;
