// js/admin.js

// 1. Cek Sesi Admin
const sessionRole = localStorage.getItem('session_role');
if (sessionRole !== 'ADMIN') {
    alert('Akses Ditolak!');
    window.location.href = '../login.html';
}

// Global State
let allPendaftar = [];
let currentPage = 1;
let rowsPerPage = 10;
let selectedIds = new Set(); 
let editState = {}; 
let currentSort = { column: 'created_at', direction: 'desc' };

// 2. Sidebar Toggle
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const main = document.getElementById('mainContent');
    sidebar.classList.toggle('collapsed');
    main.classList.toggle('expanded');
    if (window.innerWidth <= 768) { sidebar.classList.toggle('mobile-open'); }
}

// 3. Load Data Utama
async function loadPendaftar() {
    try {
        const { data, error } = await db
            .from('pendaftar')
            .select('*');

        if (error) throw error;

        allPendaftar = data;
        updateStats(data);
        renderTable(); 

    } catch (err) {
        console.error('Error load admin:', err);
        Swal.fire('Error', 'Gagal memuat data pendaftar', 'error');
    }
}

// 4. Update Statistik
function updateStats(data) {
    document.getElementById('count-total').innerText = data.length;
    document.getElementById('count-pending').innerText = data.filter(p => p.status_verifikasi === null).length;
    document.getElementById('count-lulus').innerText = data.filter(p => p.status_kelulusan === 'DITERIMA').length;
}

// 5. Render Tabel
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
            const statusStr = String(p.status_verifikasi); 
            matchVerif = statusStr === filterVerif;
        }
        
        let matchLulus = true;
        if (filterLulus !== "") matchLulus = (p.status_kelulusan || 'PENDING') === filterLulus;
        
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
        if (p.status_verifikasi === true) badgeVerif = '<span class="badge-modern badge-green">Terverifikasi</span>';
        else if (p.status_verifikasi === false) badgeVerif = '<span class="badge-modern badge-red">Ditolak</span>';
            
        let badgeLulus = '<span class="badge-modern badge-blue">Menunggu</span>';
        if (p.status_kelulusan === 'DITERIMA') badgeLulus = '<span class="badge-modern badge-green">DITERIMA</span>';
        if (p.status_kelulusan === 'TIDAK DITERIMA') badgeLulus = '<span class="badge-modern badge-red">TIDAK LULUS</span>';

        const isChecked = selectedIds.has(p.id) ? 'checked' : '';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="checkbox" class="row-checkbox" value="${p.id}" onclick="toggleRow('${p.id}')" ${isChecked}></td>
            <td>
                <div class="student-cell">
                    <img src="${photoSrc}" class="student-thumb" onerror="this.src='https://via.placeholder.com/40'">
                    <div>
                        <div style="font-weight:600; color:#1e293b;">${p.nama_lengkap}</div>
                        <div style="font-size:0.8rem; color:#64748b;">${p.no_pendaftaran}</div>
                    </div>
                </div>
            </td>
            <td><span class="badge-modern ${p.jalur === 'PRESTASI' ? 'badge-blue' : 'badge-green'}" style="font-size:0.7rem;">${p.jalur}</span></td>
            <td style="font-size:0.9rem;">${p.asal_sekolah}</td>
            <td>${badgeVerif}</td>
            <td>${badgeLulus}</td>
            <td style="text-align: right;">
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

// 6. Pagination UI
function renderPagination(totalPages) {
    const container = document.getElementById('pagination');
    container.innerHTML = '';
    if (totalPages <= 1) return;
    const prevBtn = document.createElement('button');
    prevBtn.className = 'page-btn';
    prevBtn.innerHTML = '<i class="ph ph-caret-left"></i>';
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => { currentPage--; renderTable(); };
    container.appendChild(prevBtn);
    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button');
        btn.className = `page-btn ${i === currentPage ? 'active' : ''}`;
        btn.innerText = i;
        btn.onclick = () => { currentPage = i; renderTable(); };
        container.appendChild(btn);
    }
    const nextBtn = document.createElement('button');
    nextBtn.className = 'page-btn';
    nextBtn.innerHTML = '<i class="ph ph-caret-right"></i>';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => { currentPage++; renderTable(); };
    container.appendChild(nextBtn);
}

