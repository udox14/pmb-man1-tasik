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
        renderFullData(pendaftarData);
        renderPrestasiContent(prestasiData);
        renderStatus(pendaftarData);
        
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
    const elNama = document.getElementById('nama-siswa');
    const elNisn = document.getElementById('nisn-siswa');
    if (elNama) elNama.innerText = data.nama_lengkap;
    if (elNisn) elNisn.innerText = data.nisn;
    
    const imgUrl = data.foto_url || 'https://via.placeholder.com/300x400?text=FOTO';
    document.getElementById('profile-pic').src = imgUrl;
    
    const elPrintPic = document.getElementById('print-foto');
    if (elPrintPic) elPrintPic.src = imgUrl;

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

    renderFileButtons(data);
}

function renderFileButtons(data) {
    const sidebarList = document.getElementById('sidebar-file-list');
    if (!sidebarList) return;
    
    sidebarList.innerHTML = '';

    const addBtn = (url, label, icon) => {
        if(url) {
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
    addBtn(data.scan_rapor_url, 'Rapor', 'ph-book-open-text'); 
    if(data.scan_sertifikat_prestasi_url) addBtn(data.scan_sertifikat_prestasi_url, 'Sertifikat Prestasi', 'ph-trophy');
}

// 4. Render Data Lengkap (Isi Tab A-D) & INJECT DATA KARTU
function renderFullData(data) {
    const val = (v) => v ? v : '-';
    const money = (v) => v ? 'Rp ' + parseInt(v).toLocaleString('id-ID') : '-';

    const setTxt = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    };
    
    setTxt('no-daftar', data.no_pendaftaran);
    setTxt('d-nik', val(data.nik));
    setTxt('d-ttl', `${val(data.tempat_lahir)}, ${val(data.tanggal_lahir)}`);
    setTxt('d-jk', val(data.jenis_kelamin));
    setTxt('d-anak', `${val(data.anak_ke)} dari ${val(data.jumlah_saudara)}`);
    setTxt('d-saudara', val(data.jumlah_saudara));
    setTxt('d-status-anak', val(data.status_anak));
    setTxt('d-baju', val(data.ukuran_baju));

    setTxt('d-alamat', val(data.alamat_lengkap));
    setTxt('d-rtrw', `${val(data.rt)} / ${val(data.rw)}`);
    setTxt('d-desa', val(data.desa_kelurahan));
    setTxt('d-kec', val(data.kecamatan));
    setTxt('d-kab', val(data.kabupaten_kota));
    setTxt('d-prov', val(data.provinsi));
    setTxt('d-pos', val(data.kode_pos));

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

    setTxt('d-sekolah', val(data.asal_sekolah));
    setTxt('d-npsn', val(data.npsn_sekolah));
    setTxt('d-status-sek', val(data.status_sekolah));
    setTxt('d-alamat-sek', val(data.alamat_sekolah));
    setTxt('d-pesantren', val(data.pilihan_pesantren));

    setTxt('print-no', data.no_pendaftaran);
    setTxt('print-nama', data.nama_lengkap);
    setTxt('print-nisn', data.nisn);
    setTxt('print-jk', data.jenis_kelamin);
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

    let html = `<table class="prestasi-table"><thead><tr><th>Kategori</th><th>Nama Prestasi</th><th>Tingkat</th><th>Tahun</th></tr></thead><tbody>`;

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

// 6. RENDER STATUS & NOTIFIKASI
function renderStatus(data) {
    const cardVerif = document.getElementById('card-verif');
    const valVerif = document.getElementById('val-verif');
    const cardLulus = document.getElementById('card-lulus');
    const valLulus = document.getElementById('val-lulus');
    
    // Reset Notifikasi
    const alertUndangan = document.getElementById('alert-undangan-prestasi');
    const alertGagal = document.getElementById('alert-gagal-prestasi');
    if(alertUndangan) alertUndangan.style.display = 'none';
    if(alertGagal) alertGagal.style.display = 'none';

    // A. STATUS VERIFIKASI BERKAS
    if (data.status_verifikasi === true) {
        cardVerif.className = 'status-card-lg st-green';
        valVerif.innerHTML = '<i class="ph ph-check-circle"></i> BERKAS DITERIMA';
        
        if (data.jalur === 'PRESTASI' && data.status_kelulusan === 'PENDING') {
             if(alertUndangan) alertUndangan.style.display = 'block';
        }

    } else if (data.status_verifikasi === false) {
        cardVerif.className = 'status-card-lg st-red';
        valVerif.innerHTML = '<i class="ph ph-x-circle"></i> BERKAS DITOLAK';

        if (data.jalur === 'PRESTASI') {
             if(alertGagal) alertGagal.style.display = 'block';
        }
    } else {
        cardVerif.className = 'status-card-lg st-yellow';
        valVerif.innerHTML = '<i class="ph ph-hourglass"></i> MENUNGGU VERIFIKASI';
    }

    // B. STATUS KELULUSAN AKHIR
    if (data.jalur === 'PRESTASI' && data.status_kelulusan === 'TIDAK DITERIMA') {
        cardLulus.className = 'status-card-lg st-yellow'; 
        valLulus.innerHTML = `
            <div style="font-size:0.9rem; line-height:1.2; text-align:right;">
                <span style="color:#d97706;">BELUM LOLOS PRESTASI</span><br>
                <small style="color:#1e293b;">Silakan alihkan ke Jalur Reguler</small>
            </div>
        `;

        const container = document.querySelector('main');
        if (!document.getElementById('alert-alih-jalur')) {
            const alertDiv = document.createElement('div');
            alertDiv.id = 'alert-alih-jalur';
            alertDiv.className = 'notif-box';
            alertDiv.style = "background:#eff6ff; border:1px solid #bfdbfe; display:block; margin-top:20px;";
            alertDiv.innerHTML = `
                <h3 class="notif-title" style="color:#1e40af;"><i class="ph ph-info"></i> Informasi Penting</h3>
                <p class="notif-body" style="color:#1e3a8a;">
                    Mohon maaf, Anda belum lolos di Jalur Prestasi.<br>
                    Namun, Anda <strong>OTOMATIS BERHAK</strong> mengikuti seleksi Jalur Reguler menggunakan nilai Rapor (Tanpa Tes Tulis).
                </p>
                <button onclick="prosesPengalihanReguler('${data.id}')" class="btn btn-primary" style="background:#2563eb; width:100%; justify-content:center;">
                    AMBIL JALUR REGULER &nbsp; <i class="ph ph-arrow-right"></i>
                </button>
            `;
            const timer = document.querySelector('.timer-banner');
            timer.parentNode.insertBefore(alertDiv, timer.nextSibling);
        }

    } else if (data.status_kelulusan === 'DITERIMA') {
        cardLulus.className = 'status-card-lg st-green';
        valLulus.innerHTML = '<i class="ph ph-confetti"></i> LULUS SELEKSI';
    } else if (data.status_kelulusan === 'TIDAK DITERIMA') {
        cardLulus.className = 'status-card-lg st-red';
        valLulus.innerHTML = '<i class="ph ph-x-circle"></i> TIDAK LULUS';
    } else {
        cardLulus.className = 'status-card-lg st-blue';
        valLulus.innerHTML = '<i class="ph ph-info"></i> MENUNGGU PENGUMUMAN';
    }

    // C. CETAK KARTU DAN INFO BEBAS TES
    const btnPrint = document.getElementById('btn-sidebar-cetak');
    const oldInfo = document.getElementById('info-bebas-tes');
    if (oldInfo) oldInfo.remove();

    if (data.jalur === 'REGULER') {
        if (data.ruang_tes) {
            // Punya Ruangan -> Berarti dia jalur Reguler asli ATAU pindahan dari gagal berkas prestasi (wajib tes)
            if(btnPrint) btnPrint.style.display = 'flex';
        } else {
            // TIDAK Punya Ruangan -> Berarti dia pindahan dari gagal tes prestasi (Bebas Tes)
            if(btnPrint) btnPrint.style.display = 'none';

            // Inject info bebas tes
            const timerBanner = document.querySelector('.timer-banner');
            const infoBox = document.createElement('div');
            infoBox.id = 'info-bebas-tes';
            infoBox.style = "background:#eff6ff; border:1px solid #bfdbfe; color:#1e40af; padding:20px; border-radius:12px; margin-bottom:20px; text-align:left; animation: fadeIn 0.5s ease;";
            infoBox.innerHTML = `
                <h4 style="margin:0 0 8px 0; display:flex; align-items:center; gap:8px; font-size:1.1rem;">
                    <i class="ph ph-info" style="font-size:1.4rem;"></i> Informasi Ujian
                </h4>
                <p style="margin:0; font-size:0.95rem; line-height:1.5;">
                    Status Anda saat ini: <strong>Jalur Reguler</strong>.<br>
                    Tombol "Cetak Kartu Tes" tidak tersedia karena Anda dinyatakan <strong>BEBAS TES TULIS (CBT)</strong> sebagai bentuk pengalihan dari Jalur Prestasi (Seleksi menggunakan Nilai Rapor).<br><br>
                    Silakan pantau terus dashboard ini untuk pengumuman kelulusan.
                </p>
            `;
            if(timerBanner) timerBanner.parentNode.insertBefore(infoBox, timerBanner.nextSibling);
        }
    } else {
        if(btnPrint) btnPrint.style.display = 'none';
    }
}

// 7. FUNGSI PENGALIHAN OTOMATIS (Gagal Tes Prestasi -> Bebas Tes)
window.prosesPengalihanReguler = async function(id) {
    const confirm = await Swal.fire({
        title: 'Lanjut Jalur Reguler?',
        text: "Data Anda akan dipindahkan ke Jalur Reguler. Anda tidak perlu mengikuti tes tulis.",
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Ya, Lanjutkan',
        cancelButtonText: 'Batal'
    });

    if (confirm.isConfirmed) {
        Swal.showLoading();
        try {
            const { error } = await db.from('pendaftar')
                .update({ 
                    jalur: 'REGULER',
                    status_kelulusan: 'PENDING',
                    status_verifikasi: true // Berkas sudah diverifikasi
                    // ruang_tes dibiarkan NULL agar terdeteksi bebas tes
                })
                .eq('id', id);

            if (error) throw error;

            Swal.fire('Berhasil', 'Status Anda telah dialihkan ke Jalur Reguler. Silakan tunggu pengumuman kelulusan reguler.', 'success')
                .then(() => location.reload());

        } catch (e) {
            console.error(e);
            Swal.fire('Gagal', 'Gagal memproses data.', 'error');
        }
    }
}

// 8. FUNGSI PINDAH JALUR AWAL (Gagal Verifikasi Berkas -> Wajib Tes)
window.pindahKeRegulerTrigger = async function() {
    const confirm = await Swal.fire({
        title: 'Pindah ke Jalur Reguler?',
        text: "Anda akan pindah ke jalur reguler dan wajib mengikuti tes.",
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Ya, Pindah',
        cancelButtonText: 'Batal'
    });

    if (confirm.isConfirmed) {
        Swal.showLoading();
        try {
            if (!userSession || !userSession.id) throw new Error("ID User tidak ditemukan.");

            // Kalkulasi Ruangan Tes secara manual (Sama dengan logika Trigger Postgres)
            const { data: pData, error: errFetch } = await db.from('pendaftar').select('no_pendaftaran').eq('id', userSession.id).single();
            if (errFetch) throw errFetch;

            const seqVal = parseInt(pData.no_pendaftaran.substring(4), 10);
            const ruangTesBaru = Math.floor((seqVal - 1) / 20) + 1;
            
            const { error } = await db.from('pendaftar')
                .update({ 
                    jalur: 'REGULER',
                    status_verifikasi: null, // Reset biar diverifikasi ulang oleh admin
                    ruang_tes: ruangTesBaru  // MEMBERIKAN RUANGAN agar bisa cetak kartu tes
                })
                .eq('id', userSession.id);

            if (error) throw error;
            Swal.fire('Berhasil', 'Anda kini terdaftar di Jalur Reguler dan bisa mencetak kartu tes.', 'success').then(() => location.reload());

        } catch (e) {
            console.error(e);
            Swal.fire('Gagal', e.message, 'error');
        }
    }
}

// 9. Logic Tab Switching
window.switchTab = function(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    const btns = document.querySelectorAll('.tab-btn');
    btns.forEach(btn => { if(btn.getAttribute('onclick').includes(tabId)) btn.classList.add('active'); });
}

function cetakKartu() { 
    const now = new Date();
    const options = { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    document.getElementById('print-date').innerText = now.toLocaleDateString('id-ID', options) + ' WIB';
    window.print(); 
}

function editData() {
    Swal.fire({
        title: 'Hubungi Panitia',
        html: `
            <div style="text-align:left; margin-top:10px;">
                <p style="margin-bottom:15px; font-size:0.9rem; color:#666;">Untuk perbaikan data, silakan hubungi panitia:</p>
                <a href="https://wa.me/6281323325771" target="_blank" style="display:flex; align-items:center; gap:10px; padding:12px; border-bottom:1px solid #eee; text-decoration:none; color:#1e293b;">
                    <i class="ph ph-whatsapp-logo" style="font-size:1.5rem; color:#25D366;"></i><div><strong>Dede Fathul Umam</strong><br>0813-2332-5771</div>
                </a>
                <a href="https://wa.me/6281220338298" target="_blank" style="display:flex; align-items:center; gap:10px; padding:12px; border-bottom:1px solid #eee; text-decoration:none; color:#1e293b;">
                    <i class="ph ph-whatsapp-logo" style="font-size:1.5rem; color:#25D366;"></i><div><strong>H. Undang Kurniawan</strong><br>0812-2033-8298</div>
                </a>
            </div>
        `,
        showConfirmButton: false, showCloseButton: true
    });
}

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
            if(document.getElementById("timer")) document.getElementById("timer").innerHTML = "<h3>PENGUMUMAN DIBUKA</h3>";
            return;
        }
        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
        
        if(document.getElementById("timer")) {
            document.getElementById("timer").innerHTML = `<div class="t-box"><span class="t-val">${days}</span><span class="t-lbl">Hari</span></div><div class="t-box"><span class="t-val">${hours}</span><span class="t-lbl">Jam</span></div><div class="t-box"><span class="t-val">${minutes}</span><span class="t-lbl">Menit</span></div><div class="t-box"><span class="t-val">${seconds}</span><span class="t-lbl">Detik</span></div>`;
        }
    }, 1000);
}

loadDashboardData();