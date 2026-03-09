// functions/api/auth.js
// POST /api/auth — login siswa & admin

export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return Response.json({ error: 'Username dan password wajib diisi.' }, { status: 400, headers: corsHeaders });
    }

    // 1. Cek Admin
    const admin = await env.DB.prepare(
      'SELECT * FROM admins WHERE username = ?'
    ).bind(username).first();

    if (admin && admin.password === password) {
      return Response.json({
        role: 'ADMIN',
        user: { name: admin.nama_lengkap || 'Administrator' }
      }, { headers: corsHeaders });
    }

    // 2. Cek Siswa — login pakai NISN
    const siswa = await env.DB.prepare(
      'SELECT id, nisn, nama_lengkap, tanggal_lahir FROM pendaftar WHERE nisn = ?'
    ).bind(username).first();

    if (!siswa) {
      return Response.json({ error: 'NISN tidak ditemukan.' }, { status: 401, headers: corsHeaders });
    }

    // Password = tanggal lahir format DDMMYYYY
    const parts = siswa.tanggal_lahir.split('-'); // YYYY-MM-DD
    const correctPassword = parts[2] + parts[1] + parts[0];

    if (password !== correctPassword) {
      return Response.json({ error: 'Password salah. Gunakan Tanggal Lahir (DDMMYYYY).' }, { status: 401, headers: corsHeaders });
    }

    return Response.json({
      role: 'SISWA',
      user: { id: siswa.id, nama: siswa.nama_lengkap, nisn: siswa.nisn }
    }, { headers: corsHeaders });

  } catch (err) {
    return Response.json({ error: 'Terjadi kesalahan server.', detail: err.message }, { status: 500, headers: corsHeaders });
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