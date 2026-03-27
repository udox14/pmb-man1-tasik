// functions/api/reset.js
// POST /api/reset — hapus seluruh data pendaftar & prestasi
// Membutuhkan header konfirmasi X-Reset-Confirm: YES_DELETE_ALL

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

export async function onRequestPost(context) {
  const { request, env } = context;

  // Double-check: wajib ada header konfirmasi
  const confirm = request.headers.get('X-Reset-Confirm');
  if (confirm !== 'YES_DELETE_ALL') {
    return Response.json(
      { error: 'Header konfirmasi tidak valid.' },
      { status: 403, headers: CORS }
    );
  }

  try {
    // Hapus tabel prestasi dulu (foreign key ke pendaftar)
    await env.DB.prepare('DELETE FROM prestasi').run();

    // Hapus semua pendaftar
    await env.DB.prepare('DELETE FROM pendaftar').run();

    // Catat berapa yang terhapus (akan 0 setelah delete, tapi bisa cek via changes)
    return Response.json(
      { success: true, message: 'Semua data berhasil dihapus. Nomor urut pendaftaran akan mulai dari awal.' },
      { status: 200, headers: CORS }
    );
  } catch (err) {
    return Response.json(
      { error: err.message },
      { status: 500, headers: CORS }
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Reset-Confirm',
    }
  });
}