// js/siswa.js

const sessionRole    = localStorage.getItem('session_role');
const sessionUserRaw = localStorage.getItem('session_user');

if (sessionRole !== 'SISWA' || !sessionUserRaw) {
  window.location.href = '../login.html';
}

let userSession = null;
try {
  userSession = JSON.parse(sessionUserRaw);
} catch (e) {
  console.error('Session Error', e);
  window.location.href = '../login.html';
}

// Cache data pendaftar untuk dipakai di editData
let _cachedData = null;

// ===========================================================
// LOAD DASHBOARD
// ===========================================================
async function loadDashboardData() {
  try {
    if (!userSession || !userSession.id) throw new Error('ID User tidak ditemukan.');

    const pendaftarData = await apiGet('pendaftar', { id: userSession.id });
    if (pendaftarData.error) throw new Error(pendaftarData.error);

    _cachedData = pendaftarData;

    let prestasiData = [];
    if (pendaftarData.jalur === 'PRESTASI' || pendaftarData.scan_sertifikat_prestasi_url) {
      const pres = await apiGet('prestasi', { pendaftar_id: userSession.id });
      if (Array.isArray(pres)) prestasiData = pres;
    }

    renderProfile(pendaftarData);
    renderFullData(pendaftarData);
    renderPrestasiContent(prestasiData);
    renderStatus(pendaftarData);
    setupSmartCountdown(pendaftarData);

    try {
        const setDB = await apiGet('pengaturan');
        if (Array.isArray(setDB)) {
            const cfg = {};
            setDB.forEach(item => cfg[item.key] = item.value);
            document.querySelectorAll('.dyn-txt').forEach(el => {
                const key = el.getAttribute('data-key');
                if (cfg[key]) el.innerHTML = cfg[key];
            });
            if (cfg['LINK_GRUP_WA']) {
                const linkWA = cfg['LINK_GRUP_WA'];
                const aWa = document.getElementById('wa-dash-link');
                const iWa = document.getElementById('wa-dash-qrcode');
                if (aWa) aWa.href = linkWA;
                if (iWa) iWa.setAttribute('onerror', `this.src='https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(linkWA)}'`);
            }
        }
    } catch(e) { console.error('Gagal meload teks dinamis', e); }

  } catch (err) {
    console.error('Error Dashboard:', err);
    Swal.fire({
      icon: 'error',
      title: 'Gagal Memuat Data',
      text: 'Terjadi kesalahan koneksi atau sesi habis. Silakan login ulang.',
      confirmButtonText: 'Login Ulang',
      allowOutsideClick: false
    }).then(() => { logout(); });
  }
}

// ===========================================================
// RENDER PROFILE
// ===========================================================
function renderProfile(data) {
  const elNama = document.getElementById('nama-siswa');
  const elNisn = document.getElementById('nisn-siswa');
  if (elNama) elNama.innerText = data.nama_lengkap;
  if (elNisn) elNisn.innerText = data.nisn;

  const imgUrl = data.foto_url || 'https://via.placeholder.com/300x400?text=FOTO';
  document.getElementById('profile-pic').src = imgUrl;

  const elPrintPic = document.getElementById('print-foto');
  if (elPrintPic) elPrintPic.src = imgUrl;

  const badgeJalur      = document.getElementById('badge-jalur');
  const tabPrestasiBtn  = document.getElementById('btn-tab-prestasi');

  if (badgeJalur) {
    badgeJalur.innerText = data.jalur;
    if (data.jalur === 'PRESTASI') {
      badgeJalur.style.background    = '#dbeafe';
      badgeJalur.style.color         = '#1e40af';
      badgeJalur.style.borderColor   = '#bfdbfe';
      if (tabPrestasiBtn) tabPrestasiBtn.style.display = 'inline-block';
    } else {
      badgeJalur.style.background    = '#dcfce7';
      badgeJalur.style.color         = '#166534';
      badgeJalur.style.borderColor   = '#bbf7d0';
      if (tabPrestasiBtn)
        tabPrestasiBtn.style.display = data.scan_sertifikat_prestasi_url ? 'inline-block' : 'none';
    }
  }

  renderFileButtons(data);
  renderBerkasDitolak(data);
}

function renderFileButtons(data) {
  const sidebarList = document.getElementById('sidebar-file-list');
  if (!sidebarList) return;

  sidebarList.innerHTML = '';
  const addBtn = (url, label, icon) => {
    if (url) {
      sidebarList.innerHTML +=
        `<a href="${url}" target="_blank" class="file-btn-small">` +
        `<i class="ph ${icon}"></i> ${label}</a>`;
    }
  };
  addBtn(data.scan_kk_url,                   'Kartu Keluarga',     'ph-file-pdf');
  addBtn(data.scan_akta_url,                  'Akta Lahir',         'ph-file-pdf');
  addBtn(data.scan_kelakuan_baik_url,         'Surat Kelakuan Baik','ph-file-pdf');
  addBtn(data.scan_ktp_ortu_url,              'KTP Orang Tua',      'ph-file-pdf');
  addBtn(data.scan_rapor_url,                 'Rapor',              'ph-book-open-text');
  if (data.scan_sertifikat_prestasi_url)
    addBtn(data.scan_sertifikat_prestasi_url, 'Sertifikat Prestasi','ph-trophy');
}

// ===========================================================
// RENDER WARNING BERKAS DITOLAK
// ===========================================================
function renderBerkasDitolak(data) {
  // Hapus warning lama dulu
  const old = document.getElementById('berkas-ditolak-warning');
  if (old) old.remove();

  let berkasArr = [];
  try {
    berkasArr = data.berkas_ditolak ? JSON.parse(data.berkas_ditolak) : [];
  } catch(e) {}

  if (berkasArr.length === 0) return;

  const labelMap = {
    'foto_url':                     'Pas Foto',
    'scan_kk_url':                  'Kartu Keluarga',
    'scan_akta_url':                'Akta Kelahiran',
    'scan_kelakuan_baik_url':       'Surat Kelakuan Baik',
    'scan_ktp_ortu_url':            'KTP Orang Tua',
    'scan_rapor_url':               'Rapor',
    'scan_sertifikat_prestasi_url': 'Sertifikat Prestasi',
  };

  const berkasList = berkasArr
    .map(k => `<li style="margin-bottom:4px;">${labelMap[k] || k}</li>`)
    .join('');

  const warning = document.createElement('div');
  warning.id = 'berkas-ditolak-warning';
  warning.style.cssText =
    'background:#fef2f2; border:1px solid #fca5a5; border-left:4px solid #dc2626;' +
    'border-radius:12px; padding:16px 18px; margin-bottom:14px;';
  warning.innerHTML = `
    <h4 style="font-size:.88rem; font-weight:800; color:#b91c1c; margin:0 0 8px;
               display:flex; align-items:center; gap:7px;">
      <i class="ph ph-warning-circle"></i> Berkas Perlu Diupload Ulang
    </h4>
    <p style="font-size:.8rem; color:#7f1d1d; margin:0 0 10px; line-height:1.6;">
      Admin telah menandai berkas berikut tidak sesuai dan perlu diupload ulang:
    </p>
    <ul style="padding-left:18px; margin:0 0 12px; font-size:.82rem;
               color:#b91c1c; font-weight:700; line-height:1.8;">
      ${berkasList}
    </ul>
    <button onclick="editData();switchEoTab('eo-upload');"
            style="padding:9px 16px; background:#dc2626; color:white; border:none;
                   border-radius:8px; font-size:.8rem; font-weight:700;
                   cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
      <i class="ph ph-upload-simple"></i> Upload Ulang Sekarang
    </button>`;

  // Tampilkan di atas status cards
  const statusGrid = document.querySelector('.status-main-grid');
  if (statusGrid) statusGrid.parentNode.insertBefore(warning, statusGrid);
}

