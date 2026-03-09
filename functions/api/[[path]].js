// functions/api/file/[[path]].js
// GET /api/file/folder/filename.ext  — serve file dari R2

export async function onRequestGet(context) {
  const { params, env } = context;

  // params.path adalah array dari dynamic route [[path]]
  const key = Array.isArray(params.path) ? params.path.join('/') : params.path;

  if (!key) {
    return new Response('File path diperlukan.', { status: 400 });
  }

  try {
    const object = await env.R2_BUCKET.get(key);

    if (!object) {
      return new Response('File tidak ditemukan.', { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('Cache-Control', 'public, max-age=31536000'); // cache 1 tahun

    return new Response(object.body, { headers });
  } catch (err) {
    return new Response('Error: ' + err.message, { status: 500 });
  }
}