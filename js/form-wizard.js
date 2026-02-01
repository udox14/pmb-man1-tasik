// js/form-wizard.js

// --- PENGAMAN UTAMA ---
// Cek apakah kita sedang berada di halaman yang memiliki Formulir Pendaftaran (pmbForm)
if (!document.getElementById('pmbForm')) {
    // Berhenti di sini jika bukan halaman formulir
} else {
    initFormPage();
}

function initFormPage() {
    // 1. Cek Sesi (User tidak boleh buka link ini langsung tanpa cek NISN di depan)
    const urlParams = new URLSearchParams(window.location.search);
    let nisnSesi = localStorage.getItem('pmb_nisn');
    let jalurSesi = localStorage.getItem('pmb_jalur');

    // Fallback: Jika LocalStorage kosong, coba ambil dari URL
    if (!nisnSesi) nisnSesi = urlParams.get('nisn');
    if (!jalurSesi) jalurSesi = urlParams.get('jalur');

    // VALIDASI KETAT: Jika data tidak ada, tendang ke landing page
    if (!nisnSesi || !jalurSesi) {
        alert('Akses ditolak. Silakan masukkan NISN di halaman utama.');
        window.location.href = 'index.html';
        return; // Stop
    } else {
        // Simpan ulang ke storage agar aman saat refresh
        localStorage.setItem('pmb_nisn', nisnSesi);
        localStorage.setItem('pmb_jalur', jalurSesi);
    }

    // Set Info di Header (Hidden Input)
    const nisnField = document.getElementById('nisn');
    if (nisnField) nisnField.value = nisnSesi;

    // Variabel Kontrol Wizard Global
    window.currentStep = 1;
    window.totalStep = 4; 
    
    if (jalurSesi === 'PRESTASI') {
        window.totalStep = 5; 
        const stepIcon5 = document.getElementById('step-icon-5');
        if (stepIcon5) stepIcon5.style.display = 'flex';
        // Init UI Prestasi jika jalur prestasi
        setTimeout(initPrestasiUI, 500); 
    }

    // Load Data Wilayah & Restore Draft
    initWilayah();
    setupAutoSave();

    // --- LOGIKA TOMBOL KELUAR (KONFIRMASI HAPUS DATA) ---
    const btnBack = document.querySelector('header .nav-actions .btn-secondary');
    if(btnBack) {
        btnBack.addEventListener('click', (e) => {
            e.preventDefault(); // Jangan langsung pindah halaman
            
            Swal.fire({
                title: 'Batalkan Pendaftaran?',
                text: "PERHATIAN: Jika Anda keluar sekarang, seluruh data yang sudah Anda ketik akan DIHAPUS. (Jika hanya refresh browser, data aman).",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Ya, Keluar & Hapus Data',
                cancelButtonText: 'Lanjut Mengisi',
                confirmButtonColor: '#d33',
                cancelButtonColor: '#3085d6'
            }).then((result) => {
                if (result.isConfirmed) {
                    // Hapus Draft & Sesi
                    clearDraftData();
                    localStorage.removeItem('pmb_jalur');
                    localStorage.removeItem('pmb_nisn');
                    // Kembali ke Landing Page
                    window.location.href = 'index.html';
                }
            });
        });
    }
}

// --- FUNGSI API WILAYAH (DENGAN AUTO-RESTORE DRAFT) ---
const API_BASE = 'https://www.emsifa.com/api-wilayah-indonesia/api';

async function fetchWilayah(endpoint) {
    try {
        const response = await fetch(`${API_BASE}/${endpoint}.json`);
        return await response.json();
    } catch (error) {
        console.error('Gagal ambil wilayah:', error);
        return [];
    }
}

async function initWilayah() {
    const provinces = await fetchWilayah('provinces');
    const select = document.getElementById('provinsi');
    if(!select) return;
    
    select.innerHTML = '<option value="">- Pilih Provinsi -</option>';
    provinces.forEach(p => {
        select.innerHTML += `<option value="${p.id}" data-name="${p.name}">${p.name}</option>`;
    });

    // RESTORE PROVINSI
    const savedProv = localStorage.getItem('draft_provinsi');
    if (savedProv) {
        select.value = savedProv;
        loadKabupaten(); 
    }
}

// (Fungsi loadKabupaten harus ada di window scope agar bisa dipanggil onchange HTML)
window.loadKabupaten = async function() {
    const provId = document.getElementById('provinsi').value;
    const select = document.getElementById('kabupaten');
    select.innerHTML = '<option value="">Loading...</option>'; select.disabled = true;
    
    // Simpan Draft
    localStorage.setItem('draft_provinsi', provId);

    if (provId) {
        const data = await fetchWilayah(`regencies/${provId}`);
        select.innerHTML = '<option value="">- Pilih Kota/Kab -</option>';
        data.forEach(d => select.innerHTML += `<option value="${d.id}" data-name="${d.name}">${d.name}</option>`);
        select.disabled = false;

        // RESTORE KABUPATEN
        const savedKab = localStorage.getItem('draft_kabupaten');
        if (savedKab && select.querySelector(`option[value="${savedKab}"]`)) {
            select.value = savedKab;
            loadKecamatan();
        }
    }
}

window.loadKecamatan = async function() {
    const kabId = document.getElementById('kabupaten').value;
    const select = document.getElementById('kecamatan');
    select.innerHTML = '<option value="">Loading...</option>'; select.disabled = true;
    
    // Simpan Draft
    localStorage.setItem('draft_kabupaten', kabId);

    if (kabId) {
        const data = await fetchWilayah(`districts/${kabId}`);
        select.innerHTML = '<option value="">- Pilih Kecamatan -</option>';
        data.forEach(d => select.innerHTML += `<option value="${d.id}" data-name="${d.name}">${d.name}</option>`);
        select.disabled = false;

        // RESTORE KECAMATAN
        const savedKec = localStorage.getItem('draft_kecamatan');
        if (savedKec && select.querySelector(`option[value="${savedKec}"]`)) {
            select.value = savedKec;
            loadDesa();
        }
    }
}

window.loadDesa = async function() {
    const kecId = document.getElementById('kecamatan').value;
    const select = document.getElementById('desa');
    select.innerHTML = '<option value="">Loading...</option>'; select.disabled = true;
    
    // Simpan Draft
    localStorage.setItem('draft_kecamatan', kecId);

    if (kecId) {
        const data = await fetchWilayah(`villages/${kecId}`);
        select.innerHTML = '<option value="">- Pilih Desa/Kel -</option>';
        data.forEach(d => select.innerHTML += `<option value="${d.id}" data-name="${d.name}">${d.name}</option>`);
        select.disabled = false;

        // RESTORE DESA
        const savedDesa = localStorage.getItem('draft_desa');
        if (savedDesa && select.querySelector(`option[value="${savedDesa}"]`)) {
            select.value = savedDesa;
        }
    }
}

// Handler khusus untuk menyimpan Desa saat dipilih
document.addEventListener('change', function(e) {
    if (e.target && e.target.id === 'desa') {
        localStorage.setItem('draft_desa', e.target.value);
    }
});

// --- LOGIKA WIZARD ---
window.showStep = function(step) {
    document.querySelectorAll('.form-section').forEach(el => el.classList.remove('active'));
    document.getElementById(`section-${step}`).classList.add('active');
    
    document.querySelectorAll('.wizard-step').forEach((el, index) => {
        if (index + 1 === step) el.classList.add('active');
        else if (index + 1 < step) el.classList.add('finished');
        else el.classList.remove('active', 'finished');
    });

    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    const btnSubmit = document.getElementById('btn-submit');

    if(btnPrev) btnPrev.style.display = step === 1 ? 'none' : 'inline-flex';
    
    if (step === window.totalStep) {
        if(btnNext) btnNext.style.display = 'none';
        if(btnSubmit) btnSubmit.style.display = 'inline-flex';
    } else {
        if(btnNext) btnNext.style.display = 'inline-flex';
        if(btnSubmit) btnSubmit.style.display = 'none';
    }
}

