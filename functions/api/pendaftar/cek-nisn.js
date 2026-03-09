// functions/api/pendaftar/cek-nisn.js
// GET /api/pendaftar/cek-nisn?nisn=xxx

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const nisn = url.searchParams.get('nisn');

  if (!nisn) {
    return Response.json({ error: 'NISN diperlukan.' }, { status: 400, headers: CORS });
  }

  try {
    const data = await env.DB.prepare(
      'SELECT nisn, nama_lengkap FROM pendaftar WHERE nisn = ?'
    ).bind(nisn).first();

    if (data) {
      return Response.json({ exists: true, nama_lengkap: data.nama_lengkap }, { headers: CORS });
    } else {
      return Response.json({ exists: false }, { headers: CORS });
    }
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