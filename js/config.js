// js/config.js
// Konfigurasi API — menggantikan Supabase client

// Base URL otomatis sesuai environment (local dev / production)
const API_BASE_URL = '';  // kosong = relative URL, otomatis ikut domain

// Helper: fetch ke API dengan method POST + JSON body
async function apiPost(endpoint, data, retries = 3) {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return await res.json();
    } catch (err) {
      lastError = err;
      if (err.name === 'TypeError' && err.message.toLowerCase().includes('fetch')) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Wait before retry
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

// Helper: fetch ke API dengan method GET + query params
async function apiGet(endpoint, params = {}, retries = 3) {
  const qs = new URLSearchParams(params).toString();
  const url = `${API_BASE_URL}/api/${endpoint}${qs ? '?' + qs : ''}`;
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      return await res.json();
    } catch (err) {
      lastError = err;
      if (err.name === 'TypeError' && err.message.toLowerCase().includes('fetch')) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

// Helper: upload file ke R2 via /api/upload
async function apiUpload(file, folder, docName, retries = 3) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', folder);
  formData.append('docName', docName);

  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        body: formData,
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Upload gagal.');
      return result.url; // return URL string
    } catch (err) {
      lastError = err;
      // If the error object has no response, it's likely a network error (Failed to fetch)
      if (err.name === 'TypeError' && err.message.toLowerCase().includes('fetch')) {
        await new Promise(resolve => setTimeout(resolve, 1500 * (i + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

console.log('API Config Ready 🚀');