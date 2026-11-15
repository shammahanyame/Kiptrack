// sqlrun.mjs — run psql-style .sql files against the live Supabase Postgres.
// Supports the meta-commands used in this repo: \set (literal + subquery),
// \echo, \pset, :'var' substitution. Each file runs as one transactional batch.
import pg from 'pg';
import { readFileSync } from 'node:fs';

const DBPW = process.env.SUPABASE_DB_PASSWORD;
if (!DBPW) {
  console.error('Usage: SUPABASE_DB_PASSWORD=<pw> node sqlrun.mjs <file.sql> [more.sql ...]');
  process.exit(2);
}

const hosts = [
  `postgresql://postgres:${DBPW}@db.ossubzewdyzuwiwhbqkg.supabase.co:5432/postgres`,
  `postgresql://postgres.ossubzewdyzuwiwhbqkg:${DBPW}@aws-0-eu-west-2.pooler.supabase.com:5432/postgres`,
];

async function connect() {
  for (const cs of hosts) {
    const client = new pg.Client({ connectionString: cs, connectionTimeoutMillis: 15000 });
    try {
      await client.connect();
      await client.query('SELECT 1');
      console.log('connected via ' + cs.replace(/:[^:@/]+@/, ':***@'));
      return client;
    } catch (e) {
      try { await client.end(); } catch {}
      console.log('connect failed via ' + cs.replace(/:[^:@/]+@/, ':***@') + ' -> ' + e.message.split('\n')[0]);
    }
  }
  throw new Error('could not connect to the database with any connection string');
}

function balancedParens(s) {
  let d = 0, inStr = false, inId = false, inDollar = false;
  for (let i = 0; i < s.length; i++) {
    if (inDollar) { if (s.startsWith('$$', i)) { inDollar = false; i++; } continue; }
    if (!inStr && !inId && s.startsWith('$$', i)) { inDollar = true; i++; continue; }
    const c = s[i];
    if (!inId && c === "'") inStr = !inStr;
    else if (!inStr && c === '"') inId = !inId;
    else if (!inStr && !inId) {
      if (c === '(') d++;
      else if (c === ')') { d--; if (d === 0) return i; if (d < 0) return i; }
    }
  }
  return -1; // still open
}

function quoteLit(v) { return "'" + String(v).replace(/'/g, "''") + "'"; }

function preprocess(text, vars) {
  const lines = text.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\\echo\b/.test(line)) { console.log('echo: ' + line.replace(/^\\echo\s*/, '').replace(/(?:^')|(')$/g, '')); out.push(''); i++; continue; }
    if (/^\\pset\b/.test(line)) { out.push(''); i++; continue; }
    const m = line.match(/^\\set\s+([A-Za-z_][A-Za-z0-9_]*)\s*(.*)$/);
    if (m) {
      const [, name, rest] = m;
      const restTrim = rest.trim();
      if (restTrim.startsWith('(')) {
        const idx = balancedParens(restTrim);
        if (idx !== -1) {
          vars.set(name, { sub: restTrim.slice(1, idx).trim() });
        } else {
          let buf = restTrim, j = i + 1;
          let found = -1;
          while (j < lines.length) {
            buf += ' ' + lines[j];
            found = balancedParens(buf);
            if (found !== -1) break;
            j++;
          }
          if (found === -1) throw new Error(`unbalanced parens in \\set ${name}`);
          vars.set(name, { sub: buf.slice(1, found).trim() });
          i = j;
        }
        console.log(`set ${name} <- subquery`);
      } else {
        const v = restTrim.replace(/^(?:')|(?:')$/g, '');
        vars.set(name, { val: v });
        console.log(`set ${name} = ${v}`);
      }
      out.push('');
      i++;
      continue;
    }
    out.push(line);
    i++;
  }
  return out.join('\n');
}

async function resolveSubqueries(sqlText, vars, client) {
  while (true) {
    const used = [...vars.keys()].filter(n => sqlText.includes(`:'${n}'`));
    if (used.length === 0) break;
    const n = used[0];
    const v = vars.get(n);
    let val;
    if ('val' in v) val = v.val;
    else {
      // Apply any already-resolved literals inside the stored subquery.
      let sub = v.sub;
      for (const [n2, v2] of vars) {
        if ('val' in v2) sub = sub.split(`:'${n2}'`).join(quoteLit(v2.val));
      }
      const r = await client.query(`SELECT (${sub}) AS v`);
      val = r.rows[0] && r.rows[0].v !== null ? String(r.rows[0].v) : 'NULL';
      console.log(`resolved ${n} = ${val}`);
    }
    sqlText = sqlText.split(`:'${n}'`).join(val === 'NULL' ? 'NULL' : quoteLit(val));
  }
  return sqlText;
}

const files = process.argv.slice(2);
const client = await connect();
let failures = 0;
for (const f of files) {
  console.log(`\n${'='.repeat(64)}\nFILE ${f}\n${'='.repeat(64)}`);
  const vars = new Map();
  let sql;
  try {
    sql = await resolveSubqueries(preprocess(readFileSync(f, 'utf8'), vars), vars, client);
  } catch (e) {
    failures++;
    console.error('PREPROCESS ERROR: ' + e.message);
    continue;
  }
  try {
    const startTime = Date.now();
    const res = await client.query(sql);
    const ms = Date.now() - startTime;
    if (Array.isArray(res)) {
      console.log(`OK — ${res.length} statement results in ${ms}ms`);
      let shown = 0;
      for (const r of res) {
        if (r.command === 'SELECT' && r.rows && r.rows.length && shown < 12) {
          console.log(`  SELECT -> ${r.rowCount} rows: ${JSON.stringify(r.rows.slice(0, 3)).slice(0, 300)}`);
          shown++;
        }
      }
    } else console.log(`OK in ${ms}ms`);
  } catch (e) {
    failures++;
    console.error('ERROR: ' + e.message);
    if (e.where && e.position) {
      const linesUpToPos = sql.slice(0, Number(e.position));
      const lineNo = linesUpToPos.split('\n').length;
      const snippet = linesUpToPos.split('\n').slice(Math.max(0, lineNo - 3), lineNo + 2).join('\n');
      console.error(`at near line ${lineNo}:\n${snippet}`);
    }
  }
}
try { await client.end(); } catch {}
process.exit(failures ? 1 : 0);
