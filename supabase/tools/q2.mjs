import pg from 'pg';
const c = new pg.Client({ connectionString: `postgresql://postgres.ossubzewdyzuwiwhbqkg:${process.env.SUPABASE_DB_PASSWORD}@aws-0-eu-west-2.pooler.supabase.com:5432/postgres` });
await c.connect();
const r = await c.query(`select p.proname, pg_get_function_arguments(p.oid) args, pg_get_function_result(p.oid) ret
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by p.proname`);
for (const x of r.rows) console.log(`${x.proname}(${x.args}) -> ${x.ret}`);
const t = await c.query(`select tablename from pg_tables where schemaname='public' order by 1`);
console.log('\nTABLES:', t.rows.map(r=>r.tablename).join(', '));
await c.end();
