-- CreateEnum
CREATE TYPE "EntryLogAction" AS ENUM ('ADD', 'REMOVE', 'REBUY', 'BULK_UPDATE');

-- CreateTable
CREATE TABLE "tour_entry_logs" (
    "id" SERIAL NOT NULL,
    "action" "EntryLogAction" NOT NULL,
    "entryId" TEXT,
    "entryName" TEXT,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "undoneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,
    "tourId" INTEGER NOT NULL,

    CONSTRAINT "tour_entry_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tour_entry_logs_tourId_id_idx" ON "tour_entry_logs"("tourId", "id");

-- AddForeignKey
ALTER TABLE "tour_entry_logs" ADD CONSTRAINT "tour_entry_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_entry_logs" ADD CONSTRAINT "tour_entry_logs_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "tours"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: gán id (uuid) cho các entry cũ chưa có id, giữ nguyên thứ tự
UPDATE "tour_controls"
SET "entries" = (
  SELECT COALESCE(
    jsonb_agg(
      CASE WHEN e ? 'id' THEN e
           ELSE e || jsonb_build_object('id', gen_random_uuid()::text)
      END
      ORDER BY ord
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements("entries") WITH ORDINALITY AS t(e, ord)
)
WHERE jsonb_typeof("entries") = 'array' AND jsonb_array_length("entries") > 0;