// ===========================================================
// RENDER FULL DATA (IDs dipertahankan)
// ===========================================================
function renderFullData(data) {
  const val   = (v) => v ? v : '-';
  const money = (v) => v ? 'Rp ' + parseInt(v).toLocaleString('id-ID') : '-';
  const setTxt = (id, text) => { const el = document.getElementById(id); if (el) el.innerText = text; };

  setTxt('no-daftar',      data.no_pendaftaran);
  setTxt('d-nik',          val(data.nik));
  setTxt('d-ttl',          `${val(data.tempat_lahir)}, ${val(data.tanggal_lahir)}`);
  setTxt('d-jk',           val(data.jenis_kelamin));
  setTxt('d-anak',         `${val(data.anak_ke)} dari ${val(data.jumlah_saudara)}`);
  setTxt('d-saudara',      val(data.jumlah_saudara));
  setTxt('d-status-anak',  val(data.status_anak));
  setTxt('d-baju',         val(data.ukuran_baju));
  setTxt('d-alamat',       val(data.alamat_lengkap));
  setTxt('d-rtrw',         `${val(data.rt)} / ${val(data.rw)}`);
  setTxt('d-desa',         val(data.desa_kelurahan));
  setTxt('d-kec',          val(data.kecamatan));
  setTxt('d-kab',          val(data.kabupaten_kota));
  setTxt('d-prov',         val(data.provinsi));
  setTxt('d-pos',          val(data.kode_pos));
  setTxt('d-kk',           val(data.no_kk));
  setTxt('d-ayah',         val(data.nama_ayah));
  setTxt('d-ayah-nik',     val(data.nik_ayah));
  setTxt('d-ayah-pend',    val(data.pendidikan_ayah));
  setTxt('d-ayah-job',     val(data.pekerjaan_ayah));
  setTxt('d-ayah-hasil',   money(data.penghasilan_ayah));
  setTxt('d-ibu',          val(data.nama_ibu));
  setTxt('d-ibu-nik',      val(data.nik_ibu));
  setTxt('d-ibu-pend',     val(data.pendidikan_ibu));
  setTxt('d-ibu-job',      val(data.pekerjaan_ibu));
  setTxt('d-ibu-hasil',    money(data.penghasilan_ibu));
  setTxt('d-hp',           val(data.no_telepon_ortu));
  setTxt('d-sekolah',      val(data.asal_sekolah));
  setTxt('d-npsn',         val(data.npsn_sekolah));
  setTxt('d-status-sek',   val(data.status_sekolah));
  setTxt('d-alamat-sek',   val(data.alamat_sekolah));
  setTxt('d-pesantren',    val(data.pilihan_pesantren));

  // Render nilai rapor (hanya untuk jalur PRESTASI)
  const raporContainer = document.getElementById('d-nilai-rapor-section');
  if (raporContainer) {
    if (data.jalur === 'PRESTASI' && data.nilai_rapor) {
      try {
        const rObj = JSON.parse(data.nilai_rapor);
        const labels = { '7_1':'Kelas 7 Sem. 1','7_2':'Kelas 7 Sem. 2','8_1':'Kelas 8 Sem. 1','8_2':'Kelas 8 Sem. 2','9_1':'Kelas 9 Sem. 1' };
        const vals = Object.entries(labels)
          .map(([k,l]) => rObj[k] ? { label:l, ...rObj[k] } : null)
          .filter(Boolean);
        if (vals.length > 0) {
          const avg = (vals.reduce((s,v) => s + v.rata, 0) / vals.length).toFixed(2);
          const avgColor = parseFloat(avg) >= 90 ? '#15803d' : '#b45309';
          let rows = vals.map(v =>
            `<tr>
              <td style="padding:5px 8px; border:1px solid #e2e8f0;">${v.label}</td>
              <td style="padding:5px 8px; border:1px solid #e2e8f0; font-weight:600;">${v.rata}</td>
              <td style="padding:5px 8px; border:1px solid #e2e8f0; color:#94a3b8;">${v.rank ? 'Ke-' + v.rank : '-'}</td>
            </tr>`).join('');
          raporContainer.innerHTML = `
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:14px 16px; margin-top:12px;">
              <div style="font-size:.78rem; font-weight:800; color:#475569; text-transform:uppercase; letter-spacing:.5px; margin-bottom:10px;">
                <i class="ph ph-book-open-text" style="margin-right:5px;"></i>Nilai Rapor
              </div>
              <table style="width:100%; border-collapse:collapse; font-size:0.8rem;">
                <thead><tr style="background:#f1f5f9;">
                  <th style="padding:5px 8px; text-align:left; border:1px solid #e2e8f0;">Semester</th>
                  <th style="padding:5px 8px; text-align:left; border:1px solid #e2e8f0;">Rata-rata</th>
                  <th style="padding:5px 8px; text-align:left; border:1px solid #e2e8f0;">Ranking</th>
                </tr></thead>
                <tbody>${rows}</tbody>
              </table>
              <div style="margin-top:10px; padding:8px 10px; background:white; border-radius:6px; border:1px solid #e2e8f0;">
                <span style="font-size:.75rem; color:#64748b;">Rata-rata keseluruhan:</span>
                <span style="font-size:1rem; font-weight:800; color:${avgColor}; margin-left:8px;">${avg}</span>
              </div>
            </div>`;
          raporContainer.style.display = 'block';
        } else { raporContainer.style.display = 'none'; }
      } catch(e) { raporContainer.style.display = 'none'; }
    } else {
      raporContainer.style.display = 'none';
    }
  }

  setTxt('print-no',       data.no_pendaftaran);
  setTxt('print-nama',     data.nama_lengkap);
  setTxt('print-nisn',     data.nisn);
  setTxt('print-jk',       data.jenis_kelamin);
  setTxt('print-sekolah',  data.asal_sekolah);
  setTxt('print-ruang',    data.ruang_tes || '-');
  setTxt('print-hari',     data.tanggal_tes || '-');
  setTxt('print-sesi',     data.sesi_tes || '-');
}

// ===========================================================
// RENDER PRESTASI
// ===========================================================
function renderPrestasiContent(list) {
  const container = document.getElementById('prestasi-list-container');
  if (!container) return;
  if (!list || list.length === 0) {
    container.innerHTML =
      '<p style="color:#64748b; font-style:italic; padding:20px; text-align:center;">Tidak ada data prestasi yang diinput.</p>';
    return;
  }
  let html = `<div style="overflow-x:auto;">
    <table class="prestasi-table">
      <thead><tr>
        <th>Kategori</th><th>Nama Prestasi</th><th>Tingkat</th><th>Tahun</th>
      </tr></thead><tbody>`;
  list.forEach(item => {
    html += `<tr>
      <td><span class="pres-badge">${item.kategori || '-'}</span></td>
      <td>${item.nama_lomba}
        <div style="font-size:.72rem; color:#64748b; margin-top:2px;">${item.penyelenggara || ''}</div>
      </td>
      <td>${item.tingkat || '-'}</td>
      <td>${item.tahun_perolehan || '-'}</td>
    </tr>`;
  });
  html += '</tbody></table></div>';
  container.innerHTML = html;
}

