import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch {} }
  const { action, table, data, order, limit, orderField } = body || req.query;

  try {
    if (req.method === 'GET' || action === 'select') {
      const t = sanitizeTable(table);
      const lim = parseInt(limit) || 1000;
      const ord = orderField === 'nome' ? '"nome"' : '"created_at"';
      const asc = order === 'asc' ? 'ASC' : 'DESC';
      const rows = await sql(`SELECT * FROM ${t} ORDER BY ${ord} ${asc} LIMIT ${lim}`);
      return res.json({ data: rows, error: null });
    }
    if (action === 'insert') {
      const t = sanitizeTable(table);
      const keys = Object.keys(data);
      const vals = Object.values(data);
      const cols = keys.map(k => `"${k}"`).join(', ');
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      const rows = await sql(`INSERT INTO ${t} (${cols}) VALUES (${placeholders}) RETURNING *`, vals);
      return res.json({ data: rows[0], error: null });
    }
    return res.status(400).json({ error: 'Acao invalida' });
  } catch (e) {
    return res.status(500).json({ data: null, error: e.message });
  }
}

const ALLOWED_TABLES = ['fichas_triagem', 'fichas_casal', 'terapeutas'];
function sanitizeTable(t) {
  if (!ALLOWED_TABLES.includes(t)) throw new Error('Tabela nao permitida: ' + t);
  return `public."${t}"`;
}
