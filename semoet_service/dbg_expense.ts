import { db } from './src/config/database.js';
async function main() {
  const r = await db.query(`SELECT id, category, amount_idr, note, expense_date, created_by, created_at, updated_at FROM expenses ORDER BY created_at DESC LIMIT 3`);
  console.log(JSON.stringify(r.rows, null, 2));
  process.exit(0);
}
void main();
