-- CreateTable
CREATE TABLE "tour_controls" (
    "id" SERIAL NOT NULL,
    "currentLevel" INTEGER NOT NULL DEFAULT 1,
    "isPaused" BOOLEAN NOT NULL DEFAULT true,
    "pausedAtSecond" INTEGER NOT NULL DEFAULT 0,
    "levelStartedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tourId" INTEGER NOT NULL,

    CONSTRAINT "tour_controls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tour_controls_tourId_key" ON "tour_controls"("tourId");

-- AddForeignKey
ALTER TABLE "tour_controls" ADD CONSTRAINT "tour_controls_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "tours"("id") ON DELETE CASCADE ON UPDATE CASCADE;
