-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'TRIAL', 'STANDARD');

-- AlterTable: user mới mặc định TRIAL
ALTER TABLE "users" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'TRIAL';

-- User đã có sẵn → STANDARD (không bị ảnh hưởng bởi giới hạn dùng thử)
UPDATE "users" SET "role" = 'STANDARD';

-- CreateTable
CREATE TABLE "plan_limits" (
    "id" SERIAL NOT NULL,
    "plan" "UserRole" NOT NULL,
    "maxPlayers" INTEGER,
    "maxTours" INTEGER,
    "maxRunningTours" INTEGER,
    "canExportPlayers" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_limits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plan_limits_plan_key" ON "plan_limits"("plan");

-- Cấu hình mặc định: TRIAL bị giới hạn, STANDARD không giới hạn
INSERT INTO "plan_limits" ("plan", "maxPlayers", "maxTours", "maxRunningTours", "canExportPlayers", "updatedAt") VALUES
  ('TRIAL', 20, 3, 1, false, CURRENT_TIMESTAMP),
  ('STANDARD', NULL, NULL, NULL, true, CURRENT_TIMESTAMP);
