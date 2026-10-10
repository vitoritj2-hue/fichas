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
    if (action === 'therapistLoad') {
      // Retorna apenas a CONTAGEM de pacientes ativos por terapeuta.
      // Nunca expõe dados de pacientes (nome, contato, etc.) — só números.
      const rows = await sql(`
        SELECT "therapistId", SUM(cnt)::int AS cnt FROM (
          SELECT "therapistId", COUNT(*) AS cnt FROM public."fichas_triagem"
            WHERE "therapistId" IS NOT NULL AND status NOT IN ('finalizado','inativo')
            GROUP BY "therapistId"
          UNION ALL
          SELECT "therapistId", COUNT(*) AS cnt FROM public."fichas_casal"
            WHERE "therapistId" IS NOT NULL AND status NOT IN ('finalizado','inativo')
            GROUP BY "therapistId"
        ) combined
        GROUP BY "therapistId"
      `);
      return res.json({ data: rows, error: null });
    }
    if (action === 'insert') {
      const t = sanitizeTable(table);
      const keys = Object.keys(data).map(sanitizeColumn);
      const vals = Object.values(data);
      const cols = keys.map(k => `"${k}"`).join(', ');
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      const queryStr = `INSERT INTO ${t} (${cols}) VALUES (${placeholders}) RETURNING *`;
      try {
        const rows = await sql(queryStr, vals);
        return res.json({ data: rows[0], error: null });
      } catch (e) {
        // Auto-migração: se alguma coluna nova ainda não existe na tabela (ex: campo
        // adicionado recentemente no formulário), cria a coluna e tenta de novo.
        if (e.message && e.message.includes('does not exist')) {
          for (const k of keys) {
            await sql(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS "${k}" TEXT`);
          }
          const rows = await sql(queryStr, vals);
          return res.json({ data: rows[0], error: null });
        }
        throw e;
      }
    }
    return res.status(400).json({ error: 'Acao invalida' });
  } catch (e) {
    return res.status(500).json({ data: null, error: e.message });
  }
}

const ALLOWED_TABLES = ['fichas_triagem', 'fichas_casal', 'terapeutas'];
const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
function sanitizeColumn(k) {
  if (!SAFE_IDENTIFIER.test(k)) throw new Error('Nome de campo invalido: ' + k);
  return k;
}
function sanitizeTable(t) {
  if (!ALLOWED_TABLES.includes(t)) throw new Error('Tabela nao permitida: ' + t);
  return `public."${t}"`;
}