// ===========================================================
// RENDER STATUS
// ===========================================================
function renderStatus(data) {
  const cardVerif    = document.getElementById('card-verif');
  const valVerif     = document.getElementById('val-verif');
  const cardLulus    = document.getElementById('card-lulus');
  const valLulus     = document.getElementById('val-lulus');
  const alertUndangan = document.getElementById('alert-undangan-prestasi');
  const alertGagal    = document.getElementById('alert-gagal-prestasi');

  if (alertUndangan) alertUndangan.style.display = 'none';
  if (alertGagal)    alertGagal.style.display    = 'none';

  if (data.status_verifikasi === true) {
    cardVerif.className = 'status-card-lg st-green';
    valVerif.innerHTML  = '<i class="ph ph-check-circle"></i> Berkas Diterima';
    if (data.jalur === 'PRESTASI' && data.status_kelulusan === 'PENDING') {
      if (alertUndangan) alertUndangan.style.display = 'block';
    }
  } else if (data.status_verifikasi === false) {
    cardVerif.className = 'status-card-lg st-red';
    valVerif.innerHTML  = '<i class="ph ph-x-circle"></i> Berkas Ditolak';
    if (data.jalur === 'PRESTASI') {
      if (alertGagal) alertGagal.style.display = 'block';
    }
  } else {
    cardVerif.className = 'status-card-lg st-yellow';
    valVerif.innerHTML  = '<i class="ph ph-hourglass"></i> Menunggu Verifikasi';
  }

  if (data.jalur === 'PRESTASI' && data.status_kelulusan === 'TIDAK DITERIMA') {
    cardLulus.className = 'status-card-lg st-yellow';
    valLulus.innerHTML  = `<div style="font-size:.82rem; line-height:1.3;">
      <span style="color:#d97706;">Belum Lolos Prestasi</span><br>
      <small style="color:#1e293b;">Silakan alihkan ke Jalur Reguler</small></div>`;
    if (!document.getElementById('alert-alih-jalur')) {
      const alertDiv = document.createElement('div');
      alertDiv.id = 'alert-alih-jalur';
      alertDiv.style.cssText =
        'background:#eff6ff; border:1px solid #bfdbfe; border-radius:12px; padding:18px 20px; margin-bottom:16px;';
      alertDiv.innerHTML = `
        <h3 style="font-size:.9rem; font-weight:800; color:#1e40af; margin:0 0 8px; display:flex; align-items:center; gap:8px;">
          <i class="ph ph-info"></i> Informasi Penting
        </h3>
        <p style="font-size:.84rem; color:#1e3a8a; margin-bottom:12px; line-height:1.6;">
          Mohon maaf, Anda belum lolos di Jalur Prestasi.<br>
          Namun, Anda <strong>masih dapat mendaftar</strong> melalui Jalur Reguler
          dengan <strong>wajib mengikuti Tes CBT</strong>.
        </p>
        <button onclick="prosesPengalihanReguler('${data.id}')"
          style="background:#2563eb; color:white; border:none; padding:10px 18px; border-radius:8px;
                 font-size:.82rem; font-weight:700; cursor:pointer; width:100%;">
          Ambil Jalur Reguler &nbsp;<i class="ph ph-arrow-right"></i>
        </button>`;
      const timer = document.querySelector('.timer-banner');
      timer.parentNode.insertBefore(alertDiv, timer.nextSibling);
    }
  } else if (data.status_kelulusan === 'DITERIMA') {
    cardLulus.className = 'status-card-lg st-green';
    valLulus.innerHTML  = '<i class="ph ph-confetti"></i> Lulus Seleksi';
    // Tampilkan section Daftar Ulang
    renderDaftarUlang(data);
  } else if (data.status_kelulusan === 'TIDAK DITERIMA') {
    cardLulus.className = 'status-card-lg st-red';
    valLulus.innerHTML  = '<i class="ph ph-x-circle"></i> Tidak Lulus';
  } else {
    cardLulus.className = 'status-card-lg st-blue';
    valLulus.innerHTML  = '<i class="ph ph-info"></i> Menunggu Pengumuman';
  }

  const btnPrint    = document.getElementById('btn-sidebar-cetak');
  const btnPrintMob = document.getElementById('btn-sidebar-cetak-mob');

  ['info-bebas-tes', 'info-tunggu-verif', 'info-tunggu-jadwal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });

  const timerBanner = document.querySelector('.timer-banner');
  const showPrint   = (show) => {
    if (btnPrint)    btnPrint.style.display    = show ? 'flex' : 'none';
    if (btnPrintMob) btnPrintMob.style.display = show ? 'flex' : 'none';
  };

  // Siswa wajib CBT jika:
  // 1. Jalur REGULER yang sudah terverifikasi, ATAU
  // 2. Jalur PRESTASI yang berkasnya DITOLAK (status_verifikasi === false), ATAU
  // 3. Jalur PRESTASI yang berkas diterima TAPI gagal tes pembuktian (status_kelulusan === 'TIDAK DITERIMA')
  const mustFollowCBT =
    (data.jalur === 'REGULER' && data.status_verifikasi === true) ||
    (data.jalur === 'PRESTASI' && data.status_verifikasi === false) ||
    (data.jalur === 'PRESTASI' && data.status_verifikasi === true && data.status_kelulusan === 'TIDAK DITERIMA');

  if (mustFollowCBT) {
    if (data.status_verifikasi === true || data.status_verifikasi === false) {
      if (data.ruang_tes && data.tanggal_tes && data.sesi_tes) {
        // Jadwal sudah ada — tampilkan tombol cetak
        showPrint(true);
      } else {
        // Verifikasi sudah ada tapi jadwal belum
        showPrint(false);
        const infoBox = document.createElement('div');
        infoBox.id = 'info-tunggu-jadwal';
        infoBox.style.cssText =
          'background:#fffbeb; border:1px solid #fcd34d; padding:16px 18px; border-radius:12px; margin-bottom:14px;';
        infoBox.innerHTML = `
          <h4 style="margin:0 0 6px; display:flex; align-items:center; gap:7px; font-size:.88rem; color:#b45309;">
            <i class="ph ph-calendar-blank"></i> Jadwal Tes CBT Belum Tersedia
          </h4>
          <p style="margin:0; font-size:.82rem; color:#b45309; line-height:1.5;">
            Status verifikasi Anda sudah diproses, namun jadwal ujian CBT belum diatur panitia.
            Tombol <strong>Cetak Kartu Ujian</strong> akan muncul setelah jadwal Anda tersedia.
          </p>`;
        if (timerBanner) timerBanner.parentNode.insertBefore(infoBox, timerBanner.nextSibling);
      }
    } else {
      // Belum diverifikasi sama sekali (null)
      showPrint(false);
      const infoBox = document.createElement('div');
      infoBox.id = 'info-tunggu-verif';
      infoBox.style.cssText =
        'background:#fffbeb; border:1px solid #fcd34d; padding:16px 18px; border-radius:12px; margin-bottom:14px;';
      infoBox.innerHTML = `
        <h4 style="margin:0 0 6px; display:flex; align-items:center; gap:7px; font-size:.88rem; color:#b45309;">
          <i class="ph ph-warning-circle"></i> Menunggu Verifikasi
        </h4>
        <p style="margin:0; font-size:.82rem; color:#b45309;">
          Tombol <strong>Cetak Kartu Ujian</strong> belum tersedia. Tunggu hingga berkas diverifikasi panitia.
        </p>`;
      if (timerBanner) timerBanner.parentNode.insertBefore(infoBox, timerBanner.nextSibling);
    }
  } else {
    // Bebas CBT (PRESTASI masih dalam proses / sudah DITERIMA via jalur prestasi)
    showPrint(false);
  }
}

// ===========================================================
// DAFTAR ULANG
// ===========================================================
function renderDaftarUlang(data) {
  const section = document.getElementById('daftar-ulang-section');
  if (!section) return;

  section.style.display = 'block';

  // Update status badge masing-masing dokumen
  const updateBadge = (elId, url) => {
    const el = document.getElementById(elId);
    if (!el) return;
    if (url) {
      el.innerHTML = `<span class="du-status-badge du-status-uploaded">
        <i class="ph ph-check-circle"></i> Sudah Upload
        <a href="${url}" target="_blank" style="color:#065f46; margin-left:4px; font-size:.62rem;">Lihat</a>
      </span>`;
    } else {
      el.innerHTML = `<span class="du-status-badge du-status-pending">
        <i class="ph ph-clock"></i> Belum Upload
      </span>`;
    }
  };

  updateBadge('du-status-pesantren', data.daftar_ulang_pesantren_url);

  // Update teks tombol upload jika sudah terupload
  if (data.daftar_ulang_pesantren_url) {
    const btn = document.getElementById('btn-upload-pesantren');
    if (btn) btn.innerHTML = '<i class="ph ph-arrow-counter-clockwise"></i> Upload Ulang';
  }
}

window.uploadDU = async function(input, jenis) {
  const file = input.files[0];
  if (!file) return;

  const fieldMap = {
    pesantren: { field: 'daftar_ulang_pesantren_url', btnId: 'btn-upload-pesantren', statusId: 'du-status-pesantren' },
  };
  const cfg = fieldMap[jenis];
  if (!cfg || !userSession?.id) return;

  const btn = document.getElementById(cfg.btnId);
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ph ph-spinner"></i> Mengupload...'; }

  try {
    // Upload file ke R2
    const form = new FormData();
    form.append('file', file);
    form.append('folder', `daftar-ulang/${userSession.id}`);
    form.append('docName', jenis.toUpperCase());

    const upRes = await fetch('/api/upload', { method: 'POST', body: form });
    const upJson = await upRes.json();

    if (upJson.error) throw new Error(upJson.error);

    // Simpan URL ke database
    const saveRes = await fetch('/api/pendaftar-edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: userSession.id, [cfg.field]: upJson.url }),
    });
    const saveJson = await saveRes.json();
    if (saveJson.error) throw new Error(saveJson.error);

    // Update cache & UI
    if (_cachedData) _cachedData[cfg.field] = upJson.url;
    const statusEl = document.getElementById(cfg.statusId);
    if (statusEl) {
      statusEl.innerHTML = `<span class="du-status-badge du-status-uploaded">
        <i class="ph ph-check-circle"></i> Sudah Upload
        <a href="${upJson.url}" target="_blank" style="color:#065f46; margin-left:4px; font-size:.62rem;">Lihat</a>
      </span>`;
    }
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ph ph-arrow-counter-clockwise"></i> Upload Ulang'; }

    Swal.fire({ icon: 'success', title: 'Upload Berhasil!', text: 'Dokumen daftar ulang Anda telah tersimpan.', timer: 2000, showConfirmButton: false });

  } catch (err) {
    console.error('Upload DU error:', err);
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ph ph-upload-simple"></i> Upload Scan'; }
    Swal.fire('Gagal Upload', err.message, 'error');
  }

  input.value = ''; // reset input
};

