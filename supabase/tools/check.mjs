import pg from 'pg';
const pw = process.env.SUPABASE_DB_PASSWORD;
const c = new pg.Client({ connectionString: `postgresql://postgres:${pw}@db.ossubzewdyzuwiwhbqkg.supabase.co:5432/postgres` });
await c.connect();
const { rows } = await c.query(`select column_name, is_nullable, data_type, column_default from information_schema.columns where table_schema='auth' and table_name='users' and is_nullable='NO' order by ordinal_position`);
console.log(rows.length ? JSON.stringify(rows, null, 1) : 'no auth.users table');
const e = await c.query(`select count(*)::int n from auth.users`);
console.log('auth.users rows:', e.rows[0].n);
await c.end();
