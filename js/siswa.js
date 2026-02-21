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

        const { data: pendaftarData, error: errorPendaftar } = await db
            .from('pendaftar')
            .select('*')
            .eq('id', userSession.id)
            .single();

        if (errorPendaftar) throw errorPendaftar;
        if (!pendaftarData) throw new Error("Data siswa tidak ditemukan.");

        let prestasiData = [];
        if (pendaftarData.jalur === 'PRESTASI' || pendaftarData.scan_sertifikat_prestasi_url) {
            const { data: pres, error: errorPres } = await db
                .from('prestasi')
                .select('*')
                .eq('pendaftar_id', userSession.id);
            
            if (!errorPres && pres) prestasiData = pres;
        }

        renderProfile(pendaftarData);
        renderFullData(pendaftarData);
        renderPrestasiContent(prestasiData);
        renderStatus(pendaftarData);
        
        // PANGGIL SMART COUNTDOWN
        setupSmartCountdown(pendaftarData);

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
            // Munculkan tab prestasi jika dia limpahan (punya URL sertifikat)
            if(tabPrestasiBtn) {
                tabPrestasiBtn.style.display = data.scan_sertifikat_prestasi_url ? 'inline-block' : 'none';
            }
        }
    }

    renderFileButtons(data);
}

function renderFileButtons(data) {
    const sidebarList = document.getElementById('sidebar-file-list');
    if (!sidebarList) return;
    
    sidebarList.innerHTML = '';
    const addBtn = (url, label, icon) => {
        if(url) { sidebarList.innerHTML += `<a href="${url}" target="_blank" class="file-btn-small"><i class="${icon}"></i> ${label}</a>`; }
    };
    addBtn(data.scan_kk_url, 'Kartu Keluarga', 'ph-file-pdf');
    addBtn(data.scan_akta_url, 'Akta Lahir', 'ph-file-pdf');
    addBtn(data.scan_kelakuan_baik_url, 'SKB / Kelakuan Baik', 'ph-file-pdf');
    addBtn(data.scan_ktp_ortu_url, 'KTP Orang Tua', 'ph-file-pdf');
    addBtn(data.scan_rapor_url, 'Rapor', 'ph-book-open-text'); 
    if(data.scan_sertifikat_prestasi_url) addBtn(data.scan_sertifikat_prestasi_url, 'Sertifikat Prestasi', 'ph-trophy');
}

// 4. Render Data Lengkap & INJECT DATA KARTU JADWAL BARU
function renderFullData(data) {
    const val = (v) => v ? v : '-';
    const money = (v) => v ? 'Rp ' + parseInt(v).toLocaleString('id-ID') : '-';
    const setTxt = (id, text) => { const el = document.getElementById(id); if (el) el.innerText = text; };
    
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

    // --- DATA KARTU TES (DINAMIS SESUAI JADWAL ADMIN) ---
    setTxt('print-no', data.no_pendaftaran);
    setTxt('print-nama', data.nama_lengkap);
    setTxt('print-nisn', data.nisn);
    setTxt('print-jk', data.jenis_kelamin);
    setTxt('print-sekolah', data.asal_sekolah);
    
    setTxt('print-ruang', data.ruang_tes || '-');
    const waktuTes = (data.tanggal_tes && data.sesi_tes) ? `${data.tanggal_tes}, ${data.sesi_tes}` : '-';
    setTxt('print-waktu', waktuTes);
}