// --- VALIDASI VISUAL (BORDER MERAH, BACKGROUND PUTIH) ---
function validateSection(step) {
    const section = document.getElementById(`section-${step}`);
    const inputs = section.querySelectorAll('input[required], select[required], textarea[required]');
    let isValid = true;

    inputs.forEach(input => {
        let isEmpty = !input.value;
        if (input.type === 'file') {
            isEmpty = input.files.length === 0;
        }

        const errorBorder = '#ef4444';
        const errorBg = '#fff5f5';
        const normalBorder = '#cbd5e1';
        const normalBg = '#ffffff';
        const fileBg = '#f0fdfa';

        if (isEmpty) {
            isValid = false;
            
            // JIKA INPUT FILE: Beri BORDER MERAH pada parent card
            if (input.type === 'file' && input.parentElement.classList.contains('upload-card-item')) {
                input.parentElement.style.borderColor = errorBorder;
                input.parentElement.style.backgroundColor = normalBg; 
                
                const statusSpan = input.parentElement.querySelector('.upload-status-text');
                if (statusSpan) { 
                    statusSpan.innerText = "Wajib diisi!"; 
                    statusSpan.style.color = errorBorder; 
                    statusSpan.style.fontWeight = 'bold';
                }
            } else {
                // INPUT BIASA
                input.style.borderColor = errorBorder;
                input.style.backgroundColor = errorBg;
            }
        } else {
            // RESET STYLE JIKA VALID
            if (input.type === 'file' && input.parentElement.classList.contains('upload-card-item')) {
                // Reset border merah ke normal/hijau
                if(input.parentElement.style.borderColor === 'rgb(239, 68, 68)' || input.parentElement.style.borderColor === '#ef4444') {
                     input.parentElement.style.borderColor = 'var(--primary)'; 
                     input.parentElement.style.backgroundColor = fileBg; 
                }
            } else {
                input.style.borderColor = normalBorder;
                input.style.backgroundColor = normalBg;
            }
        }
    });

    if (!isValid) {
        Swal.fire('Data Belum Lengkap', 'Mohon isi semua kolom yang bertanda garis merah.', 'warning');
    }
    return isValid;
}

window.nextStep = function() {
    if (validateSection(window.currentStep)) {
        window.currentStep++;
        showStep(window.currentStep);
        window.scrollTo(0,0);
    }
}

window.prevStep = function() {
    window.currentStep--;
    showStep(window.currentStep);
    window.scrollTo(0,0);
}

