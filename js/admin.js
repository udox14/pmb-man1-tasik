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
    document.getElementById('count-total').innerText = data.length;
    document.getElementById('count-reguler').innerText = data.filter(p => p.jalur === 'REGULER').length;
    document.getElementById('count-prestasi').innerText = data.filter(p => p.jalur === 'PRESTASI').length;
    document.getElementById('count-pending').innerText = data.filter(p => p.status_verifikasi === null).length;
    document.getElementById('count-lulus').innerText = data.filter(p => p.status_kelulusan === 'DITERIMA').length;
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
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 30px;">Tidak ada data ditemukan.</td></tr>';
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
            <td data-label="Aksi" style="text-align: right;">
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
    
    // TANGANI DOWNLOAD ZIP PILIHAN
    if (action === 'DOWNLOAD_ZIP') {
        const selectedPendaftar = allPendaftar.filter(p => ids.includes(p.id));
        const tgl = new Date().toISOString().slice(0,10);
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
        const tglCetak = new Date().toLocaleDateString('id-ID', {day:'numeric', month:'long', year:'numeric'});

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
    let uniqueSessions = new Set();
    let uniqueRooms = new Set();
    scheduleConfig.forEach(h => {
        (h.sesi || []).forEach(s => {
            uniqueSessions.add(s.nama);
            (s.ruangan || []).forEach(r => {
                uniqueRooms.add(r.nama);
            });
        });
    });
    uniqueSessions = Array.from(uniqueSessions);
    let allRoomsList = Array.from(uniqueRooms);

    selTgl.innerHTML = '<option value="">Semua Tanggal</option>' + uniqueDates.map(d => `<option value="${d}">${d}</option>`).join('') + '<option value="UNASSIGNED">-- Belum Diatur --</option>';
    selSesi.innerHTML = '<option value="">Semua Sesi</option>' + uniqueSessions.map(s => `<option value="${s}">${s}</option>`).join('') + '<option value="UNASSIGNED">-- Belum Diatur --</option>';
    
    let optRuang = '<option value="">Semua Ruangan</option>';
    allRoomsList.forEach(r => {
        optRuang += `<option value="${r}">${r}</option>`;
    });
    optRuang += '<option value="UNASSIGNED">-- Belum Diatur --</option>';
    selRuang.innerHTML = optRuang;

    selTgl.value = curTgl;
    selSesi.value = curSesi;
    selRuang.value = curRuang;
}

