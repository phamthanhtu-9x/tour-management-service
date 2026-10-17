-- AlterTable
ALTER TABLE "users" ADD COLUMN     "slug" TEXT;

-- Backfill slug cho user cũ từ phần trước '@' của email (khớp slugBaseFromEmail ở server).
-- Trùng phần gốc → user đầu tiên (id nhỏ nhất) giữ nguyên, các user sau thêm hậu tố "-<id>".
WITH cleaned AS (
  SELECT "id",
         rtrim(left(btrim(regexp_replace(lower(split_part("email", '@', 1)), '[^a-z0-9]+', '-', 'g'), '-'), 26), '-') AS c
  FROM "users"
),
base AS (
  SELECT "id",
         CASE
           WHEN length(c) < 3 OR c IN ('admin', 'administrator', 'api', 'auth', 'login', 'logout', 'register', 'signup', 'signin', 'me', 'user', 'users', 'tour', 'tours', 'player', 'players', 'setup', 'upload', 'uploads', 'docs', 'settings', 'profile', 'account', 'help', 'support', 'root', 'system', 'null', 'undefined', 'new', 'edit', 'delete', 'www', 'static', 'assets', 'public', 'dashboard')
             THEN CASE WHEN c = '' THEN 'member' ELSE c || '-member' END
           ELSE c
         END AS b
  FROM cleaned
),
numbered AS (
  SELECT "id", b, row_number() OVER (PARTITION BY b ORDER BY "id") AS rn
  FROM base
)
UPDATE "users" u
SET "slug" = CASE WHEN n.rn = 1 THEN n.b ELSE n.b || '-' || u."id" END
FROM numbered n
WHERE u."id" = n."id";

ALTER TABLE "users" ALTER COLUMN "slug" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_slug_key" ON "users"("slug");
