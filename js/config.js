// js/config.js
// Konfigurasi API — menggantikan Supabase client

// Base URL otomatis sesuai environment (local dev / production)
const API_BASE_URL = '';  // kosong = relative URL, otomatis ikut domain

// Helper: fetch ke API dengan method POST + JSON body
async function apiPost(endpoint, data) {
  const res = await fetch(`${API_BASE_URL}/api/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

// Helper: fetch ke API dengan method GET + query params
async function apiGet(endpoint, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${API_BASE_URL}/api/${endpoint}${qs ? '?' + qs : ''}`;
  const res = await fetch(url);
  return res.json();
}

// Helper: upload file ke R2 via /api/upload
async function apiUpload(file, folder, docName) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', folder);
  formData.append('docName', docName);

  const res = await fetch(`${API_BASE_URL}/api/upload`, {
    method: 'POST',
    body: formData,
  });

  const result = await res.json();
  if (!res.ok) throw new Error(result.error || 'Upload gagal.');
  return result.url; // return URL string
}

console.log('API Config Ready 🚀');