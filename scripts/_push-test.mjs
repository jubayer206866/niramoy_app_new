/**
 * List registered push devices, or send a test push to one of them.
 *
 *   node scripts/_push-test.mjs                 # list devices (tokens truncated)
 *   node scripts/_push-test.mjs <tokenPrefix>   # push a test notification to that device only
 *
 * Needs the server env (MYSQL_*, FIREBASE_SERVICE_ACCOUNT).
 */
import db from "../server/db.mjs";
import { pushConfigured, pushToTokens } from "../server/push.mjs";

const prefix = process.argv[2];
const rows = await db.all(
  `SELECT p.token, p.user_id, u.name, p.platform, p.updated_at
     FROM push_tokens p LEFT JOIN users u ON u.id = p.user_id
    ORDER BY p.updated_at DESC`,
);
console.log(`push configured: ${pushConfigured()}  devices: ${rows.length}`);
for (const r of rows.slice(0, 10)) {
  console.log(`  ${r.token.slice(0, 16)}…  user=${r.user_id ?? "guest"} ${r.name ?? ""}  ${r.platform}  ${r.updated_at}`);
}

if (prefix) {
  const match = rows.filter((r) => r.token.startsWith(prefix));
  if (match.length !== 1) {
    console.error(`expected exactly one device starting with "${prefix}", found ${match.length}`);
    process.exit(1);
  }
  const result = await pushToTokens([match[0].token], {
    id: 0,
    kind: "notice",
    title: "Niramoy push is live",
    body: "Firebase Cloud Messaging is connected. You'll get offers and order updates here.",
    link: "/account/notifications",
  });
  console.log(`sent=${result.sent} failed=${result.failed}`);
  if (!result.sent) process.exitCode = 1;
}
process.exit();
