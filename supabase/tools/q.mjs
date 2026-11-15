import pg from 'pg';
const c = new pg.Client({ connectionString: `postgresql://postgres.ossubzewdyzuwiwhbqkg:${process.env.SUPABASE_DB_PASSWORD}@aws-0-eu-west-2.pooler.supabase.com:5432/postgres` });
await c.connect();
const r = await c.query(`select * from seller_daily_profit order by day desc limit 5`);
console.log(JSON.stringify(r.rows, null, 1));
const t = await c.query(`select tgname, pg_get_triggerdef(oid) def from pg_trigger where tgrelid='order_items'::regclass and not tgisinternal`);
console.log(t.rows.map(x=>x.tgname+': '+x.def).join('\n'));
await c.end();