function renderPlottingTable() {
    const tbody = document.getElementById('plottingTableBody');
    
    const fTgl = document.getElementById('filterPlotTgl')?.value || "";
    const fSesi = document.getElementById('filterPlotSesi')?.value || "";
    const fRuang = document.getElementById('filterPlotRuang')?.value || "";

    let targetStudents = allPendaftar.filter(p => {
        if (!p.status_verifikasi && p.status_verifikasi !== false) return false;
        if (p.jalur === 'REGULER' && p.status_verifikasi === true) return true;
        if (p.jalur === 'PRESTASI' && p.status_verifikasi === false) return true;
        if (p.jalur === 'PRESTASI' && p.status_verifikasi === true && p.status_kelulusan === 'TIDAK DITERIMA') return true;
        return false;
    });
    
    if (fTgl) {
        if (fTgl === 'UNASSIGNED') targetStudents = targetStudents.filter(p => !p.tanggal_tes);
        else targetStudents = targetStudents.filter(p => p.tanggal_tes === fTgl);
    }
    if (fSesi) {
        if (fSesi === 'UNASSIGNED') targetStudents = targetStudents.filter(p => !p.sesi_tes);
        else targetStudents = targetStudents.filter(p => p.sesi_tes === fSesi);
    }
    if (fRuang) {
        if (fRuang === 'UNASSIGNED') targetStudents = targetStudents.filter(p => !p.ruang_tes);
        else targetStudents = targetStudents.filter(p => p.ruang_tes === fRuang);
    }

    const countSpan = document.getElementById('plotCount');
    if (countSpan) countSpan.innerText = targetStudents.length;

    tbody.innerHTML = '';
    if (targetStudents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;">Belum ada siswa Reguler murni / Tidak ada yang cocok dengan filter.</td></tr>';
        return;
    }

    let uniqueDates = scheduleConfig.map(h => h.tanggal);
    let uniqueSessions = new Set();
    let uniqueRooms = new Set();
    scheduleConfig.forEach(h => {
        (h.sesi || []).forEach(s => {
            uniqueSessions.add(s.nama);
            (s.ruangan || []).forEach(r => {
                uniqueRooms.add(r.nama);
            });
        });
    });
    uniqueSessions = Array.from(uniqueSessions);
    let allRoomsList = Array.from(uniqueRooms);

    const optDates = '<option value="">- Belum Diatur -</option>' + uniqueDates.map(d => `<option value="${d}">${d}</option>`).join('');
    const optSessions = '<option value="">- Belum Diatur -</option>' + uniqueSessions.map(s => `<option value="${s}">${s}</option>`).join('');
    
    let optRooms = '<option value="">- Belum Diatur -</option>';
    allRoomsList.forEach(r => {
        optRooms += `<option value="${r}">${r}</option>`;
    });

    targetStudents.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Peserta">
                <div style="font-weight:600; color:#1e293b;">${p.nama_lengkap}</div>
                <div style="font-size:0.8rem; color:#64748b;">${p.nisn} / ${p.no_pendaftaran}</div>
            </td>
            <td data-label="Tanggal Tes">
                <select class="input-modern-form" style="padding: 8px; font-size:0.85rem;" onchange="markPlottingChange('${p.id}', 'tanggal_tes', this.value)">
                    ${optDates}
                </select>
            </td>
            <td data-label="Sesi CBT">
                <select class="input-modern-form" style="padding: 8px; font-size:0.85rem;" onchange="markPlottingChange('${p.id}', 'sesi_tes', this.value)">
                    ${optSessions}
                </select>
            </td>
            <td data-label="Ruangan">
                <select class="input-modern-form" style="padding: 8px; font-size:0.85rem;" onchange="markPlottingChange('${p.id}', 'ruang_tes', this.value)">
                    ${optRooms}
                </select>
            </td>
        `;
        
        const selects = tr.querySelectorAll('select');
        if(p.tanggal_tes && selects[0]) selects[0].value = p.tanggal_tes;
        if(p.sesi_tes && selects[1]) selects[1].value = p.sesi_tes;
        if(p.ruang_tes && selects[2]) selects[2].value = p.ruang_tes;
        
        tbody.appendChild(tr);
    });
}

window.markPlottingChange = function(id, field, value) {
    if(!plottingChanges[id]) plottingChanges[id] = {};
    plottingChanges[id][field] = value;
    document.getElementById('btn-save-plotting').style.display = 'inline-flex';
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
// 9. DETAIL SISWA (SWEETALERT POPUP)
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
        const money = (v) => v ? 'Rp ' + parseInt(v).toLocaleString('id-ID') : '-';
        
        const isVerifTrue = p.status_verifikasi === true ? 'active' : '';
        const isVerifFalse = p.status_verifikasi === false ? 'active' : '';
        const isVerifNull = (p.status_verifikasi === null || p.status_verifikasi === undefined) ? 'active' : '';

        const isLulusTrue = p.status_kelulusan === 'DITERIMA' ? 'active' : '';
        const isLulusFalse = p.status_kelulusan === 'TIDAK DITERIMA' ? 'active' : '';
        const isLulusPending = (!p.status_kelulusan || p.status_kelulusan === 'PENDING') ? 'active' : '';

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
                                <div class="detail-item"><label>Tempat, Tanggal Lahir</label><b>${val(p.tempat_lahir)}, ${val(p.tanggal_lahir)}</b></div>
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
            { label: 'Surat Kelakuan Baik',  url: p.scan_skb_url,                  type: 'pdf' },
            { label: 'KTP Orang Tua',        url: p.scan_ktp_ortu_url,             type: 'pdf' },
            { label: 'Rapor',                url: p.scan_rapor_url,                type: 'pdf' },
            { label: 'Sertifikat Prestasi',  url: p.scan_sertifikat_prestasi_url,  type: 'pdf' },
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
                { label: 'Surat Kelakuan Baik',  url: p.scan_skb_url,                  type: 'pdf' },
                { label: 'KTP Orang Tua',        url: p.scan_ktp_ortu_url,             type: 'pdf' },
                { label: 'Rapor',                url: p.scan_rapor_url,                type: 'pdf' },
                { label: 'Sertifikat Prestasi',  url: p.scan_sertifikat_prestasi_url,  type: 'pdf' },
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
                p.scan_rapor_url, p.scan_sertifikat_prestasi_url
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
            "Waktu Daftar": p.created_at ? new Date(p.created_at).toLocaleString('id-ID') : "-",
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
    
    const tgl = new Date().toISOString().slice(0,10);
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
    processZipDownload(allPendaftar, `Berkas_ALL_PMB_MAN1Tasik_${new Date().toISOString().slice(0,10)}.zip`);
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
        const regChecked = config['JALUR_REGULER'] !== 'false';
        const presChecked = config['JALUR_PRESTASI'] !== 'false';

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
                    document.getElementById('t-link-wa').value
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
                { key: 'LINK_GRUP_WA', value: formValues[13] }
            ]});
            Swal.fire('Sukses', 'Pengaturan berhasil disimpan', 'success');
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
loadPendaftar();