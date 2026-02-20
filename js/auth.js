// js/auth.js

// Fungsi Login
async function handleLogin() {
    const usernameInput = document.getElementById('username').value.trim();
    const passwordInput = document.getElementById('password').value.trim();

    if (!usernameInput || !passwordInput) {
        Swal.fire('Gagal', 'Mohon isi Username dan Password.', 'warning');
        return;
    }

    Swal.fire({
        title: 'Memproses...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        // 1. Cek Login ADMIN (Hardcoded sederhana untuk keamanan dasar client-side)
        if (usernameInput === 'admin' && passwordInput === 'admin123') {
            localStorage.setItem('session_role', 'ADMIN');
            localStorage.setItem('session_user', JSON.stringify({ name: 'Administrator' }));
            
            Swal.fire({
                icon: 'success',
                title: 'Login Admin Berhasil',
                timer: 1000,
                showConfirmButton: false
            }).then(() => {
                window.location.href = 'admin/index.html';
            });
            return;
        }

        // 2. Cek Login SISWA (Database)
        const { data, error } = await db
            .from('pendaftar')
            .select('*')
            .eq('nisn', usernameInput)
            .single();

        if (error || !data) {
            Swal.fire('Login Gagal', 'NISN tidak ditemukan.', 'error');
            return;
        }

        // LOGIKA BARU: Verifikasi Password menggunakan Tanggal Lahir (DDMMYYYY)
        // Format di Database: YYYY-MM-DD (Contoh: 2008-12-22)
        const dbDate = data.tanggal_lahir; 
        const parts = dbDate.split('-'); // [2008, 12, 22]
        // Gabung jadi 22122008
        const correctPassword = parts[2] + parts[1] + parts[0];

        if (passwordInput === correctPassword) {
            // Login Sukses
            localStorage.setItem('session_role', 'SISWA');
            localStorage.setItem('session_user', JSON.stringify({ 
                id: data.id, 
                nama: data.nama_lengkap,
                nisn: data.nisn 
            }));

            Swal.fire({
                icon: 'success',
                title: 'Login Berhasil',
                text: `Selamat datang, ${data.nama_lengkap}!`,
                timer: 1500,
                showConfirmButton: false
            }).then(() => {
                window.location.href = 'siswa/index.html';
            });
        } else {
            Swal.fire('Password Salah', 'Gunakan Tanggal Lahir (Format: DDMMYYYY) sebagai password.', 'error');
        }

    } catch (err) {
        console.error(err);
        Swal.fire('Error', 'Terjadi kesalahan sistem.', 'error');
    }
}

// Fungsi Logout
function logout() {
    Swal.fire({
        title: 'Keluar?',
        text: "Anda akan keluar dari sesi ini.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Ya, Keluar',
        cancelButtonColor: '#d33'
    }).then((result) => {
        if (result.isConfirmed) {
            localStorage.clear();
            window.location.href = '../login.html'; // Sesuaikan path jika perlu
        }
    });
}