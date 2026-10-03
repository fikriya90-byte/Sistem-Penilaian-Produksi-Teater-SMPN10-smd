# 🎭 SP-PPT — Sistem Penilaian & Manajemen Produksi Teater

**SMP Negeri 10 Samarinda — Kelas IX — Mata Pelajaran Seni Budaya & Teater**

PWA untuk mengelola produksi pementasan teater siswa dengan penilaian multi-penilai (Guru 50%, Ketua 30%, Rekan 20%).

---

## 📦 Fitur Utama

- ✅ Login multi-role (Siswa/Guru/Admin)
- ✅ Dashboard dinamis per peran (20+ peran)
- ✅ Nilai Saya + Radar Chart + Rapor PDF
- ✅ Form Penilaian slider 1-4 (Guru/Ketua/Koordinator)
- ✅ Jadwal & Kalender + Booking Alat
- ✅ Absensi dengan aturan ketat pembuat sesi
- ✅ Checklist Tugas + Kanban Board
- ✅ Struktur Kerabat Kerja + Kontak WA
- ✅ Arsip Dokumen + Informasi Umum
- ✅ Aduan + WA Follow-up
- ✅ PWA Offline-Ready
- ✅ Dark Mode First

---

## 🚀 Setup Firebase

1. Buka [Firebase Console](https://console.firebase.google.com/)
2. Pilih project: **penilaian-proyek-teater-siswa**
3. Aktifkan:
   - **Authentication** → Sign-in method → **Email/Password** → Enable
   - **Firestore Database** → Create database → Start in **production mode**
   - **Storage** → Get started
4. Salin `firestore.rules` ke tab **Rules** di Firestore, klik **Publish**.

### Konfigurasi Firebase (sudah ada di `firebase-init.js`)
```js
const firebaseConfig = {
  apiKey: "AIzaSyDczk0n-4QvvwTDikDBnuTkRX_SlXIV9JQ",
  authDomain: "penilaian-proyek-teater-siswa.firebaseapp.com",
  projectId: "penilaian-proyek-teater-siswa",
  storageBucket: "penilaian-proyek-teater-siswa.firebasestorage.app",
  messagingSenderId: "278312873930",
  appId: "1:278312873930:web:0de00becefffd9e4a2e933"
};
