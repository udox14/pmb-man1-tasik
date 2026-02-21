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
let scheduleConfig = {
    dates: ["Kamis, 21 Mei 2026", "Jumat, 22 Mei 2026", "Sabtu, 23 Mei 2026"],
    sessions: ["Sesi 1 (07.30 - 09.30 WIB)", "Sesi 2 (10.00 - 12.00 WIB)", "Sesi 3 (13.00 - 15.00 WIB)"],
    rooms: 4,
    capacity: 20
};
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
        const { data, error } = await db.from('pendaftar').select('*');
        if (error) throw error;
        
        allPendaftar = data;
        updateStats(data);
        renderTable(); 

        const { data: cfgData } = await db.from('pengaturan').select('*').eq('key', 'JADWAL_CONFIG').maybeSingle();
        if (cfgData && cfgData.value) {
            try { 
                scheduleConfig = JSON.parse(cfgData.value); 
            } catch(e) {
                console.warn('Gagal mem-parsing jadwal config');
            }
        } else {
            const localCfg = localStorage.getItem('JADWAL_CONFIG');
            if(localCfg) {
                scheduleConfig = JSON.parse(localCfg);
            }
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
        
        let matchVerif = true;
        if (filterVerif !== "") {
            matchVerif = String(p.status_verifikasi) === filterVerif;
        }
        
        let matchLulus = true;
        if (filterLulus !== "") {
            matchLulus = (p.status_kelulusan || 'PENDING') === filterLulus;
        }
        
        return matchSearch && matchVerif && matchLulus;
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

    const totalPages = Math.ceil(filteredData.length / rowsPerPage);
    if (currentPage > totalPages) currentPage = 1;
    if (currentPage < 1) currentPage = 1;
    
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + parseInt(rowsPerPage);
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
    
    if (totalPages <= 1) return;
    
    const prevBtn = document.createElement('button');
    prevBtn.className = 'page-btn'; 
    prevBtn.innerHTML = '<i class="ph ph-caret-left"></i>'; 
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => { 
        currentPage--; 
        renderTable(); 
    }; 
    container.appendChild(prevBtn);
    
    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button'); 
        btn.className = `page-btn ${i === currentPage ? 'active' : ''}`;
        btn.innerText = i; 
        btn.onclick = () => { 
            currentPage = i; 
            renderTable(); 
        }; 
        container.appendChild(btn);
    }
    
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
    }

    const confirm = await Swal.fire({ 
        title: 'Konfirmasi', 
        text: confirmText, 
        icon: 'warning', 
        showCancelButton: true, 
        confirmButtonText: 'Ya, Proses' 
    });

    if (confirm.isConfirmed) {
        Swal.showLoading();
        const { error } = await db.from('pendaftar').update(updateData).in('id', ids);
        
        if (!error) {
            selectedIds.clear(); 
            await loadPendaftar(); 
            Swal.fire('Berhasil', 'Data berhasil diperbarui', 'success');
            
            if(action === 'JADWAL') renderPlottingTable();
        } else { 
            Swal.fire('Gagal', error.message, 'error'); 
        }
    }
}

// ==========================================
// 8. LOGIKA PANEL MANAJEMEN JADWAL 
// ==========================================
function renderScheduleSettings() {
    document.getElementById('cfg-dates').value = scheduleConfig.dates.join('\n');
    document.getElementById('cfg-sessions').value = scheduleConfig.sessions.join('\n');
    document.getElementById('cfg-rooms').value = scheduleConfig.rooms;
    document.getElementById('cfg-capacity').value = scheduleConfig.capacity;
}

