-- AlterTable
ALTER TABLE "players" ADD COLUMN     "searchName" TEXT NOT NULL DEFAULT '';

-- Backfill: tên bỏ dấu tiếng Việt + chữ thường + gộp khoảng trắng (khớp toSearchText ở server)
UPDATE "players"
SET "searchName" = btrim(regexp_replace(lower(translate("name",
  'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ',
  'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyydaaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'
)), '\s+', ' ', 'g'));

-- Chuẩn hoá số điện thoại: +84xxxxxxxxx -> 0xxxxxxxxx (bỏ qua nếu sẽ gây trùng)
UPDATE "players" p
SET "phone" = '0' || substr(p."phone", 4)
WHERE p."phone" LIKE '+84%'
  AND NOT EXISTS (
    SELECT 1 FROM "players" q
    WHERE q."userId" = p."userId" AND q."phone" = '0' || substr(p."phone", 4)
  );
