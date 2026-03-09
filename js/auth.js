// js/auth.js

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
    const result = await apiPost('auth', {
      username: usernameInput,
      password: passwordInput,
    });

    if (result.error) {
      Swal.fire('Login Gagal', result.error, 'error');
      return;
    }

    if (result.role === 'ADMIN') {
      localStorage.setItem('session_role', 'ADMIN');
      localStorage.setItem('session_user', JSON.stringify(result.user));
      Swal.fire({
        icon: 'success', title: 'Login Admin Berhasil',
        timer: 1000, showConfirmButton: false
      }).then(() => { window.location.href = 'admin/index.html'; });

    } else if (result.role === 'SISWA') {
      localStorage.setItem('session_role', 'SISWA');
      localStorage.setItem('session_user', JSON.stringify(result.user));
      Swal.fire({
        icon: 'success', title: 'Login Berhasil',
        text: `Selamat datang, ${result.user.nama}!`,
        timer: 1500, showConfirmButton: false
      }).then(() => { window.location.href = 'siswa/index.html'; });
    }

  } catch (err) {
    console.error(err);
    Swal.fire('Error', 'Terjadi kesalahan sistem.', 'error');
  }
}

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
      window.location.href = '../login.html';
    }
  });
}