window.saveScheduleConfig = async function() {
    const datesStr = document.getElementById('cfg-dates').value.trim();
    const sessionsStr = document.getElementById('cfg-sessions').value.trim();
    
    const dates = datesStr.split('\n').map(d => d.trim()).filter(d => d);
    const sessions = sessionsStr.split('\n').map(s => s.trim()).filter(s => s);
    const rooms = parseInt(document.getElementById('cfg-rooms').value);
    const capacity = parseInt(document.getElementById('cfg-capacity').value);

    if (dates.length === 0 || sessions.length === 0 || !rooms || !capacity) {
        Swal.fire('Warning', 'Pastikan semua kolom pengaturan terisi dengan benar.', 'warning'); 
        return;
    }

    scheduleConfig = { dates, sessions, rooms, capacity };
    localStorage.setItem('JADWAL_CONFIG', JSON.stringify(scheduleConfig));
    
    try { 
        await db.from('pengaturan').upsert([{ key: 'JADWAL_CONFIG', value: JSON.stringify(scheduleConfig) }]); 
    } catch(e) { 
        console.warn('Gagal simpan ke database. Tersimpan di lokal.');
    }

    Swal.fire('Berhasil', 'Pengaturan master jadwal disimpan.', 'success');
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

    selTgl.innerHTML = '<option value="">Semua Tanggal</option>' + scheduleConfig.dates.map(d => `<option value="${d}">${d}</option>`).join('') + '<option value="UNASSIGNED">-- Belum Diatur --</option>';
    selSesi.innerHTML = '<option value="">Semua Sesi</option>' + scheduleConfig.sessions.map(s => `<option value="${s}">${s}</option>`).join('') + '<option value="UNASSIGNED">-- Belum Diatur --</option>';
    
    let optRuang = '<option value="">Semua Ruangan</option>';
    for(let r=1; r<=scheduleConfig.rooms; r++) {
        optRuang += `<option value="Ruang ${r}">Ruang ${r}</option>`;
    }
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

    // FILTER SAKTI: HANYA Murni Reguler (Yang sertifikatnya KOSONG / NULL)
    let targetStudents = allPendaftar.filter(p => 
        p.jalur === 'REGULER' && 
        p.status_verifikasi === true && 
        (!p.scan_sertifikat_prestasi_url || p.scan_sertifikat_prestasi_url === "")
    );
    
    if (fTgl) {
        if (fTgl === 'UNASSIGNED') {
            targetStudents = targetStudents.filter(p => !p.tanggal_tes);
        } else {
            targetStudents = targetStudents.filter(p => p.tanggal_tes === fTgl);
        }
    }
    if (fSesi) {
        if (fSesi === 'UNASSIGNED') {
            targetStudents = targetStudents.filter(p => !p.sesi_tes);
        } else {
            targetStudents = targetStudents.filter(p => p.sesi_tes === fSesi);
        }
    }
    if (fRuang) {
        if (fRuang === 'UNASSIGNED') {
            targetStudents = targetStudents.filter(p => !p.ruang_tes);
        } else {
            targetStudents = targetStudents.filter(p => p.ruang_tes === fRuang);
        }
    }

    const countSpan = document.getElementById('plotCount');
    if (countSpan) countSpan.innerText = targetStudents.length;

    tbody.innerHTML = '';
    if (targetStudents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;">Belum ada siswa Reguler murni / Tidak ada yang cocok dengan filter.</td></tr>';
        return;
    }

    const optDates = '<option value="">- Belum Diatur -</option>' + scheduleConfig.dates.map(d => `<option value="${d}">${d}</option>`).join('');
    const optSessions = '<option value="">- Belum Diatur -</option>' + scheduleConfig.sessions.map(s => `<option value="${s}">${s}</option>`).join('');
    
    let optRooms = '<option value="">- Belum Diatur -</option>';
    for(let r=1; r<=scheduleConfig.rooms; r++){
        optRooms += `<option value="Ruang ${r}">Ruang ${r}</option>`;
    }

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
        const promises = ids.map(id => db.from('pendaftar').update(plottingChanges[id]).eq('id', id));
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

    let unassigned = allPendaftar.filter(p => 
        p.jalur === 'REGULER' && 
        p.status_verifikasi === true && 
        !p.ruang_tes &&
        (!p.scan_sertifikat_prestasi_url || p.scan_sertifikat_prestasi_url === "")
    );

    if (unassigned.length === 0) {
        Swal.fire('Info', 'Semua siswa Reguler murni yang memenuhi syarat sudah memiliki jadwal.', 'info');
        return;
    }

    let slots = {};
    scheduleConfig.dates.forEach(d => {
        slots[d] = {};
        scheduleConfig.sessions.forEach(s => {
            slots[d][s] = {};
            for (let r = 1; r <= scheduleConfig.rooms; r++) { 
                slots[d][s][`Ruang ${r}`] = 0; 
            }
        });
    });

    let assigned = allPendaftar.filter(p => 
        p.jalur === 'REGULER' && 
        p.status_verifikasi === true && 
        p.ruang_tes &&
        (!p.scan_sertifikat_prestasi_url || p.scan_sertifikat_prestasi_url === "")
    );

    assigned.forEach(p => {
        if (slots[p.tanggal_tes] && slots[p.tanggal_tes][p.sesi_tes] && slots[p.tanggal_tes][p.sesi_tes][p.ruang_tes] !== undefined) {
            slots[p.tanggal_tes][p.sesi_tes][p.ruang_tes]++;
        }
    });

    let updates = [];
    for (let student of unassigned) {
        let assignedSlot = null;
        
        for (let d of scheduleConfig.dates) {
            if (assignedSlot) break;
            for (let s of scheduleConfig.sessions) {
                if (assignedSlot) break;
                for (let r = 1; r <= scheduleConfig.rooms; r++) {
                    let roomName = `Ruang ${r}`;
                    if (slots[d][s][roomName] < scheduleConfig.capacity) {
                        slots[d][s][roomName]++;
                        assignedSlot = { 
                            tanggal_tes: d, 
                            sesi_tes: s, 
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
            Swal.fire('Peringatan', 'Kapasitas Ruangan & Sesi sudah PENUH.', 'warning');
            break;
        }
    }

    if (updates.length > 0) {
        Swal.showLoading();
        try {
            const promises = updates.map(u => db.from('pendaftar').update({
                tanggal_tes: u.tanggal_tes, 
                sesi_tes: u.sesi_tes, 
                ruang_tes: u.ruang_tes
            }).eq('id', u.id));
            
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
        const { data: p, error } = await db.from('pendaftar').select('*').eq('id', id).single();
        if (error || !p) throw new Error('Data tidak ditemukan');

        editState = { 
            id: p.id, 
            status_verifikasi: p.status_verifikasi, 
            status_kelulusan: p.status_kelulusan || 'PENDING' 
        };

        let prestasiHtml = '';
        if (p.jalur === 'PRESTASI' || p.scan_sertifikat_prestasi_url) { 
            const { data: pres } = await db.from('prestasi').select('*').eq('pendaftar_id', id);
            if (pres && pres.length > 0) {
                prestasiHtml = `
                <div style="margin-top:20px; background:#f0fdfa; padding:15px; border-radius:8px; border:1px solid #ccfbf1;">
                    <div class="detail-section-title" style="margin-top:0;">🏅 Data Prestasi</div>
                    <ul style="padding-left:20px; margin:5px 0 0 0; font-size:0.9rem;">
                `;
                pres.forEach(x => {
                    prestasiHtml += `<li><b>${x.nama_lomba}</b> (${x.tingkat}) - ${x.tahun_perolehan}</li>`;
                });
                prestasiHtml += `</ul></div>`;
            }
        }

        const val = (v) => v ? v : '-';
        const money = (v) => v ? 'Rp ' + parseInt(v).toLocaleString('id-ID') : '-';
        
        const isVerifTrue = p.status_verifikasi === true ? 'active' : '';
        const isVerifFalse = p.status_verifikasi === false ? 'active' : '';
        const isVerifNull = (p.status_verifikasi === null || p.status_verifikasi === undefined) ? 'active' : '';

        const isLulusTrue = p.status_kelulusan === 'DITERIMA' ? 'active' : '';
        const isLulusFalse = p.status_kelulusan === 'TIDAK DITERIMA' ? 'active' : '';
        const isLulusPending = (!p.status_kelulusan || p.status_kelulusan === 'PENDING') ? 'active' : '';

        const isBebasTes = (p.jalur === 'REGULER' && p.scan_sertifikat_prestasi_url);

        Swal.fire({
            title: '', 
            width: '1000px', 
            padding: '0', 
            showConfirmButton: false, 
            showCloseButton: true,
            html: `
                <style>
                    .d-wrapper { display: grid; grid-template-columns: 300px 1fr; max-height: 85vh; overflow-y: auto; text-align: left; align-items: start; }
                    .d-left { background: #f8fafc; padding: 30px; border-right: 1px solid #e2e8f0; position: sticky; top: 0; z-index: 5; height: fit-content; }
                    .d-right { display: block; height: auto; overflow: visible; }
                    .d-header { padding: 20px 30px; border-bottom: 1px solid #e2e8f0; background: white; position: sticky; top: 0; z-index: 10; }
                    .d-body { padding: 30px; background: #fff; }
                    .file-btn { display: flex; align-items: center; gap: 10px; padding: 10px; border: 1px solid #e2e8f0; background: white; border-radius: 8px; text-decoration: none; color: #475569; font-weight: 600; font-size: 0.85rem; margin-bottom: 8px; transition: 0.2s; }
                    .file-btn:hover { border-color: var(--primary); color: var(--primary); background: #f0fdfa; }
                    .detail-title { font-size: 1rem; font-weight: 700; color: var(--primary); border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; margin: 25px 0 15px 0; }
                    .detail-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 15px; }
                    .detail-item label { display: block; font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; font-weight: 700; margin-bottom: 3px; }
                    .detail-item b { display: block; font-size: 0.95rem; color: #1e293b; }
                    .status-row { display: flex; gap: 15px; margin-top: 15px; flex-wrap: wrap; }
                    .status-box { display: flex; align-items: center; background: #f8fafc; padding: 4px; border-radius: 6px; border: 1px solid #e2e8f0; }
                    .status-label { font-size: 0.7rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin: 0 8px; }
                    .btn-act { border: none; padding: 6px 12px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; cursor: pointer; color: white; opacity: 0.4; transition: 0.2s; margin-left: 2px; }
                    .btn-act:hover { opacity: 0.7; }
                    .btn-act.active { opacity: 1; transform: scale(1.05); box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
                    .act-blue { background-color: #2563eb; } .act-green { background-color: #16a34a; } .act-red { background-color: #dc2626; }
                    
                    .sch-input { width: 100%; padding: 8px 12px; border: 1px solid #bfdbfe; border-radius: 6px; font-family: inherit; font-size: 0.9rem; color: #1e3a8a; background: white; outline: none; transition: 0.2s; }
                    .sch-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2); }

                    @media (max-width: 768px) {
                        .d-wrapper { display: block; height: auto; max-height: 85vh; overflow-y: auto; }
                        .d-left { position: static; width: 100%; border-right: none; border-bottom: 1px solid #e2e8f0; height: auto; }
                        .d-header { position: static; }
                    }
                </style>

                <div class="d-wrapper">
                    <!-- SIDEBAR DETAIL -->
                    <div class="d-left">
                        <img src="${p.foto_url || 'https://via.placeholder.com/300x400'}" style="width: 100%; aspect-ratio: 3/4; object-fit: cover; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; margin-bottom: 20px;">
                        <h5 style="color: #475569; margin-bottom: 10px; font-size: 0.85rem; font-weight: 700;">BERKAS LAMPIRAN</h5>
                        <a href="${p.scan_kk_url}" target="_blank" class="file-btn"><i class="ph ph-file-pdf"></i> Kartu Keluarga</a>
                        <a href="${p.scan_akta_url}" target="_blank" class="file-btn"><i class="ph ph-file-pdf"></i> Akta Lahir</a>
                        <a href="${p.scan_skb_url || '#'}" target="_blank" class="file-btn"><i class="ph ph-file-pdf"></i> SKB</a>
                        <a href="${p.scan_ktp_ortu_url}" target="_blank" class="file-btn"><i class="ph ph-file-pdf"></i> KTP Ortu</a>
                        <a href="${p.scan_rapor_url || '#'}" target="_blank" class="file-btn"><i class="ph ph-book-open-text"></i> Rapor</a>
                        ${p.scan_sertifikat_prestasi_url ? `<a href="${p.scan_sertifikat_prestasi_url}" target="_blank" class="file-btn" style="border-color: #fbbf24; background: #fffbeb;"><i class="ph ph-trophy" style="color: #d97706;"></i> Sertifikat</a>` : ''}
                    </div>

                    <!-- KONTEN KANAN -->
                    <div class="d-right">
                        <div class="d-header">
                            <h2 style="margin: 0; color: #1e293b; font-size: 1.5rem;">${p.nama_lengkap}</h2>
                            <div style="font-size: 0.9rem; color: #64748b; margin-top: 5px;">
                                ${p.nisn} • ${p.asal_sekolah} • <span style="font-weight:bold; color:var(--primary);">${p.jalur}</span>
                                ${isBebasTes ? `<span style="background:#fee2e2; color:#991b1b; padding:2px 6px; border-radius:4px; font-weight:bold; margin-left:5px;">(BEBAS CBT)</span>` : ''}
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
                                <button id="btn-save-changes" onclick="saveDetailChanges()" class="btn-act" style="background: #0f172a; opacity: 1; padding: 6px 20px; font-size: 0.8rem; margin-left: auto;">
                                    <i class="ph ph-floppy-disk"></i> SIMPAN
                                </button>
                            </div>
                        </div>

                        <div class="d-body">
                            
                            <!-- INFO JADWAL CBT -->
                            ${(p.jalur === 'REGULER' && !isBebasTes) ? `
                            <div class="detail-title" style="margin-top:0;">JADWAL TES CBT</div>
                            <div class="detail-grid" style="background:#eff6ff; padding:15px; border-radius:10px; border:1px solid #bfdbfe; margin-bottom: 20px;">
                                <div class="detail-item">
                                    <label style="color:#1e40af;">Tanggal Tes</label>
                                    <input type="text" id="input-tgl" class="sch-input" value="${p.tanggal_tes || ''}" oninput="triggerSaveAnim()">
                                </div>
                                <div class="detail-item">
                                    <label style="color:#1e40af;">Sesi / Waktu</label>
                                    <input type="text" id="input-sesi" class="sch-input" value="${p.sesi_tes || ''}" oninput="triggerSaveAnim()">
                                </div>
                                <div class="detail-item">
                                    <label style="color:#1e40af;">Ruang Ujian</label>
                                    <input type="text" id="input-ruang" class="sch-input" value="${p.ruang_tes || ''}" oninput="triggerSaveAnim()">
                                </div>
                            </div>
                            ` : ''}

                            <!-- DATA PRIBADI -->
                            <div class="detail-title" ${(p.jalur !== 'REGULER' || isBebasTes) ? 'style="margin-top:0;"' : ''}>DATA PRIBADI</div>
                            <div class="detail-grid">
                                <div class="detail-item"><label>NIK</label><b>${val(p.nik)}</b></div>
                                <div class="detail-item"><label>TTL</label><b>${val(p.tempat_lahir)}, ${val(p.tanggal_lahir)}</b></div>
                                <div class="detail-item"><label>JK</label><b>${val(p.jenis_kelamin)}</b></div>
                                <div class="detail-item"><label>Agama</label><b>${val(p.agama)}</b></div>
                                <div class="detail-item"><label>Anak Ke</label><b>${val(p.anak_ke)} dari ${val(p.jumlah_saudara)}</b></div>
                                <div class="detail-item"><label>Status Anak</label><b>${val(p.status_anak)}</b></div>
                                <div class="detail-item"><label>Ukuran Baju</label><b>${val(p.ukuran_baju)}</b></div>
                            </div>

                            <!-- ALAMAT -->
                            <div class="detail-title">ALAMAT DOMISILI</div>
                            <div class="detail-grid">
                                <div class="detail-item" style="grid-column: span 2;"><label>Alamat Lengkap</label><b>${val(p.alamat_lengkap)}</b></div>
                                <div class="detail-item"><label>RT / RW</label><b>${val(p.rt)} / ${val(p.rw)}</b></div>
                                <div class="detail-item"><label>Desa/Kelurahan</label><b>${val(p.desa_kelurahan)}</b></div>
                                <div class="detail-item"><label>Kecamatan</label><b>${val(p.kecamatan)}</b></div>
                                <div class="detail-item"><label>Kab/Kota</label><b>${val(p.kabupaten_kota)}</b></div>
                                <div class="detail-item"><label>Provinsi</label><b>${val(p.provinsi)}</b></div>
                                <div class="detail-item"><label>Kode Pos</label><b>${val(p.kode_pos)}</b></div>
                            </div>

                            <!-- DATA ORTU -->
                            <div class="detail-title">DATA KELUARGA</div>
                            <div style="background:#f8fafc; padding:15px; border-radius:10px; margin-bottom:15px;">
                                <h6 style="margin:0 0 10px 0; color:#64748b; font-size:0.8rem; border-bottom:1px solid #e2e8f0;">AYAH</h6>
                                <div class="detail-grid">
                                    <div class="detail-item"><label>Nama Ayah</label><b>${val(p.nama_ayah)}</b></div>
                                    <div class="detail-item"><label>NIK Ayah</label><b>${val(p.nik_ayah)}</b></div>
                                    <div class="detail-item"><label>Pekerjaan</label><b>${val(p.pekerjaan_ayah)}</b></div>
                                    <div class="detail-item"><label>Pendidikan</label><b>${val(p.pendidikan_ayah)}</b></div>
                                    <div class="detail-item"><label>Penghasilan</label><b>${money(p.penghasilan_ayah)}</b></div>
                                </div>
                            </div>
                            
                            <div style="background:#f8fafc; padding:15px; border-radius:10px;">
                                <h6 style="margin:0 0 10px 0; color:#64748b; font-size:0.8rem; border-bottom:1px solid #e2e8f0;">IBU</h6>
                                <div class="detail-grid">
                                    <div class="detail-item"><label>Nama Ibu</label><b>${val(p.nama_ibu)}</b></div>
                                    <div class="detail-item"><label>NIK Ibu</label><b>${val(p.nik_ibu)}</b></div>
                                    <div class="detail-item"><label>Pekerjaan</label><b>${val(p.pekerjaan_ibu)}</b></div>
                                    <div class="detail-item"><label>Pendidikan</label><b>${val(p.pendidikan_ibu)}</b></div>
                                    <div class="detail-item"><label>Penghasilan</label><b>${money(p.penghasilan_ibu)}</b></div>
                                </div>
                            </div>
                            
                            <div style="margin-top:15px;">
                                <label style="font-size:0.8rem; color:#64748b;">NO. HP ORTU:</label> 
                                <b style="color:var(--primary); font-size: 1.1rem;">${val(p.no_telepon_ortu)}</b>
                            </div>

                            <!-- DATA SEKOLAH -->
                            <div class="detail-title">SEKOLAH ASAL</div>
                            <div class="detail-grid">
                                <div class="detail-item"><label>Asal Sekolah</label><b>${val(p.asal_sekolah)}</b></div>
                                <div class="detail-item"><label>NPSN</label><b>${val(p.npsn_sekolah)}</b></div>
                                <div class="detail-item"><label>Status</label><b>${val(p.status_sekolah)}</b></div>
                                <div class="detail-item" style="grid-column: span 2;"><label>Alamat Sekolah</label><b>${val(p.alamat_sekolah)}</b></div>
                            </div>
                            
                            <!-- PESANTREN -->
                            <div style="margin-top:15px; background: #fffbeb; padding: 15px; border: 1px solid #fcd34d; border-radius: 8px;">
                                <label style="font-size:0.8rem; color:#b45309; font-weight: bold;">PILIHAN PESANTREN / TEMPAT TINGGAL:</label><br> 
                                <b style="color:#92400e; font-size: 1.1rem;">${val(p.pilihan_pesantren)}</b>
                            </div>

                            ${prestasiHtml}
                        </div>
                    </div>
                </div>
            `
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
    const toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true });
    toast.fire({ icon: 'info', title: 'Menyimpan...' });
    
    let payload = { 
        status_verifikasi: editState.status_verifikasi, 
        status_kelulusan: editState.status_kelulusan 
    };
    
    const elTgl = document.getElementById('input-tgl'); 
    const elSesi = document.getElementById('input-sesi'); 
    const elRuang = document.getElementById('input-ruang');
    
    if (elTgl && elSesi && elRuang) { 
        payload.tanggal_tes = elTgl.value; 
        payload.sesi_tes = elSesi.value; 
        payload.ruang_tes = elRuang.value; 
    }

    const { error } = await db.from('pendaftar').update(payload).eq('id', editState.id);
    
    if (!error) {
        const index = allPendaftar.findIndex(x => x.id === editState.id);
        if (index !== -1) { 
            allPendaftar[index].status_verifikasi = payload.status_verifikasi; 
            allPendaftar[index].status_kelulusan = payload.status_kelulusan; 
            
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
        
        const saveBtn = document.getElementById('btn-save-changes');
        if(saveBtn) { 
            saveBtn.innerHTML = '<i class="ph ph-check"></i> OK'; 
            saveBtn.style.background = '#0f172a'; 
            setTimeout(() => { 
                saveBtn.innerHTML = '<i class="ph ph-floppy-disk"></i> SIMPAN'; 
            }, 2000); 
        }
        toast.fire({ icon: 'success', title: 'Tersimpan' });
    } else { 
        toast.fire({ icon: 'error', title: 'Gagal: ' + error.message }); 
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
            ketUjian = "Ujian Offline (Cek Bukti Sertifikat)"; 
        } else if (p.jalur === 'REGULER') { 
            ketUjian = p.scan_sertifikat_prestasi_url ? "BEBAS TES CBT (Limpahan)" : "WAJIB TES CBT"; 
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
        if(p.scan_skb_url) { 
            const b = await urlToBlob(p.scan_skb_url); 
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
        const { data } = await db.from('pengaturan').select('*');
        const config = {};
        
        if (data) {
            data.forEach(item => {
                // Tangkap semua key yang mengandung kata TANGGAL_PENGUMUMAN
                if(item.key.includes('TANGGAL_PENGUMUMAN')) {
                    config[item.key] = item.value;
                } else {
                    config[item.key] = item.is_active;
                }
            });
        }

        const { value: formValues } = await Swal.fire({
            title: 'Pengaturan Sistem PPDB',
            html: `
                <div style="display:flex; flex-direction:column; gap:15px; text-align:left; padding:10px;">
                    <div style="background:#f8fafc; padding:15px; border-radius:10px; border:1px solid #eee; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <strong style="color:#00796b;">Jalur Reguler</strong><br>
                            <small>Tes Akademik & BTQ</small>
                        </div>
                        <input type="checkbox" id="check-reguler" ${config['JALUR_REGULER'] !== false ? 'checked' : ''} style="transform:scale(1.5);">
                    </div>
                    
                    <div style="background:#f8fafc; padding:15px; border-radius:10px; border:1px solid #eee; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <strong style="color:#991b1b;">Jalur Prestasi</strong><br>
                            <small>Non-Akademik</small>
                        </div>
                        <input type="checkbox" id="check-prestasi" ${config['JALUR_PRESTASI'] !== false ? 'checked' : ''} style="transform:scale(1.5);">
                    </div>
                    
                    <div style="margin-top:20px; border-top:1px dashed #ddd; padding-top:15px;">
                        <label style="display:block; font-weight:600; color:#1e293b; margin-bottom:5px;">📅 Pengumuman Prestasi</label>
                        <input type="datetime-local" id="tgl-pres" class="swal2-input" style="margin:0; width:100%; font-size:0.9rem;" value="${config['TANGGAL_PENGUMUMAN_PRESTASI'] || '2026-04-18T00:00'}">
                    </div>

                    <div style="margin-top:10px;">
                        <label style="display:block; font-weight:600; color:#1e293b; margin-bottom:5px;">📅 Pengumuman Reguler</label>
                        <input type="datetime-local" id="tgl-reg" class="swal2-input" style="margin:0; width:100%; font-size:0.9rem;" value="${config['TANGGAL_PENGUMUMAN_REGULER'] || '2026-05-25T00:00'}">
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
                    document.getElementById('tgl-reg').value
                ];
            }
        });

        if (formValues) {
            await db.from('pengaturan').upsert([
                { key: 'JALUR_REGULER', is_active: formValues[0] },
                { key: 'JALUR_PRESTASI', is_active: formValues[1] },
                { key: 'TANGGAL_PENGUMUMAN_PRESTASI', value: formValues[2] },
                { key: 'TANGGAL_PENGUMUMAN_REGULER', value: formValues[3] }
            ]);
            Swal.fire('Sukses', 'Pengaturan berhasil disimpan', 'success');
        }
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'Gagal memuat pengaturan', 'error');
    }
}

// ==========================================
// 12. INISIALISASI
// ==========================================
loadPendaftar();