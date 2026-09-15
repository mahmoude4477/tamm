import { parseArgs } from "node:util";
import pg from "pg";
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { email: { type: "string" }, actor: { type: "string" } },
});
const action = positionals[0];
if (
  !["suspend", "activate"].includes(action) ||
  !values.email ||
  !values.actor
) {
  console.error(
    "Usage: node --env-file=.env.local scripts/accounts.mjs suspend|activate --email user@example.com --actor operator@example.com",
  );
  process.exit(1);
}
if (values.email.toLowerCase() === values.actor.toLowerCase()) {
  console.error("Use a separate operator account.");
  process.exit(1);
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  await client.query("BEGIN");
  const target = await client.query(
    'SELECT id,banned FROM "user" WHERE email=$1 FOR UPDATE',
    [values.email.toLowerCase()],
  );
  const actor = await client.query('SELECT id FROM "user" WHERE email=$1', [
    values.actor.toLowerCase(),
  ]);
  if (!target.rowCount || !actor.rowCount) throw Error("Account not found");
  const userId = target.rows[0].id;
  await client.query(
    'UPDATE "user" SET banned=$1,updated_at=now() WHERE id=$2',
    [action === "suspend", userId],
  );
  if (action === "suspend")
    await client.query("DELETE FROM session WHERE user_id=$1", [userId]);
  const memberships = await client.query(
    "SELECT workspace_id FROM membership WHERE user_id=$1",
    [userId],
  );
  for (const { workspace_id } of memberships.rows)
    await client.query(
      "INSERT INTO audit_log(id,workspace_id,actor_id,action,entity_id,detail) VALUES($1,$2,$3,$4,$5,$6)",
      [
        crypto.randomUUID(),
        workspace_id,
        actor.rows[0].id,
        `account.${action}`,
        userId,
        JSON.stringify({
          source: "database-operator-cli",
          before: { banned: target.rows[0].banned },
          after: { banned: action === "suspend" },
        }),
      ],
    );
  await client.query("COMMIT");
  console.log("Account updated.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(
    error instanceof Error ? error.message : "Account update failed",
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
