// functions/api/prestasi.js
// GET  /api/prestasi?pendaftar_id=xxx  — ambil prestasi satu pendaftar
// POST /api/prestasi                   — simpan list prestasi (bulk insert)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pendaftar_id = url.searchParams.get('pendaftar_id');

  if (!pendaftar_id) {
    return Response.json({ error: 'pendaftar_id diperlukan.' }, { status: 400, headers: CORS });
  }

  try {
    const { results } = await env.DB.prepare(
      'SELECT * FROM prestasi WHERE pendaftar_id = ?'
    ).bind(pendaftar_id).all();

    return Response.json(results, { headers: CORS });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: CORS });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const list = await request.json(); // array of prestasi objects

    if (!Array.isArray(list) || list.length === 0) {
      return Response.json({ error: 'Data prestasi kosong.' }, { status: 400, headers: CORS });
    }

    const stmts = list.map(item =>
      env.DB.prepare(`
        INSERT INTO prestasi (id, pendaftar_id, kategori, nama_lomba, penyelenggara, tingkat, tahun_perolehan)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        item.pendaftar_id,
        item.kategori ?? null,
        item.nama_lomba ?? null,
        item.penyelenggara ?? null,
        item.tingkat ?? null,
        item.tahun_perolehan ?? null
      )
    );

    await env.DB.batch(stmts);

    return Response.json({ success: true, inserted: list.length }, { status: 201, headers: CORS });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: CORS });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}