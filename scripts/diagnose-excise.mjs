import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL);

const tenants = await sql`SELECT id, name, settings FROM tenants LIMIT 3`;
for (const t of tenants) {
  const s = t.settings || {};
  console.log('Tenant:', t.name, '| excise_enabled:', s.excise_enabled ?? 'NOT SET', '| category:', s.excise_brewery_category ?? 'NOT SET');
}

const wh = await sql`SELECT id, name, is_excise_relevant FROM warehouses ORDER BY name`;
console.log('\nWarehouses:');
for (const w of wh) {
  console.log(' ', w.name, '| is_excise_relevant:', w.is_excise_relevant);
}

const items = await sql`SELECT id, name, code, is_excise_relevant FROM items WHERE is_excise_relevant = true LIMIT 10`;
console.log('\nExcise-relevant items:', items.length);
for (const i of items) {
  console.log(' ', i.code, i.name);
}

const issues = await sql`
  SELECT si.id, si.code, si.status, si.movement_type, si.movement_purpose, si.batch_id, si.warehouse_id, w.name as wh_name
  FROM stock_issues si
  LEFT JOIN warehouses w ON w.id = si.warehouse_id
  WHERE si.status = 'confirmed' AND si.movement_purpose = 'production_in'
  ORDER BY si.created_at DESC
  LIMIT 5
`;
console.log('\nRecent confirmed production receipts:', issues.length);
for (const i of issues) {
  console.log(' ', i.code, '| batch:', i.batch_id ? 'YES' : 'NO', '| wh:', i.wh_name);
}

const moves = await sql`SELECT COUNT(*) as cnt FROM excise_movements`;
console.log('\nExcise movements count:', moves[0].cnt);

await sql.end();