function renderPrestasiContent(list) {
    const container = document.getElementById('prestasi-list-container');
    if (!container) return;
    if (!list || list.length === 0) {
        container.innerHTML = '<p style="color:#64748b; font-style:italic; padding:20px; text-align:center;">Tidak ada data prestasi yang diinput.</p>';
        return;
    }
    let html = `<table class="prestasi-table"><thead><tr><th>Kategori</th><th>Nama Prestasi</th><th>Tingkat</th><th>Tahun</th></tr></thead><tbody>`;
    list.forEach(item => {
        html += `<tr><td><span class="pres-badge">${item.kategori || '-'}</span></td><td>${item.nama_lomba}<div style="font-size:0.75rem; color:#64748b; margin-top:2px;">${item.penyelenggara || ''}</div></td><td>${item.tingkat || '-'}</td><td>${item.tahun_perolehan || '-'}</td></tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
}

// 6. RENDER STATUS & JADWAL LOGIC
function renderStatus(data) {
    const cardVerif = document.getElementById('card-verif');
    const valVerif = document.getElementById('val-verif');
    const cardLulus = document.getElementById('card-lulus');
    const valLulus = document.getElementById('val-lulus');
    
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

    // C. LOGIKA CETAK KARTU (BERDASARKAN JADWAL MANUAL)
    const btnPrint = document.getElementById('btn-sidebar-cetak');
    
    // Clear old boxes
    ['info-bebas-tes', 'info-tunggu-verif', 'info-tunggu-jadwal'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.remove();
    });

    const timerBanner = document.querySelector('.timer-banner');

    if (data.jalur === 'REGULER') {
        if (data.status_verifikasi === true) {
            
            // CEK APAKAH SUDAH DIJADWALKAN ADMIN?
            if (data.ruang_tes && data.tanggal_tes && data.sesi_tes) {
                // JADWAL LENGKAP -> BOLEH CETAK KARTU
                if(btnPrint) btnPrint.style.display = 'flex';
                
            } else if (!data.ruang_tes && !data.tanggal_tes) {
                // TIDAK ADA JADWAL
                if(btnPrint) btnPrint.style.display = 'none';

                // CEK APAKAH LIMPAHAN PRESTASI (Bebas Tes) ATAU REGULER MURNI
                const isBebasTes = data.scan_sertifikat_prestasi_url ? true : false;
                
                const infoBox = document.createElement('div');
                infoBox.style = "padding:20px; border-radius:12px; margin-bottom:20px; text-align:left; animation: fadeIn 0.5s ease;";
                
                if (isBebasTes) {
                    infoBox.id = 'info-bebas-tes';
                    infoBox.style.background = '#eff6ff';
                    infoBox.style.borderColor = '#bfdbfe';
                    infoBox.style.borderWidth = '1px';
                    infoBox.style.borderStyle = 'solid';
                    infoBox.style.color = '#1e40af';
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
                } else {
                    infoBox.id = 'info-tunggu-jadwal';
                    infoBox.style.background = '#fffbeb';
                    infoBox.style.borderColor = '#fcd34d';
                    infoBox.style.borderWidth = '1px';
                    infoBox.style.borderStyle = 'solid';
                    infoBox.style.color = '#b45309';
                    infoBox.innerHTML = `
                        <h4 style="margin:0 0 8px 0; display:flex; align-items:center; gap:8px; font-size:1.1rem;">
                            <i class="ph ph-calendar-blank" style="font-size:1.4rem;"></i> Jadwal CBT Belum Tersedia
                        </h4>
                        <p style="margin:0; font-size:0.95rem; line-height:1.5;">
                            Berkas Anda sudah dinyatakan <strong>VALID</strong>, namun Panitia belum mengatur Jadwal dan Ruangan Ujian CBT Anda.<br>
                            Silakan cek halaman ini secara berkala. Tombol Cetak Kartu akan muncul setelah jadwal Anda tersedia.
                        </p>
                    `;
                }
                if(timerBanner) timerBanner.parentNode.insertBefore(infoBox, timerBanner.nextSibling);
            }

        } else {
            // BELUM DIVERIFIKASI (Pending/Tolak)
            if(btnPrint) btnPrint.style.display = 'none';

            if (data.status_verifikasi === null) {
                const infoBox = document.createElement('div');
                infoBox.id = 'info-tunggu-verif';
                infoBox.style = "background:#fffbeb; border:1px solid #fcd34d; color:#b45309; padding:20px; border-radius:12px; margin-bottom:20px; text-align:left; animation: fadeIn 0.5s ease;";
                infoBox.innerHTML = `
                    <h4 style="margin:0 0 8px 0; display:flex; align-items:center; gap:8px; font-size:1.1rem;">
                        <i class="ph ph-warning-circle" style="font-size:1.4rem;"></i> Informasi Ujian
                    </h4>
                    <p style="margin:0; font-size:0.95rem; line-height:1.5;">
                        Tombol <strong>Cetak Kartu Ujian</strong> belum tersedia. Silakan tunggu hingga berkas pendaftaran Anda selesai diverifikasi oleh panitia.
                    </p>
                `;
                if(timerBanner) timerBanner.parentNode.insertBefore(infoBox, timerBanner.nextSibling);
            }
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
                    status_verifikasi: true,
                    ruang_tes: null, tanggal_tes: null, sesi_tes: null
                })
                .eq('id', id);

            if (error) throw error;
            Swal.fire('Berhasil', 'Status Anda telah dialihkan ke Jalur Reguler. Silakan tunggu pengumuman kelulusan reguler.', 'success').then(() => location.reload());

        } catch (e) {
            Swal.fire('Gagal', 'Gagal memproses data.', 'error');
        }
    }
}

window.pindahKeRegulerTrigger = async function() {
    const confirm = await Swal.fire({
        title: 'Pindah ke Jalur Reguler?',
        text: "Anda akan pindah ke jalur reguler. Jadwal CBT akan diberikan setelah berkas Anda diverifikasi ulang oleh admin.",
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Ya, Pindah',
        cancelButtonText: 'Batal'
    });

    if (confirm.isConfirmed) {
        Swal.showLoading();
        try {
            if (!userSession || !userSession.id) throw new Error("ID User tidak ditemukan.");

            const { error } = await db.from('pendaftar')
                .update({ 
                    jalur: 'REGULER',
                    status_verifikasi: null, 
                    ruang_tes: null, tanggal_tes: null, sesi_tes: null 
                })
                .eq('id', userSession.id);

            if (error) throw error;
            Swal.fire('Berhasil', 'Anda kini terdaftar di Jalur Reguler. Silakan tunggu verifikasi admin.', 'success').then(() => location.reload());

        } catch (e) {
            Swal.fire('Gagal', e.message, 'error');
        }
    }
}

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

// ==============================================================
// 10. SMART COUNTDOWN LOGIC (HITUNG MUNDUR PINTAR)
// ==============================================================
let countdownInterval;

// Helper Parse Tanggal CBT (Format "Kamis, 21 Mei 2026" & "Sesi 1 (07.30 - 09.30 WIB)")
function parseExamDate(tglStr, sesiStr) {
    try {
        if (!tglStr || !sesiStr) return null;
        let datePart = tglStr.split(',')[1]?.trim() || tglStr; 
        const months = {"Januari":"01", "Februari":"02", "Maret":"03", "April":"04", "Mei":"05", "Juni":"06", "Juli":"07", "Agustus":"08", "September":"09", "Oktober":"10", "November":"11", "Desember":"12"};
        for(let m in months) { datePart = datePart.replace(m, months[m]); }
        
        let parts = datePart.split(' '); 
        let day = parts[0].padStart(2, '0');
        let month = parts[1];
        let year = parts[2];

        let timeMatch = sesiStr.match(/(\d{2})\.(\d{2})/);
        let timePart = timeMatch ? `${timeMatch[1]}:${timeMatch[2]}:00` : "07:00:00";

        return `${year}-${month}-${day}T${timePart}`;
    } catch(e) {
        return null;
    }
}

async function setupSmartCountdown(pendaftar) {
    const banner = document.querySelector('.timer-banner');
    if (!banner) return;

    // Sembunyikan timer jika berkas masih pending/ditolak
    if (pendaftar.status_verifikasi !== true) {
        banner.style.display = 'none';
        return;
    }

    // Default Pengumuman dari Database
    let tglPres = "2026-04-18T00:00:00"; 
    let tglReg = "2026-05-25T00:00:00";
    try {
        const { data } = await db.from('pengaturan').select('*').in('key', ['TANGGAL_PENGUMUMAN_PRESTASI', 'TANGGAL_PENGUMUMAN_REGULER']);
        if (data) {
            data.forEach(item => {
                if(item.key === 'TANGGAL_PENGUMUMAN_PRESTASI') tglPres = item.value;
                if(item.key === 'TANGGAL_PENGUMUMAN_REGULER') tglReg = item.value;
            });
        }
    } catch (e) { console.warn("Gagal load tanggal dari db", e); }

    const now = new Date().getTime();
    let targetDate = null;
    let titleText = "";
    let subText = "";

    const isBebasTes = (pendaftar.jalur === 'REGULER' && pendaftar.scan_sertifikat_prestasi_url);

    // LOGIKA PENENTUAN TARGET TANGGAL
    if (pendaftar.jalur === 'PRESTASI') {
        const tesPresDate = new Date("2026-04-16T07:30:00").getTime();
        if (now < tesPresDate) {
            targetDate = tesPresDate;
            titleText = "Menuju Tes Pembuktian Prestasi";
            subText = "Harap hadir di kampus MAN 1 Tasikmalaya";
        } else {
            targetDate = new Date(tglPres).getTime();
            titleText = "Menuju Pengumuman Hasil Prestasi";
            subText = "Hasil Seleksi Jalur Prestasi";
        }
    } else if (pendaftar.jalur === 'REGULER') {
        if (isBebasTes) {
            targetDate = new Date(tglReg).getTime();
            titleText = "Menuju Pengumuman Kelulusan Akhir";
            subText = "Seleksi Menggunakan Nilai Rapor (Bebas Tes)";
        } else {
            if (pendaftar.tanggal_tes && pendaftar.sesi_tes) {
                let examDateStr = parseExamDate(pendaftar.tanggal_tes, pendaftar.sesi_tes);
                let examTime = examDateStr ? new Date(examDateStr).getTime() : 0;
                
                if (examTime > now) {
                    targetDate = examTime;
                    titleText = "Menuju Ujian CBT Anda";
                    subText = `${pendaftar.tanggal_tes} - ${pendaftar.sesi_tes.split('(')[0].trim()}`;
                } else {
                    targetDate = new Date(tglReg).getTime();
                    titleText = "Menuju Pengumuman Kelulusan Akhir";
                    subText = "Hasil Seleksi Jalur Reguler";
                }
            } else {
                targetDate = new Date(tglReg).getTime();
                titleText = "Menuju Pengumuman Kelulusan Akhir";
                subText = "Jadwal ujian belum tersedia, pantau terus";
            }
        }
    }

    // UPDATE UI TEKS
    const titleEl = banner.querySelector('h2');
    const subEl = banner.querySelector('p');
    if (titleEl) titleEl.innerText = titleText;
    if (subEl) subEl.innerText = subText;
    
    // START INTERVAL TIMER
    if (countdownInterval) clearInterval(countdownInterval);
    
    countdownInterval = setInterval(function() {
        const currentNow = new Date().getTime();
        const distance = targetDate - currentNow;
        
        if (distance < 0) {
            clearInterval(countdownInterval);
            if(document.getElementById("timer")) document.getElementById("timer").innerHTML = `<h3 style="margin:0; padding:10px 20px; background:rgba(255,255,255,0.2); border-radius:10px;">WAKTU TELAH TIBA</h3>`;
            return;
        }
        
        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
        
        if(document.getElementById("timer")) {
            document.getElementById("timer").innerHTML = `
                <div class="t-box"><span class="t-val">${days}</span><span class="t-lbl">Hari</span></div>
                <div class="t-box"><span class="t-val">${hours}</span><span class="t-lbl">Jam</span></div>
                <div class="t-box"><span class="t-val">${minutes}</span><span class="t-lbl">Menit</span></div>
                <div class="t-box"><span class="t-val">${seconds}</span><span class="t-lbl">Detik</span></div>
            `;
        }
    }, 1000);
    
    banner.style.display = 'flex'; // Pastikan terlihat jika sudah valid
}

loadDashboardData();