// --- LOGIKA PRESTASI (4 KATEGORI) ---
window.initPrestasiUI = function() {
    const container = document.getElementById('container-prestasi');
    if (!container) return;
    
    const oldBtn = document.querySelector('button[onclick="tambahPrestasi()"]');
    if(oldBtn) oldBtn.style.display = 'none';

    // Inject CSS
    const style = document.createElement('style');
    style.innerHTML = `
        .pres-category-box { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 25px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); }
        .pres-cat-header { font-weight: 800; color: var(--primary); font-size: 1.1rem; margin-bottom: 15px; border-bottom: 2px solid #f1f5f9; padding-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
        .pres-row { display: grid; grid-template-columns: 1fr; gap: 10px; background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 10px; position: relative; border: 1px dashed #cbd5e1; }
        .pres-row-tahfidz { display: grid; grid-template-columns: 1fr; gap: 10px; background: #f0fdfa; padding: 15px; border-radius: 8px; margin-bottom: 10px; border: 1px solid #ccfbf1; }
        @media(min-width: 900px) {
            .pres-row { grid-template-columns: 2fr 2fr 1.2fr 0.8fr 40px; align-items: end; }
            .pres-row-tahfidz { grid-template-columns: 1.5fr 1fr 1fr; align-items: end; }
        }
        .pres-label { font-size: 0.75rem; font-weight: 700; color: #64748b; margin-bottom: 4px; display: block; text-transform: uppercase; }
        .btn-add-pres { background: #f1f5f9; color: var(--primary); border: 1px dashed var(--primary); width: 100%; padding: 10px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; }
        .btn-add-pres:hover { background: #e0f2f1; }
        .btn-del-pres { color: #ef4444; background: white; border: 1px solid #fecaca; width: 36px; height: 36px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .btn-del-pres:hover { background: #fef2f2; }
    `;
    document.head.appendChild(style);

    container.innerHTML = `
        <div class="pres-category-box">
            <div class="pres-cat-header"><span>📚 Prestasi Akademik</span><small style="font-weight:400; color:#64748b;">(OSN, OMI, Debat, dll)</small></div>
            <div id="list-akademik"></div>
            <button class="btn-add-pres" onclick="addPrestasiRow('akademik')">+ Tambah (Maks 3)</button>
        </div>
        <div class="pres-category-box">
            <div class="pres-cat-header"><span>⚽ Prestasi Non-Akademik</span><small style="font-weight:400; color:#64748b;">(Olah Raga, Seni, LKBB)</small></div>
            <div id="list-nonakademik"></div>
            <button class="btn-add-pres" onclick="addPrestasiRow('nonakademik')">+ Tambah (Maks 3)</button>
        </div>
        <div class="pres-category-box">
            <div class="pres-cat-header"><span>🕌 Prestasi Keagamaan</span><small style="font-weight:400; color:#64748b;">(MQK, MTQ, dll)</small></div>
            <div id="list-keagamaan"></div>
            <button class="btn-add-pres" onclick="addPrestasiRow('keagamaan')">+ Tambah (Maks 3)</button>
        </div>
        <div class="pres-category-box" style="border-color: #10b981;">
            <div class="pres-cat-header" style="color: #047857;"><span>📖 Tahfidz Al-Qur'an</span><small style="font-weight:400; color:#64748b;">(Min. 10 Juz)</small></div>
            <div id="list-tahfidz">
                <div class="pres-row-tahfidz">
                    <div><label class="pres-label">Jumlah Hafalan (Juz)</label><input type="number" class="input-modern-form tahfidz-juz" placeholder="Min. 10"></div>
                    <div><label class="pres-label">Tahun Selesai</label><input type="number" class="input-modern-form tahfidz-tahun" placeholder="YYYY"></div>
                    <div><label class="pres-label">Status Mutqin</label><select class="input-modern-form tahfidz-mutqin"><option value="">- Pilih -</option><option value="Mutqin">Mutqin</option><option value="Belum Mutqin">Belum Mutqin</option></select></div>
                </div>
            </div>
        </div>
        
        <div class="upload-grid-modern" style="margin-top: 30px;">
            <div class="upload-card-item" style="border-color: var(--accent); background: #fffbeb; grid-column: 1 / -1;">
                <input type="file" id="file_sertifikat" accept=".pdf" onchange="updateFileName(this)">
                <div class="upload-icon-box" style="color: #d97706;"><i class="ph ph-trophy"></i></div>
                <span class="upload-label-text" style="color: #92400e;">Upload Sertifikat Prestasi (Gabung 1 PDF) *</span>
                <span class="upload-status-text" id="lbl-file_sertifikat">Max 300KB (PDF Only)</span>
            </div>
        </div>
    `;
    
    const oldFile = document.querySelector('#section-5 .input-modern-form[type="file"]');
    if(oldFile && oldFile.parentElement) oldFile.parentElement.style.display = 'none';
}

