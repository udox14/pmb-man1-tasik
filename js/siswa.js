// js/siswa.js

// 1. Cek Sesi Aman (Safety First)
const sessionRole = localStorage.getItem('session_role');
const sessionUserRaw = localStorage.getItem('session_user');

if (sessionRole !== 'SISWA' || !sessionUserRaw) {
    window.location.href = '../login.html';
}

let userSession = null;
try {
    userSession = JSON.parse(sessionUserRaw);
} catch (e) {
    console.error("Session Error", e);
    window.location.href = '../login.html';
}

// 2. Load Data Dashboard (Fungsi Utama)
async function loadDashboardData() {
    try {
        if (!userSession || !userSession.id) throw new Error("ID User tidak ditemukan.");

        // A. Ambil Data Pendaftar dari Database (Fresh)
        const { data: pendaftarData, error: errorPendaftar } = await db
            .from('pendaftar')
            .select('*')
            .eq('id', userSession.id)
            .single();

        if (errorPendaftar) throw errorPendaftar;
        if (!pendaftarData) throw new Error("Data siswa tidak ditemukan.");

        // B. Ambil Data Prestasi (Jika Jalur Prestasi)
        let prestasiData = [];
        if (pendaftarData.jalur === 'PRESTASI') {
            const { data: pres, error: errorPres } = await db
                .from('prestasi')
                .select('*')
                .eq('pendaftar_id', userSession.id);
            
            if (!errorPres && pres) prestasiData = pres;
        }

        // C. Render Semua Tampilan
        renderProfile(pendaftarData);
        renderFullData(pendaftarData); // Tab Data Lengkap
        renderPrestasiContent(prestasiData); // Tab Prestasi
        renderStatus(pendaftarData); // Status & Tombol Cetak
        
        // D. Setup Countdown (Async)
        setupCountdown();

    } catch (err) {
        console.error('Error Dashboard:', err);
        Swal.fire({
            icon: 'error',
            title: 'Gagal Memuat Data',
            text: 'Terjadi kesalahan koneksi atau sesi habis. Silakan login ulang.',
            confirmButtonText: 'Login Ulang',
            allowOutsideClick: false
        }).then(() => {
            logout();
        });
    }
}

// 3. Render Sidebar Profil
function renderProfile(data) {
    // Nama & NISN Sidebar
    const elNama = document.getElementById('nama-siswa');
    const elNisn = document.getElementById('nisn-siswa');
    if (elNama) elNama.innerText = data.nama_lengkap;
    if (elNisn) elNisn.innerText = data.nisn;
    
    // Foto Profil (Fallback jika kosong)
    const imgUrl = data.foto_url || 'https://via.placeholder.com/300x400?text=FOTO';
    document.getElementById('profile-pic').src = imgUrl;
    
    // Update Foto untuk Kartu Tes (PENTING)
    const elPrintPic = document.getElementById('print-foto');
    if (elPrintPic) elPrintPic.src = imgUrl;

    // Badge Jalur & Tab Prestasi Visibility
    const badgeJalur = document.getElementById('badge-jalur');
    const tabPrestasiBtn = document.getElementById('btn-tab-prestasi');
    
    if (badgeJalur) {
        badgeJalur.innerText = data.jalur;
        if (data.jalur === 'PRESTASI') {
            badgeJalur.style.background = '#dbeafe'; badgeJalur.style.color = '#1e40af'; badgeJalur.style.borderColor = '#bfdbfe';
            if(tabPrestasiBtn) tabPrestasiBtn.style.display = 'inline-block';
        } else {
            badgeJalur.style.background = '#dcfce7'; badgeJalur.style.color = '#166534'; badgeJalur.style.borderColor = '#bbf7d0';
            if(tabPrestasiBtn) tabPrestasiBtn.style.display = 'none';
        }
    }

    // Render Tombol Berkas di Sidebar
    renderFileButtons(data);
}

