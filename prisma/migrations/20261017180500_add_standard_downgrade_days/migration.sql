-- AlterTable: STANDARD hết hạn → hạ xuống TRIAL thêm N ngày (null = khoá ngay)
ALTER TABLE "plan_limits" ADD COLUMN     "downgradeDays" INTEGER;

-- Mặc định STANDARD được 5 ngày dùng TRIAL sau khi hết hạn
UPDATE "plan_limits" SET "downgradeDays" = 5 WHERE "plan" = 'STANDARD';
