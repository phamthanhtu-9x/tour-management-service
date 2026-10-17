/**
 * Nâng một tài khoản ĐÃ ĐĂNG KÝ lên SUPER_ADMIN.
 *
 *   npm run admin:promote -- <email>
 *
 * - Hệ thống chỉ có đúng 1 super admin: script từ chối nếu đã có.
 * - Chạy trong 1 transaction + advisory lock để 2 lần chạy đồng thời không tạo ra 2 super admin.
 * - Đọc DATABASE_URL từ file .env (qua dotenv).
 */
const { Client } = require('pg');

const LOCK_KEY = 815_2026; // khoá riêng cho thao tác gán super admin

async function main() {
  const email = (process.argv[2] || '').trim();
  if (!email) {
    console.error('Cách dùng: npm run admin:promote -- <email>');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('Thiếu DATABASE_URL (kiểm tra file .env).');
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);

    const existing = await client.query(
      `SELECT id, email FROM "users" WHERE "role" = 'SUPER_ADMIN' LIMIT 1`,
    );
    if (existing.rowCount > 0) {
      throw new Error(
        `Hệ thống đã có super admin (${existing.rows[0].email}). Chỉ được có 1 super admin.`,
      );
    }

    const user = await client.query(
      `SELECT id, email, "role" FROM "users" WHERE lower("email") = lower($1)`,
      [email],
    );
    if (user.rowCount === 0) {
      throw new Error(`Không tìm thấy tài khoản với email "${email}". Hãy đăng ký trước.`);
    }

    await client.query(
      `UPDATE "users" SET "role" = 'SUPER_ADMIN', "updatedAt" = NOW() WHERE id = $1`,
      [user.rows[0].id],
    );
    await client.query('COMMIT');
    console.log(
      `✔ Đã nâng "${user.rows[0].email}" (id ${user.rows[0].id}, trước đó: ${user.rows[0].role}) lên SUPER_ADMIN.`,
    );
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`✘ ${err.message}`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