// Helper: Render Tombol Berkas Sidebar
function renderFileButtons(data) {
    const sidebarList = document.getElementById('sidebar-file-list');
    if (!sidebarList) return;
    
    sidebarList.innerHTML = '';

    const addBtn = (url, label, icon) => {
        if(url) {
            // FIX: Menggunakan class 'file-btn-small' agar tampil sebagai tombol, bukan teks biru biasa
            sidebarList.innerHTML += `
                <a href="${url}" target="_blank" class="file-btn-small">
                    <i class="${icon}"></i> ${label}
                </a>`;
        }
    };

    addBtn(data.scan_kk_url, 'Kartu Keluarga', 'ph-file-pdf');
    addBtn(data.scan_akta_url, 'Akta Lahir', 'ph-file-pdf');
    addBtn(data.scan_kelakuan_baik_url, 'SKB / Kelakuan Baik', 'ph-file-pdf');
    addBtn(data.scan_ktp_ortu_url, 'KTP Orang Tua', 'ph-file-pdf');
    
    if(data.scan_sertifikat_prestasi_url) {
        addBtn(data.scan_sertifikat_prestasi_url, 'Sertifikat Prestasi', 'ph-trophy');
    }
}

// 4. Render Data Lengkap (Isi Tab A-D) & INJECT DATA KARTU
function renderFullData(data) {
    const val = (v) => v ? v : '-';
    const money = (v) => v ? 'Rp ' + parseInt(v).toLocaleString('id-ID') : '-';

    const setTxt = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    };
    
    // A. Pribadi
    setTxt('no-daftar', data.no_pendaftaran);
    setTxt('d-nik', val(data.nik));
    setTxt('d-ttl', `${val(data.tempat_lahir)}, ${val(data.tanggal_lahir)}`);
    setTxt('d-jk', val(data.jenis_kelamin));
    setTxt('d-anak', `${val(data.anak_ke)} dari ${val(data.jumlah_saudara)}`);
    setTxt('d-saudara', val(data.jumlah_saudara));
    setTxt('d-status-anak', val(data.status_anak));
    setTxt('d-baju', val(data.ukuran_baju));

    // B. Alamat
    setTxt('d-alamat', val(data.alamat_lengkap));
    setTxt('d-rtrw', `${val(data.rt)} / ${val(data.rw)}`);
    setTxt('d-desa', val(data.desa_kelurahan));
    setTxt('d-kec', val(data.kecamatan));
    setTxt('d-kab', val(data.kabupaten_kota));
    setTxt('d-prov', val(data.provinsi));
    setTxt('d-pos', val(data.kode_pos));

    // C. Keluarga
    setTxt('d-kk', val(data.no_kk));
    setTxt('d-ayah', val(data.nama_ayah));
    setTxt('d-ayah-nik', val(data.nik_ayah));
    setTxt('d-ayah-pend', val(data.pendidikan_ayah));
    setTxt('d-ayah-job', val(data.pekerjaan_ayah));
    setTxt('d-ayah-hasil', money(data.penghasilan_ayah));
    
    setTxt('d-ibu', val(data.nama_ibu));
    setTxt('d-ibu-nik', val(data.nik_ibu));
    setTxt('d-ibu-pend', val(data.pendidikan_ibu));
    setTxt('d-ibu-job', val(data.pekerjaan_ibu));
    setTxt('d-ibu-hasil', money(data.penghasilan_ibu));
    
    setTxt('d-hp', val(data.no_telepon_ortu));

    // D. Sekolah
    setTxt('d-sekolah', val(data.asal_sekolah));
    setTxt('d-npsn', val(data.npsn_sekolah));
    setTxt('d-status-sek', val(data.status_sekolah));
    setTxt('d-alamat-sek', val(data.alamat_sekolah));
    setTxt('d-pesantren', val(data.pilihan_pesantren));

    // --- DATA UNTUK CETAK KARTU (PENTING) ---
    setTxt('print-no', data.no_pendaftaran);
    setTxt('print-nama', data.nama_lengkap);
    setTxt('print-nisn', data.nisn);         // INJECT NISN
    setTxt('print-jk', data.jenis_kelamin);  // INJECT JK
    setTxt('print-sekolah', data.asal_sekolah);
    setTxt('print-ruang', `Ruang ${data.ruang_tes || '-'}`);
}