// 7. Handlers
window.filterTable = function() { currentPage = 1; renderTable(); }
window.changeLimit = function() { rowsPerPage = parseInt(document.getElementById('rowsPerPage').value); currentPage = 1; renderTable(); }
window.sortTable = function(column) {
    if (currentSort.column === column) currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    else { currentSort.column = column; currentSort.direction = 'asc'; }
    renderTable();
}

// 8. Bulk Actions
window.toggleRow = function(id) {
    if (selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id);
    updateBulkUI();
}
window.toggleSelectAll = function() {
    const mainCheck = document.getElementById('selectAll');
    const checkboxes = document.querySelectorAll('.row-checkbox');
    checkboxes.forEach(cb => {
        const id = cb.value;
        if (mainCheck.checked) selectedIds.add(id); else selectedIds.delete(id);
        cb.checked = mainCheck.checked; 
    });
    updateBulkUI();
}
function updateBulkUI() {
    const bar = document.getElementById('bulkActions');
    const countSpan = document.getElementById('selectedCount');
    if (selectedIds.size > 0) { bar.classList.add('show'); countSpan.innerText = selectedIds.size; } 
    else { bar.classList.remove('show'); document.getElementById('selectAll').checked = false; }
}

window.bulkAction = async function(action) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    let updateData = {};
    let confirmText = '';
    if (action === 'VERIFY') { updateData = { status_verifikasi: true }; confirmText = `Verifikasi ${ids.length} siswa terpilih?`; } 
    else if (action === 'GRADUATE') {
        const { value: status } = await Swal.fire({ title: 'Tentukan Status Kelulusan', input: 'select', inputOptions: { 'DITERIMA': 'DITERIMA', 'TIDAK DITERIMA': 'TIDAK DITERIMA' }, showCancelButton: true });
        if (!status) return;
        updateData = { status_kelulusan: status };
        confirmText = `Ubah status menjadi ${status} untuk ${ids.length} siswa?`;
    }
    const confirm = await Swal.fire({ title: 'Konfirmasi', text: confirmText, icon: 'warning', showCancelButton: true, confirmButtonText: 'Ya, Proses' });
    if (confirm.isConfirmed) {
        Swal.showLoading();
        const { error } = await db.from('pendaftar').update(updateData).in('id', ids);
        if (!error) {
            selectedIds.clear(); await loadPendaftar(); Swal.fire('Berhasil', 'Data berhasil diperbarui', 'success');
        } else { Swal.fire('Gagal', error.message, 'error'); }
    }
}

