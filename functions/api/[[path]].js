// functions/api/file/[[path]].js
// GET /api/file/folder/filename.ext  — serve file dari R2

export async function onRequestGet(context) {
  const { request, env } = context;

  // Ambil key langsung dari URL pathname untuk hindari masalah encoding di params
  const url = new URL(request.url);
  const rawPath = url.pathname.replace(/^\/api\/file\//, '');

  // Decode URL encoding (%2F -> /)
  const key = decodeURIComponent(rawPath);

  if (!key) {
    return new Response('File path diperlukan.', { status: 400 });
  }

  try {
    // Coba key dengan slash normal dulu
    let object = await env.R2_BUCKET.get(key);

    // Fallback: coba key dengan slash ter-encode (kalau ada upload lama)
    if (!object) {
      const encodedSlashKey = key.replace(/\//g, '%2F');
      object = await env.R2_BUCKET.get(encodedSlashKey);
    }

    if (!object) {
      return new Response(`File tidak ditemukan. Key: ${key}`, { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('Cache-Control', 'public, max-age=31536000');

    return new Response(object.body, { headers });
  } catch (err) {
    return new Response('Error: ' + err.message, { status: 500 });
  }
}