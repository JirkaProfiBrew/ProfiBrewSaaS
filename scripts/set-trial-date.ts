import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

async function main(): Promise<void> {
  const sql = postgres(process.env.DATABASE_URL as string);
  const tenantId = "e251ceb5-c8c5-4277-94e9-95c80dc4b53a";

  const offsetDays = parseInt(process.argv[2] || "0", 10);
  const targetDate = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);

  console.log(`Setting trial_ends_at to ${targetDate.toISOString()} (${offsetDays} days from now)`);

  await sql`UPDATE subscriptions SET trial_ends_at = ${targetDate} WHERE tenant_id = ${tenantId}`;
  const rows = await sql`SELECT status, trial_ends_at FROM subscriptions WHERE tenant_id = ${tenantId}`;
  console.log("Result:", JSON.stringify(rows[0]));
  await sql.end();
}

main();