window.addPrestasiRow = function(category) {
    const listId = `list-${category}`;
    const container = document.getElementById(listId);
    if (container.children.length >= 3) {
        Swal.fire('Batas Maksimal', 'Maksimal 3 prestasi untuk kategori ini.', 'warning');
        return;
    }
    const row = document.createElement('div');
    row.className = 'pres-row';
    row.dataset.cat = category; 
    row.innerHTML = `
        <div><label class="pres-label">Nama Lomba</label><input type="text" class="input-modern-form pres-nama" placeholder="Nama Prestasi" style="text-transform:uppercase;"></div>
        <div><label class="pres-label">Penyelenggara</label><input type="text" class="input-modern-form pres-oleh" placeholder="Penyelenggara" style="text-transform:uppercase;"></div>
        <div><label class="pres-label">Tingkat</label><select class="input-modern-form pres-tingkat"><option value="Provinsi">Provinsi</option><option value="Nasional">Nasional</option><option value="Internasional">Internasional</option></select></div>
        <div><label class="pres-label">Tahun</label><input type="number" class="input-modern-form pres-tahun" placeholder="YYYY"></div>
        <button class="btn-del-pres" onclick="this.parentElement.remove()" title="Hapus"><i class="ph ph-trash"></i></button>
    `;
    container.appendChild(row);
};

// --- UTILS: COMPRESS ---
function compressImage(file, quality) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = event => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const MAX_WIDTH = 1000;
                if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob(blob => { blob.name = file.name.replace(/\.[^/.]+$/, "") + ".jpg"; resolve(blob); }, 'image/jpeg', quality);
            };
            img.onerror = error => reject(error);
        };
        reader.onerror = error => reject(error);
    });
}

// --- SYSTEM: AUTO SAVE TEXT ONLY ---
function setupAutoSave() {
    const inputs = document.querySelectorAll('#pmbForm input:not([type="file"]), #pmbForm select, #pmbForm textarea');
    inputs.forEach(input => {
        if (input.id === 'nisn' || input.id === 'provinsi' || input.id === 'kabupaten' || input.id === 'kecamatan' || input.id === 'desa') return;
        const savedValue = localStorage.getItem('draft_' + input.id);
        if (savedValue) input.value = savedValue;
        input.addEventListener('input', function() { localStorage.setItem('draft_' + this.id, this.value); });
        input.addEventListener('change', function() { localStorage.setItem('draft_' + this.id, this.value); });
    });
}

function clearDraftData() {
    const inputs = document.querySelectorAll('#pmbForm input, #pmbForm select, #pmbForm textarea');
    inputs.forEach(input => { localStorage.removeItem('draft_' + input.id); });
    localStorage.removeItem('draft_provinsi');
    localStorage.removeItem('draft_kabupaten');
    localStorage.removeItem('draft_kecamatan');
    localStorage.removeItem('draft_desa');
}

