#!/usr/bin/env node
/**
 * Grant (or revoke) admin access:
 *   node scripts/promote-admin.mjs someone@example.com
 *   node scripts/promote-admin.mjs someone@example.com --off
 * Uses the same MYSQL_* environment variables as the server.
 */
import db, { now } from "../server/db.mjs";

const email = (process.argv[2] || "").trim().toLowerCase();
const revoke = process.argv.includes("--off");

if (!email) {
  console.error("usage: node scripts/promote-admin.mjs <email> [--off]");
  process.exit(1);
}

try {
  const user = await db.get("SELECT id, name, role FROM users WHERE email = ?", [email]);
  if (!user) {
    console.error(`No account found for ${email}`);
    process.exitCode = 1;
  } else if (revoke) {
    const admins = (await db.get("SELECT COUNT(*) n FROM users WHERE role = 'admin'")).n;
    if (user.role === "admin" && admins <= 1) {
      console.error("Cannot revoke - the store needs at least one administrator.");
      process.exitCode = 1;
    } else {
      await db.run("UPDATE users SET role = 'customer', updated_at = ? WHERE id = ?", [now(), user.id]);
      console.log(`${user.name} <${email}> is now a customer.`);
    }
  } else {
    await db.run("UPDATE users SET role = 'admin', updated_at = ? WHERE id = ?", [now(), user.id]);
    console.log(`${user.name} <${email}> is now an administrator.`);
  }
} finally {
  await db.pool.end();
}
