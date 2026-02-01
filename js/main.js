// js/main.js

let selectedJalur = 'REGULER'; 
let currentSlideIndex = 0;

function selectTab(jalur) {
    if (document.getElementById(`tab-${jalur.toLowerCase()}`).classList.contains('disabled')) return;
    selectedJalur = jalur;
    document.querySelectorAll('.jalur-tab').forEach(el => el.classList.remove('active'));
    if (jalur === 'REGULER') {
        document.getElementById('tab-reguler').classList.add('active');
    } else {
        document.getElementById('tab-prestasi').classList.add('active');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // Check Jalur Status
    await checkJalurStatus();

    // Fix UI Help
    const helpList = document.querySelector('.help-list');
    if (helpList) {
        helpList.style.maxHeight = 'none';
        helpList.style.overflowY = 'visible';
    }

    const styleFix = document.createElement('style');
    styleFix.innerHTML = `
        .contact-info { display: flex; flex-direction: column; justify-content: center; line-height: 1.2; }
        .contact-name { font-weight: 800; font-size: 0.9rem; color: #1e293b; display: block; }
        .contact-role { font-size: 0.75rem; color: #64748b; display: block; margin-top: 2px; }
    `;
    document.head.appendChild(styleFix);
});

// LOGIKA SLIDESHOW MANUAL & LAZY LOAD
function moveSlide(n) {
    const slides = document.querySelectorAll('.slide');
    if (slides.length === 0) return;

    slides[currentSlideIndex].classList.remove('active');

    currentSlideIndex += n;
    if (currentSlideIndex >= slides.length) currentSlideIndex = 0;
    if (currentSlideIndex < 0) currentSlideIndex = slides.length - 1;

    const targetSlide = slides[currentSlideIndex];
    if (targetSlide.hasAttribute('data-src')) {
        targetSlide.src = targetSlide.getAttribute('data-src');
        targetSlide.removeAttribute('data-src');
    }

    targetSlide.classList.add('active');
}

async function checkJalurStatus() {
    try {
        const { data, error } = await db.from('pengaturan').select('*');
        if (error || !data) return;

        let regOpen = true;
        let presOpen = true;

        data.forEach(item => {
            if (item.key === 'JALUR_REGULER') regOpen = item.is_active;
            if (item.key === 'JALUR_PRESTASI') presOpen = item.is_active;
        });

        const tabReg = document.getElementById('tab-reguler');
        const tabPres = document.getElementById('tab-prestasi');

        tabReg.classList.remove('disabled');
        tabPres.classList.remove('disabled');
        // REVISI: Teks tidak diubah, hanya status disabled/enabled yang main

        if (!regOpen) {
            tabReg.classList.add('disabled');
            if (selectedJalur === 'REGULER') selectTab('PRESTASI');
        }

        if (!presOpen) {
            tabPres.classList.add('disabled');
            if (selectedJalur === 'PRESTASI' && regOpen) selectTab('REGULER');
        }
        
        if (!regOpen && !presOpen) {
            const btnDaftar = document.querySelector('.compact-action button');
            const inputNisn = document.querySelector('#input-nisn');
            if (btnDaftar) {
                btnDaftar.disabled = true;
                btnDaftar.innerText = "Pendaftaran Ditutup";
                btnDaftar.style.backgroundColor = '#9ca3af';
                btnDaftar.style.borderColor = '#9ca3af';
                btnDaftar.style.boxShadow = 'none';
            }
            if (inputNisn) inputNisn.disabled = true;
        }

    } catch (e) {
        console.error("Gagal cek jalur", e);
    }
}

async function cekNisnDanDaftar() {
    const nisnInput = document.getElementById('input-nisn').value.trim();

    if (!nisnInput || nisnInput.length !== 10) {
        Swal.fire('NISN Tidak Valid', 'NISN wajib 10 digit angka.', 'error');
        return;
    }

    Swal.fire({
        title: 'Sedang Mengecek...',
        text: 'Mohon tunggu sebentar',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    try {
        const settingKey = selectedJalur === 'REGULER' ? 'JALUR_REGULER' : 'JALUR_PRESTASI';
        const { data: setting } = await db.from('pengaturan').select('is_active').eq('key', settingKey).maybeSingle();

        if (setting && setting.is_active === false) {
            Swal.fire({
                icon: 'warning',
                title: 'Pendaftaran Ditutup',
                text: `Mohon maaf, Pendaftaran ${selectedJalur} saat ini sedang ditutup.`,
                confirmButtonText: 'Oke'
            });
            return; 
        }

        const { data, error } = await db
            .from('pendaftar')
            .select('nisn, nama_lengkap')
            .eq('nisn', nisnInput)
            .maybeSingle();

        if (error) throw error;

        if (data) {
            Swal.fire({
                icon: 'info',
                title: 'Sudah Terdaftar!',
                text: `NISN ${nisnInput} atas nama ${data.nama_lengkap} sudah terdaftar.`,
                showCancelButton: true,
                confirmButtonText: 'Login Sekarang',
                cancelButtonText: 'Tutup'
            }).then((result) => {
                if (result.isConfirmed) {
                    window.location.href = 'login.html';
                }
            });
        } else {
            localStorage.setItem('pmb_jalur', selectedJalur);
            localStorage.setItem('pmb_nisn', nisnInput);
            
            Swal.fire({
                icon: 'success',
                title: 'Jalur Tersedia',
                text: 'Mengarahkan ke formulir...',
                timer: 1000,
                showConfirmButton: false
            }).then(() => {
                window.location.href = `pendaftaran.html?nisn=${nisnInput}&jalur=${selectedJalur}`;
            });
        }

    } catch (err) {
        console.error('Error:', err);
        Swal.fire('Terjadi Kesalahan', 'Gagal terhubung ke server.', 'error');
    }
}

function toggleHelp() {
    const popup = document.getElementById('helpPopup');
    const btn = document.getElementById('helpBtn');
    const icon = btn.querySelector('i');
    const textSpan = btn.querySelector('span');
    
    popup.classList.toggle('active');
    btn.classList.toggle('opened');
    
    if (popup.classList.contains('active')) {
        icon.classList.replace('ph-chat-teardrop-text', 'ph-x');
        if(textSpan) textSpan.style.display = 'none';
    } else {
        icon.classList.replace('ph-x', 'ph-chat-teardrop-text');
        if(textSpan) textSpan.style.display = 'inline';
    }
}