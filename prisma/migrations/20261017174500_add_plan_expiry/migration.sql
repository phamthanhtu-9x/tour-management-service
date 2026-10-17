-- AlterTable: hạn sử dụng theo từng user (null = vô thời hạn; user hiện có giữ vô thời hạn)
ALTER TABLE "users" ADD COLUMN     "planExpiresAt" TIMESTAMP(3);

-- AlterTable: thời hạn mặc định cho user mới của mỗi gói
ALTER TABLE "plan_limits" ADD COLUMN     "durationDays" INTEGER;

-- TRIAL mặc định 14 ngày, STANDARD vô thời hạn
UPDATE "plan_limits" SET "durationDays" = 14 WHERE "plan" = 'TRIAL';
