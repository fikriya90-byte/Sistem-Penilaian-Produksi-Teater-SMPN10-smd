/**
 * SP-PPT — Router & Proteksi Halaman
 * Memastikan halaman hanya diakses oleh role yang berhak.
 */

import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Daftar peran yang boleh mengakses halaman tertentu (opsional)
export const PAGE_ACCESS = {
  "dashboard.html": ["siswa", "guru", "admin"],
  "nilai.html": ["siswa", "guru", "admin"],
  "jadwal.html": ["siswa", "guru", "admin"],
  "absensi.html": ["siswa", "guru", "admin"],
  "checklist.html": ["siswa", "guru", "admin"],
  "struktur.html": ["siswa", "guru", "admin"],
  "arsip.html": ["siswa", "guru", "admin"],
  "aduan.html": ["siswa", "guru", "admin"],
  "rapor.html": ["siswa", "guru", "admin"],
};

/**
 * Panggil di setiap halaman terlindungi.
 * @returns {Promise<{uid: string, profile: object}>}
 */
export function protectPage() {
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.replace("index.html");
        reject("Tidak login");
        return;
      }
      const snap = await getDoc(doc(db, "users", user.uid));
      if (!snap.exists()) {
        window.location.replace("index.html");
        reject("Profil tidak ditemukan");
        return;
      }
      const profile = snap.data();

      // Cek akses halaman
      const page = window.location.pathname.split("/").pop() || "dashboard.html";
      const allowed = PAGE_ACCESS[page] || ["siswa", "guru", "admin"];
      if (!allowed.includes(profile.role)) {
        alert("Akses ditolak untuk halaman ini.");
        window.location.replace("dashboard.html");
        reject("Akses ditolak");
        return;
      }

      resolve({ uid: user.uid, profile });
    });
  });
}

/** Navigasi programatik */
export function goto(page) {
  window.location.href = page;
}
