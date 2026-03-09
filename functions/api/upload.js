// functions/api/upload.js
// POST /api/upload  — upload file ke R2, return public URL
// Body: multipart/form-data dengan field: file, folder, docName

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

// Maksimum 2MB
const MAX_SIZE_BYTES = 2 * 1024 * 1024;

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const folder = formData.get('folder') ?? 'uploads';
    const docName = formData.get('docName') ?? 'file';

    if (!file || typeof file === 'string') {
      return Response.json({ error: 'File tidak ditemukan.' }, { status: 400, headers: CORS });
    }

    if (file.size > MAX_SIZE_BYTES) {
      return Response.json(
        { error: `File terlalu besar. Maksimum 2MB. Ukuran file: ${(file.size / 1024 / 1024).toFixed(2)}MB` },
        { status: 400, headers: CORS }
      );
    }

    const ext = file.name ? file.name.split('.').pop().toLowerCase() : 'bin';
    const timestamp = Date.now();
    const key = `${folder}/${docName}_${timestamp}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();

    await env.R2_BUCKET.put(key, arrayBuffer, {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
    });

    // Public URL via R2 custom domain atau workers URL
    // Format: https://pub-{hash}.r2.dev/{key} jika public bucket
    // Kita return path saja, nanti di-handle via /api/file/[key]
    const publicUrl = `/api/file/${key}`;

    return Response.json({ url: publicUrl, key }, { headers: CORS });
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