// --- SUBMIT ---
window.submitForm = async function() {
    if (!validateSection(window.currentStep)) return;

    // VALIDASI KETAT JALUR PRESTASI
    if (localStorage.getItem('pmb_jalur') === 'PRESTASI') {
        const certFile = document.getElementById('file_sertifikat');
        if (certFile.files.length === 0) {
            Swal.fire('Berkas Kurang', 'Wajib upload file sertifikat prestasi.', 'warning');
            certFile.parentElement.style.borderColor = '#ef4444';
            certFile.parentElement.style.backgroundColor = '#fff5f5';
            return;
        }
        const rows = document.querySelectorAll('.pres-row');
        const tahfidzJuz = document.querySelector('.tahfidz-juz');
        const isTahfidzFilled = tahfidzJuz && tahfidzJuz.value && parseInt(tahfidzJuz.value) >= 10;
        if (rows.length === 0 && !isTahfidzFilled) {
            Swal.fire('Data Kurang', 'Wajib mengisi minimal satu data prestasi atau Tahfidz (Min. 10 Juz).', 'warning');
            return;
        }
    }

    const confirm = await Swal.fire({
        title: 'Kirim Pendaftaran?',
        text: "Pastikan data sudah benar. Data tidak bisa diubah setelah dikirim.",
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Ya, Kirim!',
        cancelButtonText: 'Cek Lagi'
    });

    if (!confirm.isConfirmed) return;

    Swal.fire({
        title: 'Sedang Mengirim...',
        text: 'Mohon tunggu, sedang mengupload berkas...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        const timestamp = Date.now();
        const nisn = document.getElementById('nisn').value;
        const nama = document.getElementById('nama_lengkap').value.replace(/[^a-zA-Z0-9]/g, '_');
        const folderName = `${nisn}_${nama}`;

        async function uploadFile(fileInputId, docName, maxKB, autoCompress = false) {
            const fileInput = document.getElementById(fileInputId);
            if (fileInput && fileInput.files.length > 0) {
                let file = fileInput.files[0];
                if (autoCompress && file.type.startsWith('image/')) {
                    try {
                        const compressedBlob = await compressImage(file, 0.7);
                        if (compressedBlob.size < file.size) file = compressedBlob;
                    } catch (e) { console.warn("Compress fail", e); }
                }
                const fileSizeKB = file.size / 1024;
                if (fileSizeKB > maxKB) throw new Error(`File ${docName} terlalu besar. Max ${maxKB} KB.`);
                const ext = file.name ? file.name.split('.').pop() : 'jpg';
                const fileName = `${folderName}/${docName}_${timestamp}.${ext}`;
                
                const { error } = await db.storage.from('berkas_pmb').upload(fileName, file, { contentType: file.type || 'image/jpeg', upsert: true });
                if (error) throw error;
                const { data: urlData } = db.storage.from('berkas_pmb').getPublicUrl(fileName);
                return urlData.publicUrl;
            }
            return null;
        }

        const [fotoUrl, kkUrl, aktaUrl, skbUrl, ktpOrtuUrl, sertifUrl] = await Promise.all([
            uploadFile('file_foto', 'FOTO', 100, true),
            uploadFile('file_kk', 'KK', 200),
            uploadFile('file_akta', 'AKTA', 200),
            uploadFile('file_skb', 'SKB', 200),
            uploadFile('file_ktp_ortu', 'KTP_ORTU', 200),
            (localStorage.getItem('pmb_jalur') === 'PRESTASI') ? uploadFile('file_sertifikat', 'SERTIFIKAT', 300) : Promise.resolve(null)
        ]);

        const getSelectText = (id) => { const el = document.getElementById(id); return el.options[el.selectedIndex]?.text || ''; };

        const formData = {
            jalur: localStorage.getItem('pmb_jalur'),
            nisn: nisn,
            nik: document.getElementById('nik').value,
            nama_lengkap: document.getElementById('nama_lengkap').value.toUpperCase(),
            jenis_kelamin: document.getElementById('jenis_kelamin').value,
            tempat_lahir: document.getElementById('tempat_lahir').value.toUpperCase(),
            tanggal_lahir: document.getElementById('tanggal_lahir').value,
            ukuran_baju: document.getElementById('ukuran_baju').value,
            agama: 'Islam',
            jumlah_saudara: document.getElementById('jumlah_saudara').value,
            anak_ke: document.getElementById('anak_ke').value,
            status_anak: document.getElementById('status_anak').value,
            
            provinsi: getSelectText('provinsi'),
            kabupaten_kota: getSelectText('kabupaten'),
            kecamatan: getSelectText('kecamatan'),
            desa_kelurahan: getSelectText('desa'),
            rt: document.getElementById('rt').value,
            rw: document.getElementById('rw').value,
            alamat_lengkap: document.getElementById('alamat_lengkap').value.toUpperCase(),
            kode_pos: document.getElementById('kode_pos').value,
            
            no_kk: document.getElementById('no_kk').value,
            nama_ayah: document.getElementById('nama_ayah').value.toUpperCase(),
            nik_ayah: document.getElementById('nik_ayah').value,
            pendidikan_ayah: document.getElementById('pendidikan_ayah').value,
            pekerjaan_ayah: document.getElementById('pekerjaan_ayah').value.toUpperCase(),
            penghasilan_ayah: document.getElementById('penghasilan_ayah').value,
            
            nama_ibu: document.getElementById('nama_ibu').value.toUpperCase(),
            nik_ibu: document.getElementById('nik_ibu').value,
            pendidikan_ibu: document.getElementById('pendidikan_ibu').value,
            pekerjaan_ibu: document.getElementById('pekerjaan_ibu').value.toUpperCase(),
            penghasilan_ibu: document.getElementById('penghasilan_ibu').value,
            no_telepon_ortu: document.getElementById('no_telepon_ortu').value,

            asal_sekolah: document.getElementById('asal_sekolah').value.toUpperCase(),
            npsn_sekolah: document.getElementById('npsn_sekolah').value,
            status_sekolah: document.getElementById('status_sekolah').value,
            alamat_sekolah: document.getElementById('alamat_sekolah').value.toUpperCase(),
            pilihan_pesantren: document.getElementById('pilihan_pesantren').value,

            foto_url: fotoUrl,
            scan_kk_url: kkUrl,
            scan_akta_url: aktaUrl,
            scan_kelakuan_baik_url: skbUrl,
            scan_ktp_ortu_url: ktpOrtuUrl,
            scan_sertifikat_prestasi_url: sertifUrl
        };

        const { data: pendaftarData, error: dbError } = await db.from('pendaftar').insert([formData]).select().single();
        if (dbError) throw dbError;

        if (localStorage.getItem('pmb_jalur') === 'PRESTASI') {
            const pendaftarId = pendaftarData.id;
            const prestasiList = [];

            const rows = document.querySelectorAll('.pres-row');
            rows.forEach(row => {
                const nama = row.querySelector('.pres-nama').value;
                if (nama) {
                    let kat = 'Umum';
                    if (row.dataset.cat === 'akademik') kat = 'Akademik';
                    if (row.dataset.cat === 'nonakademik') kat = 'Non-Akademik';
                    if (row.dataset.cat === 'keagamaan') kat = 'Keagamaan';

                    prestasiList.push({
                        pendaftar_id: pendaftarId,
                        nama_lomba: nama.toUpperCase(),
                        penyelenggara: row.querySelector('.pres-oleh').value.toUpperCase(),
                        tingkat: row.querySelector('.pres-tingkat').value,
                        tahun_perolehan: row.querySelector('.pres-tahun').value,
                        kategori: kat
                    });
                }
            });

            const juz = document.querySelector('.tahfidz-juz').value;
            if (juz && parseInt(juz) >= 10) {
                prestasiList.push({
                    pendaftar_id: pendaftarId,
                    kategori: 'Tahfidz',
                    nama_lomba: `Hafalan ${juz} Juz`,
                    penyelenggara: '-',
                    tingkat: document.querySelector('.tahfidz-mutqin').value || '-',
                    tahun_perolehan: document.querySelector('.tahfidz-tahun').value || '-'
                });
            }

            if (prestasiList.length > 0) {
                await db.from('prestasi').insert(prestasiList);
            }
        }

        Swal.fire({
            icon: 'success',
            title: 'Pendaftaran Berhasil!',
            text: `Nomor Pendaftaran Anda: ${pendaftarData.no_pendaftaran}`,
            allowOutsideClick: false
        }).then(() => {
            clearDraftData();
            localStorage.removeItem('pmb_jalur');
            localStorage.removeItem('pmb_nisn');
            localStorage.setItem('resume_data', JSON.stringify(pendaftarData));
            window.location.href = 'resume.html';
        });

    } catch (err) {
        console.error(err);
        Swal.fire('Gagal Mengirim', 'Terjadi kesalahan: ' + err.message, 'error');
    }
}