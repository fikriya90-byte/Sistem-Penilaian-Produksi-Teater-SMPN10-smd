/**
 * SP-PPT — Firebase Initialization (Tanpa Firebase Auth)
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { initializeFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDczk0n-4QvvwTDikDBnuTkRX_SlXIV9JQ",
  authDomain: "penilaian-proyek-teater-siswa.firebaseapp.com",
  projectId: "penilaian-proyek-teater-siswa",
  storageBucket: "penilaian-proyek-teater-siswa.firebasestorage.app",
  messagingSenderId: "278312873930",
  appId: "1:278312873930:web:0de00becefffd9e4a2e933",
};

export const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {});

// Stub auth — supaya file lain yang masih import { auth } tidak crash
export const auth = {
  currentUser: null,
  signOut: () => Promise.resolve(),
};

export const PERAN_LIST = [
  "Pimpinan Produksi", "Sekretaris", "Bendahara",
  "Sutradara", "Asisten Sutradara",
  "Koordinator Perlengkapan", "Koordinator Publikasi & Dokumentasi",
  "Koordinator Tata Panggung", "Koordinator Tata Rias",
  "Koordinator Tata Busana", "Koordinator Tata Musik & Suara",
  "Anggota Perlengkapan", "Anggota Publikasi & Dokumentasi",
  "Anggota Tata Panggung", "Anggota Tata Rias",
  "Anggota Tata Busana", "Anggota Tata Musik & Suara",
  "Pemain", "Guru Pembina", "Admin",
];

export const PERAN_DIVISI = {
  "Pimpinan Produksi": "Pengurus Inti",
  Sekretaris: "Pengurus Inti",
  Bendahara: "Pengurus Inti",
  Sutradara: "Artistik",
  "Asisten Sutradara": "Artistik",
  "Koordinator Perlengkapan": "Perlengkapan",
  "Anggota Perlengkapan": "Perlengkapan",
  "Koordinator Publikasi & Dokumentasi": "Publikasi & Dokumentasi",
  "Anggota Publikasi & Dokumentasi": "Publikasi & Dokumentasi",
  "Koordinator Tata Panggung": "Tata Panggung",
  "Anggota Tata Panggung": "Tata Panggung",
  "Koordinator Tata Rias": "Tata Rias",
  "Anggota Tata Rias": "Tata Rias",
  "Koordinator Tata Busana": "Tata Busana",
  "Anggota Tata Busana": "Tata Busana",
  "Koordinator Tata Musik & Suara": "Tata Musik & Suara",
  "Anggota Tata Musik & Suara": "Tata Musik & Suara",
  Pemain: "Pemeran",
  "Guru Pembina": "Guru",
  Admin: "Admin",
};