// 10. Detail Siswa (FIXED STICKY SIDEBAR LAYOUT)
window.viewDetail = async function(id) {
    Swal.fire({ title: 'Memuat Data...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const { data: p, error } = await db.from('pendaftar').select('*').eq('id', id).single();
        if (error || !p) throw new Error('Data tidak ditemukan');

        editState = { id: p.id, status_verifikasi: p.status_verifikasi, status_kelulusan: p.status_kelulusan || 'PENDING' };

        let prestasiHtml = '';
        if (p.jalur === 'PRESTASI') {
            const { data: pres } = await db.from('prestasi').select('*').eq('pendaftar_id', id);
            if (pres && pres.length > 0) {
                prestasiHtml = '<div style="margin-top:20px; background:#f0fdfa; padding:15px; border-radius:8px; border:1px solid #ccfbf1;"><div class="detail-section-title" style="margin-top:0;">🏅 Data Prestasi</div><ul style="padding-left:20px; margin:5px 0 0 0; font-size:0.9rem;">';
                pres.forEach(x => prestasiHtml += `<li><b>${x.nama_lomba}</b> (${x.tingkat}) - ${x.tahun_perolehan}</li>`);
                prestasiHtml += '</ul></div>';
            }
        }

        const val = (v) => v ? v : '-';
        const money = (v) => v ? 'Rp ' + parseInt(v).toLocaleString('id-ID') : '-';
        
        // Helper Class Active
        const isVerifTrue = p.status_verifikasi === true ? 'active' : '';
        const isVerifFalse = p.status_verifikasi === false ? 'active' : '';
        const isVerifNull = (p.status_verifikasi === null || p.status_verifikasi === undefined) ? 'active' : '';

        const isLulusTrue = p.status_kelulusan === 'DITERIMA' ? 'active' : '';
        const isLulusFalse = p.status_kelulusan === 'TIDAK DITERIMA' ? 'active' : '';
        const isLulusPending = (!p.status_kelulusan || p.status_kelulusan === 'PENDING') ? 'active' : '';

        Swal.fire({
            title: '', width: '1000px', padding: '0', showConfirmButton: false, showCloseButton: true,
            html: `
                <style>
                    /* Layout Reset & Sticky Logic */
                    .d-wrapper { 
                        display: grid; 
                        grid-template-columns: 300px 1fr; 
                        max-height: 85vh; 
                        overflow-y: auto; /* Scroll utama di sini */
                        text-align: left; 
                        align-items: start; /* Penting agar sticky jalan */
                    }
                    .d-left { 
                        background: #f8fafc; 
                        padding: 30px; 
                        border-right: 1px solid #e2e8f0; 
                        position: sticky; /* Bikin Sidebar Sticky */
                        top: 0; 
                        z-index: 5;
                        height: fit-content; /* Biar tidak stretch, jadi bisa sticky */
                    }
                    .d-right { 
                        display: block; 
                        height: auto; 
                        overflow: visible; 
                    }
                    .d-header { 
                        padding: 20px 30px; 
                        border-bottom: 1px solid #e2e8f0; 
                        background: white; 
                        position: sticky; /* Header Kanan juga Sticky */
                        top: 0; 
                        z-index: 10; 
                    }
                    .d-body { 
                        padding: 30px; 
                        background: #fff;
                    }
                    
                    /* Components */
                    .file-btn { display: flex; align-items: center; gap: 10px; padding: 10px; border: 1px solid #e2e8f0; background: white; border-radius: 8px; text-decoration: none; color: #475569; font-weight: 600; font-size: 0.85rem; margin-bottom: 8px; transition: 0.2s; }
                    .file-btn:hover { border-color: var(--primary); color: var(--primary); background: #f0fdfa; }
                    
                    .detail-title { font-size: 1rem; font-weight: 700; color: var(--primary); border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; margin: 25px 0 15px 0; }
                    .detail-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 15px; }
                    .detail-item label { display: block; font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; font-weight: 700; margin-bottom: 3px; }
                    .detail-item b { display: block; font-size: 0.95rem; color: #1e293b; }
                    
                    /* Actions Area */
                    .status-row { display: flex; gap: 15px; margin-top: 15px; flex-wrap: wrap; }
                    .status-box { display: flex; align-items: center; background: #f8fafc; padding: 4px; border-radius: 6px; border: 1px solid #e2e8f0; }
                    .status-label { font-size: 0.7rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin: 0 8px; }
                    
                    .btn-act { border: none; padding: 6px 12px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; cursor: pointer; color: white; opacity: 0.4; transition: 0.2s; margin-left: 2px; }
                    .btn-act:hover { opacity: 0.7; }
                    .btn-act.active { opacity: 1; transform: scale(1.05); box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
                    .act-blue { background-color: #2563eb; } 
                    .act-green { background-color: #16a34a; } 
                    .act-red { background-color: #dc2626; }
                    
                    /* Mobile */
                    @media (max-width: 768px) {
                        .d-wrapper { display: block; height: auto; max-height: 85vh; overflow-y: auto; }
                        .d-left { position: static; width: 100%; border-right: none; border-bottom: 1px solid #e2e8f0; height: auto; }
                        .d-header { position: static; }
                    }
                    @keyframes pulse-soft { 0% { transform: scale(1); } 50% { transform: scale(1.05); } 100% { transform: scale(1); } }
                    .pulse-animation { animation: pulse-soft 1s infinite; border: 1px solid white; }
                </style>

                <div class="d-wrapper">
                    <!-- SIDEBAR KIRI (STICKY) -->
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
                        <!-- Header (Sticky juga) -->
                        <div class="d-header">
                            <h2 style="margin: 0; color: #1e293b; font-size: 1.5rem;">${p.nama_lengkap}</h2>
                            <div style="font-size: 0.9rem; color: #64748b; margin-top: 5px;">
                                ${p.nisn} • ${p.asal_sekolah} • <span style="font-weight:bold; color:var(--primary);">${p.jalur}</span>
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
                                <button id="btn-save-changes" onclick="saveDetailChanges()" class="btn-act" 
                                        style="background: #0f172a; opacity: 1; padding: 6px 20px; font-size: 0.8rem; margin-left: auto;">
                                    <i class="ph ph-floppy-disk"></i> SIMPAN
                                </button>
                            </div>
                        </div>

                        <!-- Body (Scrollable Content) -->
                        <div class="d-body">
                            <div class="detail-title" style="margin-top: 0;">👤 Data Pribadi</div>
                            <div class="detail-grid">
                                <div class="detail-item"><label>NIK</label><b>${val(p.nik)}</b></div>
                                <div class="detail-item"><label>TTL</label><b>${val(p.tempat_lahir)}, ${val(p.tanggal_lahir)}</b></div>
                                <div class="detail-item"><label>JK</label><b>${val(p.jenis_kelamin)}</b></div>
                                <div class="detail-item"><label>Agama</label><b>${val(p.agama)}</b></div>
                                <div class="detail-item"><label>Anak Ke</label><b>${val(p.anak_ke)} dari ${val(p.jumlah_saudara)}</b></div>
                                <div class="detail-item"><label>Status</label><b>${val(p.status_anak)}</b></div>
                                <div class="detail-item"><label>Baju</label><b>${val(p.ukuran_baju)}</b></div>
                            </div>

                            <div class="detail-title">🏠 Alamat Domisili</div>
                            <div class="detail-grid">
                                <div class="detail-item" style="grid-column: span 2;"><label>Alamat</label><b>${val(p.alamat_lengkap)}</b></div>
                                <div class="detail-item"><label>RT/RW</label><b>${val(p.rt)} / ${val(p.rw)}</b></div>
                                <div class="detail-item"><label>Desa</label><b>${val(p.desa_kelurahan)}</b></div>
                                <div class="detail-item"><label>Kecamatan</label><b>${val(p.kecamatan)}</b></div>
                                <div class="detail-item"><label>Kab/Kota</label><b>${val(p.kabupaten_kota)}</b></div>
                                <div class="detail-item"><label>Provinsi</label><b>${val(p.provinsi)}</b></div>
                            </div>

                            <div class="detail-title">DATA ORANG TUA</div>
                            <div style="background:#f8fafc; padding:15px; border-radius:10px; margin-bottom:15px;">
                                <h6 style="margin:0 0 10px 0; color:#64748b; font-size:0.8rem; border-bottom:1px solid #e2e8f0;">AYAH</h6>
                                <div class="detail-grid">
                                    <div class="detail-item"><label>Nama</label><b>${val(p.nama_ayah)}</b></div>
                                    <div class="detail-item"><label>NIK</label><b>${val(p.nik_ayah)}</b></div>
                                    <div class="detail-item"><label>Pekerjaan</label><b>${val(p.pekerjaan_ayah)}</b></div>
                                    <div class="detail-item"><label>Pend.</label><b>${val(p.pendidikan_ayah)}</b></div>
                                    <div class="detail-item"><label>Gaji</label><b>${money(p.penghasilan_ayah)}</b></div>
                                </div>
                            </div>
                            <div style="background:#f8fafc; padding:15px; border-radius:10px;">
                                <h6 style="margin:0 0 10px 0; color:#64748b; font-size:0.8rem; border-bottom:1px solid #e2e8f0;">IBU</h6>
                                <div class="detail-grid">
                                    <div class="detail-item"><label>Nama</label><b>${val(p.nama_ibu)}</b></div>
                                    <div class="detail-item"><label>NIK</label><b>${val(p.nik_ibu)}</b></div>
                                    <div class="detail-item"><label>Pekerjaan</label><b>${val(p.pekerjaan_ibu)}</b></div>
                                    <div class="detail-item"><label>Pend.</label><b>${val(p.pendidikan_ibu)}</b></div>
                                    <div class="detail-item"><label>Gaji</label><b>${money(p.penghasilan_ibu)}</b></div>
                                </div>
                            </div>
                            <div style="margin-top:15px;"><label style="font-size:0.8rem; color:#64748b;">NO. HP ORTU:</label> <b style="color:var(--primary);">${val(p.no_telepon_ortu)}</b></div>

                            <div class="detail-title">SEKOLAH ASAL</div>
                            <div class="detail-grid">
                                <div class="detail-item"><label>Sekolah</label><b>${val(p.asal_sekolah)}</b></div>
                                <div class="detail-item"><label>NPSN</label><b>${val(p.npsn_sekolah)}</b></div>
                                <div class="detail-item"><label>Status</label><b>${val(p.status_sekolah)}</b></div>
                                <div class="detail-item" style="grid-column: span 2;"><label>Alamat</label><b>${val(p.alamat_sekolah)}</b></div>
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
    if (type === 'verif') editState.status_verifikasi = value;
    if (type === 'lulus') editState.status_kelulusan = value;
    
    // Update tampilan tombol aktif
    const parent = btn.parentElement;
    const siblings = parent.querySelectorAll('.btn-act');
    siblings.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // Animasi tombol simpan
    const saveBtn = document.getElementById('btn-save-changes');
    if(saveBtn) {
        saveBtn.innerHTML = '<i class="ph ph-floppy-disk"></i> SIMPAN *';
        saveBtn.style.background = '#e11d48'; // Merah biar notice
    }
}

window.saveDetailChanges = async function() {
    const toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true });
    toast.fire({ icon: 'info', title: 'Menyimpan...' });
    
    const { error } = await db.from('pendaftar')
        .update({ 
            status_verifikasi: editState.status_verifikasi, 
            status_kelulusan: editState.status_kelulusan 
        })
        .eq('id', editState.id);
        
    if (!error) {
        // Update data lokal
        const index = allPendaftar.findIndex(x => x.id === editState.id);
        if (index !== -1) { 
            allPendaftar[index].status_verifikasi = editState.status_verifikasi; 
            allPendaftar[index].status_kelulusan = editState.status_kelulusan; 
        }
        updateStats(allPendaftar);
        renderTable(); 
        
        const saveBtn = document.getElementById('btn-save-changes');
        if(saveBtn) {
            saveBtn.innerHTML = '<i class="ph ph-check"></i> OK';
            saveBtn.style.background = '#0f172a';
            setTimeout(() => { saveBtn.innerHTML = '<i class="ph ph-floppy-disk"></i> SIMPAN'; }, 2000);
        }
        toast.fire({ icon: 'success', title: 'Tersimpan' });
    } else {
        toast.fire({ icon: 'error', title: 'Gagal: ' + error.message });
    }
}

// ... (KODE ATUR JALUR & LOAD PENDAFTAR TETAP SAMA) ...
window.aturJalur = async function() {
    try {
        const { data } = await db.from('pengaturan').select('*');
        const config = {};
        if (data) data.forEach(item => {
            if(item.key === 'TANGGAL_PENGUMUMAN') config[item.key] = item.value;
            else config[item.key] = item.is_active;
        });

        const { value: formValues } = await Swal.fire({
            title: 'Pengaturan Sistem PPDB',
            html: `
                <div style="display:flex; flex-direction:column; gap:15px; text-align:left; padding:10px;">
                    <div style="background:#f8fafc; padding:15px; border-radius:10px; border:1px solid #eee; display:flex; justify-content:space-between; align-items:center;">
                        <div><strong style="color:#00796b;">Jalur Reguler</strong><br><small>Tes Akademik & BTQ</small></div>
                        <input type="checkbox" id="check-reguler" ${config['JALUR_REGULER'] ? 'checked' : ''} style="transform:scale(1.5);">
                    </div>
                    <div style="background:#f8fafc; padding:15px; border-radius:10px; border:1px solid #eee; display:flex; justify-content:space-between; align-items:center;">
                        <div><strong style="color:#991b1b;">Jalur Prestasi</strong><br><small>Non-Akademik</small></div>
                        <input type="checkbox" id="check-prestasi" ${config['JALUR_PRESTASI'] ? 'checked' : ''} style="transform:scale(1.5);">
                    </div>
                    <div style="margin-top:20px; border-top:1px dashed #ddd; padding-top:15px;">
                        <label style="display:block; font-weight:600; color:#1e293b; margin-bottom:5px;">📅 Tanggal Pengumuman Kelulusan</label>
                        <input type="datetime-local" id="tgl-pengumuman" class="swal2-input" style="margin:0; width:100%;" value="${config['TANGGAL_PENGUMUMAN'] || ''}">
                    </div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'Simpan Perubahan',
            preConfirm: () => [
                document.getElementById('check-reguler').checked,
                document.getElementById('check-prestasi').checked,
                document.getElementById('tgl-pengumuman').value
            ]
        });

        if (formValues) {
            await db.from('pengaturan').upsert([
                { key: 'JALUR_REGULER', is_active: formValues[0] },
                { key: 'JALUR_PRESTASI', is_active: formValues[1] },
                { key: 'TANGGAL_PENGUMUMAN', value: formValues[2] }
            ]);
            Swal.fire('Sukses', 'Pengaturan berhasil disimpan', 'success');
        }
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'Gagal memuat pengaturan', 'error');
    }
}

loadPendaftar();