// 5. Render Tab Prestasi
function renderPrestasiContent(list) {
    const container = document.getElementById('prestasi-list-container');
    if (!container) return;

    if (!list || list.length === 0) {
        container.innerHTML = '<p style="color:#64748b; font-style:italic; padding:20px; text-align:center;">Tidak ada data prestasi yang diinput.</p>';
        return;
    }

    let html = `
        <table class="prestasi-table">
            <thead>
                <tr>
                    <th>Kategori</th>
                    <th>Nama Prestasi</th>
                    <th>Tingkat</th>
                    <th>Tahun</th>
                </tr>
            </thead>
            <tbody>
    `;

    list.forEach(item => {
        html += `
            <tr>
                <td><span class="pres-badge">${item.kategori || '-'}</span></td>
                <td>
                    ${item.nama_lomba}
                    <div style="font-size:0.75rem; color:#64748b; margin-top:2px;">${item.penyelenggara || ''}</div>
                </td>
                <td>${item.tingkat || '-'}</td>
                <td>${item.tahun_perolehan || '-'}</td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

// 6. Render Status & Tombol Cetak
function renderStatus(data) {
    const cardVerif = document.getElementById('card-verif');
    const valVerif = document.getElementById('val-verif');
    const cardLulus = document.getElementById('card-lulus');
    const valLulus = document.getElementById('val-lulus');

    // Status Verifikasi
    if (data.status_verifikasi) {
        cardVerif.className = 'status-card-lg st-green';
        valVerif.innerHTML = '<i class="ph ph-check-circle"></i> BERKAS TERVERIFIKASI';
    } else {
        cardVerif.className = 'status-card-lg st-yellow';
        valVerif.innerHTML = '<i class="ph ph-hourglass"></i> MENUNGGU VERIFIKASI';
    }

    // Status Kelulusan
    if (data.status_kelulusan === 'DITERIMA') {
        cardLulus.className = 'status-card-lg st-green';
        valLulus.innerHTML = '<i class="ph ph-confetti"></i> LULUS SELEKSI';
    } else if (data.status_kelulusan === 'TIDAK DITERIMA') {
        cardLulus.className = 'status-card-lg st-red';
        valLulus.innerHTML = '<i class="ph ph-x-circle"></i> TIDAK LULUS';
    } else {
        cardLulus.className = 'status-card-lg st-blue';
        valLulus.innerHTML = '<i class="ph ph-info"></i> MENUNGGU PENGUMUMAN';
    }

    // Tampilkan Tombol Cetak di Sidebar (Hanya Reguler)
    if (data.jalur === 'REGULER') {
        const btnPrint = document.getElementById('btn-sidebar-cetak');
        if(btnPrint) btnPrint.style.display = 'flex';
    }
}

// 7. Logic Cetak Kartu (Inject Tanggal Real-time)
function cetakKartu() { 
    // Set Tanggal Cetak Otomatis (Hari ini)
    const now = new Date();
    const options = { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    const dateStr = now.toLocaleDateString('id-ID', options) + ' WIB';
    
    // Inject ke HTML sebelum print
    const elDate = document.getElementById('print-date');
    if(elDate) elDate.innerText = dateStr;
    
    window.print(); 
}

// 8. Logic Tab Switching
window.switchTab = function(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    const target = document.getElementById(tabId);
    if(target) target.classList.add('active');
    
    const btns = document.querySelectorAll('.tab-btn');
    btns.forEach(btn => {
        if(btn.getAttribute('onclick').includes(tabId)) {
            btn.classList.add('active');
        }
    });
}

// 9. Edit Data Popup
function editData() {
    Swal.fire({
        title: 'Hubungi Panitia',
        html: `
            <div style="text-align:left; margin-top:10px;">
                <p style="margin-bottom:15px; font-size:0.9rem; color:#666;">Silakan hubungi salah satu panitia berikut untuk mengajukan perbaikan data:</p>
                <a href="https://wa.me/6281323325771" target="_blank" style="display:flex; align-items:center; gap:10px; padding:12px; border-bottom:1px solid #eee; text-decoration:none; color:#1e293b; transition:0.2s;">
                    <i class="ph ph-whatsapp-logo" style="font-size:1.5rem; color:#25D366;"></i>
                    <div><div style="font-weight:700;">Dede Fathul Umam</div><div style="font-size:0.85rem; color:#64748b;">0813-2332-5771</div></div>
                </a>
                <a href="https://wa.me/6281220338298" target="_blank" style="display:flex; align-items:center; gap:10px; padding:12px; border-bottom:1px solid #eee; text-decoration:none; color:#1e293b; transition:0.2s;">
                    <i class="ph ph-whatsapp-logo" style="font-size:1.5rem; color:#25D366;"></i>
                    <div><div style="font-weight:700;">H. Undang Kurniawan</div><div style="font-size:0.85rem; color:#64748b;">0812-2033-8298</div></div>
                </a>
                <a href="https://wa.me/6281287722857" target="_blank" style="display:flex; align-items:center; gap:10px; padding:12px; border-bottom:1px solid #eee; text-decoration:none; color:#1e293b; transition:0.2s;">
                    <i class="ph ph-whatsapp-logo" style="font-size:1.5rem; color:#25D366;"></i>
                    <div><div style="font-weight:700;">Muhammad Ropik Nazib</div><div style="font-size:0.85rem; color:#64748b;">0812-8772-2857</div></div>
                </a>
                <a href="https://wa.me/6282218943383" target="_blank" style="display:flex; align-items:center; gap:10px; padding:12px; border-bottom:1px solid #eee; text-decoration:none; color:#1e293b; transition:0.2s;">
                    <i class="ph ph-whatsapp-logo" style="font-size:1.5rem; color:#25D366;"></i>
                    <div><div style="font-weight:700;">M. Iqbal Abdul Wakil</div><div style="font-size:0.85rem; color:#64748b;">0822-1894-3383</div></div>
                </a>
            </div>
        `,
        showConfirmButton: false, showCloseButton: true
    });
}

// 10. Countdown Timer (From DB)
async function setupCountdown() {
    let targetStr = "2026-05-15T00:00:00"; 
    try {
        const { data } = await db.from('pengaturan').select('value').eq('key', 'TANGGAL_PENGUMUMAN').maybeSingle();
        if (data && data.value) { targetStr = data.value; }
    } catch (e) { console.warn(e); }

    const targetDate = new Date(targetStr).getTime();
    const timer = setInterval(function() {
        const now = new Date().getTime();
        const distance = targetDate - now;
        if (distance < 0) {
            clearInterval(timer);
            const el = document.getElementById("timer");
            if(el) el.innerHTML = "<h3>PENGUMUMAN DIBUKA</h3>";
            return;
        }
        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
        
        const el = document.getElementById("timer");
        if(el) {
            el.innerHTML = `
                <div class="t-box"><span class="t-val">${days}</span><span class="t-lbl">Hari</span></div>
                <div class="t-box"><span class="t-val">${hours}</span><span class="t-lbl">Jam</span></div>
                <div class="t-box"><span class="t-val">${minutes}</span><span class="t-lbl">Menit</span></div>
                <div class="t-box"><span class="t-val">${seconds}</span><span class="t-lbl">Detik</span></div>
            `;
        }
    }, 1000);
}

// Jalankan
loadDashboardData();