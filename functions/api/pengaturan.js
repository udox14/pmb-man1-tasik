// functions/api/pengaturan.js
// GET /api/pengaturan?keys=KEY1,KEY2  — ambil nilai pengaturan

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const keysParam = url.searchParams.get('keys');

  try {
    let results;

    if (keysParam) {
      const keys = keysParam.split(',').map(k => k.trim());
      const placeholders = keys.map(() => '?').join(',');
      const { results: rows } = await env.DB.prepare(
        `SELECT key, value FROM pengaturan WHERE key IN (${placeholders})`
      ).bind(...keys).all();
      results = rows;
    } else {
      const { results: rows } = await env.DB.prepare(
        'SELECT key, value FROM pengaturan'
      ).all();
      results = rows;
    }

    return Response.json(results, { headers: CORS });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: CORS });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}