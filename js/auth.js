// js/auth.js

async function handleLogin() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!username || !password) {
        Swal.fire('Error', 'Username dan Password wajib diisi', 'error');
        return;
    }

    Swal.fire({
        title: 'Sedang Login...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        // 1. CEK ADMIN DULU
        // Kita cek apakah username ada di tabel 'admins'
        const { data: adminData, error: adminError } = await db
            .from('admins')
            .select('*')
            .eq('username', username)
            .eq('password', password) // Catatan: Di real app password harus di-hash!
            .maybeSingle();

        if (adminData) {
            // LOGIN SUKSES SEBAGAI ADMIN
            localStorage.setItem('session_role', 'ADMIN');
            localStorage.setItem('session_user', JSON.stringify(adminData));
            
            Swal.fire({
                icon: 'success',
                title: 'Login Admin Berhasil',
                showConfirmButton: false,
                timer: 1500
            }).then(() => {
                window.location.href = 'admin/index.html'; // Kita buat nanti
            });
            return;
        }

        // 2. JIKA BUKAN ADMIN, CEK SISWA (PENDAFTAR)
        // Username = NISN, Password = No. Pendaftaran
        const { data: siswaData, error: siswaError } = await db
            .from('pendaftar')
            .select('*')
            .eq('nisn', username)
            .eq('no_pendaftaran', password)
            .maybeSingle();

        if (siswaData) {
            // LOGIN SUKSES SEBAGAI SISWA
            localStorage.setItem('session_role', 'SISWA');
            localStorage.setItem('session_user', JSON.stringify(siswaData));
            
            Swal.fire({
                icon: 'success',
                title: 'Login Berhasil',
                text: `Selamat datang, ${siswaData.nama_lengkap}`,
                showConfirmButton: false,
                timer: 1500
            }).then(() => {
                window.location.href = 'siswa/index.html'; // Kita buat nanti
            });
            return;
        }

        // 3. JIKA GAGAL KEDUANYA
        Swal.fire('Login Gagal', 'Username atau Password salah.', 'error');

    } catch (err) {
        console.error(err);
        Swal.fire('Error', 'Terjadi kesalahan sistem.', 'error');
    }
}

// Fungsi Logout (Bisa dipanggil dari dashboard nanti)
function logout() {
    Swal.fire({
        title: 'Keluar?',
        text: "Anda akan mengakhiri sesi.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Ya, Keluar'
    }).then((result) => {
        if (result.isConfirmed) {
            localStorage.clear();
            window.location.href = '../index.html'; // Naik satu folder karena dashboard ada di subfolder
        }
    });
}