// ===========================================================
// CETAK ULANG BUKTI PENDAFTARAN
// ===========================================================
window.cetakResume = function() {
  if (!_cachedData) {
    Swal.fire('Error', 'Data belum termuat sepenuhnya, silakan tunggu atau refresh halaman.', 'error');
    return;
  }
  localStorage.setItem('resume_data', JSON.stringify(_cachedData));
  window.open('../resume.html', '_blank');
}

// ===========================================================
// EDIT DATA — Form penuh + Upload Ulang
// ===========================================================
window.editData = function() {
  if (!_cachedData) {
    Swal.fire('Tunggu sebentar', 'Data sedang dimuat.', 'info');
    return;
  }
  const p = _cachedData;
  const v = (val) => val || '';

  // Inject overlay ke body (bukan di dalam Swal)
  let overlay = document.getElementById('edit-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'edit-overlay';
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = `
    <style>
      #edit-overlay {
        position: fixed; inset: 0; z-index: 99999;
        background: rgba(0,0,0,.55); backdrop-filter: blur(4px);
        display: flex; align-items: center; justify-content: center;
        padding: 16px; font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
      }
      .eo-box {
        background: white; border-radius: 16px; width: 100%;
        max-width: 720px; max-height: 90vh; display: flex;
        flex-direction: column; overflow: hidden;
        box-shadow: 0 24px 60px rgba(0,0,0,.2);
      }
      .eo-head {
        padding: 18px 22px; border-bottom: 1px solid #e2e8f0;
        display: flex; align-items: center; justify-content: space-between;
        flex-shrink: 0;
      }
      .eo-head h2 { font-size: .95rem; font-weight: 800; color: #0d1b2a; margin: 0; }
      .eo-close {
        background: #f1f5f9; border: none; width: 32px; height: 32px;
        border-radius: 8px; cursor: pointer; display: flex;
        align-items: center; justify-content: center; font-size: 1.1rem; color: #64748b;
      }
      .eo-close:hover { background: #e2e8f0; }
      .eo-tabs {
        display: flex; border-bottom: 1px solid #e2e8f0;
        padding: 0 22px; background: #f8fafc;
        overflow-x: auto; flex-shrink: 0;
      }
      .eo-tabs::-webkit-scrollbar { display: none; }
      .eo-tab {
        padding: 11px 14px; border: none; background: transparent;
        border-bottom: 2px solid transparent; font-size: .76rem;
        font-weight: 600; color: #64748b; cursor: pointer;
        white-space: nowrap; font-family: inherit; margin-bottom: -1px;
        transition: color .15s, border-color .15s;
      }
      .eo-tab.active { color: #00796b; border-bottom-color: #00796b; font-weight: 800; }
      .eo-body { flex: 1; overflow-y: auto; padding: 22px; }
      .eo-section { display: none; }
      .eo-section.active { display: block; }
      .eo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .eo-group { display: flex; flex-direction: column; gap: 5px; }
      .eo-group.full { grid-column: span 2; }
      .eo-label { font-size: .7rem; font-weight: 700; color: #64748b;
                  text-transform: uppercase; letter-spacing: .4px; }
      .eo-input {
        padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px;
        font-size: .88rem; color: #0d1b2a; background: white; outline: none;
        font-family: inherit; transition: border-color .15s;
        width: 100%; box-sizing: border-box;
      }
      .eo-input:focus { border-color: #00796b; box-shadow: 0 0 0 3px rgba(0,121,107,.1); }
      select.eo-input {
        appearance: none; -webkit-appearance: none;
        background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
        background-repeat: no-repeat; background-position: right 10px center;
        background-size: .85em; padding-right: 28px; cursor: pointer;
      }
      .eo-sub { font-size: .68rem; font-weight: 800; letter-spacing: 1.5px;
                text-transform: uppercase; color: #94a3b8; grid-column: span 2;
                padding: 10px 0 6px; border-bottom: 1px solid #e2e8f0; margin-top: 4px; }

      /* Upload section */
      .eo-upload-list { display: flex; flex-direction: column; gap: 8px; }
      .eo-upload-row {
        display: flex; align-items: center; gap: 10px;
        padding: 11px 14px; border: 1px solid #e2e8f0;
        border-radius: 8px; background: #f8fafc;
        transition: border-color .15s, background .15s;
        position: relative;
      }
      .eo-upload-row.has-file { border-color: #00796b; background: #f0fdf4; }
      .eo-upload-icon { width: 34px; height: 34px; border-radius: 7px;
                        background: white; border: 1px solid #e2e8f0;
                        display: flex; align-items: center; justify-content: center;
                        font-size: .95rem; color: #64748b; flex-shrink: 0; }
      .eo-upload-row.has-file .eo-upload-icon { border-color: #00796b; color: #00796b; }
      .eo-upload-info { flex: 1; min-width: 0; }
      .eo-upload-name { font-size: .82rem; font-weight: 700; color: #0d1b2a; display: block; }
      .eo-upload-status { font-size: .7rem; color: #94a3b8; display: block; margin-top: 1px; }
      .eo-upload-row.has-file .eo-upload-status { color: #00796b; }
      .eo-upload-btn {
        flex-shrink: 0; padding: 6px 12px; background: #0d1b2a; color: white;
        border: none; border-radius: 6px; font-size: .72rem; font-weight: 700;
        cursor: pointer; font-family: inherit; white-space: nowrap;
        transition: background .15s;
      }
      .eo-upload-btn:hover { background: #1e293b; }
      .eo-upload-btn.uploading { background: #64748b; cursor: wait; }
      .eo-upload-input { display: none; }

      .eo-note {
        background: #fffbeb; border: 1px solid #fcd34d;
        border-radius: 8px; padding: 10px 14px;
        font-size: .76rem; color: #b45309; margin-bottom: 16px; line-height: 1.5;
      }

      .eo-foot {
        padding: 16px 22px; border-top: 1px solid #e2e8f0;
        display: flex; justify-content: flex-end; gap: 8px; flex-shrink: 0;
      }
      .eo-btn-cancel {
        padding: 10px 20px; background: #f1f5f9; border: 1px solid #cbd5e1;
        border-radius: 8px; font-size: .82rem; font-weight: 700;
        color: #475569; cursor: pointer; font-family: inherit;
      }
      .eo-btn-save {
        padding: 10px 24px; background: #0d1b2a; border: none;
        border-radius: 8px; font-size: .82rem; font-weight: 700;
        color: white; cursor: pointer; font-family: inherit;
        display: flex; align-items: center; gap: 6px;
        transition: background .15s;
      }
      .eo-btn-save:hover { background: #00796b; }

      @media (max-width: 600px) {
        .eo-grid { grid-template-columns: 1fr; }
        .eo-group.full { grid-column: span 1; }
        .eo-sub { grid-column: span 1; }
        #edit-overlay { padding: 0; align-items: flex-end; }
        .eo-box { max-height: 96vh; border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
      }
    </style>

    <div class="eo-box">
      <div class="eo-head">
        <h2><i class="ph ph-pencil-simple-line" style="margin-right:6px;"></i>Edit Data Pendaftaran</h2>
        <button class="eo-close" onclick="closeEditOverlay()"><i class="ph ph-x"></i></button>
      </div>

      <div class="eo-tabs">
        <button class="eo-tab active" onclick="switchEoTab('eo-diri')">Data Diri</button>
        <button class="eo-tab" onclick="switchEoTab('eo-keluarga')">Keluarga</button>
        <button class="eo-tab" onclick="switchEoTab('eo-sekolah')">Sekolah</button>
        <button class="eo-tab" onclick="switchEoTab('eo-upload')">Upload Berkas</button>
        ${p.jalur === 'PRESTASI' ? `<button class="eo-tab" onclick="switchEoTab('eo-rapor')"><i class="ph ph-book-open-text" style="margin-right:4px;"></i>Nilai Rapor</button>` : ''}
      </div>

      <div class="eo-body">

        <!-- Tab 1: Data Diri -->
        <div class="eo-section active" id="eo-diri">
          <div class="eo-grid">
            <div class="eo-group">
              <label class="eo-label">Nama Lengkap</label>
              <input class="eo-input" id="eo-nama" type="text" value="${v(p.nama_lengkap)}"
                     style="text-transform:uppercase;">
            </div>
            <div class="eo-group">
              <label class="eo-label">NIK Siswa</label>
              <input class="eo-input" id="eo-nik" type="number" value="${v(p.nik)}"
                     placeholder="16 digit NIK">
            </div>
            <div class="eo-group">
              <label class="eo-label">Jenis Kelamin</label>
              <select class="eo-input" id="eo-jk">
                <option value="Laki-laki" ${p.jenis_kelamin==='Laki-laki'?'selected':''}>Laki-laki</option>
                <option value="Perempuan" ${p.jenis_kelamin==='Perempuan'?'selected':''}>Perempuan</option>
              </select>
            </div>
            <div class="eo-group">
              <label class="eo-label">Tempat Lahir</label>
              <input class="eo-input" id="eo-tempat-lahir" type="text" value="${v(p.tempat_lahir)}"
                     style="text-transform:uppercase;">
            </div>
            <div class="eo-group">
              <label class="eo-label">Tanggal Lahir</label>
              <input class="eo-input" id="eo-tanggal-lahir" type="date" value="${v(p.tanggal_lahir)}">
            </div>
            <div class="eo-group">
              <label class="eo-label">Ukuran Baju</label>
              <select class="eo-input" id="eo-baju">
                ${['S','M','L','XL','XXL','XXXL'].map(s =>
                  `<option value="${s}" ${p.ukuran_baju===s?'selected':''}>${s}</option>`
                ).join('')}
              </select>
            </div>
            <div class="eo-group">
              <label class="eo-label">Jumlah Saudara</label>
              <input class="eo-input" id="eo-jml-saudara" type="number" value="${v(p.jumlah_saudara)}">
            </div>
            <div class="eo-group">
              <label class="eo-label">Anak Ke-</label>
              <input class="eo-input" id="eo-anak-ke" type="number" value="${v(p.anak_ke)}">
            </div>
            <div class="eo-group">
              <label class="eo-label">Status Anak</label>
              <select class="eo-input" id="eo-status-anak">
                <option value="Kandung" ${p.status_anak==='Kandung'?'selected':''}>Kandung</option>
                <option value="Angkat"  ${p.status_anak==='Angkat'?'selected':''}>Angkat</option>
              </select>
            </div>
            <div class="eo-sub">Alamat Domisili</div>
            <div class="eo-group full">
              <label class="eo-label">Alamat Lengkap</label>
              <input class="eo-input" id="eo-alamat" type="text" value="${v(p.alamat_lengkap)}"
                     style="text-transform:uppercase;">
            </div>
            <div class="eo-group">
              <label class="eo-label">RT</label>
              <input class="eo-input" id="eo-rt" type="number" value="${v(p.rt)}">
            </div>
            <div class="eo-group">
              <label class="eo-label">RW</label>
              <input class="eo-input" id="eo-rw" type="number" value="${v(p.rw)}">
            </div>
            <div class="eo-group">
              <label class="eo-label">Kode Pos</label>
              <input class="eo-input" id="eo-kodepos" type="number" value="${v(p.kode_pos)}">
            </div>
            <div class="eo-group">
              <label class="eo-label">No. HP Orang Tua (WA)</label>
              <input class="eo-input" id="eo-hp" type="number" value="${v(p.no_telepon_ortu)}">
            </div>
          </div>
        </div>

        <!-- Tab 2: Keluarga -->
        <div class="eo-section" id="eo-keluarga">
          <div class="eo-grid">
            <div class="eo-group full">
              <label class="eo-label">Nomor Kartu Keluarga (KK)</label>
              <input class="eo-input" id="eo-no-kk" type="number" value="${v(p.no_kk)}">
            </div>
            <div class="eo-sub">Data Ayah</div>
            <div class="eo-group">
              <label class="eo-label">Nama Ayah</label>
              <input class="eo-input" id="eo-ayah-nama" type="text" value="${v(p.nama_ayah)}"
                     style="text-transform:uppercase;">
            </div>
            <div class="eo-group">
              <label class="eo-label">NIK Ayah</label>
              <input class="eo-input" id="eo-ayah-nik" type="number" value="${v(p.nik_ayah)}">
            </div>
            <div class="eo-group">
              <label class="eo-label">Pendidikan Ayah</label>
              <select class="eo-input" id="eo-ayah-pend">
                ${['TIDAK SEKOLAH','SD','SLTP','SLTA','D3','S1','S2','S3'].map(e =>
                  `<option value="${e}" ${p.pendidikan_ayah===e?'selected':''}>${e}</option>`
                ).join('')}
              </select>
            </div>
            <div class="eo-group">
              <label class="eo-label">Pekerjaan Ayah</label>
              <select class="eo-input" id="eo-ayah-job">
                ${['TIDAK BEKERJA','PENSIUNAN','PNS','TNI/POLISI','GURU/DOSEN','PEGAWAI SWASTA',
                   'WIRASWASTA','PEDAGANG','PETANI/PETERNAK','NELAYAN',
                   'BURUH (TANI/PABRIK/BANGUNAN)','SOPIR/MASINIS/KONDEKTUR','LAINNYA'].map(e =>
                  `<option value="${e}" ${p.pekerjaan_ayah===e?'selected':''}>${e}</option>`
                ).join('')}
              </select>
            </div>
            <div class="eo-group">
              <label class="eo-label">Penghasilan Ayah (Rp)</label>
              <input class="eo-input" id="eo-ayah-hasil" type="number" value="${v(p.penghasilan_ayah)}">
            </div>
            <div class="eo-sub">Data Ibu</div>
            <div class="eo-group">
              <label class="eo-label">Nama Ibu</label>
              <input class="eo-input" id="eo-ibu-nama" type="text" value="${v(p.nama_ibu)}"
                     style="text-transform:uppercase;">
            </div>
            <div class="eo-group">
              <label class="eo-label">NIK Ibu</label>
              <input class="eo-input" id="eo-ibu-nik" type="number" value="${v(p.nik_ibu)}">
            </div>
            <div class="eo-group">
              <label class="eo-label">Pendidikan Ibu</label>
              <select class="eo-input" id="eo-ibu-pend">
                ${['TIDAK SEKOLAH','SD','SLTP','SLTA','D3','S1','S2','S3'].map(e =>
                  `<option value="${e}" ${p.pendidikan_ibu===e?'selected':''}>${e}</option>`
                ).join('')}
              </select>
            </div>
            <div class="eo-group">
              <label class="eo-label">Pekerjaan Ibu</label>
              <select class="eo-input" id="eo-ibu-job">
                ${['TIDAK BEKERJA','PENSIUNAN','PNS','TNI/POLISI','GURU/DOSEN','PEGAWAI SWASTA',
                   'WIRASWASTA','PEDAGANG','PETANI/PETERNAK','NELAYAN',
                   'BURUH (TANI/PABRIK/BANGUNAN)','SOPIR/MASINIS/KONDEKTUR','LAINNYA'].map(e =>
                  `<option value="${e}" ${p.pekerjaan_ibu===e?'selected':''}>${e}</option>`
                ).join('')}
              </select>
            </div>
            <div class="eo-group">
              <label class="eo-label">Penghasilan Ibu (Rp)</label>
              <input class="eo-input" id="eo-ibu-hasil" type="number" value="${v(p.penghasilan_ibu)}">
            </div>
          </div>
        </div>

        <!-- Tab 3: Sekolah -->
        <div class="eo-section" id="eo-sekolah">
          <div class="eo-grid">
            <div class="eo-group">
              <label class="eo-label">Nama Sekolah Asal</label>
              <input class="eo-input" id="eo-sekolah-nama" type="text" value="${v(p.asal_sekolah)}"
                     style="text-transform:uppercase;">
            </div>
            <div class="eo-group">
              <label class="eo-label">NPSN</label>
              <input class="eo-input" id="eo-npsn" type="number" value="${v(p.npsn_sekolah)}">
            </div>
            <div class="eo-group">
              <label class="eo-label">Status Sekolah</label>
              <select class="eo-input" id="eo-status-sek">
                <option value="Negeri"  ${p.status_sekolah==='Negeri'?'selected':''}>Negeri</option>
                <option value="Swasta"  ${p.status_sekolah==='Swasta'?'selected':''}>Swasta</option>
              </select>
            </div>
            <div class="eo-group full">
              <label class="eo-label">Alamat Sekolah</label>
              <input class="eo-input" id="eo-alamat-sek" type="text" value="${v(p.alamat_sekolah)}"
                     style="text-transform:uppercase;">
            </div>
            <div class="eo-group full">
              <label class="eo-label">Pilihan Tempat Tinggal / Pesantren</label>
              <select class="eo-input" id="eo-pesantren">
                ${['Pesantren Sukahideng','Pesantren Sukamanah','Pesantren Rancabolang',
                   'Pesantren Sukaguru','Penduduk Desa Sukarapih','Penduduk Desa Wargekerta'].map(e =>
                  `<option value="${e}" ${p.pilihan_pesantren===e?'selected':''}>${e}</option>`
                ).join('')}
              </select>
            </div>
          </div>
        </div>

        <!-- Tab 4: Upload Berkas -->
        <div class="eo-section" id="eo-upload">
          <div class="eo-note">
            Klik tombol <strong>Ganti File</strong> di samping kanan setiap berkas untuk mengunggah ulang.
            File lama akan otomatis digantikan setelah berhasil diupload.
          </div>
          <div class="eo-upload-list">
            ${buildUploadRow('foto',     'Pas Foto',              'ph-user-focus',          p.foto_url,                    'image/*',   'foto')}
            ${buildUploadRow('kk',       'Kartu Keluarga',        'ph-users-three',          p.scan_kk_url,                 '.pdf',      'kk')}
            ${buildUploadRow('akta',     'Akta Kelahiran',        'ph-scroll',               p.scan_akta_url,               '.pdf',      'akta')}
            ${buildUploadRow('skb',      'Surat Kelakuan Baik',   'ph-certificate',          p.scan_kelakuan_baik_url,      '.pdf',      'skb')}
            ${buildUploadRow('ktp',      'KTP Orang Tua',         'ph-identification-card',  p.scan_ktp_ortu_url,           '.pdf',      'ktp_ortu')}
            ${buildUploadRow('rapor',    `Rapor 5 Semester${p.jalur === 'REGULER' ? ' (Opsional)' : ''}`, 'ph-book-open-text', p.scan_rapor_url, '.pdf', 'rapor')}
            ${p.jalur === 'PRESTASI' || p.scan_sertifikat_prestasi_url
              ? buildUploadRow('sertif', 'Sertifikat Prestasi',   'ph-trophy',               p.scan_sertifikat_prestasi_url,'.pdf',      'sertifikat_prestasi')
              : ''}
          </div>
        </div>

      </div><!-- /eo-body -->

      <div class="eo-foot">
        <button class="eo-btn-cancel" onclick="closeEditOverlay()">Batal</button>
        <button class="eo-btn-save" onclick="saveEditData()">
          <i class="ph ph-floppy-disk"></i> Simpan Perubahan
        </button>
      </div>
    </div>`;

  // Inject tab nilai rapor setelah overlay dibuat (khusus jalur PRESTASI)
  if (p.jalur === 'PRESTASI') {
    const eoBody = overlay.querySelector('.eo-body');
    let rObjEdit = {};
    try { rObjEdit = JSON.parse(p.nilai_rapor || '{}'); } catch(e) {}
    const semLabels = [['7_1','Kelas 7 Sem. 1'],['7_2','Kelas 7 Sem. 2'],['8_1','Kelas 8 Sem. 1'],['8_2','Kelas 8 Sem. 2'],['9_1','Kelas 9 Sem. 1']];
    const raporTab = document.createElement('div');
    raporTab.className = 'eo-section';
    raporTab.id = 'eo-rapor';
    raporTab.innerHTML = `
      <p style="font-size:0.75rem; background:#fee2e2; color:#b91c1c; padding:10px 14px; border-radius:6px; border:1px solid #fecaca; margin:0 0 14px; font-weight:600; line-height:1.5; display:flex; gap:8px;">
        <i class="ph ph-warning-circle" style="font-size:1.1rem; margin-top:1px;"></i>
        <span><b>PERHATIAN:</b> Nilai yang diinput <u>WAJIB sesuai dengan Buku Rapor</u>. Ketidaksesuaian nilai pada saat verifikasi akan membatalkan kelulusan Anda.</span>
      </p>
      <p style="font-size:.78rem; color:#64748b; margin:0 0 14px; line-height:1.5;">
        Isi rata-rata nilai rapor dari kelas 7 semester 1 hingga kelas 9 semester 1.
        Ranking tiap semester bersifat opsional.
      </p>
      <table style="width:100%; border-collapse:collapse; font-size:0.83rem; margin-bottom:14px;">
        <thead><tr style="background:#f1f5f9;">
          <th style="width:30%; padding:8px 10px; text-align:left; border:1px solid #e2e8f0;">Semester</th>
          <th style="width:45%; padding:8px 10px; text-align:left; border:1px solid #e2e8f0;">Rata-rata Nilai <span style="color:#ef4444">*</span></th>
          <th style="width:25%; padding:8px 10px; text-align:left; border:1px solid #e2e8f0; color:#94a3b8;">Ranking</th>
        </tr></thead>
        <tbody>
          ${semLabels.map(([k,l], i) => `
          <tr style="background:${i%2===0?'white':'#f8fafc'}">
            <td style="padding:8px 10px; border:1px solid #e2e8f0; font-weight:600;">${l}</td>
            <td style="padding:6px 8px; border:1px solid #e2e8f0;">
              <input type="number" class="eo-input eo-rapor-nilai" data-key="${k}"
                     value="${rObjEdit[k]?.rata ?? ''}"
                     placeholder="cth: 85.5" min="0" max="100" step="0.1"
                     oninput="hitungRataRaporEdit()"
                     style="padding:7px 10px; font-size:0.82rem;">
            </td>
            <td style="padding:6px 8px; border:1px solid #e2e8f0;">
              <input type="number" class="eo-input eo-rapor-rank" data-key="${k}"
                     value="${rObjEdit[k]?.rank ?? ''}"
                     placeholder="cth: 3" min="1"
                     style="padding:7px 10px; font-size:0.82rem;">
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div id="eo-rapor-avg-display" style="padding:10px 14px; border-radius:8px; background:#f0fdf4; border:1px solid #bbf7d0; display:none;">
        <span style="font-size:.78rem; color:#166534; font-weight:700;">Rata-rata keseluruhan:</span>
        <span id="eo-rapor-avg-val" style="font-size:1.1rem; font-weight:800; color:#15803d; margin-left:8px;"></span>
      </div>
      
      <!-- CHECKBOX INTEGRITAS EDIT -->
      <div style="margin-top: 15px; padding: 12px; background: #fff1f2; border: 1px solid #fecaca; border-radius: 8px; display: flex; gap: 10px; align-items: start; text-align: left;">
          <input type="checkbox" id="check-integritas-rapor-edit" style="margin-top: 3px; transform: scale(1.1); cursor: pointer;">
          <label for="check-integritas-rapor-edit" style="font-size: 0.75rem; color: #991b1b; font-weight: 700; cursor: pointer; line-height: 1.4;">
              SAYA MENJAMIN: Nilai yang saya input ini adalah BENAR sesuai rapor asli. Saya siap menerima konsekuensi diskualifikasi jika ditemukan ketidaksesuaian data.
          </label>
      </div>

      <button onclick="saveNilaiRapor()"
              style="margin-top:14px; width:100%; padding:11px; background:#0d1b2a; color:white;
                     border:none; border-radius:8px; font-size:.83rem; font-weight:700; cursor:pointer;
                     display:flex; align-items:center; justify-content:center; gap:7px;">
        <i class="ph ph-floppy-disk"></i> Simpan Nilai Rapor
      </button>`;
    eoBody.appendChild(raporTab);
    // Hitung awal jika sudah ada data
    setTimeout(() => hitungRataRaporEdit(), 100);
  }

  overlay.style.display = 'flex';
};

function buildUploadRow(key, label, icon, currentUrl, accept, docName) {
  const hasFile = !!currentUrl;
  return `
    <div class="eo-upload-row ${hasFile ? 'has-file' : ''}" id="eo-row-${key}">
      <div class="eo-upload-icon"><i class="ph ${icon}"></i></div>
      <div class="eo-upload-info">
        <span class="eo-upload-name">${label}</span>
        <span class="eo-upload-status" id="eo-status-${key}">
          ${hasFile ? 'Sudah diupload' : 'Belum ada file'}
        </span>
      </div>
      ${currentUrl
        ? `<a href="${currentUrl}" target="_blank"
             style="padding:6px 10px; font-size:.7rem; font-weight:700; color:#00796b;
                    border:1px solid #b2dfdb; background:#f0fdf4; border-radius:6px;
                    text-decoration:none; white-space:nowrap; flex-shrink:0;">
             Lihat
           </a>`
        : ''}
      <button class="eo-upload-btn" id="eo-btn-${key}"
              onclick="document.getElementById('eo-input-${key}').click()">
        Ganti File
      </button>
      <input type="file" class="eo-upload-input" id="eo-input-${key}"
             accept="${accept}"
             onchange="handleReupload(this, '${key}', '${docName}')">
    </div>`;
}

window.switchEoTab = function(sectionId) {
  document.querySelectorAll('.eo-section').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.eo-tab').forEach(el => el.classList.remove('active'));
  document.getElementById(sectionId).classList.add('active');
  document.querySelectorAll('.eo-tab').forEach(btn => {
    if (btn.getAttribute('onclick').includes(sectionId)) btn.classList.add('active');
  });
};

window.closeEditOverlay = function() {
  const ov = document.getElementById('edit-overlay');
  if (ov) ov.style.display = 'none';
};

window.hitungRataRaporEdit = function() {
  const inputs = document.querySelectorAll('.eo-rapor-nilai');
  const vals = Array.from(inputs).map(i => parseFloat(i.value)).filter(v => !isNaN(v) && v >= 0);
  const display = document.getElementById('eo-rapor-avg-display');
  const valEl   = document.getElementById('eo-rapor-avg-val');
  if (vals.length > 0) {
    const avg = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
    if (display) display.style.display = 'block';
    if (valEl)   { valEl.textContent = avg; valEl.style.color = parseFloat(avg) >= 90 ? '#15803d' : '#b45309'; }
  } else {
    if (display) display.style.display = 'none';
  }
};

window.saveNilaiRapor = async function() {
  const checkIntegritas = document.getElementById('check-integritas-rapor-edit');
  if (checkIntegritas && !checkIntegritas.checked) {
    Swal.fire({
        icon: 'error',
        title: 'Pernyataan Integritas',
        text: 'Wajib mencentang pernyataan integritas sebelum menyimpan nilai rapor.'
    });
    checkIntegritas.parentElement.style.borderColor = '#ef4444';
    checkIntegritas.parentElement.style.backgroundColor = '#fee2e2';
    return;
  }

  const raporData = {};
  document.querySelectorAll('.eo-rapor-nilai').forEach(inp => {
    const key = inp.dataset.key;
    const val = parseFloat(inp.value);
    if (!isNaN(val)) raporData[key] = { rata: val };
  });
  document.querySelectorAll('.eo-rapor-rank').forEach(inp => {
    const key = inp.dataset.key;
    const val = parseInt(inp.value);
    if (!isNaN(val) && raporData[key]) raporData[key].rank = val;
  });

  const nilaiRaporJson = Object.keys(raporData).length > 0 ? JSON.stringify(raporData) : null;

  try {
    const res = await fetch('/api/pendaftar?action=update-rapor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: userSession.id, nilai_rapor: nilaiRaporJson }),
    });
    const result = await res.json();
    if (!res.ok || result.error) throw new Error(result.error || 'Gagal menyimpan.');
    _cachedData.nilai_rapor = nilaiRaporJson;
    renderFullData(_cachedData);
    const toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2500 });
    toast.fire({ icon: 'success', title: 'Nilai rapor berhasil disimpan' });
  } catch(err) {
    Swal.fire('Gagal', err.message, 'error');
  }
};

// Upload ulang individual file
window.handleReupload = async function(input, key, docName) {
  const file = input.files[0];
  if (!file) return;

  const btnEl    = document.getElementById(`eo-btn-${key}`);
  const statusEl = document.getElementById(`eo-status-${key}`);
  const rowEl    = document.getElementById(`eo-row-${key}`);

  const MAX_MB   = 2;
  const isImage  = file.type.startsWith('image/');
  const isPdf    = file.type === 'application/pdf';
  const isFoto   = (key === 'foto');

  if (isFoto && !isImage) {
    Swal.fire('Format Salah', 'Foto harus berformat JPG atau PNG.', 'error'); return;
  }
  if (!isFoto && !isPdf) {
    Swal.fire('Format Salah', 'Dokumen harus berformat PDF.', 'error'); return;
  }
  if (file.size > MAX_MB * 1024 * 1024) {
    Swal.fire('File Terlalu Besar', `Ukuran maksimal ${MAX_MB} MB.`, 'error'); return;
  }

  btnEl.textContent = 'Mengupload...';
  btnEl.classList.add('uploading');
  btnEl.disabled    = true;
  if (statusEl) statusEl.textContent = 'Mengupload...';

  try {
    const folder = _cachedData.no_pendaftaran || userSession.id;
    const url    = await apiUpload(file, folder, docName);

    // Update URL di database via pendaftar-edit
    const fieldMap = {
      foto:    'foto_url',
      kk:      'scan_kk_url',
      akta:    'scan_akta_url',
      skb:     'scan_kelakuan_baik_url',
      ktp:     'scan_ktp_ortu_url',
      rapor:   'scan_rapor_url',
      sertif:  'scan_sertifikat_prestasi_url',
    };
    const field = fieldMap[key];
    if (field) {
      const res = await fetch('/api/pendaftar-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userSession.id, [field]: url }),
      });
      const result = await res.json();
      if (!res.ok || result.error) throw new Error(result.error || 'Gagal simpan URL.');
      _cachedData = result.data;
    }

    if (statusEl) statusEl.textContent = 'Berhasil diupload';
    if (rowEl)    rowEl.classList.add('has-file');

    // Update foto profil langsung jika foto diganti
    if (key === 'foto') {
      const profilePic = document.getElementById('profile-pic');
      const printFoto  = document.getElementById('print-foto');
      if (profilePic) profilePic.src = url;
      if (printFoto)  printFoto.src  = url;
    }

    // Refresh file list sidebar
    renderFileButtons(_cachedData);

  } catch (err) {
    Swal.fire('Upload Gagal', err.message, 'error');
    if (statusEl) statusEl.textContent = 'Upload gagal, coba lagi';
  } finally {
    btnEl.textContent = 'Ganti File';
    btnEl.classList.remove('uploading');
    btnEl.disabled    = false;
    input.value       = '';
  }
};

// Simpan perubahan data teks
window.saveEditData = async function() {
  const get = (id) => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : null;
  };

  const updates = {
    id:               userSession.id,
    nama_lengkap:     get('eo-nama'),
    nik:              get('eo-nik'),
    jenis_kelamin:    get('eo-jk'),
    tempat_lahir:     get('eo-tempat-lahir'),
    tanggal_lahir:    get('eo-tanggal-lahir'),
    ukuran_baju:      get('eo-baju'),
    jumlah_saudara:   get('eo-jml-saudara'),
    anak_ke:          get('eo-anak-ke'),
    status_anak:      get('eo-status-anak'),
    alamat_lengkap:   get('eo-alamat'),
    rt:               get('eo-rt'),
    rw:               get('eo-rw'),
    kode_pos:         get('eo-kodepos'),
    no_telepon_ortu:  get('eo-hp'),
    no_kk:            get('eo-no-kk'),
    nama_ayah:        get('eo-ayah-nama'),
    nik_ayah:         get('eo-ayah-nik'),
    pendidikan_ayah:  get('eo-ayah-pend'),
    pekerjaan_ayah:   get('eo-ayah-job'),
    penghasilan_ayah: get('eo-ayah-hasil'),
    nama_ibu:         get('eo-ibu-nama'),
    nik_ibu:          get('eo-ibu-nik'),
    pendidikan_ibu:   get('eo-ibu-pend'),
    pekerjaan_ibu:    get('eo-ibu-job'),
    penghasilan_ibu:  get('eo-ibu-hasil'),
    asal_sekolah:     get('eo-sekolah-nama'),
    npsn_sekolah:     get('eo-npsn'),
    status_sekolah:   get('eo-status-sek'),
    alamat_sekolah:   get('eo-alamat-sek'),
    pilihan_pesantren:get('eo-pesantren'),
  };

  // Hapus field null/undefined
  Object.keys(updates).forEach(k => {
    if (updates[k] === null || updates[k] === undefined || updates[k] === '') {
      delete updates[k];
    }
  });

  try {
    const res = await fetch('/api/pendaftar-edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const result = await res.json();
    if (!res.ok || result.error) throw new Error(result.error || 'Gagal menyimpan data.');

    _cachedData = result.data;
    renderProfile(_cachedData);
    renderFullData(_cachedData);

    closeEditOverlay();
    Swal.fire({
      icon: 'success',
      title: 'Data Berhasil Disimpan',
      timer: 1800,
      showConfirmButton: false,
    });

  } catch (err) {
    Swal.fire('Gagal', err.message, 'error');
  }
};

// ===========================================================
// SWITCH TAB (biodata view)
// ===========================================================
window.switchTab = function(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  document.querySelectorAll('.tab-btn').forEach(btn => {
    if (btn.getAttribute('onclick').includes(tabId)) btn.classList.add('active');
  });
};

// ===========================================================
// PROSES PENGALIHAN REGULER
// ===========================================================
window.prosesPengalihanReguler = async function(id) {
  const confirm = await Swal.fire({
    title: 'Lanjut Jalur Reguler?',
    html: 'Data Anda akan dipindahkan ke <b>Jalur Reguler</b>.<br>Anda <b>wajib mengikuti Tes CBT</b> setelah pengalihan ini.',
    icon: 'question', showCancelButton: true,
    confirmButtonText: 'Ya, Lanjutkan', cancelButtonText: 'Batal'
  });
  if (confirm.isConfirmed) {
    Swal.showLoading();
    try {
      const result = await apiPost('pendaftar/alih-reguler', { id });
      if (result.error) throw new Error(result.error);
      Swal.fire('Berhasil', 'Status Anda telah dialihkan ke Jalur Reguler. Tunggu informasi jadwal Tes CBT.', 'success')
        .then(() => location.reload());
    } catch (e) {
      Swal.fire('Gagal', e.message, 'error');
    }
  }
};

// Wrapper untuk tombol di notif HTML statis (alert-gagal-prestasi)
window.pindahKeRegulerTrigger = function() {
  if (!_cachedData || !_cachedData.id) {
    Swal.fire('Tunggu sebentar', 'Data sedang dimuat.', 'info');
    return;
  }
  prosesPengalihanReguler(_cachedData.id);
};

// ===========================================================
// CETAK KARTU CBT
// ===========================================================
function cetakKartu() {
  const now = new Date();
  const opts = { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
  const el = document.getElementById('print-date');
  if (el) el.innerText = now.toLocaleDateString('id-ID', opts) + ' WIB';

  document.body.classList.remove('print-undangan');
  document.body.classList.add('print-kartu');
  window.print();
  setTimeout(() => document.body.classList.remove('print-kartu'), 1000);
}

// ===========================================================
// CETAK UNDANGAN TES PEMBUKTIAN PRESTASI
// ===========================================================
window.cetakUndangan = function() {
  if (!_cachedData) {
    Swal.fire('Tunggu sebentar', 'Data sedang dimuat.', 'info');
    return;
  }
  const p = _cachedData;
  const v = (val) => val || '-';

  // Isi data siswa ke elemen undangan
  const setEl = (id, text) => { const el = document.getElementById(id); if (el) el.innerText = text; };
  setEl('und-no',      v(p.no_pendaftaran));
  setEl('und-nama',    v(p.nama_lengkap));
  setEl('und-nisn',    v(p.nisn));
  setEl('und-jk',      v(p.jenis_kelamin));
  setEl('und-sekolah', v(p.asal_sekolah));
  
  const fotoEl = document.getElementById('und-foto');
  if (fotoEl) {
    fotoEl.src = p.foto_url ? p.foto_url : 'https://via.placeholder.com/150?text=FOTO';
  }

  const now  = new Date();
  const opts = { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
  setEl('und-print-date', now.toLocaleDateString('id-ID', opts) + ' WIB');

  document.body.classList.remove('print-kartu');
  document.body.classList.add('print-undangan');
  window.print();
  setTimeout(() => document.body.classList.remove('print-undangan'), 1000);
};

// ===========================================================
// SMART COUNTDOWN
// ===========================================================
let countdownInterval;

function parseExamDate(tglStr, sesiStr) {
  try {
    if (!tglStr || !sesiStr) return null;
    let datePart = tglStr.split(',')[1]?.trim() || tglStr;
    const months = {
      'Januari':'01','Februari':'02','Maret':'03','April':'04',
      'Mei':'05','Juni':'06','Juli':'07','Agustus':'08',
      'September':'09','Oktober':'10','November':'11','Desember':'12'
    };
    for (let m in months) { datePart = datePart.replace(m, months[m]); }
    const parts = datePart.split(' ');
    const day   = parts[0].padStart(2,'0');
    const month = parts[1];
    const year  = parts[2];
    const timeMatch = sesiStr.match(/(\d{2})\.(\d{2})/);
    const timePart  = timeMatch ? `${timeMatch[1]}:${timeMatch[2]}:00` : '07:00:00';
    return `${year}-${month}-${day}T${timePart}`;
  } catch (e) { return null; }
}

async function setupSmartCountdown(pendaftar) {
  const banner = document.querySelector('.timer-banner');
  if (!banner) return;

  if (pendaftar.status_verifikasi !== true) {
    banner.style.display = 'none';
    return;
  }

  let tglPres = '2026-04-18T00:00:00';
  let tglReg  = '2026-05-25T00:00:00';
  try {
    const data = await apiGet('pengaturan', { keys: 'TANGGAL_PENGUMUMAN_PRESTASI,TANGGAL_PENGUMUMAN_REGULER' });
    if (Array.isArray(data)) {
      data.forEach(item => {
        if (item.key === 'TANGGAL_PENGUMUMAN_PRESTASI') tglPres = item.value;
        if (item.key === 'TANGGAL_PENGUMUMAN_REGULER')  tglReg  = item.value;
      });
    }
  } catch (e) { console.warn('Gagal load tanggal', e); }

  const now = new Date().getTime();
  let targetDate = null, titleText = '', subText = '';
  const isBebasTes = (pendaftar.jalur === 'REGULER' && pendaftar.scan_sertifikat_prestasi_url);

  if (pendaftar.jalur === 'PRESTASI') {
    const tesPresDate = new Date('2026-04-16T07:30:00').getTime();
    if (now < tesPresDate) {
      targetDate = tesPresDate;
      titleText  = 'Menuju Tes Pembuktian Prestasi';
      subText    = 'Harap hadir di kampus MAN 1 Tasikmalaya';
    } else {
      targetDate = new Date(tglPres).getTime();
      titleText  = 'Menuju Pengumuman Hasil Prestasi';
      subText    = 'Hasil Seleksi Jalur Prestasi';
    }
  } else if (pendaftar.jalur === 'REGULER') {
    if (pendaftar.tanggal_tes && pendaftar.sesi_tes) {
      const examDateStr = parseExamDate(pendaftar.tanggal_tes, pendaftar.sesi_tes);
      const examTime    = examDateStr ? new Date(examDateStr).getTime() : 0;
      if (examTime > now) {
        targetDate = examTime;
        titleText  = 'Menuju Ujian CBT Anda';
        subText    = `${pendaftar.tanggal_tes} — ${pendaftar.sesi_tes.split('(')[0].trim()}`;
      } else {
        targetDate = new Date(tglReg).getTime();
        titleText  = 'Menuju Pengumuman Kelulusan Akhir';
        subText    = 'Hasil Seleksi Jalur Reguler';
      }
    } else {
      targetDate = new Date(tglReg).getTime();
      titleText  = 'Menuju Pengumuman Kelulusan Akhir';
      subText    = 'Jadwal ujian belum tersedia, pantau terus';
    }
  }

  const titleEl = banner.querySelector('h2');
  const subEl   = banner.querySelector('p');
  if (titleEl) titleEl.innerText = titleText;
  if (subEl)   subEl.innerText   = subText;

  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(function() {
    const distance = targetDate - new Date().getTime();
    const timerEl  = document.getElementById('timer');
    if (!timerEl) { clearInterval(countdownInterval); return; }
    if (distance < 0) {
      clearInterval(countdownInterval);
      timerEl.innerHTML =
        `<h3 style="margin:0; padding:8px 16px; background:rgba(255,255,255,.15);
                    border-radius:8px; font-size:.9rem;">Waktu Telah Tiba</h3>`;
      return;
    }
    const days    = Math.floor(distance / 86400000);
    const hours   = Math.floor((distance % 86400000) / 3600000);
    const minutes = Math.floor((distance % 3600000) / 60000);
    const seconds = Math.floor((distance % 60000) / 1000);
    timerEl.innerHTML = `
      <div class="t-box"><span class="t-val">${days}</span><span class="t-lbl">Hari</span></div>
      <div class="t-box"><span class="t-val">${hours}</span><span class="t-lbl">Jam</span></div>
      <div class="t-box"><span class="t-val">${minutes}</span><span class="t-lbl">Menit</span></div>
      <div class="t-box"><span class="t-val">${seconds}</span><span class="t-lbl">Detik</span></div>`;
  }, 1000);

  banner.style.display = 'flex';
}

// ===========================================================
// INIT
// ===========================================================
loadDashboardData();