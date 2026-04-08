// functions/api/admin.js
// Semua operasi admin: GET semua pendaftar, UPDATE verifikasi/jadwal/kelulusan/pengaturan

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

// Middleware: cek session admin (simpel via header X-Admin-Session)
function isAdmin(request) {
  // Cek localStorage tidak bisa di server — admin.js di client sudah handle auth
  // Endpoint ini diasumsikan hanya dipanggil dari halaman admin yang sudah login
  // Untuk keamanan lebih, bisa tambahkan token JWT nanti
  return true;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  try {
    if (action === 'pengaturan') {
      const { results } = await env.DB.prepare('SELECT * FROM pengaturan').all();
      return Response.json(results, { headers: CORS });
    }

    // Default: ambil semua pendaftar
    const { results } = await env.DB.prepare(
      'SELECT * FROM pendaftar ORDER BY created_at DESC'
    ).all();

    // Konversi status_verifikasi integer ke boolean/null
    const data = results.map(r => ({
      ...r,
      status_verifikasi: r.status_verifikasi === null ? null : r.status_verifikasi === 1
    }));

    return Response.json(data, { headers: CORS });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: CORS });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  try {
    const body = await request.json();

    // Update verifikasi + status_kelulusan untuk banyak pendaftar sekaligus
    if (action === 'verifikasi') {
      const { ids, updateData } = body;
      if (!ids || !Array.isArray(ids)) return Response.json({ error: 'ids required' }, { status: 400, headers: CORS });

      // Konversi boolean ke integer untuk D1
      const dbData = { ...updateData };
      if ('status_verifikasi' in dbData) {
        dbData.status_verifikasi = dbData.status_verifikasi === true ? 1 : dbData.status_verifikasi === false ? 0 : null;
      }

      const setClauses = Object.keys(dbData).map(k => `${k} = ?`).join(', ');
      const values = Object.values(dbData);

      const stmts = ids.map(id =>
        env.DB.prepare(`UPDATE pendaftar SET ${setClauses} WHERE id = ?`)
          .bind(...values, id)
      );
      await env.DB.batch(stmts);
      return Response.json({ success: true, updated: ids.length }, { headers: CORS });
    }

    // Simpan JADWAL_CONFIG ke pengaturan
    if (action === 'jadwal') {
      const { config } = body;
      await env.DB.prepare(
        `INSERT INTO pengaturan (key, value) VALUES ('JADWAL_CONFIG', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).bind(JSON.stringify(config)).run();
      return Response.json({ success: true }, { headers: CORS });
    }

    // Update plotting (jadwal per pendaftar: ruang_tes, tanggal_tes, sesi_tes)
    if (action === 'plotting') {
      const { changes } = body; // { id: { ruang_tes, tanggal_tes, sesi_tes }, ... }
      const stmts = Object.entries(changes).map(([id, data]) =>
        env.DB.prepare(
          'UPDATE pendaftar SET ruang_tes = ?, tanggal_tes = ?, sesi_tes = ? WHERE id = ?'
        ).bind(data.ruang_tes ?? null, data.tanggal_tes ?? null, data.sesi_tes ?? null, id)
      );
      await env.DB.batch(stmts);
      return Response.json({ success: true }, { headers: CORS });
    }

    // Update kelulusan bulk
    if (action === 'kelulusan') {
      const { updates } = body; // [{ id, status_kelulusan }, ...]
      const stmts = updates.map(u =>
        env.DB.prepare('UPDATE pendaftar SET status_kelulusan = ? WHERE id = ?')
          .bind(u.status_kelulusan, u.id)
      );
      await env.DB.batch(stmts);
      return Response.json({ success: true }, { headers: CORS });
    }

    // Update satu pendaftar (edit data)
    if (action === 'update-satu') {
      const { id, payload } = body;
      if (!id) return Response.json({ error: 'id required' }, { status: 400, headers: CORS });

      const dbPayload = { ...payload };
      if ('status_verifikasi' in dbPayload) {
        dbPayload.status_verifikasi = dbPayload.status_verifikasi === true ? 1 : dbPayload.status_verifikasi === false ? 0 : null;
      }

      const setClauses = Object.keys(dbPayload).map(k => `${k} = ?`).join(', ');
      const values = Object.values(dbPayload);

      await env.DB.prepare(`UPDATE pendaftar SET ${setClauses} WHERE id = ?`)
        .bind(...values, id).run();
      return Response.json({ success: true }, { headers: CORS });
    }

    // Upsert pengaturan (key-value)
    if (action === 'pengaturan') {
      const { items } = body; // [{ key, value }, ...]
      const stmts = items.map(item =>
        env.DB.prepare(
          `INSERT INTO pengaturan (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`
        ).bind(item.key, item.value)
      );
      await env.DB.batch(stmts);
      return Response.json({ success: true }, { headers: CORS });
    }

    // Alihkan batch pendaftar PRESTASI ke REGULER (oleh admin)
    if (action === 'alih-reguler') {
      const { ids } = body;
      if (!ids || !Array.isArray(ids) || ids.length === 0)
        return Response.json({ error: 'ids required' }, { status: 400, headers: CORS });

      const stmts = ids.map(id =>
        env.DB.prepare(`
          UPDATE pendaftar SET
            jalur = 'REGULER',
            status_kelulusan = 'PENDING',
            status_verifikasi = NULL,
            ruang_tes = NULL,
            tanggal_tes = NULL,
            sesi_tes = NULL
          WHERE id = ?
        `).bind(id)
      );
      await env.DB.batch(stmts);
      return Response.json({ success: true, updated: ids.length }, { headers: CORS });
    }

    return Response.json({ error: 'Action tidak dikenal.' }, { status: 400, headers: CORS });

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