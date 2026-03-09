// functions/api/pendaftar/alih-reguler.js
// POST /api/pendaftar/alih-reguler — alihkan jalur PRESTASI -> REGULER

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { id } = await request.json();
    if (!id) return Response.json({ error: 'ID diperlukan.' }, { status: 400, headers: CORS });

    await env.DB.prepare(`
      UPDATE pendaftar SET
        jalur = 'REGULER',
        status_kelulusan = 'PENDING',
        status_verifikasi = 1,
        ruang_tes = NULL,
        tanggal_tes = NULL,
        sesi_tes = NULL
      WHERE id = ?
    `).bind(id).run();

    return Response.json({ success: true }, { headers: CORS });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: CORS });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}