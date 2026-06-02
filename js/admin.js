// js/admin.js

// ==========================================
// 1. CEK SESI ADMIN
// ==========================================
const sessionRole = localStorage.getItem('session_role');
if (sessionRole !== 'ADMIN') {
    alert('Akses Ditolak!');
    window.location.href = '../login.html';
}

// ==========================================
// GLOBAL STATE
// ==========================================
let allPendaftar = [];
let currentPage = 1;
let rowsPerPage = 10;
let selectedIds = new Set(); 
let editState = {}; 
let currentSort = { column: 'created_at', direction: 'desc' };

// State Jadwal Baru
let scheduleConfig = [
    {
        tanggal: "Kamis, 21 Mei 2026",
        sesi: [
            { 
                nama: "Sesi 1 (07.30 - 09.30 WIB)", 
                ruangan: [
                    { nama: "Ruang 1", capacity: 20 },
                    { nama: "Ruang 2", capacity: 20 },
                    { nama: "Ruang 3", capacity: 20 },
                    { nama: "Ruang 4", capacity: 20 }
                ] 
            }
        ]
    }
];
let plottingChanges = {};

// ==========================================
// 2. UI HANDLERS (SIDEBAR & PANELS)
// ==========================================
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const main = document.getElementById('mainContent');
    
    if (window.innerWidth <= 768) {
        // Di mobile, hanya buka/tutup menu geser (jangan ciutkan teksnya)
        sidebar.classList.toggle('mobile-open');
        sidebar.classList.remove('collapsed');
    } else {
        // Di desktop, ciutkan menu menjadi ikon
        sidebar.classList.toggle('collapsed');
        main.classList.toggle('expanded');
    }
}

window.switchAdminPanel = function(panel) {
    document.querySelectorAll('.admin-panel').forEach(el => {
        el.style.display = 'none';
    });
    document.getElementById('panel-' + panel).style.display = 'block';

    document.querySelectorAll('.sidebar-menu .menu-item').forEach(el => {
        el.classList.remove('active');
    });
    document.getElementById('menu-' + panel).classList.add('active');

    if(panel === 'jadwal') {
        renderScheduleSettings();
        updatePlottingFilters();
        renderPlottingTable();
    }
    
    // Auto close sidebar on mobile after clicking
    if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('mobile-open');
    }
}

// ==========================================
// 3. LOAD DATA UTAMA (DATABASE FETCHING)
// ==========================================
async function loadPendaftar() {
    try {
        const data = await apiGet('admin');
        if (data.error) throw new Error(data.error);
        
        allPendaftar = data;
        updateStats(data);
        renderTable(); 

        const cfgAll = await apiGet('pengaturan', { keys: 'JADWAL_CONFIG' });
        const cfgData = Array.isArray(cfgAll) ? cfgAll.find(r => r.key === 'JADWAL_CONFIG') : null;
        let loadedCfg = null;
        if (cfgData && cfgData.value) {
            try { loadedCfg = JSON.parse(cfgData.value); } catch(e) { }
        } else {
            const localCfg = localStorage.getItem('JADWAL_CONFIG');
            if(localCfg) {
                try { loadedCfg = JSON.parse(localCfg); } catch(e) { }
            }
        }
        
        if (Array.isArray(loadedCfg)) {
            // Migrasi dari pola lama ke pola array `ruangan`
            loadedCfg.forEach(h => {
                (h.sesi || []).forEach(s => {
                    if (!s.ruangan && s.rooms) {
                        s.ruangan = [];
                        let capArr = String(s.capacity).split(',').map(x => parseInt(x.trim()) || 20);
                        for(let r=1; r<=s.rooms; r++){
                            s.ruangan.push({ nama: `Ruang ${r}`, capacity: capArr[r-1] || capArr[0] || 20 });
                        }
                    }
                });
            });
            scheduleConfig = loadedCfg;
        }

    } catch (err) {
        console.error('Error load admin:', err);
        Swal.fire('Error', 'Gagal memuat data pendaftar', 'error');
    }
}

// ==========================================
// 4. UPDATE STATISTIK DASHBOARD
// ==========================================
function updateStats(data) {
    const diterima = data.filter(p => p.status_kelulusan === 'DITERIMA');

    document.getElementById('count-total').innerText = data.length;
    document.getElementById('count-reguler').innerText = data.filter(p => p.jalur === 'REGULER').length;
    document.getElementById('count-prestasi').innerText = data.filter(p => p.jalur === 'PRESTASI').length;
    document.getElementById('count-pending').innerText = data.filter(p => p.status_verifikasi === null).length;
    document.getElementById('count-lulus').innerText = diterima.length;
    document.getElementById('count-tidak-lulus').innerText = data.filter(p => p.status_kelulusan === 'TIDAK DITERIMA').length;
    document.getElementById('count-kelulusan-pending').innerText = data.filter(p => (p.status_kelulusan || 'PENDING') === 'PENDING').length;
    document.getElementById('count-daftar-ulang-sudah').innerText = diterima.filter(p => p.daftar_ulang_hardcopy_status === 'SUDAH').length;
    document.getElementById('count-daftar-ulang-belum').innerText = diterima.filter(p => p.daftar_ulang_hardcopy_status !== 'SUDAH').length;
}

// ==========================================
// 5. RENDER TABEL UTAMA (DATA PENDAFTAR)
// ==========================================
function renderTable() {
    const tbody = document.getElementById('tableBody');
    const searchVal = document.getElementById('searchInput').value.toLowerCase();
    const filterVerif = document.getElementById('filterVerif').value;
    const filterLulus = document.getElementById('filterLulus').value;
    
    let filteredData = allPendaftar.filter(p => {
        const matchSearch = p.nama_lengkap.toLowerCase().includes(searchVal) || 
                            p.nisn.includes(searchVal) ||
                            p.no_pendaftaran.toLowerCase().includes(searchVal);
        
        const filterJalur = document.getElementById('filterJalur').value;
        let matchJalur = true;
        if (filterJalur !== '') {
            matchJalur = p.jalur === filterJalur;
        }
        
        let matchVerif = true;
        if (filterVerif !== "") {
            matchVerif = String(p.status_verifikasi) === filterVerif;
        }
        
        let matchLulus = true;
        if (filterLulus !== "") {
            matchLulus = (p.status_kelulusan || 'PENDING') === filterLulus;
        }
        
        return matchSearch && matchJalur && matchVerif && matchLulus;
    });

    filteredData.sort((a, b) => {
        let valA = a[currentSort.column] || ""; 
        let valB = b[currentSort.column] || "";
        
        if (typeof valA === 'string') valA = valA.toLowerCase(); 
        if (typeof valB === 'string') valB = valB.toLowerCase();
        
        if (valA < valB) return currentSort.direction === 'asc' ? -1 : 1;
        if (valA > valB) return currentSort.direction === 'asc' ? 1 : -1;
        return 0;
    });

    // Jika rowsPerPage sangat besar (mode "Semua"), tampilkan semua langsung
    const isShowAll = rowsPerPage >= 99999;
    const totalPages = isShowAll ? 1 : Math.ceil(filteredData.length / rowsPerPage);
    if (currentPage > totalPages) currentPage = 1;
    if (currentPage < 1) currentPage = 1;
    
    const start = isShowAll ? 0 : (currentPage - 1) * rowsPerPage;
    const end   = isShowAll ? filteredData.length : start + parseInt(rowsPerPage);
    const pageData = filteredData.slice(start, end);

    tbody.innerHTML = '';
    if (pageData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 30px;">Tidak ada data ditemukan.</td></tr>';
        renderPagination(0); 
        return;
    }

    pageData.forEach(p => {
        const photoSrc = p.foto_url ? p.foto_url : 'https://via.placeholder.com/40?text=' + p.nama_lengkap.charAt(0);
        
        let badgeVerif = '<span class="badge-modern badge-yellow">Pending</span>'; 
        if (p.status_verifikasi === true) {
            badgeVerif = '<span class="badge-modern badge-green">Terverifikasi</span>';
        } else if (p.status_verifikasi === false) {
            badgeVerif = '<span class="badge-modern badge-red">Ditolak</span>';
        }
            
        let badgeLulus = '<span class="badge-modern badge-blue">Menunggu</span>';
        if (p.status_kelulusan === 'DITERIMA') {
            badgeLulus = '<span class="badge-modern badge-green">DITERIMA</span>';
        } else if (p.status_kelulusan === 'TIDAK DITERIMA') {
            badgeLulus = '<span class="badge-modern badge-red">TIDAK LULUS</span>';
        }

        // Badge Daftar Ulang (hanya untuk yang DITERIMA)
        let badgeDU = '';
        if (p.status_kelulusan === 'DITERIMA') {
            if (p.daftar_ulang_hardcopy_status === 'SUDAH') {
                badgeDU = `<button onclick="toggleDaftarUlangHardcopy('${p.id}', 'BELUM')" class="badge-modern badge-green" style="font-size:.65rem; border:none; cursor:pointer;"><i class="ph ph-check-circle"></i> Sudah Serah</button>`;
            } else {
                badgeDU = `<button onclick="toggleDaftarUlangHardcopy('${p.id}', 'SUDAH')" class="badge-modern badge-red" style="font-size:.65rem; border:none; cursor:pointer;"><i class="ph ph-clock"></i> Belum Serah</button>`;
            }
        } else {
            badgeDU = '<span style="color:#94a3b8; font-size:.7rem;">—</span>';
        }

        const isChecked = selectedIds.has(p.id) ? 'checked' : '';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Pilih">
                <input type="checkbox" class="row-checkbox" value="${p.id}" onclick="toggleRow('${p.id}')" ${isChecked}>
            </td>
            <td data-label="Peserta">
                <div class="student-cell">
                    <img src="${photoSrc}" class="student-thumb" onerror="this.src='https://via.placeholder.com/40'">
                    <div>
                        <div style="font-weight:600; color:#1e293b;">${p.nama_lengkap}</div>
                        <div style="font-size:0.8rem; color:#64748b;">${p.no_pendaftaran}</div>
                    </div>
                </div>
            </td>
            <td data-label="Jalur">
                <span class="badge-modern ${p.jalur === 'PRESTASI' ? 'badge-blue' : 'badge-green'}" style="font-size:0.7rem;">${p.jalur}</span>
            </td>
            <td data-label="Asal Sekolah" style="font-size:0.9rem;">
                ${p.asal_sekolah}
            </td>
            <td data-label="Verifikasi">
                ${badgeVerif}
            </td>
            <td data-label="Kelulusan">
                ${badgeLulus}
            </td>
            <td data-label="Daftar Ulang">
                ${badgeDU}
            </td>
            <td data-label="Aksi" style="text-align: right;">
                <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;" onclick="cetakKartuTes('${p.id}')">
                    <i class="ph ph-printer"></i> Kartu
                </button>
                <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;" onclick="viewDetail('${p.id}')">
                    <i class="ph ph-eye"></i> Detail
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    renderPagination(totalPages);
    updateBulkUI();
}

window.toggleDaftarUlangHardcopy = async function(id, nextStatus) {
    const p = allPendaftar.find(x => x.id === id);
    if (!p) return;

    const isDone = nextStatus === 'SUDAH';
    const result = await apiPost('admin?action=update-satu', {
        id,
        payload: {
            daftar_ulang_hardcopy_status: nextStatus,
            daftar_ulang_hardcopy_at: isDone ? new Date().toISOString() : null,
        }
    });

    if (result.error) {
        Swal.fire('Gagal', result.error, 'error');
        return;
    }

    p.daftar_ulang_hardcopy_status = nextStatus;
    p.daftar_ulang_hardcopy_at = isDone ? new Date().toISOString() : null;
    updateStats(allPendaftar);
    renderTable();
};

// ==========================================
// 6. PAGINATION & TABLE HANDLERS
// ==========================================
function renderPagination(totalPages) {
    const container = document.getElementById('pagination');
    container.innerHTML = '';
    
    // Jika mode Semua, sembunyikan pagination
    if (rowsPerPage >= 99999 || totalPages <= 1) return;
    
    const prevBtn = document.createElement('button');
    prevBtn.className = 'page-btn'; 
    prevBtn.innerHTML = '<i class="ph ph-caret-left"></i>'; 
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => { 
        currentPage--; 
        renderTable(); 
    }; 
    container.appendChild(prevBtn);
    
    // Tampilkan max 7 tombol halaman dengan elipsis
    const maxVisible = 7;
    let pages = [];
    if (totalPages <= maxVisible) {
        for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
        pages = [1];
        if (currentPage > 3) pages.push('...');
        const start = Math.max(2, currentPage - 1);
        const end   = Math.min(totalPages - 1, currentPage + 1);
        for (let i = start; i <= end; i++) pages.push(i);
        if (currentPage < totalPages - 2) pages.push('...');
        pages.push(totalPages);
    }

    pages.forEach(p => {
        if (p === '...') {
            const span = document.createElement('span');
            span.textContent = '...';
            span.style.cssText = 'padding:0 4px; color:var(--ink-faint); font-size:.75rem; display:flex; align-items:center;';
            container.appendChild(span);
        } else {
            const btn = document.createElement('button'); 
            btn.className = `page-btn ${p === currentPage ? 'active' : ''}`;
            btn.innerText = p; 
            btn.onclick = () => { 
                currentPage = p; 
                renderTable(); 
            }; 
            container.appendChild(btn);
        }
    });
    
    const nextBtn = document.createElement('button');
    nextBtn.className = 'page-btn'; 
    nextBtn.innerHTML = '<i class="ph ph-caret-right"></i>'; 
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => { 
        currentPage++; 
        renderTable(); 
    }; 
    container.appendChild(nextBtn);
}

window.filterTable = function() { 
    currentPage = 1; 
    renderTable(); 
}

window.changeLimit = function() { 
    rowsPerPage = parseInt(document.getElementById('rowsPerPage').value); 
    currentPage = 1; 
    renderTable(); 
}

window.sortTable = function(column) {
    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else { 
        currentSort.column = column; 
        currentSort.direction = 'asc'; 
    }
    renderTable();
}

// ==========================================
// 7. BULK ACTIONS (AKSI MASSAL)
// ==========================================
window.toggleRow = function(id) {
    if (selectedIds.has(id)) {
        selectedIds.delete(id); 
    } else {
        selectedIds.add(id);
    }
    updateBulkUI();
}

window.toggleSelectAll = function() {
    const mainCheck = document.getElementById('selectAll');
    const checkboxes = document.querySelectorAll('.row-checkbox');
    
    checkboxes.forEach(cb => {
        const id = cb.value;
        if (mainCheck.checked) {
            selectedIds.add(id); 
        } else {
            selectedIds.delete(id);
        }
        cb.checked = mainCheck.checked; 
    });
    
    updateBulkUI();
}

function updateBulkUI() {
    const bar = document.getElementById('bulkActions');
    const countSpan = document.getElementById('selectedCount');
    
    if (selectedIds.size > 0) { 
        bar.classList.add('show'); 
        countSpan.innerText = selectedIds.size; 

        // Buat tombol cetak kartu tes massal
        if (!document.getElementById('btn-bulk-cetak-kartu')) {
            const btnKartu = document.createElement('button');
            btnKartu.id = 'btn-bulk-cetak-kartu';
            btnKartu.className = 'btn btn-primary';
            btnKartu.style.background = '#dc2626';
            btnKartu.style.borderColor = '#dc2626';
            btnKartu.innerHTML = '<i class="ph ph-printer"></i> Cetak Kartu Tes';
            btnKartu.onclick = () => window.bulkAction('CETAK_KARTU');
            bar.appendChild(btnKartu);
        }
        
        // Buat tombol cetak form verifikasi prestasi
        if (!document.getElementById('btn-bulk-cetak-prestasi')) {
            const btnCetak = document.createElement('button');
            btnCetak.id = 'btn-bulk-cetak-prestasi';
            btnCetak.className = 'btn btn-primary';
            btnCetak.style.background = '#0284c7'; // Biru terang
            btnCetak.style.borderColor = '#0284c7';
            btnCetak.innerHTML = '<i class="ph ph-printer"></i> Cetak Form Verifikasi';
            btnCetak.onclick = () => window.bulkAction('CETAK_PRESTASI');
            bar.appendChild(btnCetak);
        }

        // Buat tombol jadwal massal jika belum ada
        if (!document.getElementById('btn-bulk-jadwal')) {
            const btnJadwal = document.createElement('button');
            btnJadwal.id = 'btn-bulk-jadwal';
            btnJadwal.className = 'btn btn-primary';
            btnJadwal.style.background = '#d97706';
            btnJadwal.style.borderColor = '#d97706';
            btnJadwal.innerHTML = '<i class="ph ph-calendar-plus"></i> Jadwal';
            btnJadwal.onclick = () => window.bulkAction('JADWAL');
            bar.appendChild(btnJadwal);
        }

        // Buat tombol Alihkan ke Reguler massal jika belum ada
        if (!document.getElementById('btn-bulk-reguler')) {
            const btnReguler = document.createElement('button');
            btnReguler.id = 'btn-bulk-reguler';
            btnReguler.className = 'btn btn-primary';
            btnReguler.style.background = '#7c3aed';
            btnReguler.style.borderColor = '#7c3aed';
            btnReguler.innerHTML = '<i class="ph ph-arrows-left-right"></i> Alih ke Reguler';
            btnReguler.onclick = () => window.bulkAction('ALIH_REGULER');
            bar.appendChild(btnReguler);
        }

        // Buat tombol download ZIP massal jika belum ada
        if (!document.getElementById('btn-bulk-zip')) {
            const btnZip = document.createElement('button');
            btnZip.id = 'btn-bulk-zip';
            btnZip.className = 'btn btn-secondary';
            btnZip.style.borderColor = '#0369a1';
            btnZip.style.color = '#0369a1';
            btnZip.style.background = '#e0f2fe';
            btnZip.innerHTML = '<i class="ph ph-file-zip"></i> Download';
            btnZip.onclick = () => window.bulkAction('DOWNLOAD_ZIP');
            bar.appendChild(btnZip);
        }

    } else { 
        bar.classList.remove('show'); 
        document.getElementById('selectAll').checked = false; 
    }
}

window.bulkAction = async function(action) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    // TANGANI CETAK KARTU TES PILIHAN
    if (action === 'CETAK_KARTU') {
        const selectedPendaftar = allPendaftar.filter(p => ids.includes(p.id));
        cetakKartuTesPendaftar(selectedPendaftar);
        return;
    }
    
    // TANGANI DOWNLOAD ZIP PILIHAN
    if (action === 'DOWNLOAD_ZIP') {
        const selectedPendaftar = allPendaftar.filter(p => ids.includes(p.id));
        const tgl = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-');
        processZipDownload(selectedPendaftar, `Berkas_TERPILIH_PMB_${tgl}.zip`);
        return; 
    }

    // TANGANI CETAK FORM VERIFIKASI PRESTASI
    if (action === 'CETAK_PRESTASI') {
        const prestasiIds = ids.filter(id => {
            const p = allPendaftar.find(x => x.id === id);
            return p && p.jalur === 'PRESTASI';
        });

        if (prestasiIds.length === 0) {
            Swal.fire('Info', 'Mohon pilih setidaknya satu pendaftar Jalur Prestasi.', 'info');
            return;
        }

        Swal.fire({
            title: 'Mempersiapkan Form...',
            text: 'Mengunduh detail prestasi dari server.',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        const selectedPendaftar = allPendaftar.filter(p => prestasiIds.includes(p.id));
        let printAreaHTML = '';
        const tglCetak = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day:'numeric', month:'long', year:'numeric' });

        for (let p of selectedPendaftar) {
            let cats = [];
            // Deteksi rapor
            if (p.scan_rapor_url || p.nilai_rapor) {
                cats.push("NILAI RAPOR");
            }

            // Fetch Prestasi Lomba/Tahfidz
            try {
                const presData = await apiGet('prestasi?pendaftar_id=' + p.id);
                if (Array.isArray(presData)) {
                    if (presData.some(x => x.kategori === 'Akademik')) cats.push('AKADEMIK');
                    if (presData.some(x => x.kategori === 'Non-Akademik' || x.kategori === 'Keagamaan')) cats.push('NON-AKADEMIK');
                    if (presData.some(x => x.kategori === 'Tahfidz')) cats.push('TAHFIDZ');
                }
            } catch (e) {
                console.warn('Gagal memuat detail prestasi untuk', p.id);
            }

            // Hapus duplikat
            cats = [...new Set(cats)];
            let catString = cats.length > 0 ? cats.join(' &amp; ') : 'TIDAK ADA DATA PRESTASI (KOSONG)';

            const photoSrc = p.foto_url ? p.foto_url : 'https://via.placeholder.com/150x200?text=FOTO';
            const alamatPendek = [p.desa_kelurahan, p.kecamatan, p.kabupaten_kota, p.provinsi].filter(x => x && x !== '-').join(', ');
            
            // Generate Tabel Nilai Rapor
            let nilaiRaporHtml = '';
            if (p.nilai_rapor) {
                try {
                    let n = typeof p.nilai_rapor === 'string' ? JSON.parse(p.nilai_rapor) : p.nilai_rapor;
                    let thead = '', tbody = '';
                    let total = 0, count = 0;
                    for (let key in n) {
                        let label = key.replace('_','.'); // "7_1" -> "7.1"
                        thead += `<th style="border:1px solid #000; padding:4px 2px; text-align:center; font-weight:bold;">Smt ${label}</th>`;
                        tbody += `<td style="border:1px solid #000; padding:4px 2px; text-align:center;">${n[key].rata} ${n[key].rank ? `<br><small style="font-size:10px;">(Rkg ${n[key].rank})</small>` : ''}</td>`;
                        total += parseFloat(n[key].rata); count++;
                    }
                    if (count > 0) {
                        let avg = (total / count).toFixed(2);
                        thead += `<th style="border:1px solid #000; padding:4px 2px; text-align:center; background:#f0fdf4; font-weight:bold;">Rata-rata</th>`;
                        tbody += `<td style="border:1px solid #000; padding:4px 2px; text-align:center; background:#f0fdf4; font-weight:bold; color:#15803d; font-size:15px;">${avg}</td>`;
                        
                        let tableHTML = `
                        <table style="width:100%; border-collapse:collapse; font-size:13px; line-height:1.2; margin-top:2px;">
                            <thead style="background:#f8fafc;"><tr>${thead}</tr></thead>
                            <tbody><tr>${tbody}</tr></tbody>
                        </table>`;
                        
                        nilaiRaporHtml = `<tr><td style="vertical-align:top; font-weight:bold; padding-top:6px;">NILAI RAPOR</td><td style="vertical-align:top; padding-top:6px; padding-left:0;">: ${tableHTML}</td></tr>`;
                    }
                } catch(e) { }
            }

            printAreaHTML += `
            <div class="page-break" style="font-family:'Times New Roman',serif; width:100%; max-width:210mm; margin:0 auto; box-sizing:border-box; padding:0; position:relative;">
                <div style="border:2px solid #000; padding:15px 20px;">
                    <div style="border-bottom:4px double black; padding-bottom:10px; margin-bottom:15px; display:flex; align-items:center; justify-content:center; gap:15px;">
                        <img src="../images/logo.png" onerror="this.src='https://upload.wikimedia.org/wikipedia/commons/2/25/Logo_Kementerian_Agama_Republik_Indonesia_baru_2.png'" style="width:80px; height:auto;">
                        <div style="text-align:center; line-height:1.15; color:#000;">
                            <h5 style="margin:0; font-size:14px; font-weight:normal; letter-spacing:1px;">KEMENTERIAN AGAMA REPUBLIK INDONESIA</h5>
                            <h5 style="margin:0; font-size:14px; font-weight:normal; letter-spacing:1px;">KANTOR KEMENTERIAN AGAMA KAB. TASIKMALAYA</h5>
                            <h3 style="margin:4px 0; font-size:20px; font-weight:bold; font-family:Arial,sans-serif;">MADRASAH ALIYAH NEGERI 1 TASIKMALAYA</h3>
                            <p style="margin:0; font-size:11px;">Jln. Pahlawan KHZ. Musthafa Sukamanah Ds.Sukarapih Kec.Sukarame Kab.Tasikmalaya</p>
                            <p style="margin:0; font-size:11px;">Kode Pos 46461 Telp/Fax. (0265) 545719</p>
                        </div>
                    </div>

                    <div style="text-align:center; margin-bottom:20px;">
                        <h3 style="margin:0; font-size:18px; font-weight:bold; font-family:Arial,sans-serif; text-decoration:underline;">FORMULIR VERIFIKASI BERKAS (PRESTASI)</h3>
                        <div style="margin-top:10px; display:inline-block; border:2px solid #334155; border-radius:6px; padding:6px 20px; background:#f8fafc;">
                            <span style="font-size:12px; font-weight:bold; color:#64748b; display:block; margin-bottom:2px; font-family:Arial,sans-serif;">KATEGORI PRESTASI YANG DIAJUKAN</span>
                            <span style="font-size:16px; font-weight:bold; color:#0f172a; font-family:Arial,sans-serif;">${catString}</span>
                        </div>
                    </div>

                    <div style="display:flex; gap:20px; align-items:flex-start; margin-bottom:15px;">
                        <div style="width:3.5cm; flex-shrink:0; text-align:center;">
                            <img src="${photoSrc}" style="width:3.5cm; height:5cm; object-fit:cover; border:2px solid #000; padding:2px; display:block;">
                        </div>
                        <div style="flex:1;">
                            <table style="width:100%; font-size:14px; border-collapse:separate; border-spacing:0 12px; line-height:1.4;">
                                <tr><td style="width:140px; font-weight:bold;">NOMOR DAFTAR</td><td>: <span style="font-weight:bold; font-size:16px;">${p.no_pendaftaran || '-'}</span></td></tr>
                                <tr><td>NAMA LENGKAP</td><td>: <b style="text-transform:uppercase; font-size:15px;">${p.nama_lengkap}</b></td></tr>
                                <tr><td>NISN</td><td>: ${p.nisn || '-'}</td></tr>
                                <tr><td>ASAL SEKOLAH</td><td>: ${p.asal_sekolah || '-'}</td></tr>
                                <tr><td style="vertical-align:top; font-weight:bold;">ALAMAT LENGKAP</td><td style="vertical-align:top;">: ${alamatPendek}</td></tr>
                                ${nilaiRaporHtml}
                            </table>
                        </div>
                    </div>

                    <div style="margin-top:20px; border:2px solid #000; padding:15px 20px;">
                        <div style="font-weight:bold; text-decoration:underline; margin-bottom:12px; font-size:14px;">Hasil Verifikasi Fisik Dokumen (Oleh Panitia):</div>
                        <table style="width:100%; font-size:14px; margin-bottom:8px;">
                            <tr>
                                <td style="width:35px;"><div style="width:25px; height:25px; border:2px solid #000;"></div></td>
                                <td style="font-weight:bold; font-size:14px;">SESUAI (LULUS VERIFIKASI)</td>
                            </tr>
                            <tr><td colspan="2" style="height:12px;"></td></tr>
                            <tr>
                                <td style="width:35px;"><div style="width:25px; height:25px; border:2px solid #000;"></div></td>
                                <td style="font-weight:bold; font-size:14px;">TIDAK SESUAI (TIDAK LULUS) / DIBATALKAN</td>
                            </tr>
                        </table>
                        <p style="margin:8px 0 0; font-size:11px; font-style:italic;">* Peringatan: Beri tanda Centang ( V ) atau Silang ( X ) pada kotak di atas setelah dokumen asli dicocokkan dengan data tabel.</p>
                    </div>

                    <div style="margin-top:20px; text-align:right;">
                        <i style="font-size:11px; font-style:italic;">Dicetak dari Panel Admin pada: ${tglCetak}</i>
                    </div>
                </div>
            </div>
            `;
        }

        const area = document.getElementById('cetak-verifikasi-area');
        if (area) area.innerHTML = printAreaHTML;
        Swal.close();

        // Panggil print
        setTimeout(() => {
            window.print();
            // Bersihkan area memory-setelah 3 detik (jika print ditutup)
            setTimeout(() => { if (area) area.innerHTML = ''; }, 3000);
        }, 500);

        return;
    }


    let updateData = {};
    let confirmText = '';
    
    if (action === 'VERIFY') { 
        updateData = { status_verifikasi: true }; 
        confirmText = `Verifikasi ${ids.length} siswa terpilih?`; 
    } else if (action === 'GRADUATE') {
        const { value: status } = await Swal.fire({ 
            title: 'Tentukan Status Kelulusan', 
            input: 'select', 
            inputOptions: { 
                'DITERIMA': 'DITERIMA', 
                'TIDAK DITERIMA': 'TIDAK DITERIMA' 
            }, 
            showCancelButton: true 
        });
        
        if (!status) return;
        
        updateData = { status_kelulusan: status }; 
        confirmText = `Ubah status menjadi ${status} untuk ${ids.length} siswa?`;
    } else if (action === 'JADWAL') {
        const { value: formValues } = await Swal.fire({
            title: 'Atur Jadwal CBT Reguler',
            html: `
                <div style="text-align:left; font-size:0.9rem;">
                    <label style="font-weight:bold; color:#1e293b;">Tanggal Tes:</label>
                    <select id="swal-tgl" class="swal2-select" style="display:flex; width:100%; margin:5px 0 15px 0; font-size:0.95rem;">
                        <option value="Kamis, 21 Mei 2026">Kamis, 21 Mei 2026</option>
                        <option value="Jumat, 22 Mei 2026">Jumat, 22 Mei 2026</option>
                        <option value="Sabtu, 23 Mei 2026">Sabtu, 23 Mei 2026</option>
                    </select>
                    <label style="font-weight:bold; color:#1e293b;">Sesi & Waktu:</label>
                    <select id="swal-sesi" class="swal2-select" style="display:flex; width:100%; margin:5px 0 15px 0; font-size:0.95rem;">
                        <option value="Sesi 1 (07.30 - 09.30 WIB)">Sesi 1 (07.30 - 09.30 WIB)</option>
                        <option value="Sesi 2 (10.00 - 12.00 WIB)">Sesi 2 (10.00 - 12.00 WIB)</option>
                        <option value="Sesi 3 (13.00 - 15.00 WIB)">Sesi 3 (13.00 - 15.00 WIB)</option>
                    </select>
                    <label style="font-weight:bold; color:#1e293b;">Ruangan Tes:</label>
                    <input id="swal-ruang" class="swal2-input" style="display:flex; width:100%; margin:5px 0; font-size:0.95rem;" placeholder="Contoh: Ruang 1 (Lab Komputer)">
                </div>
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'Simpan Jadwal',
            cancelButtonText: 'Batal',
            preConfirm: () => {
                const r = document.getElementById('swal-ruang').value;
                if (!r) { 
                    Swal.showValidationMessage('Nama ruangan harus diisi!'); 
                    return false; 
                }
                return {
                    tanggal_tes: document.getElementById('swal-tgl').value,
                    sesi_tes: document.getElementById('swal-sesi').value,
                    ruang_tes: r
                }
            }
        });

        if (formValues) {
            updateData = formValues;
            confirmText = `Terapkan jadwal ini untuk ${ids.length} siswa terpilih?`;
        } else { 
            return; 
        }
    } else if (action === 'ALIH_REGULER') {
        // Filter: hanya yang masih PRESTASI
        const prestasiIds = ids.filter(id => {
            const p = allPendaftar.find(x => x.id === id);
            return p && p.jalur === 'PRESTASI';
        });

        if (prestasiIds.length === 0) {
            Swal.fire('Info', 'Tidak ada siswa Jalur Prestasi di antara yang dipilih.', 'info');
            return;
        }

        const confirm = await Swal.fire({
            title: 'Alihkan ke Jalur Reguler?',
            html: `<span style="color:#7c3aed; font-weight:700;">${prestasiIds.length}</span> dari ${ids.length} siswa terpilih adalah Jalur Prestasi dan akan dipindahkan ke Jalur Reguler.<br><br>
                   Mereka akan <strong>wajib mengikuti Tes CBT</strong> dan status verifikasi direset ke <em>menunggu</em>.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Ya, Alihkan',
            confirmButtonColor: '#7c3aed',
            cancelButtonText: 'Batal'
        });

        if (!confirm.isConfirmed) return;

        Swal.showLoading();
        const result = await apiPost('admin?action=alih-reguler', { ids: prestasiIds });
        if (!result.error) {
            // Update local state
            prestasiIds.forEach(id => {
                const idx = allPendaftar.findIndex(x => x.id === id);
                if (idx !== -1) {
                    allPendaftar[idx].jalur = 'REGULER';
                    allPendaftar[idx].status_verifikasi = null;
                    allPendaftar[idx].status_kelulusan = 'PENDING';
                    allPendaftar[idx].ruang_tes = null;
                    allPendaftar[idx].tanggal_tes = null;
                    allPendaftar[idx].sesi_tes = null;
                }
            });
            selectedIds.clear();
            updateStats(allPendaftar);
            renderTable();
            Swal.fire('Berhasil', `${prestasiIds.length} siswa berhasil dialihkan ke Jalur Reguler.`, 'success');
        } else {
            Swal.fire('Gagal', result.error, 'error');
        }
        return;
    }

    // Aksi lainnya (VERIFY, GRADUATE, JADWAL) perlu konfirmasi + API verifikasi
    if (!confirmText) return;

    const confirm = await Swal.fire({ 
        title: 'Konfirmasi', 
        text: confirmText, 
        icon: 'warning', 
        showCancelButton: true, 
        confirmButtonText: 'Ya, Proses' 
    });

    if (confirm.isConfirmed) {
        Swal.showLoading();
        const result = await apiPost('admin?action=verifikasi', { ids, updateData });
        
        if (!result.error) {
            selectedIds.clear(); 
            await loadPendaftar(); 
            Swal.fire('Berhasil', 'Data berhasil diperbarui', 'success');
            
            if(action === 'JADWAL') renderPlottingTable();
        } else { 
            Swal.fire('Gagal', result.error, 'error'); 
        }
    }
}

// ==========================================
// 7B. CETAK KARTU TES PESERTA
// ==========================================
function escapeHTML(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function buildKartuTesHTML(p, tglCetak) {
    const val = (value) => escapeHTML(value || '-');
    const photoSrc = p.foto_url ? escapeHTML(p.foto_url) : 'https://via.placeholder.com/160x240?text=FOTO';
    const pageBreakStyle = 'font-family:\'Times New Roman\',serif; width:100%; max-width:210mm; margin:0 auto; box-sizing:border-box; padding:0; background:white;';

    return `
    <div class="page-break" style="${pageBreakStyle}">
        <div style="border:2px solid #000; padding:25px; position:relative;">
            <div style="border-bottom:4px double black; padding-bottom:15px; margin-bottom:25px; display:flex; align-items:center; justify-content:center; gap:20px;">
                <img src="../images/logo.png" onerror="this.src='https://upload.wikimedia.org/wikipedia/commons/2/25/Logo_Kementerian_Agama_Republik_Indonesia_baru_2.png'" style="width:100px; height:auto;">
                <div style="text-align:center; line-height:1.15; color:#000;">
                    <h5 style="margin:0; font-size:16px; font-weight:normal; letter-spacing:1px;">KEMENTERIAN AGAMA REPUBLIK INDONESIA</h5>
                    <h5 style="margin:0; font-size:16px; font-weight:normal; letter-spacing:1px;">KANTOR KEMENTERIAN AGAMA KAB. TASIKMALAYA</h5>
                    <h3 style="margin:5px 0; font-size:22px; font-weight:bold; font-family:Arial,sans-serif;">MADRASAH ALIYAH NEGERI 1 TASIKMALAYA</h3>
                    <p style="margin:0; font-size:12px;">Jln. Pahlawan KHZ. Musthafa Sukamanah Ds.Sukarapih Kec.Sukarame Kab.Tasikmalaya</p>
                    <p style="margin:0; font-size:12px;">Kode Pos 46461 Telp/Fax. (0265) 545719</p>
                    <p style="margin:0; font-size:12px; font-weight:bold;"><i>website : www.man1tasikmalaya.sch.id &nbsp;&nbsp; e-mail : manegeri1tasik@gmail.com</i></p>
                </div>
            </div>

            <div style="text-align:center; margin-bottom:30px; background:#eee; border:1px solid #000; padding:8px 0; border-radius:4px;">
                <h3 style="margin:0; font-size:18px; font-weight:bold; font-family:Arial,sans-serif;">KARTU PESERTA UJIAN SELEKSI (CBT)</h3>
                <p style="margin:2px 0 0 0; font-size:14px;">PENERIMAAN MURID BARU (PMB) TAHUN AJARAN 2026/2027</p>
            </div>

            <div style="display:flex; gap:30px; align-items:flex-start;">
                <div style="width:4cm; flex-shrink:0; text-align:center;">
                    <img src="${photoSrc}" onerror="this.src='https://via.placeholder.com/160x240?text=FOTO'" style="width:4cm; height:6cm; object-fit:cover; border:2px solid #000; padding:2px; display:block;">
                </div>
                <div style="flex:1;">
                    <table style="width:100%; font-size:15px; border-collapse:separate; border-spacing:0 8px; margin-top:10px;">
                        <tr><td style="width:150px; font-weight:bold;">NOMOR PESERTA</td><td>: <span style="font-weight:bold; font-size:18px;">${val(p.no_pendaftaran)}</span></td></tr>
                        <tr><td>NAMA LENGKAP</td><td>: <span style="text-transform:uppercase;">${val(p.nama_lengkap)}</span></td></tr>
                        <tr><td>NISN</td><td>: ${val(p.nisn)}</td></tr>
                        <tr><td>JENIS KELAMIN</td><td>: ${val(p.jenis_kelamin)}</td></tr>
                        <tr><td>ASAL SEKOLAH</td><td>: ${val(p.asal_sekolah)}</td></tr>
                    </table>
                </div>
            </div>
            
            <div style="display:flex; gap:15px; margin-top:25px; align-items:stretch;">
                <div style="border:2px solid #000; padding:12px 15px; flex:1; display:flex; flex-direction:column; justify-content:center;">
                    <table style="width:100%; font-size:16px; font-weight:bold;">
                        <tr><td style="width:160px; white-space:nowrap;">RUANG UJIAN</td><td style="white-space:nowrap;">: ${val(p.ruang_tes)}</td></tr>
                        <tr><td style="white-space:nowrap;">HARI / TANGGAL</td><td style="white-space:nowrap;">: ${val(p.tanggal_tes)}</td></tr>
                        <tr><td style="white-space:nowrap;">SESI UJIAN</td><td style="white-space:nowrap;">: ${val(p.sesi_tes)}</td></tr>
                    </table>
                </div>
                <div style="border:2px solid #000; padding:10px; text-align:center; width:90px; display:flex; flex-direction:column; justify-content:center; align-items:center; flex-shrink:0;">
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://cbt.man1tasikmalaya.sch.id" style="width:100%; height:auto; display:block;" alt="QR Link">
                    <div style="font-size:9.5px; font-weight:bold; margin-top:6px; letter-spacing:0.5px; line-height:1.2;">SCAN LOGIN<br>UJIAN CBT</div>
                </div>
            </div>

            <div style="margin-top:20px; font-size:13px; border-top:2px dashed #000; padding-top:15px;">
                <b style="text-decoration:underline;">TATA TERTIB PESERTA UJIAN CBT:</b>
                <ol style="margin:5px 0 0 0; padding-left:20px; line-height:1.6;">
                    <li>Ujian dilaksanakan berbasis komputer (Computer Based Test).</li>
                    <li>Peserta <b>wajib membawa smartphone dan dilengkapi dengan kuota internet.</b></li>
                    <li>Sistem ujian (CBT) dapat diakses melalui link: <b>https://cbt.man1tasikmalaya.sch.id</b></li>
                    <li>Peserta <b>wajib hadir di madrasah</b> 30 menit sebelum sesi dimulai.</li>
                    <li>Wajib membawa <b>Kartu Peserta</b> ini (telah dicetak) sebagai bukti login ujian.</li>
                    <li>Berpakaian seragam sekolah asal, rapi, dan bersepatu.</li>
                    <li>Dilarang melakukan kecurangan selama melaksanakan tes.</li>
                    <li>Segala bentuk kecurangan terdeteksi sistem dan akan dikenakan sanksi sesuai ketentuan.</li>
                </ol>
            </div>

            <div style="margin-top:30px; display:flex; justify-content:space-between; align-items:flex-end;">
                <div style="font-size:11px; font-style:italic;">
                    <i>Dicetak otomatis oleh sistem pada: ${escapeHTML(tglCetak)}</i>
                </div>
            </div>
        </div>
    </div>`;
}

function cetakKartuTesPendaftar(pendaftarList) {
    if (!Array.isArray(pendaftarList) || pendaftarList.length === 0) {
        Swal.fire('Info', 'Tidak ada peserta yang bisa dicetak.', 'info');
        return;
    }

    const belumTerjadwal = pendaftarList.filter(p => !p.ruang_tes || !p.tanggal_tes || !p.sesi_tes);
    const lanjutCetak = () => {
        const now = new Date();
        const opts = { timeZone: 'Asia/Jakarta', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
        const tglCetak = now.toLocaleDateString('id-ID', opts) + ' WIB';
        const area = document.getElementById('cetak-verifikasi-area');
        if (!area) {
            Swal.fire('Gagal', 'Area cetak tidak ditemukan.', 'error');
            return;
        }

        area.innerHTML = pendaftarList.map(p => buildKartuTesHTML(p, tglCetak)).join('');
        setTimeout(() => {
            window.print();
            setTimeout(() => { area.innerHTML = ''; }, 3000);
        }, 300);
    };

    if (belumTerjadwal.length > 0) {
        Swal.fire({
            title: 'Sebagian Belum Terjadwal',
            html: `<b>${belumTerjadwal.length}</b> dari ${pendaftarList.length} peserta belum memiliki ruang, tanggal, atau sesi tes. Kartu tetap bisa dicetak, tetapi jadwal akan tampil sebagai tanda minus.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Tetap Cetak',
            cancelButtonText: 'Batal',
            confirmButtonColor: '#dc2626'
        }).then(result => {
            if (result.isConfirmed) lanjutCetak();
        });
        return;
    }

    lanjutCetak();
}

window.cetakKartuTes = function(id) {
    const pendaftar = allPendaftar.find(p => p.id === id);
    if (!pendaftar) {
        Swal.fire('Info', 'Data peserta tidak ditemukan.', 'info');
        return;
    }
    cetakKartuTesPendaftar([pendaftar]);
}

// ==========================================
// 8. LOGIKA PANEL MANAJEMEN JADWAL 
// ==========================================
function renderScheduleSettings() {
    const container = document.getElementById('config-builder-container');
    if (!container) return;
    container.innerHTML = '';
    
    if (!Array.isArray(scheduleConfig)) {
        scheduleConfig = [];
    }

    if (scheduleConfig.length === 0) {
        container.innerHTML = '<div style="color:var(--ink-soft); font-size:0.8rem; text-align:center; padding:20px;">Belum ada pengaturan hari tes. Klik tombol "Tambah Hari Tes".</div>';
        return;
    }

    scheduleConfig.forEach((hari, hIndex) => {
        const item = document.createElement('div');
        item.style.cssText = 'border: 1px solid var(--rule); border-radius: var(--radius); padding: 14px; background: var(--bg); position: relative;';
        
        let html = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:10px;">
                <input type="text" class="input-modern-form cfg-input-tgl" data-hindex="${hIndex}" placeholder="Cth: Senin, 20 Mei 2026" value="${hari.tanggal || ''}" style="font-weight:bold; flex:1; min-width:200px;">
                <div style="display:flex; gap:6px;">
                    <button class="btn btn-secondary btn-sm" onclick="duplicateConfigDate(${hIndex})" title="Duplikat Hari Ini"><i class="ph ph-copy"></i> Copy</button>
                    <button class="btn btn-secondary btn-sm" style="color:var(--red);" onclick="removeConfigDate(${hIndex})"><i class="ph ph-trash"></i></button>
                </div>
            </div>
            
            <div style="margin-left: 10px; border-left: 2px dashed var(--rule-dark); padding-left: 12px; display:flex; flex-direction:column; gap:8px;">
        `;
        
        if (hari.sesi && hari.sesi.length > 0) {
            hari.sesi.forEach((sesi, sIndex) => {
                html += `
                    <div style="background:var(--surface); padding:10px 14px; border-radius:8px; border:1px solid var(--rule); margin-bottom:8px;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                            <input type="text" class="input-modern-form cfg-input-sesi-nama" data-hindex="${hIndex}" data-sindex="${sIndex}" placeholder="Nama Sesi (Cth: Sesi 1 - 07.30)" value="${sesi.nama || ''}" style="width:250px; font-weight:600;">
                            <button class="btn btn-secondary btn-sm" style="color:var(--red);" onclick="removeConfigSession(${hIndex}, ${sIndex})"><i class="ph ph-trash"></i> Hapus Sesi</button>
                        </div>
                        
                        <div style="display:flex; flex-direction:column; gap:6px; margin-left:14px; border-left:2px solid var(--rule); padding-left:10px;">
        `;
        
                if (sesi.ruangan && sesi.ruangan.length > 0) {
                    sesi.ruangan.forEach((r, rIndex) => {
                        html += `
                            <div style="display:flex; align-items:center; gap:8px;">
                                <input type="text" class="input-modern-form cfg-input-ruang-nama" data-hindex="${hIndex}" data-sindex="${sIndex}" data-rindex="${rIndex}" placeholder="Nama Ruang (Cth: Ruang 1)" value="${r.nama || ''}" style="width:120px; padding:6px; font-size:0.75rem;">
                                <div style="display:flex; align-items:center; gap:4px;">
                                    <span style="font-size:0.7rem; color:var(--ink-soft);">Kapasitas:</span>
                                    <input type="number" class="input-modern-form cfg-input-ruang-capacity" data-hindex="${hIndex}" data-sindex="${sIndex}" data-rindex="${rIndex}" value="${r.capacity || 20}" min="1" style="width:60px; padding:6px; font-size:0.75rem;">
                                </div>
                                <button class="page-btn" style="color:var(--red); width:24px; height:24px;" onclick="removeConfigRoom(${hIndex}, ${sIndex}, ${rIndex})"><i class="ph ph-x"></i></button>
                            </div>
                        `;
                    });
                }
                
                html += `
                            <button class="btn btn-secondary btn-sm" style="align-self:flex-start; margin-top:4px; font-size:0.7rem; padding:4px 10px;" onclick="addConfigRoom(${hIndex}, ${sIndex})">
                                <i class="ph ph-plus"></i> Tambah Ruangan
                            </button>
                        </div>
                    </div>
                `;
            });
        } else {
            html += `<span style="font-size:0.7rem; color:var(--ink-soft);">Belum ada sesi di hari ini.</span>`;
        }
        
        html += `
                <button class="btn btn-secondary btn-sm" style="align-self:flex-start; margin-top:4px;" onclick="addConfigSession(${hIndex})">
                    <i class="ph ph-plus"></i> Tambah Sesi
                </button>
            </div>
        `;
        
        item.innerHTML = html;
        container.appendChild(item);
    });
}

window.addConfigDate = function() {
    window.syncConfigFromUI();
    if(!Array.isArray(scheduleConfig)) scheduleConfig = [];
    scheduleConfig.push({ tanggal: "", sesi: [{ nama: "Sesi 1", ruangan: [{nama:"Ruang 1", capacity:20}] }] });
    renderScheduleSettings();
}

window.duplicateConfigDate = function(hIndex) {
    window.syncConfigFromUI();
    let toCopy = JSON.parse(JSON.stringify(scheduleConfig[hIndex]));
    toCopy.tanggal = toCopy.tanggal ? toCopy.tanggal + " (Copy)" : "Hari Baru";
    scheduleConfig.splice(hIndex + 1, 0, toCopy);
    renderScheduleSettings();
}

window.removeConfigDate = function(hIndex) {
    if(confirm('Hapus hari tes ini beserta seluruh sesinya?')) {
        scheduleConfig.splice(hIndex, 1);
        renderScheduleSettings();
    }
}

window.addConfigSession = function(hIndex) {
    window.syncConfigFromUI();
    scheduleConfig[hIndex].sesi.push({ nama: "", ruangan: [{nama:"Ruang 1", capacity:20}] });
    renderScheduleSettings();
}

window.removeConfigSession = function(hIndex, sIndex) {
    window.syncConfigFromUI();
    scheduleConfig[hIndex].sesi.splice(sIndex, 1);
    renderScheduleSettings();
}

window.addConfigRoom = function(hIndex, sIndex) {
    window.syncConfigFromUI();
    let nextNum = scheduleConfig[hIndex].sesi[sIndex].ruangan.length + 1;
    scheduleConfig[hIndex].sesi[sIndex].ruangan.push({ nama: "Ruang " + nextNum, capacity: 20 });
    renderScheduleSettings();
}

window.removeConfigRoom = function(hIndex, sIndex, rIndex) {
    window.syncConfigFromUI();
    scheduleConfig[hIndex].sesi[sIndex].ruangan.splice(rIndex, 1);
    renderScheduleSettings();
}

window.syncConfigFromUI = function() {
    document.querySelectorAll('.cfg-input-tgl').forEach(el => {
        scheduleConfig[el.dataset.hindex].tanggal = el.value.trim();
    });
    document.querySelectorAll('.cfg-input-sesi-nama').forEach(el => {
        scheduleConfig[el.dataset.hindex].sesi[el.dataset.sindex].nama = el.value.trim();
    });
    document.querySelectorAll('.cfg-input-ruang-nama').forEach(el => {
        scheduleConfig[el.dataset.hindex].sesi[el.dataset.sindex].ruangan[el.dataset.rindex].nama = el.value.trim();
    });
    document.querySelectorAll('.cfg-input-ruang-capacity').forEach(el => {
        scheduleConfig[el.dataset.hindex].sesi[el.dataset.sindex].ruangan[el.dataset.rindex].capacity = parseInt(el.value) || 0;
    });
}

window.saveScheduleConfig = async function() {
    syncConfigFromUI();
    
    let isValid = true;
    if(scheduleConfig.length === 0) isValid = false;
    scheduleConfig.forEach(h => {
        if(!h.tanggal) isValid = false;
        if(h.sesi.length === 0) isValid = false;
        h.sesi.forEach(s => {
            if(!s.nama) isValid = false;
            if(!s.ruangan || s.ruangan.length === 0) isValid = false;
            (s.ruangan || []).forEach(r => {
                if(!r.nama || r.capacity <= 0) isValid = false;
            });
        });
    });

    if (!isValid) {
        Swal.fire('Warning', 'Isian tidak lengkap. Pastikan nama hari, nama sesi, nama ruangan, dan kapasitas terisi (min. 1).', 'warning'); 
        return;
    }

    localStorage.setItem('JADWAL_CONFIG', JSON.stringify(scheduleConfig));
    
    try { 
        await apiPost('admin?action=jadwal', { config: scheduleConfig });
    } catch(e) { 
        console.warn('Gagal simpan ke database. Tersimpan di lokal.');
    }

    Swal.fire('Berhasil', 'Pengaturan master jadwal disimpan.', 'success');
    renderScheduleSettings(); 
    updatePlottingFilters(); 
    renderPlottingTable(); 
}

window.updatePlottingFilters = function() {
    const selTgl = document.getElementById('filterPlotTgl');
    const selSesi = document.getElementById('filterPlotSesi');
    const selRuang = document.getElementById('filterPlotRuang');
    
    if(!selTgl || !selSesi || !selRuang) return;

    const curTgl = selTgl.value;
    const curSesi = selSesi.value;
    const curRuang = selRuang.value;

    let uniqueDates = scheduleConfig.map(h => h.tanggal);

    // Sesi: filter berdasarkan tanggal yang dipilih di filter atas
    let uniqueSessions = new Set();
    let uniqueRooms = new Set();
    if (curTgl && curTgl !== 'UNASSIGNED') {
        const hari = scheduleConfig.find(h => h.tanggal === curTgl);
        if (hari) {
            (hari.sesi || []).forEach(s => {
                uniqueSessions.add(s.nama);
                (s.ruangan || []).forEach(r => uniqueRooms.add(r.nama));
            });
        }
    } else {
        scheduleConfig.forEach(h => {
            (h.sesi || []).forEach(s => {
                uniqueSessions.add(s.nama);
                (s.ruangan || []).forEach(r => uniqueRooms.add(r.nama));
            });
        });
    }
    uniqueSessions = Array.from(uniqueSessions);
    let allRoomsList = Array.from(uniqueRooms);

    // Jika sesi dipilih, filter ruangan berdasarkan sesi tersebut
    if (curSesi && curSesi !== 'UNASSIGNED') {
        let filteredRooms = new Set();
        const targetHaris = (curTgl && curTgl !== 'UNASSIGNED') 
            ? scheduleConfig.filter(h => h.tanggal === curTgl) 
            : scheduleConfig;
        targetHaris.forEach(h => {
            (h.sesi || []).forEach(s => {
                if (s.nama === curSesi) {
                    (s.ruangan || []).forEach(r => filteredRooms.add(r.nama));
                }
            });
        });
        allRoomsList = Array.from(filteredRooms);
    }

    selTgl.innerHTML = '<option value="">Semua Tanggal</option>' + uniqueDates.map(d => `<option value="${d}">${d}</option>`).join('') + '<option value="UNASSIGNED">-- Belum Diatur --</option>';
    selSesi.innerHTML = '<option value="">Semua Sesi</option>' + uniqueSessions.map(s => `<option value="${s}">${s}</option>`).join('') + '<option value="UNASSIGNED">-- Belum Diatur --</option>';
    
    let optRuang = '<option value="">Semua Ruangan</option>';
    allRoomsList.forEach(r => {
        optRuang += `<option value="${r}">${r}</option>`;
    });
    optRuang += '<option value="UNASSIGNED">-- Belum Diatur --</option>';
    selRuang.innerHTML = optRuang;

    selTgl.value = curTgl;
    // Jika sesi yang dipilih sebelumnya tidak ada di list baru, reset
    if (curSesi && !uniqueSessions.includes(curSesi) && curSesi !== 'UNASSIGNED') {
        selSesi.value = '';
    } else {
        selSesi.value = curSesi;
    }
    // Jika ruangan yang dipilih sebelumnya tidak ada di list baru, reset
    if (curRuang && !allRoomsList.includes(curRuang) && curRuang !== 'UNASSIGNED') {
        selRuang.value = '';
    } else {
        selRuang.value = curRuang;
    }
}

function getPlottingEligibleStudents() {
    return allPendaftar.filter(p => {
        if (!p.status_verifikasi && p.status_verifikasi !== false) return false;
        if (p.jalur === 'REGULER' && p.status_verifikasi === true) return true;
        if (p.jalur === 'PRESTASI' && p.status_verifikasi === false) return true;
        if (p.jalur === 'PRESTASI' && p.status_verifikasi === true && p.status_kelulusan === 'TIDAK DITERIMA') return true;
        return false;
    });
}

function getPlottingValue(p, field) {
    return plottingChanges[p.id]?.[field] ?? p[field] ?? '';
}

function renderPlottingSessionStats() {
    const container = document.getElementById('plottingSessionStats');
    if (!container) return;

    const eligibleStudents = getPlottingEligibleStudents();
    const sessionCounts = new Map();
    const unassignedRooms = new Map();

    eligibleStudents.forEach(p => {
        const tanggal = getPlottingValue(p, 'tanggal_tes');
        const sesi = getPlottingValue(p, 'sesi_tes');
        const ruang = getPlottingValue(p, 'ruang_tes') || 'Tanpa ruangan';
        if (!tanggal || !sesi) {
            const key = 'Tanpa sesi';
            unassignedRooms.set(key, (unassignedRooms.get(key) || 0) + 1);
            return;
        }

        const key = `${tanggal}||${sesi}`;
        if (!sessionCounts.has(key)) {
            sessionCounts.set(key, { tanggal, sesi, count: 0, rooms: new Map() });
        }
        const stat = sessionCounts.get(key);
        stat.count++;
        stat.rooms.set(ruang, (stat.rooms.get(ruang) || 0) + 1);
    });

    const configuredSessions = [];
    scheduleConfig.forEach(h => {
        (h.sesi || []).forEach(s => {
            const key = `${h.tanggal}||${s.nama}`;
            const counted = sessionCounts.get(key);
            const rooms = new Map();
            (s.ruangan || []).forEach(r => rooms.set(r.nama || '-', counted?.rooms.get(r.nama) || 0));
            if (counted) {
                counted.rooms.forEach((count, roomName) => {
                    if (!rooms.has(roomName)) rooms.set(roomName, count);
                });
            }
            configuredSessions.push({
                tanggal: h.tanggal || '-',
                sesi: s.nama || '-',
                count: counted ? counted.count : 0,
                rooms
            });
            sessionCounts.delete(key);
        });
    });

    const extraSessions = Array.from(sessionCounts.values()).map(item => ({
        ...item,
        rooms: item.rooms || new Map()
    }));
    const stats = configuredSessions.concat(extraSessions);
    const unassignedCount = Array.from(unassignedRooms.values()).reduce((total, count) => total + count, 0);
    if (unassignedCount > 0) {
        stats.push({ tanggal: 'Belum diatur', sesi: 'Tanpa sesi', count: unassignedCount, rooms: unassignedRooms });
    }

    if (stats.length === 0) {
        container.innerHTML = '<div class="session-stat-item"><div class="session-stat-date">Belum ada data</div><div class="session-stat-main"><span class="session-stat-name">Sesi</span><span class="session-stat-count">0</span></div><div class="session-room-list"><span class="session-room-chip">Ruangan <b>0</b></span></div></div>';
        return;
    }

    container.innerHTML = stats.map(item => {
        const rooms = Array.from((item.rooms || new Map()).entries());
        const roomHtml = rooms.length
            ? rooms.map(([roomName, count]) => `<span class="session-room-chip">${roomName} <b>${count}</b></span>`).join('')
            : '<span class="session-room-chip">Ruangan <b>0</b></span>';
        return `
        <div class="session-stat-item" title="${item.tanggal} - ${item.sesi}">
            <div class="session-stat-date">${item.tanggal}</div>
            <div class="session-stat-main">
                <span class="session-stat-name">${item.sesi}</span>
                <span class="session-stat-count">${item.count}</span>
            </div>
            <div class="session-room-list">${roomHtml}</div>
        </div>
    `;
    }).join('');
}

function renderPlottingTable() {
    const tbody = document.getElementById('plottingTableBody');
    renderPlottingSessionStats();
    
    const fTgl = document.getElementById('filterPlotTgl')?.value || "";
    const fSesi = document.getElementById('filterPlotSesi')?.value || "";
    const fRuang = document.getElementById('filterPlotRuang')?.value || "";
    const searchKeyword = (document.getElementById('searchPlotting')?.value || "").trim().toLowerCase();

    let targetStudents = getPlottingEligibleStudents();
    
    if (fTgl) {
        if (fTgl === 'UNASSIGNED') targetStudents = targetStudents.filter(p => !getPlottingValue(p, 'tanggal_tes'));
        else targetStudents = targetStudents.filter(p => getPlottingValue(p, 'tanggal_tes') === fTgl);
    }
    if (fSesi) {
        if (fSesi === 'UNASSIGNED') targetStudents = targetStudents.filter(p => !getPlottingValue(p, 'sesi_tes'));
        else targetStudents = targetStudents.filter(p => getPlottingValue(p, 'sesi_tes') === fSesi);
    }
    if (fRuang) {
        if (fRuang === 'UNASSIGNED') targetStudents = targetStudents.filter(p => !getPlottingValue(p, 'ruang_tes'));
        else targetStudents = targetStudents.filter(p => getPlottingValue(p, 'ruang_tes') === fRuang);
    }
    if (searchKeyword) {
        targetStudents = targetStudents.filter(p => {
            const searchable = [
                p.nama_lengkap,
                p.nisn,
                p.no_pendaftaran,
                p.asal_sekolah
            ].filter(Boolean).join(' ').toLowerCase();
            return searchable.includes(searchKeyword);
        });
    }

    const countSpan = document.getElementById('plotCount');
    if (countSpan) countSpan.innerText = targetStudents.length;

    tbody.innerHTML = '';
    if (targetStudents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;">Belum ada siswa Reguler murni / Tidak ada yang cocok dengan filter.</td></tr>';
        return;
    }

    let uniqueDates = scheduleConfig.map(h => h.tanggal);

    const optDates = '<option value="">- Belum Diatur -</option>' + uniqueDates.map(d => `<option value="${d}">${d}</option>`).join('');

    // Helper: ambil sesi berdasarkan tanggal
    function getSessionsForDate(tanggal) {
        const hari = scheduleConfig.find(h => h.tanggal === tanggal);
        if (!hari) return [];
        return (hari.sesi || []).map(s => s.nama);
    }

    // Helper: ambil ruangan berdasarkan tanggal + sesi
    function getRoomsForSession(tanggal, sesiNama) {
        const hari = scheduleConfig.find(h => h.tanggal === tanggal);
        if (!hari) return [];
        const sesi = (hari.sesi || []).find(s => s.nama === sesiNama);
        if (!sesi) return [];
        return (sesi.ruangan || []).map(r => r.nama);
    }

    // Fallback: semua sesi & ruangan (jika tanggal belum dipilih)
    function getAllSessions() {
        let all = new Set();
        scheduleConfig.forEach(h => (h.sesi || []).forEach(s => all.add(s.nama)));
        return Array.from(all);
    }
    function getAllRooms() {
        let all = new Set();
        scheduleConfig.forEach(h => (h.sesi || []).forEach(s => (s.ruangan || []).forEach(r => all.add(r.nama))));
        return Array.from(all);
    }

    targetStudents.forEach(p => {
        // Tentukan opsi sesi berdasarkan tanggal yang sudah di-set
        const curTanggal = getPlottingValue(p, 'tanggal_tes');
        const curSesi = getPlottingValue(p, 'sesi_tes');
        const curRuang = getPlottingValue(p, 'ruang_tes');
        
        const sessionList = curTanggal ? getSessionsForDate(curTanggal) : getAllSessions();
        const optSessions = '<option value="">- Belum Diatur -</option>' + sessionList.map(s => `<option value="${s}">${s}</option>`).join('');

        // Tentukan opsi ruangan berdasarkan tanggal + sesi yang sudah di-set
        const roomList = (curTanggal && curSesi) ? getRoomsForSession(curTanggal, curSesi) : getAllRooms();
        let optRooms = '<option value="">- Belum Diatur -</option>';
        roomList.forEach(r => { optRooms += `<option value="${r}">${r}</option>`; });

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Peserta">
                <div style="font-weight:600; color:#1e293b;">${p.nama_lengkap}</div>
                <div style="font-size:0.8rem; color:#64748b;">${p.asal_sekolah || '-'}</div>
            </td>
            <td data-label="Tanggal Tes">
                <select class="input-modern-form" style="padding: 8px; font-size:0.85rem;" onchange="onPlotTanggalChange('${p.id}', this)">
                    ${optDates}
                </select>
            </td>
            <td data-label="Sesi CBT">
                <select class="input-modern-form plot-sesi" data-id="${p.id}" style="padding: 8px; font-size:0.85rem;" onchange="onPlotSesiChange('${p.id}', this)">
                    ${optSessions}
                </select>
            </td>
            <td data-label="Ruangan">
                <select class="input-modern-form plot-ruang" data-id="${p.id}" style="padding: 8px; font-size:0.85rem;" onchange="markPlottingChange('${p.id}', 'ruang_tes', this.value)">
                    ${optRooms}
                </select>
            </td>
        `;
        
        const selects = tr.querySelectorAll('select');
        if(curTanggal && selects[0]) selects[0].value = curTanggal;
        if(curSesi && selects[1]) selects[1].value = curSesi;
        if(curRuang && selects[2]) selects[2].value = curRuang;
        
        tbody.appendChild(tr);
    });
}

// Handler ketika tanggal diubah di baris plotting → update dropdown sesi & ruangan
window.onPlotTanggalChange = function(id, selectEl) {
    const tanggal = selectEl.value;
    markPlottingChange(id, 'tanggal_tes', tanggal);

    // Cari row yang sama
    const row = selectEl.closest('tr');
    const selSesi = row.querySelector('.plot-sesi');
    const selRuang = row.querySelector('.plot-ruang');

    // Rebuild opsi sesi berdasarkan tanggal yang dipilih
    let sessionList = [];
    if (tanggal) {
        const hari = scheduleConfig.find(h => h.tanggal === tanggal);
        if (hari) sessionList = (hari.sesi || []).map(s => s.nama);
    } else {
        scheduleConfig.forEach(h => (h.sesi || []).forEach(s => sessionList.push(s.nama)));
        sessionList = [...new Set(sessionList)];
    }
    selSesi.innerHTML = '<option value="">- Belum Diatur -</option>' + sessionList.map(s => `<option value="${s}">${s}</option>`).join('');
    selSesi.value = '';

    // Reset ruangan juga
    selRuang.innerHTML = '<option value="">- Belum Diatur -</option>';
    selRuang.value = '';

    // Reset sesi & ruang di plottingChanges
    markPlottingChange(id, 'sesi_tes', '');
    markPlottingChange(id, 'ruang_tes', '');
}

// Handler ketika sesi diubah di baris plotting → update dropdown ruangan
window.onPlotSesiChange = function(id, selectEl) {
    const sesiNama = selectEl.value;
    markPlottingChange(id, 'sesi_tes', sesiNama);

    const row = selectEl.closest('tr');
    const selTanggal = row.querySelector('select'); // first select = tanggal
    const selRuang = row.querySelector('.plot-ruang');
    const tanggal = selTanggal.value;

    // Rebuild opsi ruangan berdasarkan tanggal + sesi
    let roomList = [];
    if (tanggal && sesiNama) {
        const hari = scheduleConfig.find(h => h.tanggal === tanggal);
        if (hari) {
            const sesi = (hari.sesi || []).find(s => s.nama === sesiNama);
            if (sesi) roomList = (sesi.ruangan || []).map(r => r.nama);
        }
    } else {
        // Fallback: semua ruangan
        scheduleConfig.forEach(h => (h.sesi || []).forEach(s => (s.ruangan || []).forEach(r => roomList.push(r.nama))));
        roomList = [...new Set(roomList)];
    }
    selRuang.innerHTML = '<option value="">- Belum Diatur -</option>' + roomList.map(r => `<option value="${r}">${r}</option>`).join('');
    selRuang.value = '';
    markPlottingChange(id, 'ruang_tes', '');
}

window.markPlottingChange = function(id, field, value) {
    if(!plottingChanges[id]) plottingChanges[id] = {};
    plottingChanges[id][field] = value;
    document.getElementById('btn-save-plotting').style.display = 'inline-flex';
    renderPlottingSessionStats();
}

window.saveManualPlotting = async function() {
    const ids = Object.keys(plottingChanges);
    if(ids.length === 0) return;

    Swal.showLoading();
    try {
        const promises = ids.map(id => apiPost('admin?action=plotting', { changes: { [id]: plottingChanges[id] } }));
        await Promise.all(promises);
        
        ids.forEach(id => {
            let idx = allPendaftar.findIndex(x => x.id === id);
            if(idx !== -1) {
                Object.assign(allPendaftar[idx], plottingChanges[id]);
            }
        });
        
        plottingChanges = {};
        document.getElementById('btn-save-plotting').style.display = 'none';
        Swal.fire('Berhasil', 'Jadwal tes berhasil diperbarui.', 'success');
        
    } catch (err) {
        Swal.fire('Gagal', 'Terjadi kesalahan saat menyimpan.', 'error');
    }
}

window.autoPlotting = async function() {
    const confirm = await Swal.fire({
        title: 'Jadwalkan Otomatis?',
        text: "Siswa yang belum punya jadwal akan dibagikan jadwal & ruangan secara otomatis.",
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Ya, Jalankan'
    });

    if (!confirm.isConfirmed) return;

    let unassigned = allPendaftar.filter(p => {
        if (p.ruang_tes) return false; 
        if (p.jalur === 'REGULER' && p.status_verifikasi === true) return true;
        if (p.jalur === 'PRESTASI' && p.status_verifikasi === false) return true;
        if (p.jalur === 'PRESTASI' && p.status_verifikasi === true && p.status_kelulusan === 'TIDAK DITERIMA') return true;
        return false;
    });

    if (unassigned.length === 0) {
        Swal.fire('Info', 'Semua siswa yang memenuhi syarat sudah memiliki jadwal.', 'info');
        return;
    }

    let slots = {};
    scheduleConfig.forEach(h => {
        slots[h.tanggal] = {};
        (h.sesi || []).forEach(s => {
            slots[h.tanggal][s.nama] = {};
            (s.ruangan || []).forEach(r => {
                 slots[h.tanggal][s.nama][r.nama] = { current: 0, max: r.capacity };
            });
        });
    });

    let assigned = allPendaftar.filter(p => {
        if (!p.ruang_tes) return false; 
        if (p.jalur === 'REGULER' && p.status_verifikasi === true) return true;
        if (p.jalur === 'PRESTASI' && p.status_verifikasi === false) return true;
        if (p.jalur === 'PRESTASI' && p.status_verifikasi === true && p.status_kelulusan === 'TIDAK DITERIMA') return true;
        return false;
    });

    assigned.forEach(p => {
        if (slots[p.tanggal_tes] && slots[p.tanggal_tes][p.sesi_tes] && slots[p.tanggal_tes][p.sesi_tes][p.ruang_tes] !== undefined) {
            slots[p.tanggal_tes][p.sesi_tes][p.ruang_tes].current++;
        }
    });

    let updates = [];
    for (let student of unassigned) {
        let assignedSlot = null;
        
        for (let h of scheduleConfig) {
            if (assignedSlot) break;
            for (let s of (h.sesi || [])) {
                if (assignedSlot) break;
                for (let r of (s.ruangan || [])) {
                    let roomName = r.nama;
                    let slotState = slots[h.tanggal][s.nama][roomName];
                    if (slotState && slotState.current < slotState.max) {
                        slotState.current++;
                        assignedSlot = { 
                            tanggal_tes: h.tanggal, 
                            sesi_tes: s.nama, 
                            ruang_tes: roomName 
                        };
                        break;
                    }
                }
            }
        }

        if (assignedSlot) {
            updates.push({ id: student.id, ...assignedSlot });
        } else {
            Swal.fire('Peringatan', 'Kapasitas Ruangan & Sesi sudah penuh. Plotting dihentikan sebagian.', 'warning');
            break;
        }
    }

    if (updates.length > 0) {
        Swal.showLoading();
        try {
            const promises = updates.map(u => apiPost('admin?action=plotting', {
                changes: { [u.id]: { tanggal_tes: u.tanggal_tes, sesi_tes: u.sesi_tes, ruang_tes: u.ruang_tes } }
            }));
            
            await Promise.all(promises);

            updates.forEach(u => {
                let idx = allPendaftar.findIndex(x => x.id === u.id);
                if(idx !== -1) {
                    allPendaftar[idx].tanggal_tes = u.tanggal_tes;
                    allPendaftar[idx].sesi_tes = u.sesi_tes;
                    allPendaftar[idx].ruang_tes = u.ruang_tes;
                }
            });
            
            Swal.fire('Berhasil', `${updates.length} siswa telah didistribusikan ke dalam jadwal.`, 'success');
            renderPlottingTable();
            
        } catch (err) {
            Swal.fire('Gagal', 'Terjadi kesalahan sistem.', 'error');
        }
    }
}

// ==========================================
// 9. PLOTTING MANUAL VIA EXCEL
// ==========================================

/**
 * Export data peserta CBT ke Excel untuk plotting manual.
 * Kolom: No Pendaftaran, Nama, NISN, Asal Sekolah, Tanggal Tes, Sesi/Waktu Ujian, Ruangan
 */
window.exportPlottingExcel = function() {
    // Ambil hanya peserta yang wajib CBT (sama dengan kriteria renderPlottingTable)
    const targetStudents = allPendaftar.filter(p => {
        if (!p.status_verifikasi && p.status_verifikasi !== false) return false;
        if (p.jalur === 'REGULER' && p.status_verifikasi === true) return true;
        if (p.jalur === 'PRESTASI' && p.status_verifikasi === false) return true;
        if (p.jalur === 'PRESTASI' && p.status_verifikasi === true && p.status_kelulusan === 'TIDAK DITERIMA') return true;
        return false;
    });

    if (targetStudents.length === 0) {
        Swal.fire('Info', 'Belum ada peserta yang memenuhi syarat untuk diplot (Reguler terverifikasi / Prestasi ditolak).', 'info');
        return;
    }

    const excelData = targetStudents.map(p => ({
        'No Pendaftaran': p.no_pendaftaran || '-',
        'Nama Lengkap':   p.nama_lengkap || '-',
        'NISN':           p.nisn || '-',
        'Asal Sekolah':   p.asal_sekolah || '-',
        'Tanggal Tes':    p.tanggal_tes || '',
        'Sesi/Waktu Ujian': p.sesi_tes || '',
        'Ruangan':        p.ruang_tes || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);

    // Set lebar kolom
    worksheet['!cols'] = [
        { wch: 18 }, // No Pendaftaran
        { wch: 32 }, // Nama Lengkap
        { wch: 16 }, // NISN
        { wch: 35 }, // Asal Sekolah
        { wch: 24 }, // Tanggal Tes
        { wch: 28 }, // Sesi/Waktu Ujian
        { wch: 18 }, // Ruangan
    ];

    // Style header (warna background teal)
    const headerRange = XLSX.utils.decode_range(worksheet['!ref']);
    for (let C = headerRange.s.c; C <= headerRange.e.c; C++) {
        const cellAddr = XLSX.utils.encode_cell({ r: 0, c: C });
        if (!worksheet[cellAddr]) continue;
        worksheet[cellAddr].s = {
            fill: { fgColor: { rgb: '00796B' } },
            font: { bold: true, color: { rgb: 'FFFFFF' } },
            alignment: { horizontal: 'center' }
        };
    }

    // Kunci kolom A-D (tidak perlu diubah), kolom E-G untuk diisi
    const note = 'PETUNJUK: Isi kolom Tanggal Tes, Sesi/Waktu Ujian, dan Ruangan. Jangan ubah No Pendaftaran!';
    worksheet['A1'].c = [{ a: 'Admin', t: note }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Plotting Peserta CBT');

    const tgl = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-');
    XLSX.writeFile(workbook, `Template_Plotting_CBT_PMB_${tgl}.xlsx`);

    Swal.fire({
        icon: 'success',
        title: 'File Berhasil Didownload',
        html: `<p style="font-size:.88rem; line-height:1.6; color:#334155;">
            File <b>Template_Plotting_CBT_PMB_${tgl}.xlsx</b> sudah didownload.<br><br>
            Isi kolom <b>Tanggal Tes</b>, <b>Sesi/Waktu Ujian</b>, dan <b>Ruangan</b> di Excel,
            lalu kembali ke web dan klik <b>Import Excel Plotting</b>.
        </p>`,
        confirmButtonText: 'Mengerti',
        confirmButtonColor: '#00796b'
    });
};

/**
 * Import hasil plotting dari file Excel.
 * Match berdasarkan No Pendaftaran.
 * Update: tanggal_tes, sesi_tes, ruang_tes, DAN asal_sekolah (jika diubah).
 */
window.importPlottingExcel = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = async function(e) {
        const file = e.target.files[0];
        if (!file) return;
        document.body.removeChild(input);

        Swal.fire({ title: 'Membaca File...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        try {
            const arrayBuffer = await file.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'arraybuffer' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

            if (!rows || rows.length === 0) {
                Swal.fire('Error', 'File Excel kosong atau format tidak dikenali.', 'error');
                return;
            }

            // Validasi kolom wajib
            const firstRow = rows[0];
            const requiredCols = ['No Pendaftaran', 'Tanggal Tes', 'Sesi/Waktu Ujian', 'Ruangan'];
            const missingCols = requiredCols.filter(col => !(col in firstRow));
            if (missingCols.length > 0) {
                Swal.fire('Format Salah', `Kolom tidak ditemukan: <b>${missingCols.join(', ')}</b><br><br>Gunakan file yang diexport dari sistem ini.`, 'error');
                return;
            }

            // Apakah kolom Asal Sekolah ada di file?
            const hasSekolahCol = 'Asal Sekolah' in firstRow;

            // Match dengan data allPendaftar
            const updates  = [];
            const notFound = [];
            const skipped  = []; // baris tanpa perubahan apapun

            rows.forEach(row => {
                const noPendaftaran = String(row['No Pendaftaran'] || '').trim();
                const tanggal       = String(row['Tanggal Tes']     || '').trim();
                const sesi          = String(row['Sesi/Waktu Ujian']|| '').trim();
                const ruang         = String(row['Ruangan']         || '').trim();
                const sekolah       = hasSekolahCol ? String(row['Asal Sekolah'] || '').trim() : '';

                if (!noPendaftaran) return;

                const peserta = allPendaftar.find(p => p.no_pendaftaran === noPendaftaran);
                if (!peserta) {
                    // Hanya catat not-found jika baris tidak kosong sama sekali
                    if (tanggal || sesi || ruang || sekolah) notFound.push(noPendaftaran);
                    return;
                }

                // Deteksi perubahan nama sekolah
                const sekolahLama  = (peserta.asal_sekolah || '').trim();
                const sekolahBerubah = hasSekolahCol && sekolah && sekolah !== sekolahLama;

                // Skip baris yang tidak ada perubahan apapun
                if (!tanggal && !sesi && !ruang && !sekolahBerubah) {
                    skipped.push(noPendaftaran);
                    return;
                }

                updates.push({
                    id:              peserta.id,
                    no:              noPendaftaran,
                    nama:            peserta.nama_lengkap,
                    sekolah_lama:    sekolahLama,
                    sekolah_baru:    sekolahBerubah ? sekolah : null,
                    sekolah_berubah: sekolahBerubah,
                    tanggal_tes:     tanggal,
                    sesi_tes:        sesi,
                    ruang_tes:       ruang
                });
            });

            if (updates.length === 0) {
                let msg = 'Tidak ada data yang berubah untuk diimport.';
                if (notFound.length > 0) msg += `<br><br><b>Tidak ditemukan (${notFound.length}):</b> ${notFound.slice(0,5).join(', ')}${notFound.length > 5 ? '...' : ''}`;
                if (skipped.length > 0)  msg += `<br><b>Dilewati (tidak ada perubahan): ${skipped.length} baris</b>`;
                Swal.fire('Tidak Ada Data', msg, 'warning');
                return;
            }

            // Hitung ringkasan
            const sekolahUpdCount = updates.filter(u => u.sekolah_berubah).length;
            const plotUpdCount    = updates.filter(u => u.tanggal_tes || u.sesi_tes || u.ruang_tes).length;

            // Build preview rows — tampilkan juga perubahan sekolah jika ada
            const previewRows = updates.slice(0, 6).map(u => {
                const sekolahCell = u.sekolah_berubah
                    ? `<td style="padding:4px 8px; border-bottom:1px solid #e2e8f0; font-size:.73rem;">
                           <span style="color:#94a3b8; text-decoration:line-through;">${u.sekolah_lama || '-'}</span><br>
                           <span style="color:#16a34a; font-weight:700;">${u.sekolah_baru}</span>
                       </td>`
                    : `<td style="padding:4px 8px; border-bottom:1px solid #e2e8f0; color:#94a3b8; font-size:.73rem;">(tidak berubah)</td>`;
                return `<tr style="font-size:.78rem;">
                    <td style="padding:4px 8px; border-bottom:1px solid #e2e8f0;">${u.no}</td>
                    <td style="padding:4px 8px; border-bottom:1px solid #e2e8f0;">${u.nama}</td>
                    ${sekolahCell}
                    <td style="padding:4px 8px; border-bottom:1px solid #e2e8f0;">${u.ruang_tes || '<span style="color:#94a3b8">-</span>'}</td>
                    <td style="padding:4px 8px; border-bottom:1px solid #e2e8f0;">${u.tanggal_tes || '<span style="color:#94a3b8">-</span>'}</td>
                </tr>`;
            }).join('');

            const moreText = updates.length > 6
                ? `<tr><td colspan="5" style="font-size:.75rem; color:#64748b; padding:6px 8px; text-align:center;">... dan ${updates.length - 6} peserta lainnya</td></tr>`
                : '';

            let warningHtml = '';
            if (notFound.length > 0) {
                warningHtml += `<div style="margin-top:10px; background:#fffbeb; border:1px solid #fcd34d; border-radius:6px; padding:8px 12px; font-size:.76rem; color:#b45309;">
                    <b>⚠ ${notFound.length} No. Pendaftaran tidak ditemukan</b> di sistem: ${notFound.slice(0,3).join(', ')}${notFound.length > 3 ? '...' : ''}
                </div>`;
            }

            // Ringkasan singkat di atas preview
            const summaryPills = `
                <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
                    ${plotUpdCount > 0 ? `<span style="background:#e0f2f1; color:#00796b; font-size:.72rem; font-weight:700; padding:3px 10px; border-radius:99px;">
                        📅 ${plotUpdCount} jadwal & ruangan
                    </span>` : ''}
                    ${sekolahUpdCount > 0 ? `<span style="background:#dcfce7; color:#16a34a; font-size:.72rem; font-weight:700; padding:3px 10px; border-radius:99px;">
                        🏫 ${sekolahUpdCount} nama sekolah
                    </span>` : ''}
                </div>`;

            const { isConfirmed } = await Swal.fire({
                title: `Import — ${updates.length} Peserta`,
                html: `
                    <div style="text-align:left; font-size:.82rem;">
                        ${summaryPills}
                        <p style="color:#334155; margin:0 0 10px; font-size:.8rem;">Preview perubahan yang akan disimpan:</p>
                        <div style="overflow-x:auto; max-height:210px; overflow-y:auto;">
                        <table style="width:100%; border-collapse:collapse; font-size:.78rem;">
                            <thead>
                                <tr style="background:#f1f5f9; font-size:.68rem; font-weight:700; color:#475569; text-transform:uppercase;">
                                    <th style="padding:6px 8px; text-align:left; white-space:nowrap;">No Daftar</th>
                                    <th style="padding:6px 8px; text-align:left;">Nama</th>
                                    <th style="padding:6px 8px; text-align:left;">Asal Sekolah</th>
                                    <th style="padding:6px 8px; text-align:left; white-space:nowrap;">Ruangan</th>
                                    <th style="padding:6px 8px; text-align:left; white-space:nowrap;">Tanggal</th>
                                </tr>
                            </thead>
                            <tbody>${previewRows}${moreText}</tbody>
                        </table>
                        </div>
                        ${warningHtml}
                    </div>
                `,
                showCancelButton: true,
                confirmButtonText: `Terapkan ${updates.length} Perubahan`,
                cancelButtonText: 'Batal',
                confirmButtonColor: '#00796b',
                width: '720px'
            });

            if (!isConfirmed) return;

            Swal.fire({ title: 'Menyimpan...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

            // Kirim batch ke API plotting
            const changes = {};
            updates.forEach(u => {
                const payload = {
                    tanggal_tes: u.tanggal_tes || null,
                    sesi_tes:    u.sesi_tes    || null,
                    ruang_tes:   u.ruang_tes   || null
                };
                // Sertakan asal_sekolah hanya jika berubah
                if (u.sekolah_berubah) payload.asal_sekolah = u.sekolah_baru;
                changes[u.id] = payload;
            });

            const result = await apiPost('admin?action=plotting', { changes });

            if (!result.error) {
                // Update local state
                updates.forEach(u => {
                    const idx = allPendaftar.findIndex(p => p.id === u.id);
                    if (idx !== -1) {
                        if (u.tanggal_tes) allPendaftar[idx].tanggal_tes = u.tanggal_tes;
                        if (u.sesi_tes)    allPendaftar[idx].sesi_tes    = u.sesi_tes;
                        if (u.ruang_tes)   allPendaftar[idx].ruang_tes   = u.ruang_tes;
                        if (u.sekolah_berubah) allPendaftar[idx].asal_sekolah = u.sekolah_baru;
                    }
                });

                renderPlottingTable();
                renderTable(); // refresh tabel pendaftar juga (kolom asal sekolah)

                Swal.fire({
                    icon: 'success',
                    title: 'Import Berhasil!',
                    html: `<p style="font-size:.88rem; color:#334155; line-height:1.7;">
                        ${plotUpdCount > 0 ? `📅 <b>${plotUpdCount}</b> peserta diupdate jadwal & ruangannya.<br>` : ''}
                        ${sekolahUpdCount > 0 ? `🏫 <b>${sekolahUpdCount}</b> nama sekolah berhasil dibenarkan.` : ''}
                    </p>`,
                    confirmButtonColor: '#00796b'
                });
            } else {
                Swal.fire('Gagal', 'Terjadi kesalahan: ' + result.error, 'error');
            }

        } catch (err) {
            console.error('Import error:', err);
            Swal.fire('Error', 'Gagal membaca file Excel. Pastikan format file benar.', 'error');
        }
    };

    input.click();
};

// ==========================================
// 9B. IMPORT/EXPORT KELULUSAN VIA EXCEL
// ==========================================
function normalizeKelulusanStatus(value) {
    const raw = String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
    if (!raw) return '';
    const alias = {
        'PENDING': 'PENDING',
        'MENUNGGU': 'PENDING',
        'BELUM DIUMUMKAN': 'PENDING',
        'DITERIMA': 'DITERIMA',
        'LULUS': 'DITERIMA',
        'LULUS SELEKSI': 'DITERIMA',
        'TIDAK DITERIMA': 'TIDAK DITERIMA',
        'TIDAK_DITERIMA': 'TIDAK DITERIMA',
        'TIDAKDITERIMA': 'TIDAK DITERIMA',
        'TIDAK LULUS': 'TIDAK DITERIMA',
        'GAGAL': 'TIDAK DITERIMA'
    };
    return alias[raw] || '';
}

function findPendaftarFromKelulusanRow(row) {
    const noPendaftaran = String(row['No Pendaftaran'] || '').trim();
    const nisn = String(row['NISN'] || '').trim();
    if (noPendaftaran) {
        const byNo = allPendaftar.find(p => String(p.no_pendaftaran || '').trim() === noPendaftaran);
        if (byNo) return byNo;
    }
    if (nisn) {
        return allPendaftar.find(p => String(p.nisn || '').trim() === nisn);
    }
    return null;
}

window.downloadTemplateKelulusan = async function() {
    if (!allPendaftar.length) {
        Swal.fire('Info', 'Belum ada data pendaftar untuk dibuat template.', 'info');
        return;
    }

    const { value: jalurFilter } = await Swal.fire({
        title: 'Export Template Kelulusan',
        input: 'select',
        inputOptions: {
            'SEMUA': 'Keduanya (Prestasi & Reguler)',
            'PRESTASI': 'Hanya Jalur Prestasi',
            'REGULER': 'Hanya Jalur Reguler'
        },
        inputValue: 'SEMUA',
        showCancelButton: true,
        confirmButtonText: 'Download Template',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#00796b'
    });

    if (!jalurFilter) return;

    const targetPendaftar = jalurFilter === 'SEMUA'
        ? allPendaftar
        : allPendaftar.filter(p => p.jalur === jalurFilter);

    if (targetPendaftar.length === 0) {
        Swal.fire('Info', `Tidak ada pendaftar Jalur ${jalurFilter}.`, 'info');
        return;
    }

    const excelData = targetPendaftar.map(p => ({
        'No Pendaftaran': p.no_pendaftaran || '',
        'NISN': p.nisn || '',
        'Nama Lengkap': p.nama_lengkap || '',
        'Jalur': p.jalur || '',
        'Asal Sekolah': p.asal_sekolah || '',
        'Pilihan Pesantren': p.pilihan_pesantren || '',
        'No Telepon Orang Tua': p.no_telepon_ortu || '',
        'Status Kelulusan': p.status_kelulusan || 'PENDING',
        'Catatan': ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    worksheet['!cols'] = [
        { wch: 18 },
        { wch: 16 },
        { wch: 34 },
        { wch: 12 },
        { wch: 34 },
        { wch: 22 },
        { wch: 22 },
        { wch: 20 },
        { wch: 28 }
    ];
    if (worksheet['H1']) {
        worksheet['H1'].c = [{
            a: 'Admin',
            t: 'Isi hanya: PENDING, DITERIMA, atau TIDAK DITERIMA. Kolom No Pendaftaran/NISN dipakai untuk mencocokkan peserta.'
        }];
    }

    const guideRows = [
        ['PETUNJUK IMPORT KELULUSAN'],
        ['1. Jangan ubah No Pendaftaran atau NISN.'],
        ['2. Isi kolom Status Kelulusan dengan PENDING, DITERIMA, atau TIDAK DITERIMA.'],
        ['3. Nilai LULUS akan dibaca sebagai DITERIMA, dan TIDAK LULUS sebagai TIDAK DITERIMA.'],
        ['4. Hasil tidak tampil ke siswa selama Pengumuman Kelulusan masih nonaktif di Pengaturan Sistem.']
    ];
    const guideSheet = XLSX.utils.aoa_to_sheet(guideRows);
    guideSheet['!cols'] = [{ wch: 110 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Import Kelulusan');
    XLSX.utils.book_append_sheet(workbook, guideSheet, 'Petunjuk');

    const tgl = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-');
    const suffix = jalurFilter === 'SEMUA' ? 'Semua_Jalur' : jalurFilter;
    XLSX.writeFile(workbook, `Template_Kelulusan_${suffix}_PMB_MAN1Tasik_${tgl}.xlsx`);
};

window.importKelulusanExcel = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = async function(e) {
        const file = e.target.files[0];
        if (!file) return;
        document.body.removeChild(input);

        Swal.fire({ title: 'Membaca File...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        try {
            const arrayBuffer = await file.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'arraybuffer' });
            const sheetName = workbook.SheetNames.includes('Import Kelulusan') ? 'Import Kelulusan' : workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

            if (!rows || rows.length === 0) {
                Swal.fire('Error', 'File Excel kosong atau format tidak dikenali.', 'error');
                return;
            }

            const firstRow = rows[0];
            const requiredCols = ['Status Kelulusan'];
            const hasIdentity = ('No Pendaftaran' in firstRow) || ('NISN' in firstRow);
            const missingCols = requiredCols.filter(col => !(col in firstRow));
            if (missingCols.length > 0 || !hasIdentity) {
                Swal.fire('Format Salah', 'Kolom wajib: <b>No Pendaftaran</b> atau <b>NISN</b>, dan <b>Status Kelulusan</b>.<br><br>Gunakan template dari sistem ini.', 'error');
                return;
            }

            const updates = [];
            const notFound = [];
            const invalidStatus = [];
            const unchanged = [];

            rows.forEach((row, index) => {
                const noPendaftaran = String(row['No Pendaftaran'] || '').trim();
                const nisn = String(row['NISN'] || '').trim();
                const rawStatus = String(row['Status Kelulusan'] || '').trim();
                if (!noPendaftaran && !nisn && !rawStatus) return;

                const status = normalizeKelulusanStatus(rawStatus);
                if (!status) {
                    invalidStatus.push({ row: index + 2, no: noPendaftaran || nisn || '-', status: rawStatus || '(kosong)' });
                    return;
                }

                const peserta = findPendaftarFromKelulusanRow(row);
                if (!peserta) {
                    notFound.push(noPendaftaran || nisn || `Baris ${index + 2}`);
                    return;
                }

                const oldStatus = peserta.status_kelulusan || 'PENDING';
                if (oldStatus === status) {
                    unchanged.push(peserta.no_pendaftaran || peserta.nisn || peserta.nama_lengkap);
                    return;
                }

                updates.push({
                    id: peserta.id,
                    no: peserta.no_pendaftaran || '-',
                    nama: peserta.nama_lengkap || '-',
                    jalur: peserta.jalur || '-',
                    oldStatus,
                    status
                });
            });

            if (invalidStatus.length > 0) {
                const sample = invalidStatus.slice(0, 6).map(item => `Baris ${item.row}: ${escapeHTML(item.no)} = ${escapeHTML(item.status)}`).join('<br>');
                Swal.fire('Status Tidak Valid', `<div style="text-align:left; font-size:.82rem;">Gunakan hanya <b>PENDING</b>, <b>DITERIMA</b>, atau <b>TIDAK DITERIMA</b>.<br><br>${sample}${invalidStatus.length > 6 ? '<br>...' : ''}</div>`, 'error');
                return;
            }

            if (updates.length === 0) {
                let msg = 'Tidak ada status kelulusan yang berubah.';
                if (notFound.length > 0) msg += `<br><br><b>Tidak ditemukan (${notFound.length}):</b> ${notFound.slice(0, 6).map(escapeHTML).join(', ')}${notFound.length > 6 ? '...' : ''}`;
                if (unchanged.length > 0) msg += `<br><b>Sudah sama:</b> ${unchanged.length} baris`;
                Swal.fire('Tidak Ada Perubahan', msg, 'warning');
                return;
            }

            const diterimaCount = updates.filter(u => u.status === 'DITERIMA').length;
            const tidakCount = updates.filter(u => u.status === 'TIDAK DITERIMA').length;
            const pendingCount = updates.filter(u => u.status === 'PENDING').length;

            const previewRows = updates.slice(0, 8).map(u => `
                <tr style="font-size:.78rem;">
                    <td style="padding:5px 8px; border-bottom:1px solid #e2e8f0;">${escapeHTML(u.no)}</td>
                    <td style="padding:5px 8px; border-bottom:1px solid #e2e8f0;">${escapeHTML(u.nama)}</td>
                    <td style="padding:5px 8px; border-bottom:1px solid #e2e8f0;">${escapeHTML(u.jalur)}</td>
                    <td style="padding:5px 8px; border-bottom:1px solid #e2e8f0;">
                        <span style="color:#94a3b8; text-decoration:line-through;">${escapeHTML(u.oldStatus)}</span><br>
                        <span style="color:${u.status === 'DITERIMA' ? '#16a34a' : u.status === 'TIDAK DITERIMA' ? '#dc2626' : '#2563eb'}; font-weight:800;">${escapeHTML(u.status)}</span>
                    </td>
                </tr>
            `).join('');
            const moreText = updates.length > 8
                ? `<tr><td colspan="4" style="font-size:.75rem; color:#64748b; padding:6px 8px; text-align:center;">... dan ${updates.length - 8} peserta lainnya</td></tr>`
                : '';
            const warningHtml = notFound.length > 0
                ? `<div style="margin-top:10px; background:#fffbeb; border:1px solid #fcd34d; border-radius:6px; padding:8px 12px; font-size:.76rem; color:#b45309;">
                    <b>${notFound.length} peserta tidak ditemukan</b>: ${notFound.slice(0, 5).map(escapeHTML).join(', ')}${notFound.length > 5 ? '...' : ''}
                   </div>`
                : '';

            const { isConfirmed } = await Swal.fire({
                title: `Import Kelulusan - ${updates.length} Peserta`,
                html: `
                    <div style="text-align:left; font-size:.82rem;">
                        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
                            <span style="background:#dcfce7; color:#166534; font-size:.72rem; font-weight:700; padding:3px 10px; border-radius:99px;">DITERIMA: ${diterimaCount}</span>
                            <span style="background:#fee2e2; color:#991b1b; font-size:.72rem; font-weight:700; padding:3px 10px; border-radius:99px;">TIDAK DITERIMA: ${tidakCount}</span>
                            <span style="background:#dbeafe; color:#1e40af; font-size:.72rem; font-weight:700; padding:3px 10px; border-radius:99px;">PENDING: ${pendingCount}</span>
                        </div>
                        <p style="color:#334155; margin:0 0 10px; font-size:.8rem;">Preview perubahan yang akan disimpan:</p>
                        <div style="overflow-x:auto; max-height:240px; overflow-y:auto;">
                            <table style="width:100%; border-collapse:collapse; font-size:.78rem;">
                                <thead>
                                    <tr style="background:#f1f5f9; font-size:.68rem; font-weight:700; color:#475569; text-transform:uppercase;">
                                        <th style="padding:6px 8px; text-align:left;">No Daftar</th>
                                        <th style="padding:6px 8px; text-align:left;">Nama</th>
                                        <th style="padding:6px 8px; text-align:left;">Jalur</th>
                                        <th style="padding:6px 8px; text-align:left;">Status</th>
                                    </tr>
                                </thead>
                                <tbody>${previewRows}${moreText}</tbody>
                            </table>
                        </div>
                        ${warningHtml}
                        <div style="margin-top:10px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:6px; padding:8px 12px; font-size:.76rem; color:#1e40af;">
                            Hasil ini tetap tersembunyi dari siswa selama <b>Pengumuman Kelulusan</b> masih nonaktif.
                        </div>
                    </div>
                `,
                showCancelButton: true,
                confirmButtonText: `Terapkan ${updates.length} Status`,
                cancelButtonText: 'Batal',
                confirmButtonColor: '#00796b',
                width: '760px'
            });

            if (!isConfirmed) return;

            Swal.fire({ title: 'Menyimpan...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

            const result = await apiPost('admin?action=kelulusan', {
                updates: updates.map(u => ({ id: u.id, status_kelulusan: u.status }))
            });

            if (result.error) {
                Swal.fire('Gagal', 'Terjadi kesalahan: ' + result.error, 'error');
                return;
            }

            updates.forEach(u => {
                const idx = allPendaftar.findIndex(p => p.id === u.id);
                if (idx !== -1) allPendaftar[idx].status_kelulusan = u.status;
            });
            updateStats(allPendaftar);
            renderTable();
            renderPlottingTable();

            Swal.fire({
                icon: 'success',
                title: 'Import Kelulusan Berhasil',
                html: `<p style="font-size:.88rem; color:#334155; line-height:1.7;">
                    <b>${updates.length}</b> status kelulusan diperbarui.<br>
                    Pengumuman ke siswa mengikuti toggle <b>Pengumuman Kelulusan</b> di Pengaturan Sistem.
                </p>`,
                confirmButtonColor: '#00796b'
            });
        } catch (err) {
            console.error('Import kelulusan error:', err);
            Swal.fire('Error', 'Gagal membaca file Excel. Pastikan format file benar.', 'error');
        }
    };

    input.click();
};


// ==========================================
// 10. DETAIL SISWA (SWEETALERT POPUP)
// ==========================================
window.triggerSaveAnim = function() {
    const saveBtn = document.getElementById('btn-save-changes');
    if(saveBtn) { 
        saveBtn.innerHTML = '<i class="ph ph-floppy-disk"></i> SIMPAN *'; 
        saveBtn.style.background = '#e11d48'; 
    }
}

window.viewDetail = async function(id) {
    Swal.fire({ 
        title: 'Memuat Data...', 
        allowOutsideClick: false, 
        didOpen: () => Swal.showLoading() 
    });

    try {
        const p = await apiGet('pendaftar', { id });
        if (p.error || !p.id) throw new Error('Data tidak ditemukan');

        // Parse berkas_ditolak — simpan sebagai Set untuk lookup cepat
        let berkasArr = [];
        try { berkasArr = p.berkas_ditolak ? JSON.parse(p.berkas_ditolak) : []; } catch(e) {}

        editState = { 
            id: p.id, 
            status_verifikasi: p.status_verifikasi, 
            status_kelulusan: p.status_kelulusan || 'PENDING',
            daftar_ulang_hardcopy_status: p.daftar_ulang_hardcopy_status || 'BELUM',
            daftar_ulang_hardcopy_at: p.daftar_ulang_hardcopy_at || null,
            berkas_ditolak: berkasArr,
        };

        let prestasiHtml = '';
        if (p.jalur === 'PRESTASI' || p.scan_sertifikat_prestasi_url) { 
            const pres = await apiGet('prestasi', { pendaftar_id: id });
            if (Array.isArray(pres) && pres.length > 0) {
                prestasiHtml = `
                <div class="d-prestasi-box">
                    <div class="detail-title" style="margin-top:0;">Data Prestasi</div>
                    <ul>
                `;
                pres.forEach(x => {
                    prestasiHtml += `<li><b>${x.nama_lomba}</b> — ${x.tingkat}, ${x.tahun_perolehan}</li>`;
                });
                prestasiHtml += `</ul></div>`;
            }
        }

        // Build nilai rapor html
        let raporHtml = '';
        if (p.jalur === 'PRESTASI' && p.nilai_rapor) {
            try {
                const rObj = JSON.parse(p.nilai_rapor);
                const semLabels = [['7_1','Kelas 7 Sem. 1'],['7_2','Kelas 7 Sem. 2'],['8_1','Kelas 8 Sem. 1'],['8_2','Kelas 8 Sem. 2'],['9_1','Kelas 9 Sem. 1']];
                const vals = semLabels.map(([k,l]) => rObj[k] ? { label:l, ...rObj[k] } : null).filter(Boolean);
                if (vals.length > 0) {
                    const avg = (vals.reduce((s,v) => s + v.rata, 0) / vals.length).toFixed(2);
                    const isUnggul = parseFloat(avg) >= 90;
                    const avgColor = isUnggul ? '#15803d' : '#b45309';
                    const avgBg    = isUnggul ? '#f0fdf4' : '#fffbeb';
                    const rows = vals.map(v =>
                        `<tr>
                            <td style="padding:5px 8px; border:1px solid #e2e8f0;">${v.label}</td>
                            <td style="padding:5px 8px; border:1px solid #e2e8f0; font-weight:600;">${v.rata}</td>
                            <td style="padding:5px 8px; border:1px solid #e2e8f0; color:#94a3b8;">${v.rank ? 'Ke-' + v.rank : '-'}</td>
                        </tr>`).join('');
                    raporHtml = `
                    <div class="detail-title">Nilai Rapor</div>
                    <table style="width:100%; border-collapse:collapse; font-size:0.79rem; margin-bottom:10px;">
                        <thead><tr style="background:#f1f5f9;">
                            <th style="padding:5px 8px; text-align:left; border:1px solid #e2e8f0;">Semester</th>
                            <th style="padding:5px 8px; text-align:left; border:1px solid #e2e8f0;">Rata-rata</th>
                            <th style="padding:5px 8px; text-align:left; border:1px solid #e2e8f0;">Ranking</th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                    <div style="padding:8px 12px; border-radius:7px; background:${avgBg}; border:1px solid ${isUnggul?'#bbf7d0':'#fde68a'}; display:flex; align-items:center; gap:10px;">
                        <span style="font-size:.74rem; color:${avgColor}; font-weight:700;">Rata-rata Keseluruhan:</span>
                        <span style="font-size:1.05rem; font-weight:800; color:${avgColor};">${avg}</span>
                        ${isUnggul ? '<span style="font-size:.7rem; background:#dcfce7; color:#166534; padding:2px 8px; border-radius:99px; font-weight:800;">★ Unggul ≥ 90</span>' : ''}
                    </div>`;
                }
            } catch(e) { raporHtml = ''; }
        }

        const val = (v) => v ? v : '-';
        const tglVal = (v) => { if(!v) return '-'; const p = v.split('-'); return p.length===3 ? `${p[2]}-${p[1]}-${p[0]}` : v; };
        const money = (v) => v ? 'Rp ' + parseInt(v).toLocaleString('id-ID') : '-';
        
        const isVerifTrue = p.status_verifikasi === true ? 'active' : '';
        const isVerifFalse = p.status_verifikasi === false ? 'active' : '';
        const isVerifNull = (p.status_verifikasi === null || p.status_verifikasi === undefined) ? 'active' : '';

        const isLulusTrue = p.status_kelulusan === 'DITERIMA' ? 'active' : '';
        const isLulusFalse = p.status_kelulusan === 'TIDAK DITERIMA' ? 'active' : '';
        const isLulusPending = (!p.status_kelulusan || p.status_kelulusan === 'PENDING') ? 'active' : '';
        const isDuDone = p.daftar_ulang_hardcopy_status === 'SUDAH' ? 'active' : '';
        const isDuPending = p.daftar_ulang_hardcopy_status !== 'SUDAH' ? 'active' : '';

        // Bebas CBT hanya jika: jalur PRESTASI DAN status_verifikasi diterima DAN belum dinyatakan TIDAK DITERIMA
        // Siswa PRESTASI yang berkasnya ditolak (false) ATAU yang gagal tes pembuktian (TIDAK DITERIMA) WAJIB ikut CBT
        const isBebasTes = (p.jalur === 'PRESTASI' &&
            p.status_verifikasi === true &&
            p.status_kelulusan !== 'TIDAK DITERIMA');

        Swal.fire({
            title: '', 
            width: '1000px', 
            padding: '0', 
            showConfirmButton: false, 
            showCloseButton: true,
            html: `
                <style>
                    /* ── Layout ── */
                    .d-wrapper { display: grid; grid-template-columns: 220px 1fr; max-height: 85vh; overflow-y: auto; text-align: left; align-items: start; font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
                    .d-left { background: #f8fafc; padding: 20px; border-right: 1px solid #e2e8f0; position: sticky; top: 0; z-index: 5; height: fit-content; }
                    .d-right { display: block; height: auto; overflow: visible; }
                    .d-header { padding: 16px 22px; border-bottom: 1px solid #e2e8f0; background: white; position: sticky; top: 0; z-index: 10; }
                    .d-body { padding: 20px 22px; background: #fff; }

                    /* ── Photo ── */
                    .d-photo { width: 100%; aspect-ratio: 3/4; object-fit: cover; border-radius: 10px; border: 1px solid #e2e8f0; margin-bottom: 14px; }

                    /* ── File buttons ── */
                    .d-files-label { font-size: 0.62rem; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: #94a3b8; margin-bottom: 8px; display: block; }
                    .file-btn { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border: 1px solid #e2e8f0; background: white; border-radius: 7px; text-decoration: none; color: #334155; font-weight: 600; font-size: 0.76rem; margin-bottom: 5px; transition: 0.15s; }
                    .file-btn i { font-size: 0.9rem; color: #64748b; flex-shrink: 0; }
                    .file-btn:hover { border-color: #00796b; color: #00796b; background: #f0fdf4; }
                    .file-btn:hover i { color: #00796b; }

                    /* ── Header info ── */
                    .d-name { font-size: 1.1rem; font-weight: 800; color: #0d1b2a; margin: 0 0 4px; line-height: 1.2; }
                    .d-meta { font-size: 0.75rem; color: #64748b; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
                    .d-meta span { display: inline-flex; align-items: center; gap: 3px; }
                    .d-badge { display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: 0.65rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px; }
                    .d-badge-teal { background: #e0f2f1; color: #00695c; }
                    .d-badge-red  { background: #fee2e2; color: #991b1b; }

                    /* ── Status action row ── */
                    .status-row { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; align-items: center; }
                    .status-box { display: flex; align-items: center; background: #f8fafc; padding: 3px; border-radius: 6px; border: 1px solid #e2e8f0; gap: 1px; }
                    .status-label { font-size: 0.62rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px; margin: 0 6px; white-space: nowrap; }
                    /* btn-act, act-blue/green/red, active — tidak diubah agar JS tetap kerja */
                    .btn-act { border: none; padding: 5px 10px; border-radius: 4px; font-size: 0.7rem; font-weight: 700; cursor: pointer; color: white; opacity: 0.35; transition: 0.15s; }
                    .btn-act:hover { opacity: 0.65; }
                    .btn-act.active { opacity: 1; box-shadow: 0 2px 6px rgba(0,0,0,0.2); }
                    .act-blue { background: #2563eb; } .act-green { background: #16a34a; } .act-red { background: #dc2626; }
                    #btn-save-changes { background: #0d1b2a !important; opacity: 1 !important; padding: 5px 14px !important; font-size: 0.7rem !important; margin-left: auto; border-radius: 5px; }

                    /* ── Section title ── */
                    .detail-title { font-size: 0.62rem; font-weight: 800; letter-spacing: 1.8px; text-transform: uppercase; color: #94a3b8; padding-bottom: 8px; border-bottom: 1px solid #f1f5f9; margin: 20px 0 12px; }

                    /* ── Data grid ── */
                    .detail-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
                    .detail-item label { display: block; font-size: 0.62rem; color: #94a3b8; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; margin-bottom: 3px; }
                    .detail-item b { display: block; font-size: 0.82rem; font-weight: 600; color: #1e293b; line-height: 1.4; }

                    /* ── Sub boxes (keluarga) ── */
                    .d-sub-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 10px; }
                    .d-sub-label { font-size: 0.62rem; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: #94a3b8; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0; display: block; }

                    /* ── CBT schedule inputs ── */
                    .d-cbt-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 16px; }
                    .sch-input { width: 100%; padding: 7px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-family: inherit; font-size: 0.82rem; color: #1e293b; background: white; outline: none; transition: 0.15s; }
                    .sch-input:focus { border-color: #00796b; box-shadow: 0 0 0 3px rgba(0,121,107,0.12); }

                    /* ── Pesantren box ── */
                    .d-pesantren-box { background: #f8fafc; border: 1px solid #e2e8f0; border-left: 3px solid #00796b; border-radius: 8px; padding: 12px 14px; margin-top: 12px; }

                    /* ── Prestasi box ── */
                    .d-prestasi-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-top: 14px; }
                    .d-prestasi-box ul { padding-left: 16px; margin: 8px 0 0; font-size: 0.8rem; color: #334155; line-height: 1.7; }

                    /* ── No HP row ── */
                    .d-phone-row { display: flex; align-items: center; gap: 8px; margin-top: 12px; padding: 10px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 7px; font-size: 0.82rem; }
                    .d-phone-row label { color: #94a3b8; font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-right: 4px; }
                    .d-phone-row b { color: #0d1b2a; font-weight: 700; }

                    @media (max-width: 768px) {
                        .d-wrapper { display: block; max-height: 88vh; overflow-y: auto; }
                        .d-left { position: static; width: 100%; border-right: none; border-bottom: 1px solid #e2e8f0; }
                        .d-header { position: static; }
                        .detail-grid { grid-template-columns: 1fr 1fr; }
                    }

                    /* ── File Viewer Overlay ── (di-inject ke body, bukan dalam Swal) */
                    .fv-overlay-body {
                        display: none; position: fixed; inset: 0; z-index: 2147483647;
                        background: rgba(0,0,0,.92); flex-direction: column;
                        font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
                    }
                    .fv-overlay-body.open { display: flex; }
                    .fv-topbar {
                        height: 52px; background: #0d1b2a; display: flex;
                        align-items: center; justify-content: space-between;
                        padding: 0 16px; flex-shrink: 0; gap: 12px;
                    }
                    .fv-title {
                        font-size: 0.8rem; font-weight: 700; color: white;
                        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                    }
                    .fv-counter {
                        font-size: 0.72rem; color: rgba(255,255,255,.45);
                        white-space: nowrap; flex-shrink: 0;
                    }
                    .fv-close {
                        background: rgba(255,255,255,.1); border: none; color: white;
                        width: 32px; height: 32px; border-radius: 6px; cursor: pointer;
                        display: flex; align-items: center; justify-content: center;
                        font-size: 1.1rem; flex-shrink: 0; transition: background .15s;
                    }
                    .fv-close:hover { background: rgba(255,255,255,.2); }
                    .fv-body {
                        flex: 1; display: flex; align-items: center;
                        justify-content: center; position: relative; overflow: hidden;
                    }
                    .fv-frame {
                        width: calc(100% - 120px); height: 100%;
                        border: none; background: #f8fafc;
                    }
                    .fv-img {
                        max-width: calc(100% - 120px); max-height: 100%;
                        object-fit: contain; border-radius: 4px;
                    }
                    .fv-nav {
                        position: absolute; top: 50%; transform: translateY(-50%);
                        background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.18);
                        color: white; width: 44px; height: 44px; border-radius: 8px;
                        cursor: pointer; display: flex; align-items: center;
                        justify-content: center; font-size: 1.2rem;
                        transition: background .15s; z-index: 2;
                    }
                    .fv-nav:hover { background: rgba(255,255,255,.25); }
                    .fv-nav:disabled { opacity: .2; cursor: not-allowed; }
                    .fv-prev { left: 12px; }
                    .fv-next { right: 12px; }
                    .fv-hints {
                        height: 34px; display: flex; align-items: center;
                        justify-content: center; gap: 16px; flex-shrink: 0;
                    }
                    .fv-hint {
                        font-size: 0.65rem; color: rgba(255,255,255,.3);
                        display: flex; align-items: center; gap: 4px;
                    }
                    .fv-hint kbd {
                        background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.15);
                        border-radius: 3px; padding: 1px 5px; font-size: 0.6rem; font-family: inherit;
                    }
                    .file-btn.fv-active { border-color: #00796b; background: #f0fdf4; color: #00796b; }
                    .file-btn.fv-active i { color: #00796b; }

                    /* ── Flagging berkas ── */
                    .flag-section { margin-top: 14px; padding-top: 12px; border-top: 1px solid #e2e8f0; }
                    .flag-section-label {
                        font-size: 0.62rem; font-weight: 800; letter-spacing: 1.5px;
                        text-transform: uppercase; color: #94a3b8; display: block; margin-bottom: 8px;
                    }
                    .flag-list { display: flex; flex-direction: column; gap: 5px; }
                    .flag-item {
                        display: flex; align-items: center; gap: 8px;
                        padding: 7px 10px; border-radius: 7px;
                        border: 1px solid #e2e8f0; background: #f8fafc;
                        cursor: pointer; transition: background .15s, border-color .15s;
                        font-size: 0.75rem; font-weight: 600; color: #334155;
                        user-select: none;
                    }
                    .flag-item:hover { background: #fff1f2; border-color: #fecaca; }
                    .flag-item.flagged { background: #fef2f2; border-color: #fca5a5; color: #b91c1c; }
                    .flag-item input[type="checkbox"] {
                        width: 16px !important; height: 16px !important; 
                        max-width: 16px !important;
                        accent-color: #dc2626;
                        flex-shrink: 0; cursor: pointer; margin: 0;
                    }
                    .flag-item i { font-size: 1.1rem; flex-shrink: 0; }

                    /* ── WA button ── */
                    .wa-notify-btn {
                        display: flex; align-items: center; gap: 7px;
                        width: 100%; margin-top: 10px;
                        padding: 9px 12px; border-radius: 7px;
                        background: #dcfce7; border: 1px solid #bbf7d0;
                        color: #166534; font-size: 0.75rem; font-weight: 700;
                        cursor: pointer; font-family: inherit;
                        transition: background .15s;
                    }
                    .wa-notify-btn:hover { background: #bbf7d0; }
                    .wa-notify-btn i { font-size: 1rem; }
                </style>

                <div class="d-wrapper">
                    <!-- SIDEBAR: foto + berkas -->
                    <div class="d-left">
                        <img src="${p.foto_url || 'https://via.placeholder.com/300x400?text=FOTO'}"
                             class="d-photo" alt="Foto Siswa"
                             style="cursor:pointer;" onclick="openFileViewer(0)">
                        <span class="d-files-label">Berkas Lampiran</span>
                        <a href="#" onclick="openFileViewer(1);return false;" class="file-btn" id="fb-1">
                            <i class="ph ph-file-pdf"></i> Kartu Keluarga
                        </a>
                        <a href="#" onclick="openFileViewer(2);return false;" class="file-btn" id="fb-2">
                            <i class="ph ph-file-pdf"></i> Akta Kelahiran
                        </a>
                        <a href="#" onclick="openFileViewer(3);return false;" class="file-btn" id="fb-3">
                            <i class="ph ph-file-pdf"></i> Surat Kelakuan Baik
                        </a>
                        <a href="#" onclick="openFileViewer(4);return false;" class="file-btn" id="fb-4">
                            <i class="ph ph-file-pdf"></i> KTP Orang Tua
                        </a>
                        <a href="#" onclick="openFileViewer(5);return false;" class="file-btn" id="fb-5">
                            <i class="ph ph-book-open-text"></i> Rapor
                        </a>
                        ${p.scan_sertifikat_prestasi_url ? `<a href="#" onclick="openFileViewer(6);return false;" class="file-btn" id="fb-6"><i class="ph ph-trophy"></i> Sertifikat Prestasi</a>` : ''}
                        
                        ${p.daftar_ulang_pesantren_url ? `<span class="d-files-label" style="margin-top:15px;">Berkas Daftar Ulang</span>` : ''}
                        ${p.daftar_ulang_pesantren_url ? `<a href="#" onclick="openFileViewer(7);return false;" class="file-btn" id="fb-7"><i class="ph ph-file-pdf"></i> Surat Pesantren</a>` : ''}

                        <!-- FLAG BERKAS BERMASALAH -->
                        <div class="flag-section">
                            <span class="flag-section-label">Tandai Berkas Bermasalah</span>
                            <div class="flag-list">
                                ${buildFlagItem('foto_url',                    'Pas Foto',              'ph-user-focus',         berkasArr)}
                                ${buildFlagItem('scan_kk_url',                 'Kartu Keluarga',        'ph-file-pdf',           berkasArr)}
                                ${buildFlagItem('scan_akta_url',               'Akta Kelahiran',        'ph-file-pdf',           berkasArr)}
                                ${buildFlagItem('scan_kelakuan_baik_url',      'Surat Kelakuan Baik',   'ph-certificate',        berkasArr)}
                                ${buildFlagItem('scan_ktp_ortu_url',           'KTP Orang Tua',         'ph-identification-card',berkasArr)}
                                ${buildFlagItem('scan_rapor_url',              'Document Rapor (PDF)',  'ph-book-open-text',     berkasArr)}
                                ${buildFlagItem('nilai_rapor',                 'Input Nilai Rapor (Angka)','ph-list-numbers',       berkasArr)}
                                ${p.scan_sertifikat_prestasi_url ? buildFlagItem('scan_sertifikat_prestasi_url','Sertifikat Prestasi','ph-trophy',berkasArr) : ''}
                            </div>
                            ${p.no_telepon_ortu ? `
                            <button class="wa-notify-btn" onclick="sendWaNotif()">
                                <i class="ph ph-whatsapp-logo"></i>
                                Beritahu via WhatsApp
                            </button>` : ''}
                        </div>
                    </div>

                    <!-- KANAN: header + body -->
                    <div class="d-right">
                        <div class="d-header">
                            <h2 class="d-name">${p.nama_lengkap}</h2>
                            <div class="d-meta">
                                <span>${p.nisn}</span>
                                <span>·</span>
                                <span>${p.asal_sekolah}</span>
                                <span>·</span>
                                <span class="d-badge d-badge-teal">${p.jalur}</span>
                                ${isBebasTes ? `<span class="d-badge d-badge-red">BEBAS CBT</span>` : ''}
                            </div>

                            <div class="status-row">
                                <div class="status-box">
                                    <span class="status-label">Verifikasi</span>
                                    <button onclick="setEditState('verif', null, this)" class="btn-act act-blue ${isVerifNull}">Wait</button>
                                    <button onclick="setEditState('verif', true, this)" class="btn-act act-green ${isVerifTrue}">Valid</button>
                                    <button onclick="setEditState('verif', false, this)" class="btn-act act-red ${isVerifFalse}">Tolak</button>
                                </div>
                                <div class="status-box">
                                    <span class="status-label">Lulus</span>
                                    <button onclick="setEditState('lulus', 'PENDING', this)" class="btn-act act-blue ${isLulusPending}">Wait</button>
                                    <button onclick="setEditState('lulus', 'DITERIMA', this)" class="btn-act act-green ${isLulusTrue}">Diterima</button>
                                    <button onclick="setEditState('lulus', 'TIDAK DITERIMA', this)" class="btn-act act-red ${isLulusFalse}">Gagal</button>
                                </div>
                                <div class="status-box">
                                    <span class="status-label">Daftar Ulang</span>
                                    <button onclick="setEditState('du', 'BELUM', this)" class="btn-act act-red ${isDuPending}">Belum Serah</button>
                                    <button onclick="setEditState('du', 'SUDAH', this)" class="btn-act act-green ${isDuDone}">Sudah Serah</button>
                                </div>
                                <button id="btn-save-changes" onclick="saveDetailChanges()" class="btn-act">
                                    <i class="ph ph-floppy-disk"></i> Simpan
                                </button>
                                ${p.jalur === 'PRESTASI' ? `
                                <button onclick="alihkanSatuKeReguler('${p.id}', '${p.nama_lengkap.replace(/'/g, "\\'")}')"
                                    style="border:none; padding:5px 10px; border-radius:4px; font-size:0.7rem;
                                           font-weight:700; cursor:pointer; color:white; opacity:1;
                                           background:#7c3aed; margin-left:4px;"
                                    title="Alihkan siswa ini dari Jalur Prestasi ke Jalur Reguler">
                                    <i class="ph ph-arrows-left-right"></i> Alih ke Reguler
                                </button>` : ''}
                            </div>
                        </div>

                        <div class="d-body">

                            <!-- JADWAL TES CBT -->
                            ${!isBebasTes ? `
                            <div class="detail-title" style="margin-top:0;">Jadwal Tes CBT</div>
                            <div class="d-cbt-box detail-grid">
                                <div class="detail-item">
                                    <label>Tanggal Tes</label>
                                    <input type="text" id="input-tgl" class="sch-input" value="${p.tanggal_tes || ''}" oninput="triggerSaveAnim()">
                                </div>
                                <div class="detail-item">
                                    <label>Sesi / Waktu</label>
                                    <input type="text" id="input-sesi" class="sch-input" value="${p.sesi_tes || ''}" oninput="triggerSaveAnim()">
                                </div>
                                <div class="detail-item">
                                    <label>Ruang Ujian</label>
                                    <input type="text" id="input-ruang" class="sch-input" value="${p.ruang_tes || ''}" oninput="triggerSaveAnim()">
                                </div>
                            </div>
                            ` : ''}

                            <!-- DATA PRIBADI -->
                            <div class="detail-title" ${isBebasTes ? 'style="margin-top:0;"' : ''}>Data Pribadi</div>
                            <div class="detail-grid">
                                <div class="detail-item"><label>NIK</label><b>${val(p.nik)}</b></div>
                                <div class="detail-item"><label>Tempat, Tanggal Lahir</label><b>${val(p.tempat_lahir)}, ${tglVal(p.tanggal_lahir)}</b></div>
                                <div class="detail-item"><label>Jenis Kelamin</label><b>${val(p.jenis_kelamin)}</b></div>
                                <div class="detail-item"><label>Agama</label><b>${val(p.agama)}</b></div>
                                <div class="detail-item"><label>Anak Ke</label><b>${val(p.anak_ke)} dari ${val(p.jumlah_saudara)}</b></div>
                                <div class="detail-item"><label>Status Anak</label><b>${val(p.status_anak)}</b></div>
                                <div class="detail-item"><label>Ukuran Baju</label><b>${val(p.ukuran_baju)}</b></div>
                            </div>

                            <!-- ALAMAT -->
                            <div class="detail-title">Alamat Domisili</div>
                            <div class="detail-grid">
                                <div class="detail-item" style="grid-column:span 2;"><label>Alamat Lengkap</label><b>${val(p.alamat_lengkap)}</b></div>
                                <div class="detail-item"><label>RT / RW</label><b>${val(p.rt)} / ${val(p.rw)}</b></div>
                                <div class="detail-item"><label>Desa / Kelurahan</label><b>${val(p.desa_kelurahan)}</b></div>
                                <div class="detail-item"><label>Kecamatan</label><b>${val(p.kecamatan)}</b></div>
                                <div class="detail-item"><label>Kab / Kota</label><b>${val(p.kabupaten_kota)}</b></div>
                                <div class="detail-item"><label>Provinsi</label><b>${val(p.provinsi)}</b></div>
                                <div class="detail-item"><label>Kode Pos</label><b>${val(p.kode_pos)}</b></div>
                            </div>

                            <!-- DATA KELUARGA -->
                            <div class="detail-title">Data Keluarga</div>
                            <div class="d-sub-box" style="margin-bottom:8px;">
                                <span class="d-sub-label">Ayah</span>
                                <div class="detail-grid">
                                    <div class="detail-item"><label>Nama</label><b>${val(p.nama_ayah)}</b></div>
                                    <div class="detail-item"><label>NIK</label><b>${val(p.nik_ayah)}</b></div>
                                    <div class="detail-item"><label>Pekerjaan</label><b>${val(p.pekerjaan_ayah)}</b></div>
                                    <div class="detail-item"><label>Pendidikan</label><b>${val(p.pendidikan_ayah)}</b></div>
                                    <div class="detail-item"><label>Penghasilan</label><b>${money(p.penghasilan_ayah)}</b></div>
                                </div>
                            </div>
                            <div class="d-sub-box">
                                <span class="d-sub-label">Ibu</span>
                                <div class="detail-grid">
                                    <div class="detail-item"><label>Nama</label><b>${val(p.nama_ibu)}</b></div>
                                    <div class="detail-item"><label>NIK</label><b>${val(p.nik_ibu)}</b></div>
                                    <div class="detail-item"><label>Pekerjaan</label><b>${val(p.pekerjaan_ibu)}</b></div>
                                    <div class="detail-item"><label>Pendidikan</label><b>${val(p.pendidikan_ibu)}</b></div>
                                    <div class="detail-item"><label>Penghasilan</label><b>${money(p.penghasilan_ibu)}</b></div>
                                </div>
                            </div>
                            <div class="d-phone-row">
                                <label>No. HP Orang Tua</label>
                                <b>${val(p.no_telepon_ortu)}</b>
                            </div>

                            <!-- DATA SEKOLAH -->
                            <div class="detail-title">Sekolah Asal</div>
                            <div class="detail-grid">
                                <div class="detail-item"><label>Nama Sekolah</label><b>${val(p.asal_sekolah)}</b></div>
                                <div class="detail-item"><label>NPSN</label><b>${val(p.npsn_sekolah)}</b></div>
                                <div class="detail-item"><label>Status</label><b>${val(p.status_sekolah)}</b></div>
                                <div class="detail-item" style="grid-column:span 2;"><label>Alamat Sekolah</label><b>${val(p.alamat_sekolah)}</b></div>
                            </div>

                            <!-- PESANTREN -->
                            <div class="d-pesantren-box">
                                <label style="font-size:0.62rem;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#94a3b8;display:block;margin-bottom:4px;">Pilihan Tempat Tinggal</label>
                                <b style="font-size:0.88rem;color:#0d1b2a;">${val(p.pilihan_pesantren)}</b>
                            </div>

                            ${raporHtml}

                            ${prestasiHtml}
                        </div>
                    </div>
                </div>
            `
        });

        // ── File Viewer Functions ─────────────────────────────────────
        // Bangun daftar berkas yang tersedia
        const fvFiles = [
            { label: 'Foto Siswa',          url: p.foto_url,                      type: 'img' },
            { label: 'Kartu Keluarga',       url: p.scan_kk_url,                   type: 'pdf' },
            { label: 'Akta Kelahiran',       url: p.scan_akta_url,                 type: 'pdf' },
            { label: 'Surat Kelakuan Baik',  url: p.scan_kelakuan_baik_url,        type: 'pdf' },
            { label: 'KTP Orang Tua',        url: p.scan_ktp_ortu_url,             type: 'pdf' },
            { label: 'Rapor',                url: p.scan_rapor_url,                type: 'pdf' },
            { label: 'Sertifikat Prestasi',  url: p.scan_sertifikat_prestasi_url,  type: 'pdf' },
            { label: 'Surat Pesantren',      url: p.daftar_ulang_pesantren_url,    type: 'pdf' },
        ].filter(f => f.url);   // hanya yang ada URL-nya

        let fvCurrent = 0;

        // ── Helper: build flag checkbox item ────────────────────────────
        function buildFlagItem(fieldKey, label, icon, flaggedArr) {
            const checked = flaggedArr.includes(fieldKey) ? 'checked' : '';
            const flaggedClass = flaggedArr.includes(fieldKey) ? 'flagged' : '';
            return `<label class="flag-item ${flaggedClass}" id="fi-${fieldKey}">
                <input type="checkbox" value="${fieldKey}" ${checked}
                       onchange="toggleFlag(this)">
                <i class="ph ${icon}"></i> ${label}
            </label>`;
        }

        // Toggle flag state
        window.toggleFlag = function(cb) {
            const key = cb.value;
            const item = document.getElementById('fi-' + key);
            if (cb.checked) {
                if (!editState.berkas_ditolak.includes(key))
                    editState.berkas_ditolak.push(key);
                if (item) item.classList.add('flagged');
            } else {
                editState.berkas_ditolak = editState.berkas_ditolak.filter(k => k !== key);
                if (item) item.classList.remove('flagged');
            }
            triggerSaveAnim();
        };

        // Kirim WA notifikasi berkas bermasalah
        window.sendWaNotif = function() {
            if (editState.berkas_ditolak.length === 0) {
                Swal.fire('Info', 'Belum ada berkas yang ditandai bermasalah.', 'info');
                return;
            }
            const labelMap = {
                'foto_url':                     'Pas Foto (Buram/Tidak Sesuai)',
                'scan_kk_url':                  'Scan Kartu Keluarga',
                'scan_akta_url':                'Scan Akta Kelahiran',
                'scan_kelakuan_baik_url':       'Scan Surat Kelakuan Baik',
                'scan_ktp_ortu_url':            'Scan KTP Orang Tua',
                'scan_rapor_url':               'Dokumen Scan Rapor',
                'scan_sertifikat_prestasi_url': 'Scan Sertifikat Prestasi',
                'nilai_rapor':                  'Rata-Rata Nilai Rapor (Input Angka Tidak Sesuai dengan Asli)'
            };
            const berkasNames = editState.berkas_ditolak
                .map(k => '- ' + (labelMap[k] || k))
                .join('%0A');
            const phone = (p.no_telepon_ortu || '').replace(/^0/, '62').replace(/[^0-9]/g, '');
            const msg =
                encodeURIComponent('Assalamualaikum Warahmatullahi Wabarakatuh.') + '%0A%0A' +
                encodeURIComponent(`Kepada Yth. Orang Tua / Wali dari ${p.nama_lengkap},`) + '%0A%0A' +
                encodeURIComponent('Mohon maaf mengganggu waktunya. Kami dari Panitia Penerimaan Murid Baru (PMB) MAN 1 Tasikmalaya menginformasikan bahwa data/berkas pendaftaran putra/putri Bapak/Ibu masih ada yang bermasalah atau belum sesuai kriteria.') + '%0A%0A' +
                encodeURIComponent('Bagian yang bermasalah dan wajib diperbaiki/diupload ulang:') + '%0A' +
                encodeURIComponent(berkasNames.replace(/%0A/g, '\n')) + '%0A%0A' + // encode URI handles new lines differently, so encode the mapped string directly
                encodeURIComponent('Mohon kiranya Bapak/Ibu dapat mengarahkan putra/putri untuk segera login kembali ke portal PMB dan memperbaiki bagian tersebut sesegera mungkin, agar proses pendaftaran dapat dilanjutkan.') + '%0A%0A' +
                encodeURIComponent('Apabila ada pertanyaan, jangan ragu untuk menghubungi kami kembali. Terima kasih atas perhatian dan kerjasamanya.') + '%0A%0A' +
                encodeURIComponent('Wassalamualaikum Warahmatullahi Wabarakatuh.') + '%0A' +
                encodeURIComponent('Panitia PMB MAN 1 Tasikmalaya');
            window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
        };

        // ── Inject overlay ke document.body agar lepas dari Swal ──────
        let fvEl = document.getElementById('fv-overlay-body');
        if (!fvEl) {
            fvEl = document.createElement('div');
            fvEl.id        = 'fv-overlay-body';
            fvEl.className = 'fv-overlay-body';
            fvEl.innerHTML = `
                <div class="fv-topbar">
                    <span class="fv-title" id="fv-title">—</span>
                    <span class="fv-counter" id="fv-counter"></span>
                    <button class="fv-close" onclick="window.closeFileViewer()" title="Tutup (Esc)">
                        <i class="ph ph-x"></i>
                    </button>
                </div>
                <div class="fv-body">
                    <button class="fv-nav fv-prev" id="fv-prev" onclick="window.stepFileViewer(-1)">
                        <i class="ph ph-caret-left"></i>
                    </button>
                    <iframe class="fv-frame" id="fv-frame" src="about:blank"></iframe>
                    <img class="fv-img" id="fv-img" src="" style="display:none;" alt="">
                    <button class="fv-nav fv-next" id="fv-next" onclick="window.stepFileViewer(1)">
                        <i class="ph ph-caret-right"></i>
                    </button>
                </div>
                <div class="fv-hints">
                    <span class="fv-hint"><kbd>←</kbd><kbd>→</kbd> navigasi berkas</span>
                    <span class="fv-hint"><kbd>Esc</kbd> tutup</span>
                </div>`;
            document.body.appendChild(fvEl);
        }

        window.openFileViewer = function(btnIndex) {
            const allFiles = [
                { label: 'Foto Siswa',          url: p.foto_url,                      type: 'img' },
                { label: 'Kartu Keluarga',       url: p.scan_kk_url,                   type: 'pdf' },
                { label: 'Akta Kelahiran',       url: p.scan_akta_url,                 type: 'pdf' },
                { label: 'Surat Kelakuan Baik',  url: p.scan_kelakuan_baik_url,        type: 'pdf' },
                { label: 'KTP Orang Tua',        url: p.scan_ktp_ortu_url,             type: 'pdf' },
                { label: 'Rapor',                url: p.scan_rapor_url,                type: 'pdf' },
                { label: 'Sertifikat Prestasi',  url: p.scan_sertifikat_prestasi_url,  type: 'pdf' },
                { label: 'Surat Pesantren',      url: p.daftar_ulang_pesantren_url,    type: 'pdf' },
            ];
            const clicked = allFiles[btnIndex];
            if (!clicked || !clicked.url) return;
            const idx = fvFiles.findIndex(f => f.url === clicked.url);
            if (idx === -1) return;
            fvCurrent = idx;
            window.renderFileViewer();
            document.getElementById('fv-overlay-body').classList.add('open');
        }

        window.renderFileViewer = function() {
            const f = fvFiles[fvCurrent];
            if (!f) return;
            document.getElementById('fv-title').textContent   = f.label;
            document.getElementById('fv-counter').textContent = (fvCurrent + 1) + ' / ' + fvFiles.length;
            document.getElementById('fv-prev').disabled = fvCurrent === 0;
            document.getElementById('fv-next').disabled = fvCurrent === fvFiles.length - 1;
            const frame = document.getElementById('fv-frame');
            const img   = document.getElementById('fv-img');

            // Highlight active file-btn di sidebar Swal
            document.querySelectorAll('.file-btn').forEach(b => b.classList.remove('fv-active'));
            const origUrls = [
                p.foto_url, p.scan_kk_url, p.scan_akta_url,
                p.scan_skb_url, p.scan_ktp_ortu_url,
                p.scan_rapor_url, p.scan_sertifikat_prestasi_url,
                p.daftar_ulang_pesantren_url
            ];
            const origIdx = origUrls.indexOf(f.url);
            if (origIdx >= 0) {
                const btn = document.getElementById('fb-' + origIdx);
                if (btn) btn.classList.add('fv-active');
            }

            if (f.type === 'img') {
                frame.style.display = 'none';
                img.style.display   = 'block';
                img.src             = f.url;
            } else {
                img.style.display   = 'none';
                frame.style.display = 'block';
                frame.src           = f.url;
            }
        }

        window.stepFileViewer = function(dir) {
            const nxt = fvCurrent + dir;
            if (nxt < 0 || nxt >= fvFiles.length) return;
            fvCurrent = nxt;
            window.renderFileViewer();
        };

        window.closeFileViewer = function() {
            const ov = document.getElementById('fv-overlay-body');
            if (ov) ov.classList.remove('open');
            const frame = document.getElementById('fv-frame');
            if (frame) frame.src = 'about:blank';
            document.querySelectorAll('.file-btn').forEach(b => b.classList.remove('fv-active'));
        };

        // Keyboard navigation
        document.addEventListener('keydown', function fvKeyHandler(e) {
            const ov = document.getElementById('fv-overlay-body');
            if (!ov || !ov.classList.contains('open')) {
                document.removeEventListener('keydown', fvKeyHandler);
                return;
            }
            if (e.key === 'ArrowRight') { e.preventDefault(); window.stepFileViewer(1); }
            if (e.key === 'ArrowLeft')  { e.preventDefault(); window.stepFileViewer(-1); }
            if (e.key === 'Escape')     { window.closeFileViewer(); }
        });

    } catch (e) { 
        console.error(e); 
        Swal.fire('Error', 'Gagal memuat detail siswa.', 'error');
    }
}

window.setEditState = function(type, value, btn) {
    if (type === 'verif') {
        editState.status_verifikasi = value;
    }
    if (type === 'lulus') {
        editState.status_kelulusan = value;
    }
    if (type === 'du') {
        editState.daftar_ulang_hardcopy_status = value;
        editState.daftar_ulang_hardcopy_at = value === 'SUDAH' ? new Date().toISOString() : null;
    }
    
    const parent = btn.parentElement;
    const siblings = parent.querySelectorAll('.btn-act');
    siblings.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    triggerSaveAnim();
}

window.saveDetailChanges = async function() {
    const saveBtn = document.getElementById('btn-save-changes');
    let originalText = '';
    let originalBg = '';
    
    if (saveBtn) {
        originalText = saveBtn.innerHTML;
        originalBg = saveBtn.style.background;
        saveBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Loading...';
        saveBtn.style.pointerEvents = 'none';
        saveBtn.style.opacity = '0.7';
    }
    
    let payload = { 
        status_verifikasi: editState.status_verifikasi, 
        status_kelulusan: editState.status_kelulusan,
        daftar_ulang_hardcopy_status: editState.daftar_ulang_hardcopy_status || 'BELUM',
        daftar_ulang_hardcopy_at: editState.daftar_ulang_hardcopy_status === 'SUDAH'
            ? (editState.daftar_ulang_hardcopy_at || new Date().toISOString())
            : null,
        berkas_ditolak: editState.berkas_ditolak && editState.berkas_ditolak.length > 0
            ? JSON.stringify(editState.berkas_ditolak)
            : null,
    };
    
    const elTgl = document.getElementById('input-tgl'); 
    const elSesi = document.getElementById('input-sesi'); 
    const elRuang = document.getElementById('input-ruang');
    
    if (elTgl && elSesi && elRuang) { 
        payload.tanggal_tes = elTgl.value; 
        payload.sesi_tes = elSesi.value; 
        payload.ruang_tes = elRuang.value; 
    }

    const result = await apiPost('admin?action=update-satu', { id: editState.id, payload });
    
    if (saveBtn) {
        saveBtn.style.pointerEvents = 'auto';
        saveBtn.style.opacity = '1';
    }

    if (!result.error) {
        const index = allPendaftar.findIndex(x => x.id === editState.id);
        if (index !== -1) { 
            allPendaftar[index].status_verifikasi = payload.status_verifikasi; 
            allPendaftar[index].status_kelulusan = payload.status_kelulusan;
            allPendaftar[index].daftar_ulang_hardcopy_status = payload.daftar_ulang_hardcopy_status;
            allPendaftar[index].daftar_ulang_hardcopy_at = payload.daftar_ulang_hardcopy_at;
            allPendaftar[index].berkas_ditolak = payload.berkas_ditolak; 
            
            if(elTgl) { 
                allPendaftar[index].tanggal_tes = payload.tanggal_tes; 
                allPendaftar[index].sesi_tes = payload.sesi_tes; 
                allPendaftar[index].ruang_tes = payload.ruang_tes; 
            }
        }
        
        updateStats(allPendaftar); 
        renderTable(); 
        
        if(document.getElementById('panel-jadwal').style.display === 'block') { 
            renderPlottingTable(); 
        }
        
        if (saveBtn) { 
            saveBtn.innerHTML = '<i class="ph ph-check"></i> Tersimpan'; 
            saveBtn.style.background = '#10b981'; // success green
            saveBtn.style.color = '#fff';
            setTimeout(() => { 
                saveBtn.innerHTML = originalText; 
                saveBtn.style.background = originalBg;
            }, 2000); 
        }
    } else { 
        Swal.fire('Gagal Menyimpan', result.error, 'error');
        if (saveBtn) saveBtn.innerHTML = originalText;
    }
}

window.alihkanSatuKeReguler = async function(id, name) {
    const confirm = await Swal.fire({
        title: 'Alihkan ke Jalur Reguler?',
        html: `Anda akan memindahkan <strong>${name}</strong> dari Jalur Prestasi ke Jalur Reguler.<br><br>
               Siswa ini otomatis diwajibkan mengikuti Tes CBT dan status verifikasi dikembalikan ke <em>menunggu</em>.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Ya, Alihkan',
        confirmButtonColor: '#7c3aed',
        cancelButtonText: 'Batal'
    });

    if (!confirm.isConfirmed) return;

    Swal.showLoading();
    const result = await apiPost('admin?action=alih-reguler', { ids: [id] });
    
    if (!result.error) {
        const idx = allPendaftar.findIndex(x => x.id === id);
        if (idx !== -1) {
            allPendaftar[idx].jalur = 'REGULER';
            allPendaftar[idx].status_verifikasi = null;
            allPendaftar[idx].status_kelulusan = 'PENDING';
            allPendaftar[idx].ruang_tes = null;
            allPendaftar[idx].tanggal_tes = null;
            allPendaftar[idx].sesi_tes = null;
        }
        updateStats(allPendaftar);
        renderTable();
        closeDetail();
        Swal.fire('Berhasil', `${name} telah dialihkan ke Jalur Reguler.`, 'success');
    } else {
        Swal.fire('Gagal', result.error, 'error');
    }
}

// ==========================================
// 10. FITUR EXPORT EXCEL & ZIP BERKAS
// ==========================================
window.exportToExcel = function() {
    if (allPendaftar.length === 0) { 
        Swal.fire('Kosong', 'Belum ada data pendaftar untuk diexport.', 'info'); 
        return; 
    }
    
    const excelData = allPendaftar.map(p => {
        let statVerif = "PENDING"; 
        if (p.status_verifikasi === true) statVerif = "TERVERIFIKASI"; 
        else if (p.status_verifikasi === false) statVerif = "DITOLAK";
        
        let ketUjian = "-";
        if (p.jalur === 'PRESTASI') { 
            ketUjian = "Tes Pembuktian (Offline)"; 
        } else if (p.jalur === 'REGULER') { 
            ketUjian = "WAJIB TES CBT"; 
        }

        // SEMUA DATA FORMULIR MASUK DI SINI
        return {
            "Waktu Daftar": p.created_at ? new Date(p.created_at + 'Z').toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : "-",
            "No Pendaftaran": p.no_pendaftaran || "-", 
            "Jalur": p.jalur || "-", 
            "Status Verifikasi": statVerif, 
            "Status Kelulusan": p.status_kelulusan || "PENDING",
            "NISN": p.nisn || "-", 
            "NIK Siswa": p.nik || "-", 
            "Nama Lengkap": p.nama_lengkap || "-", 
            "Jenis Kelamin": p.jenis_kelamin || "-", 
            "Tempat Lahir": p.tempat_lahir || "-", 
            "Tanggal Lahir": p.tanggal_lahir || "-", 
            "Ukuran Baju": p.ukuran_baju || "-", 
            "Agama": p.agama || "-", 
            "Anak Ke": p.anak_ke || "-", 
            "Jumlah Saudara": p.jumlah_saudara || "-", 
            "Status Anak": p.status_anak || "-", 
            "Alamat Lengkap": p.alamat_lengkap || "-", 
            "RT": p.rt || "-", 
            "RW": p.rw || "-", 
            "Desa/Kelurahan": p.desa_kelurahan || "-", 
            "Kecamatan": p.kecamatan || "-", 
            "Kab/Kota": p.kabupaten_kota || "-", 
            "Provinsi": p.provinsi || "-", 
            "Kode Pos": p.kode_pos || "-", 
            "No Kartu Keluarga": p.no_kk || "-", 
            "Nama Ayah": p.nama_ayah || "-", 
            "NIK Ayah": p.nik_ayah || "-", 
            "Pendidikan Ayah": p.pendidikan_ayah || "-", 
            "Pekerjaan Ayah": p.pekerjaan_ayah || "-", 
            "Penghasilan Ayah (Rp)": p.penghasilan_ayah || "-", 
            "Nama Ibu": p.nama_ibu || "-", 
            "NIK Ibu": p.nik_ibu || "-", 
            "Pendidikan Ibu": p.pendidikan_ibu || "-", 
            "Pekerjaan Ibu": p.pekerjaan_ibu || "-", 
            "Penghasilan Ibu (Rp)": p.penghasilan_ibu || "-", 
            "No Telepon/WA Ortu": p.no_telepon_ortu || "-", 
            "Asal Sekolah": p.asal_sekolah || "-", 
            "NPSN Sekolah": p.npsn_sekolah || "-", 
            "Status Sekolah": p.status_sekolah || "-", 
            "Pilihan Pesantren": p.pilihan_pesantren || "-", 
            "Keterangan Ujian": ketUjian, 
            "Tanggal Tes": p.tanggal_tes || "-", 
            "Sesi Ujian": p.sesi_tes || "-", 
            "Ruang Ujian": p.ruang_tes || "-"
        };
    });

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    
    // Rapikan lebar kolom secara dinamis
    const wscols = Object.keys(excelData[0]).map(key => {
        if (key === 'Nama Lengkap' || key === 'Alamat Lengkap' || key === 'Asal Sekolah') return { wch: 30 };
        if (key === 'Keterangan Ujian' || key === 'Tanggal Tes' || key === 'Sesi Ujian') return { wch: 25 };
        if (key === 'No Pendaftaran' || key === 'NISN' || key === 'NIK Siswa') return { wch: 18 };
        return { wch: 15 };
    });
    
    worksheet['!cols'] = wscols;
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data Pendaftar");
    
    const tgl = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-');
    XLSX.writeFile(workbook, `Rekap_Lengkap_PMB_MAN1Tasik_${tgl}.xlsx`);
}

window.processZipDownload = async function(pendaftarList, zipFilename) {
    if (!pendaftarList || pendaftarList.length === 0) return;
    
    const confirm = await Swal.fire({ 
        title: 'Mulai Download?', 
        text: `Mendownload berkas ${pendaftarList.length} pendaftar.`, 
        icon: 'info', 
        showCancelButton: true, 
        confirmButtonText: 'Ya', 
        cancelButtonText: 'Batal' 
    });
    
    if (!confirm.isConfirmed) return;
    
    const zip = new JSZip(); 
    let rootFolder = zip.folder("Berkas_PMB");
    
    Swal.fire({ 
        title: 'Memproses...', 
        html: `Download: <span id="zip-progress">0</span> / ${pendaftarList.length}`, 
        allowOutsideClick: false, 
        didOpen: () => { Swal.showLoading(); } 
    });
    
    async function urlToBlob(url) { 
        if(!url) return null; 
        try { 
            const response = await fetch(url); 
            return response.ok ? await response.blob() : null; 
        } catch(e) { 
            return null; 
        } 
    }
    
    for (let i = 0; i < pendaftarList.length; i++) {
        const p = pendaftarList[i]; 
        
        document.getElementById('zip-progress').innerText = i + 1;
        
        const safeName = (p.nama_lengkap || 'Unknown').replace(/[^a-zA-Z0-9 ]/g, "").trim();
        const pFolder = rootFolder.folder(`${safeName}_${p.nisn || '000'}`);
        
        if(p.foto_url) { 
            const b = await urlToBlob(p.foto_url); 
            if(b) pFolder.file(`FOTO.jpg`, b); 
        }
        if(p.scan_kk_url) { 
            const b = await urlToBlob(p.scan_kk_url); 
            if(b) pFolder.file(`KK.pdf`, b); 
        }
        if(p.scan_akta_url) { 
            const b = await urlToBlob(p.scan_akta_url); 
            if(b) pFolder.file(`AKTA.pdf`, b); 
        }
        if(p.scan_kelakuan_baik_url) { 
            const b = await urlToBlob(p.scan_kelakuan_baik_url); 
            if(b) pFolder.file(`SKB.pdf`, b); 
        }
        if(p.scan_rapor_url) { 
            const b = await urlToBlob(p.scan_rapor_url); 
            if(b) pFolder.file(`RAPOR.pdf`, b); 
        }
    }
    
    Swal.fire({ 
        title: 'Membungkus ZIP...', 
        text: 'Mohon tunggu...', 
        allowOutsideClick: false, 
        didOpen: () => { Swal.showLoading(); } 
    });
    
    zip.generateAsync({ type: "blob" }).then(function(content) {
        saveAs(content, zipFilename); 
        Swal.fire('Berhasil!', 'File didownload.', 'success');
        
        selectedIds.clear(); 
        updateBulkUI(); 
        
        document.querySelectorAll('.row-checkbox, #selectAll').forEach(cb => {
            cb.checked = false;
        });
        
    }).catch(err => { 
        Swal.fire('Gagal', 'Terjadi kesalahan.', 'error'); 
    });
}

window.downloadAllFilesZip = function() {
    processZipDownload(allPendaftar, `Berkas_ALL_PMB_MAN1Tasik_${new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-')}.zip`);
}

// ==========================================
// 11. PENGATURAN SISTEM (BUKA/TUTUP JALUR)
// ==========================================
window.aturJalur = async function() {
    try {
        const data = await apiGet('admin?action=pengaturan');
        const config = {};
        
        if (Array.isArray(data)) {
            data.forEach(item => {
                // Semua pakai kolom value di D1
                config[item.key] = item.value;
            });
        }

        // Jalur aktif jika value === 'true' atau belum pernah diset (default aktif)
        const regChecked    = config['JALUR_REGULER'] !== 'false';
        const presChecked   = config['JALUR_PRESTASI'] !== 'false';
        const cetakChecked  = config['CETAK_KARTU_AKTIF'] === 'true';
        const lulusChecked  = config['KELULUSAN_AKTIF'] === 'true';
        const popupChecked  = config['LANDING_POPUP_AKTIF'] !== 'false';
        const popupMode     = config['LANDING_POPUP_MODE'] === 'pengumuman' ? 'pengumuman' : 'instruksi';
        const popupJudul    = config['LANDING_POPUP_JUDUL'] || 'Pengumuman Hasil Seleksi';
        const popupIsi      = config['LANDING_POPUP_ISI'] || 'Hasil seleksi sudah bisa dilihat di akun masing-masing.';
        const popupBtnText  = config['LANDING_POPUP_TOMBOL_TEXT'] || 'Login Sekarang';
        const popupBtnLink  = config['LANDING_POPUP_TOMBOL_LINK'] || 'login.html';
        const esc = (value) => String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        const { value: formValues } = await Swal.fire({
            title: 'Pengaturan Sistem PMB',
            html: `
                <div style="display:flex; flex-direction:column; gap:15px; text-align:left; padding:10px;">
                    <div style="background:#f8fafc; padding:15px; border-radius:10px; border:1px solid #eee; display:flex; justify-content:space-between; align-items:center;">
                        <strong style="color:#00796b; font-size:1.05rem;">Jalur Reguler</strong>
                        <input type="checkbox" id="check-reguler" ${regChecked ? 'checked' : ''} style="transform:scale(1.5);">
                    </div>
                    
                    <div style="background:#f8fafc; padding:15px; border-radius:10px; border:1px solid #eee; display:flex; justify-content:space-between; align-items:center;">
                        <strong style="color:#991b1b; font-size:1.05rem;">Jalur Prestasi</strong>
                        <input type="checkbox" id="check-prestasi" ${presChecked ? 'checked' : ''} style="transform:scale(1.5);">
                    </div>

                    <div style="background:${cetakChecked ? '#f0fdf4' : '#fff8f0'}; padding:15px; border-radius:10px; border:1px solid ${cetakChecked ? '#bbf7d0' : '#fed7aa'}; display:flex; justify-content:space-between; align-items:flex-start; flex-direction:column; gap:10px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                            <div>
                                <strong style="color:${cetakChecked ? '#15803d' : '#c2410c'}; font-size:1.05rem; display:flex; align-items:center; gap:7px;">
                                    <i class="ph ${cetakChecked ? 'ph-printer' : 'ph-printer-slash'}"></i>
                                    Cetak Kartu Tes
                                </strong>
                                <p style="margin:4px 0 0; font-size:.78rem; color:#64748b; line-height:1.5;">
                                    Aktifkan agar peserta bisa mencetak Kartu Ujian CBT.<br>
                                    Nonaktifkan saat plotting masih berlangsung.
                                </p>
                            </div>
                            <label id="toggle-cetak-label" style="position:relative; display:inline-block; width:52px; height:28px; flex-shrink:0; margin-left:12px;">
                                <input type="checkbox" id="check-cetak-kartu" ${cetakChecked ? 'checked' : ''}
                                       onchange="
                                           const lbl = this.closest('div').parentElement;
                                           lbl.style.background = this.checked ? '#f0fdf4' : '#fff8f0';
                                           lbl.style.borderColor = this.checked ? '#bbf7d0' : '#fed7aa';
                                           lbl.querySelector('strong').style.color = this.checked ? '#15803d' : '#c2410c';
                                           lbl.querySelector('i').className = 'ph ' + (this.checked ? 'ph-printer' : 'ph-printer-slash');
                                       "
                                       style="opacity:0;width:0;height:0;">
                                <span style="
                                    position:absolute; cursor:pointer; inset:0;
                                    background:${cetakChecked ? '#16a34a' : '#cbd5e1'};
                                    border-radius:99px; transition:.3s;
                                " id="toggle-cetak-slider"
                                   onclick="this.style.background = document.getElementById('check-cetak-kartu').checked ? '#16a34a' : '#cbd5e1';"
                                ></span>
                                <span style="
                                    position:absolute; top:3px; left:${cetakChecked ? '27px' : '3px'};
                                    background:white; width:22px; height:22px;
                                    border-radius:50%; transition:.3s;
                                    pointer-events:none;
                                " id="toggle-cetak-knob"></span>
                            </label>
                        </div>
                        <div id="cetak-status-badge" style="font-size:.75rem; font-weight:700; padding:4px 12px; border-radius:99px; background:${cetakChecked ? '#dcfce7' : '#fee2e2'}; color:${cetakChecked ? '#166534' : '#991b1b'}; align-self:flex-start;">
                            ${cetakChecked ? '✓ Aktif — Peserta bisa cetak kartu' : '✗ Nonaktif — Cetak kartu terkunci'}
                        </div>
                    </div>

                    <div style="background:${lulusChecked ? '#f0fdf4' : '#fff8f0'}; padding:15px; border-radius:10px; border:1px solid ${lulusChecked ? '#bbf7d0' : '#fed7aa'}; display:flex; justify-content:space-between; align-items:flex-start; flex-direction:column; gap:10px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                            <div>
                                <strong style="color:${lulusChecked ? '#15803d' : '#c2410c'}; font-size:1.05rem; display:flex; align-items:center; gap:7px;">
                                    <i class="ph ${lulusChecked ? 'ph-megaphone' : 'ph-megaphone-simple'}"></i>
                                    Pengumuman Kelulusan
                                </strong>
                                <p style="margin:4px 0 0; font-size:.78rem; color:#64748b; line-height:1.5;">
                                    Aktifkan hanya saat hasil akhir siap diumumkan ke dashboard siswa.<br>
                                    Nonaktifkan agar admin bisa import/ralat kelulusan tanpa terlihat siswa.
                                </p>
                            </div>
                            <label style="position:relative; display:inline-block; width:52px; height:28px; flex-shrink:0; margin-left:12px;">
                                <input type="checkbox" id="check-kelulusan-aktif" ${lulusChecked ? 'checked' : ''}
                                       onchange="
                                           const box = this.closest('div').parentElement;
                                           box.style.background = this.checked ? '#f0fdf4' : '#fff8f0';
                                           box.style.borderColor = this.checked ? '#bbf7d0' : '#fed7aa';
                                           box.querySelector('strong').style.color = this.checked ? '#15803d' : '#c2410c';
                                           box.querySelector('i').className = 'ph ' + (this.checked ? 'ph-megaphone' : 'ph-megaphone-simple');
                                           const slider = box.querySelector('.toggle-lulus-slider');
                                           const knob = box.querySelector('.toggle-lulus-knob');
                                           const badge = box.querySelector('.toggle-lulus-badge');
                                           slider.style.background = this.checked ? '#16a34a' : '#cbd5e1';
                                           knob.style.left = this.checked ? '27px' : '3px';
                                           badge.style.background = this.checked ? '#dcfce7' : '#fee2e2';
                                           badge.style.color = this.checked ? '#166534' : '#991b1b';
                                           badge.innerHTML = this.checked ? 'Aktif - Hasil terlihat siswa' : 'Nonaktif - Hasil disembunyikan';
                                       "
                                       style="opacity:0;width:0;height:0;">
                                <span class="toggle-lulus-slider" style="
                                    position:absolute; cursor:pointer; inset:0;
                                    background:${lulusChecked ? '#16a34a' : '#cbd5e1'};
                                    border-radius:99px; transition:.3s;
                                "></span>
                                <span class="toggle-lulus-knob" style="
                                    position:absolute; top:3px; left:${lulusChecked ? '27px' : '3px'};
                                    background:white; width:22px; height:22px;
                                    border-radius:50%; transition:.3s;
                                    pointer-events:none;
                                "></span>
                            </label>
                        </div>
                        <div class="toggle-lulus-badge" style="font-size:.75rem; font-weight:700; padding:4px 12px; border-radius:99px; background:${lulusChecked ? '#dcfce7' : '#fee2e2'}; color:${lulusChecked ? '#166534' : '#991b1b'}; align-self:flex-start;">
                            ${lulusChecked ? 'Aktif - Hasil terlihat siswa' : 'Nonaktif - Hasil disembunyikan'}
                        </div>
                    </div>

                    <div style="background:${popupChecked ? '#f0fdf4' : '#fff8f0'}; padding:15px; border-radius:10px; border:1px solid ${popupChecked ? '#bbf7d0' : '#fed7aa'}; display:flex; align-items:flex-start; flex-direction:column; gap:12px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                            <div>
                                <strong style="color:${popupChecked ? '#15803d' : '#c2410c'}; font-size:1.05rem; display:flex; align-items:center; gap:7px;">
                                    <i class="ph ${popupChecked ? 'ph-chats-circle' : 'ph-chat-circle-slash'}"></i>
                                    Pop-up Landing Page
                                </strong>
                                <p style="margin:4px 0 0; font-size:.78rem; color:#64748b; line-height:1.5;">
                                    Atur pop-up yang muncul saat halaman utama dibuka.
                                </p>
                            </div>
                            <label style="position:relative; display:inline-block; width:52px; height:28px; flex-shrink:0; margin-left:12px;">
                                <input type="checkbox" id="check-popup-landing" ${popupChecked ? 'checked' : ''}
                                       onchange="
                                           const box = this.closest('div').parentElement;
                                           box.style.background = this.checked ? '#f0fdf4' : '#fff8f0';
                                           box.style.borderColor = this.checked ? '#bbf7d0' : '#fed7aa';
                                           box.querySelector('strong').style.color = this.checked ? '#15803d' : '#c2410c';
                                           box.querySelector('i').className = 'ph ' + (this.checked ? 'ph-chats-circle' : 'ph-chat-circle-slash');
                                           const slider = box.querySelector('.toggle-popup-slider');
                                           const knob = box.querySelector('.toggle-popup-knob');
                                           const badge = box.querySelector('.toggle-popup-badge');
                                           slider.style.background = this.checked ? '#16a34a' : '#cbd5e1';
                                           knob.style.left = this.checked ? '27px' : '3px';
                                           badge.style.background = this.checked ? '#dcfce7' : '#fee2e2';
                                           badge.style.color = this.checked ? '#166534' : '#991b1b';
                                           badge.innerHTML = this.checked ? 'Aktif - Pop-up tampil' : 'Nonaktif - Pop-up disembunyikan';
                                       "
                                       style="opacity:0;width:0;height:0;">
                                <span class="toggle-popup-slider" style="
                                    position:absolute; cursor:pointer; inset:0;
                                    background:${popupChecked ? '#16a34a' : '#cbd5e1'};
                                    border-radius:99px; transition:.3s;
                                "></span>
                                <span class="toggle-popup-knob" style="
                                    position:absolute; top:3px; left:${popupChecked ? '27px' : '3px'};
                                    background:white; width:22px; height:22px;
                                    border-radius:50%; transition:.3s;
                                    pointer-events:none;
                                "></span>
                            </label>
                        </div>
                        <div class="toggle-popup-badge" style="font-size:.75rem; font-weight:700; padding:4px 12px; border-radius:99px; background:${popupChecked ? '#dcfce7' : '#fee2e2'}; color:${popupChecked ? '#166534' : '#991b1b'}; align-self:flex-start;">
                            ${popupChecked ? 'Aktif - Pop-up tampil' : 'Nonaktif - Pop-up disembunyikan'}
                        </div>

                        <div style="width:100%; border-top:1px dashed #dbe3ea; padding-top:12px;">
                            <label style="display:block; font-weight:700; color:#475569; font-size:.8rem; margin-bottom:8px;">Jenis Pop-up</label>
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                                <label style="display:flex; align-items:center; gap:8px; background:white; border:1px solid #cbd5e1; border-radius:8px; padding:10px; font-size:.82rem; color:#334155;">
                                    <input type="radio" name="landing-popup-mode" value="instruksi" ${popupMode === 'instruksi' ? 'checked' : ''} onchange="document.getElementById('landing-popup-fields').style.display = this.value === 'pengumuman' ? 'block' : 'none';">
                                    Instruksi Pendaftaran
                                </label>
                                <label style="display:flex; align-items:center; gap:8px; background:white; border:1px solid #cbd5e1; border-radius:8px; padding:10px; font-size:.82rem; color:#334155;">
                                    <input type="radio" name="landing-popup-mode" value="pengumuman" ${popupMode === 'pengumuman' ? 'checked' : ''} onchange="document.getElementById('landing-popup-fields').style.display = this.value === 'pengumuman' ? 'block' : 'none';">
                                    Pengumuman
                                </label>
                            </div>

                            <div id="landing-popup-fields" style="display:${popupMode === 'pengumuman' ? 'block' : 'none'}; margin-top:12px;">
                                <label style="display:block; margin:12px 0 5px; font-weight:600; color:#475569; font-size:.8rem;">Judul Pengumuman</label>
                                <input type="text" id="landing-popup-judul" style="width:100%; padding:10px 14px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.85rem; box-sizing:border-box;" value="${esc(popupJudul)}">

                                <label style="display:block; margin:12px 0 5px; font-weight:600; color:#475569; font-size:.8rem;">Isi Pengumuman</label>
                                <textarea id="landing-popup-isi" rows="3" style="width:100%; padding:10px 14px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.85rem; box-sizing:border-box; resize:vertical;">${esc(popupIsi)}</textarea>

                                <label style="display:block; margin:12px 0 5px; font-weight:600; color:#475569; font-size:.8rem;">Teks Tombol</label>
                                <input type="text" id="landing-popup-tombol-text" style="width:100%; padding:10px 14px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.85rem; box-sizing:border-box;" value="${esc(popupBtnText)}">

                                <label style="display:block; margin:12px 0 5px; font-weight:600; color:#475569; font-size:.8rem;">Link Tombol</label>
                                <input type="text" id="landing-popup-tombol-link" style="width:100%; padding:10px 14px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.85rem; box-sizing:border-box;" value="${esc(popupBtnLink)}" placeholder="login.html">
                            </div>
                        </div>
                    </div>
                    
                    <div style="margin-top:20px; border-top:1px dashed #ddd; padding-top:20px; font-size:0.85rem;">
                        <h4 style="margin:0 0 15px; color:#1e293b; font-size:1rem;">Teks Jadwal Prestasi</h4>
                        
                        <label style="display:block; margin: 15px 0 5px; font-weight:600; color:#475569;">Periode Pendaftaran</label>
                        <input type="text" id="t-daf-pres" style="width:100%; padding:10px 14px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.85rem; box-sizing:border-box;" placeholder="contoh: 6 - 14 April 2026" value="${config['TEKS_DAFTAR_PRES'] || '6 – 14 April 2026'}">
                        
                        <label style="display:block; margin: 15px 0 5px; font-weight:600; color:#475569;">Tanggal Tes Pembuktian</label>
                        <input type="text" id="t-tes-pres" style="width:100%; padding:10px 14px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.85rem; box-sizing:border-box;" placeholder="contoh: 16 April 2026" value="${config['TEKS_TES_PRES'] || '16 April 2026'}">
                        
                        <label style="display:block; margin: 15px 0 5px; font-weight:600; color:#475569;">Tanggal Pengumuman</label>
                        <input type="text" id="t-peng-pres" style="width:100%; padding:10px 14px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.85rem; box-sizing:border-box;" placeholder="contoh: 18 April 2026" value="${config['TEKS_PENGUMUMAN_PRES'] || '18 April 2026'}">
                        
                        <label style="display:block; margin: 15px 0 5px; font-weight:600; color:#475569;">Periode Lapor Diri / Daftar Ulang</label>
                        <input type="text" id="t-lap-pres" style="width:100%; padding:10px 14px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.85rem; box-sizing:border-box;" placeholder="contoh: 20 – 25 April 2026" value="${config['TEKS_LAPOR_PRES'] || '20 – 25 April 2026'}">

                        <h4 style="margin:25px 0 15px; color:#1e293b; font-size:1rem; border-top:1px dashed #ddd; padding-top:20px;">Teks Jadwal Reguler & Lainnya</h4>
                        
                        <label style="display:block; margin: 15px 0 5px; font-weight:600; color:#475569;">Periode Pendaftaran Reguler</label>
                        <input type="text" id="t-daf-reg" style="width:100%; padding:10px 14px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.85rem; box-sizing:border-box;" placeholder="contoh: 20 April – 20 Mei 2026" value="${config['TEKS_DAFTAR_REG'] || '20 April – 20 Mei 2026'}">
                        
                        <label style="display:block; margin: 15px 0 5px; font-weight:600; color:#475569;">Tanggal Tes Seleksi CBT</label>
                        <input type="text" id="t-cbt" style="width:100%; padding:10px 14px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.85rem; box-sizing:border-box;" placeholder="contoh: 21 – 23 Mei 2026" value="${config['TEKS_TES_CBT'] || '21 – 23 Mei 2026'}">
                        
                        <label style="display:block; margin: 15px 0 5px; font-weight:600; color:#475569;">Tanggal Pengumuman Reguler</label>
                        <input type="text" id="t-peng-reg" style="width:100%; padding:10px 14px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.85rem; box-sizing:border-box;" placeholder="contoh: 25 Mei 2026" value="${config['TEKS_PENGUMUMAN_REG'] || '25 Mei 2026'}">
                        
                        <label style="display:block; margin: 15px 0 5px; font-weight:600; color:#475569;">Periode Lapor Diri Reguler</label>
                        <input type="text" id="t-lap-reg" style="width:100%; padding:10px 14px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.85rem; box-sizing:border-box;" placeholder="contoh: 6 – 12 Juni 2026" value="${config['TEKS_LAPOR_REG'] || '6 – 12 Juni 2026'}">
                        
                        <label style="display:block; margin: 15px 0 5px; font-weight:600; color:#475569;">Tanggal Rapat Orang Tua</label>
                        <input type="text" id="t-rapat" style="width:100%; padding:10px 14px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.85rem; box-sizing:border-box;" placeholder="contoh: 6 Juni 2026" value="${config['TEKS_RAPAT'] || '6 Juni 2026'}">

                        <label style="display:block; margin: 15px 0 5px; font-weight:600; color:#475569;">Batas Akhir Pengumpulan Berkas Daftar Ulang</label>
                        <input type="text" id="t-batas-du" style="width:100%; padding:10px 14px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.85rem; box-sizing:border-box;" placeholder="contoh: 20 Juni 2026" value="${config['TEKS_BATAS_DAFTAR_ULANG'] || '20 Juni 2026'}">
                        
                        <h4 style="margin:25px 0 15px; color:#1e293b; font-size:1rem; border-top:1px dashed #ddd; padding-top:20px;">Link WhatsApp</h4>
                        <label style="display:block; margin: 15px 0 5px; font-weight:600; color:#475569;">Link Grup WhatsApp Calon Murid</label>
                        <input type="text" id="t-link-wa" style="width:100%; padding:10px 14px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.85rem; box-sizing:border-box;" placeholder="https://chat.whatsapp.com/..." value="${config['LINK_GRUP_WA'] || 'https://chat.whatsapp.com/JZlDusVAym7Gq9nB3nI5xo'}">
                    </div> 

                    <div style="margin-top:25px; border-top:1px dashed #ddd; padding-top:20px; text-align:left;">
                        <h4 style="margin:0 0 15px; color:#1e293b; font-size:1rem;">Akurasi Waktu Hitung Mundur</h4>
                        <label style="display:block; font-weight:600; color:#475569; font-size:0.8rem; margin:15px 0 5px;">Tanggal Pengumuman Prestasi</label>
                        <input type="datetime-local" id="tgl-pres" style="width:100%; padding:10px 14px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.85rem; box-sizing:border-box;" value="${config['TANGGAL_PENGUMUMAN_PRESTASI'] || '2026-04-18T00:00'}">
                        
                        <label style="display:block; font-weight:600; color:#475569; font-size:0.8rem; margin:15px 0 5px;">Tanggal Pengumuman Reguler</label>
                        <input type="datetime-local" id="tgl-reg" style="width:100%; padding:10px 14px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.85rem; box-sizing:border-box;" value="${config['TANGGAL_PENGUMUMAN_REGULER'] || '2026-05-25T00:00'}">
                    </div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'Simpan Perubahan',
            preConfirm: () => {
                return [
                    document.getElementById('check-reguler').checked,
                    document.getElementById('check-prestasi').checked,
                    document.getElementById('tgl-pres').value,
                    document.getElementById('tgl-reg').value,
                    document.getElementById('t-daf-pres').value,
                    document.getElementById('t-tes-pres').value,
                    document.getElementById('t-peng-pres').value,
                    document.getElementById('t-lap-pres').value,
                    document.getElementById('t-daf-reg').value,
                    document.getElementById('t-cbt').value,
                    document.getElementById('t-peng-reg').value,
                    document.getElementById('t-lap-reg').value,
                    document.getElementById('t-rapat').value,
                    document.getElementById('t-batas-du').value,
                    document.getElementById('t-link-wa').value,
                    document.getElementById('check-cetak-kartu').checked,  // index 15
                    document.getElementById('check-kelulusan-aktif').checked, // index 16
                    document.getElementById('check-popup-landing').checked, // index 17
                    document.querySelector('input[name="landing-popup-mode"]:checked')?.value || 'instruksi', // index 18
                    document.getElementById('landing-popup-judul').value || 'Pengumuman Hasil Seleksi', // index 19
                    document.getElementById('landing-popup-isi').value || 'Hasil seleksi sudah bisa dilihat di akun masing-masing.', // index 20
                    document.getElementById('landing-popup-tombol-text').value || 'Login Sekarang', // index 21
                    document.getElementById('landing-popup-tombol-link').value || 'login.html' // index 22
                ];
            }
        });

        if (formValues) {
            await apiPost('admin?action=pengaturan', { items: [
                { key: 'JALUR_REGULER', value: String(formValues[0]) },
                { key: 'JALUR_PRESTASI', value: String(formValues[1]) },
                { key: 'TANGGAL_PENGUMUMAN_PRESTASI', value: formValues[2] },
                { key: 'TANGGAL_PENGUMUMAN_REGULER', value: formValues[3] },
                { key: 'TEKS_DAFTAR_PRES', value: formValues[4] },
                { key: 'TEKS_TES_PRES', value: formValues[5] },
                { key: 'TEKS_PENGUMUMAN_PRES', value: formValues[6] },
                { key: 'TEKS_LAPOR_PRES', value: formValues[7] },
                { key: 'TEKS_DAFTAR_REG', value: formValues[8] },
                { key: 'TEKS_TES_CBT', value: formValues[9] },
                { key: 'TEKS_PENGUMUMAN_REG', value: formValues[10] },
                { key: 'TEKS_LAPOR_REG', value: formValues[11] },
                { key: 'TEKS_RAPAT', value: formValues[12] },
                { key: 'TEKS_BATAS_DAFTAR_ULANG', value: formValues[13] },
                { key: 'LINK_GRUP_WA', value: formValues[14] },
                { key: 'CETAK_KARTU_AKTIF', value: String(formValues[15]) },
                { key: 'KELULUSAN_AKTIF', value: String(formValues[16]) },
                { key: 'LANDING_POPUP_AKTIF', value: String(formValues[17]) },
                { key: 'LANDING_POPUP_MODE', value: formValues[18] },
                { key: 'LANDING_POPUP_JUDUL', value: formValues[19] },
                { key: 'LANDING_POPUP_ISI', value: formValues[20] },
                { key: 'LANDING_POPUP_TOMBOL_TEXT', value: formValues[21] },
                { key: 'LANDING_POPUP_TOMBOL_LINK', value: formValues[22] }
            ]});
            Swal.fire({
                icon: 'success',
                title: 'Pengaturan Disimpan',
                html: `<p style="font-size:.88rem; color:#334155; line-height:1.7;">
                    Pengaturan berhasil disimpan.<br><br>
                    <b style="color:${formValues[15] ? '#16a34a' : '#dc2626'};">Cetak Kartu Tes: ${formValues[15] ? 'AKTIF' : 'NONAKTIF'}</b><br>
                    <b style="color:${formValues[16] ? '#16a34a' : '#dc2626'};">Pengumuman Kelulusan: ${formValues[16] ? 'AKTIF' : 'NONAKTIF'}</b><br>
                    <b style="color:${formValues[17] ? '#16a34a' : '#dc2626'};">Pop-up Landing: ${formValues[17] ? 'AKTIF' : 'NONAKTIF'} (${formValues[18]})</b>
                </p>`,
                confirmButtonColor: '#00796b'
            });
        }
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'Gagal memuat pengaturan', 'error');
    }
}

// ==========================================
// 12. RESET DATABASE
// ==========================================
window.resetDatabase = async function() {
    // Step 0: Verifikasi PIN Rahasia
    const { value: pinOk } = await Swal.fire({
        title: '<i class="ph ph-lock-key" style="color:#dc2626"></i> Verifikasi PIN',
        html: '<p style="font-size:.85rem; color:#475569; margin:0 0 6px;">Masukkan PIN rahasia untuk melanjutkan operasi <b>Reset Database</b>.</p>',
        input: 'password',
        inputPlaceholder: 'PIN Rahasia...',
        inputAttributes: {
            autocomplete: 'new-password',
            style: 'letter-spacing:6px; text-align:center; font-size:1.1rem; font-weight:700;'
        },
        showCancelButton: true,
        confirmButtonText: 'Verifikasi',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#dc2626',
        allowOutsideClick: false,
        preConfirm: async (pin) => {
            if (!pin) {
                Swal.showValidationMessage('PIN tidak boleh kosong!');
                return false;
            }
            // Hash PIN yang dimasukkan dengan SHA-256, lalu bandingkan
            try {
                const enc = new TextEncoder();
                const buf = await crypto.subtle.digest('SHA-256', enc.encode(pin.trim()));
                const entered = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
                if (entered !== _RESET_PIN_HASH) {
                    Swal.showValidationMessage('PIN salah! Akses ditolak.');
                    return false;
                }
            } catch(e) {
                Swal.showValidationMessage('Gagal verifikasi PIN.');
                return false;
            }
            return true;
        }
    });

    if (!pinOk) return;

    // Step 1: Konfirmasi pertama
    const step1 = await Swal.fire({
        title: 'Reset Semua Data?',
        html: `
            <p style="color:#334155; font-size:.9rem; line-height:1.6; margin-bottom:12px;">
                Tindakan ini akan <b>menghapus permanen</b> seluruh data pendaftar
                dan data prestasi dari database.
            </p>
            <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:8px;
                        padding:12px 14px; text-align:left; font-size:.82rem; color:#991b1b; line-height:1.6;">
                <b>Yang akan dihapus:</b><br>
                &bull; Seluruh data pendaftar<br>
                &bull; Seluruh data prestasi<br>
                &bull; Nomor urut pendaftaran kembali ke awal<br><br>
                <b>Yang tidak terpengaruh:</b><br>
                &bull; Berkas/file di R2 (foto, dokumen) — hapus manual jika perlu<br>
                &bull; Akun admin<br>
                &bull; Pengaturan sistem (buka/tutup jalur, tanggal pengumuman)
            </div>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Lanjutkan',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#dc2626',
        focusCancel: true,
    });

    if (!step1.isConfirmed) return;

    // Step 2: Konfirmasi kedua — ketik RESET
    const step2 = await Swal.fire({
        title: 'Konfirmasi Akhir',
        html: `<p style="color:#334155; font-size:.88rem; margin-bottom:12px;">
                   Ketik <b>RESET</b> untuk melanjutkan. Tindakan ini tidak dapat dibatalkan.
               </p>`,
        input: 'text',
        inputPlaceholder: 'Ketik RESET di sini',
        inputAttributes: {
            autocomplete: 'off',
            style: 'text-transform:uppercase; letter-spacing:2px; font-weight:700; text-align:center;'
        },
        showCancelButton: true,
        confirmButtonText: 'Hapus Semua Data',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#dc2626',
        preConfirm: (val) => {
            if (val.trim().toUpperCase() !== 'RESET') {
                Swal.showValidationMessage('Ketik RESET (huruf kapital) untuk melanjutkan');
                return false;
            }
            return true;
        }
    });

    if (!step2.isConfirmed) return;

    // Proses
    Swal.fire({
        title: 'Menghapus Data...',
        text: 'Mohon tunggu sebentar',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        const res = await fetch('/api/reset', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Reset-Confirm': 'YES_DELETE_ALL',
            }
        });

        const result = await res.json();

        if (!res.ok || result.error) {
            throw new Error(result.error || 'Gagal mereset data.');
        }

        await Swal.fire({
            icon: 'success',
            title: 'Data Berhasil Dihapus',
            text: 'Semua data pendaftar telah dihapus. Nomor urut akan mulai dari awal.',
            confirmButtonText: 'OK',
            confirmButtonColor: '#00796b',
        });

        // Reload tampilan
        loadPendaftar();

    } catch (err) {
        console.error(err);
        Swal.fire('Gagal', err.message, 'error');
    }
};

// ==========================================
// 13. INISIALISASI
// ==========================================

// Inisialisasi hash PIN reset (SHA-256 dari PIN rahasia — tidak disimpan plaintext)
// Char codes: [50,50,49,50,57,53] = "221295"
let _RESET_PIN_HASH = '';
(async () => {
    try {
        const _b = new Uint8Array([50, 50, 49, 50, 57, 53]);
        const _buf = await crypto.subtle.digest('SHA-256', _b);
        _RESET_PIN_HASH = Array.from(new Uint8Array(_buf)).map(b => b.toString(16).padStart(2,'0')).join('');
    } catch(e) { console.warn('PIN hash init failed', e); }
})();

// Easter egg: klik logo "Admin PMB" sebanyak 5x dalam 3 detik → trigger resetDatabase
(function() {
    let _clickCount = 0;
    let _clickTimer = null;
    document.addEventListener('DOMContentLoaded', () => {
        const trigger = document.getElementById('sidebar-brand-trigger');
        if (!trigger) return;
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            _clickCount++;
            clearTimeout(_clickTimer);
            if (_clickCount >= 5) {
                _clickCount = 0;
                resetDatabase();
                return;
            }
            _clickTimer = setTimeout(() => { _clickCount = 0; }, 3000);
        });
    });
})();

loadPendaftar();
