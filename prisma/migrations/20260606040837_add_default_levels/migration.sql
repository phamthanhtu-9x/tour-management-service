-- CreateTable
CREATE TABLE "default_levels" (
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
    "userId" INTEGER NOT NULL,

    CONSTRAINT "default_levels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "default_levels_userId_idx_key" ON "default_levels"("userId", "idx");

-- AddForeignKey
ALTER TABLE "default_levels" ADD CONSTRAINT "default_levels_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
