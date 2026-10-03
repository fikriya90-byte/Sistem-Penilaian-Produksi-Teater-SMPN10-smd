# SP-PPT — Sistem Penilaian & Manajemen Produksi Teater

SMP Negeri 10 Samarinda · Kelas IX · Seni Budaya & Teater

## Fitur Lengkap

### Fondasi
- Login multi-role (Siswa/Guru/Admin) dengan 20+ peran
- Dashboard dinamis per role
- PWA offline-ready, dark-mode-first
- Real-time sync via Firestore

### Penilaian
- 4 tahapan: Persiapan, Pelaksanaan, Pertunjukan, Pasca
- 3 penilai: Guru 50%, Ketua 30%, Rekan 20%
- Auto-normalisasi bobot
- Batch penilaian
- Revisi nilai dengan history
- Moderasi + deteksi anomali
- Rapor PDF dengan kop resmi + QR

### Manajemen Produksi
- Broadcast per peran + WA
- Notifikasi real-time 7 jenis
- Jadwal + Kalender + Master Schedule timeline
- Booking alat dengan deteksi bentrok + approval
- Absensi dengan aturan pembuat ketat + statistik + grid presensi
- Checklist dengan upload bukti, verifikasi, rating, kanban drag-drop
- Struktur kerabat kerja + share WA
- Arsip dokumen + informasi umum
- Aduan + WA follow-up + anonim

### Panel Peran Khusus
- **Sutradara**: Visi artistik, casting, catatan harian, penilaian pemain
- **Asisten**: Prompt book, catatan harian, standby cue live
- **Koordinator**: 6 divisi (Perlengkapan, Pubdok, Panggung, Rias, Busana, Musik)
- **Pemain**: Naskah digital, latihan dialog 10 langkah, rekam suara, refleksi

### Admin/Guru
- Export XLSX multi-sheet
- Import siswa dari Excel/CSV
- Backup/Restore JSON
- Kelola siswa, rubrik, periode
- Log sistem

### Pengaturan
- Tema: Terang/Gelap/Otomatis
- Warna aksen: 6 pilihan
- Mode Aksesibilitas (font besar, kontras tinggi)
- Mode Fokus
- Mode Hemat Data
- Bahasa: ID/EN/Jawa
- Install PWA

## Setup Firebase

1. Buka [Firebase Console](https://console.firebase.google.com/) project `penilaian-proyek-teater-siswa`
2. Aktifkan: Authentication (Email/Password), Firestore, Storage
3. Copy `firestore.rules` ke tab Rules Firestore, klik Publish
4. Buat composite index (jika diminta saat runtime):
   - `notifikasi`: penerimaUid, waktu (desc)
   - `bookingAlat`: alat, waktuMulai (desc)
   - `tugas`: autoPeran, tahapan

## Buat Akun Guru Pertama

1. Firebase Auth > Add User: `guru@sekolah.id` / password
2. Copy UID
3. Firestore > collection `users` > Add doc dengan ID = UID:
