// js/config.js

// 1. Masukkan URL dan Key dari Dashboard Supabase Anda di sini
const SUPABASE_URL = 'https://tdlbdwqqahxuwbfljtxj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkbGJkd3FxYWh4dXdiZmxqdHhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3NDIwMjYsImV4cCI6MjA4NTMxODAyNn0.nLyayF1Ge_KDYZBHjMA7j2F_Ko55yDsznDacve6NJNg';

// 2. Inisialisasi Client (Global Variable)
// Pastikan script Supabase CDN sudah dimuat di index.html sebelum file ini
if (typeof supabase === 'undefined') {
    console.error('Supabase client library belum dimuat!');
} else {
    var db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('Supabase Ready to Rock 🚀');
}