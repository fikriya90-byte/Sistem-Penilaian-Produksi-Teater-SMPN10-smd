/**
 * SP-PPT — Modul Jadwal & Kalender
 */

import { auth, db } from "./firebase-init.js";
import {
  doc, getDoc, addDoc, collection, query, where, getDocs, orderBy,
  serverTimestamp, onSnapshot, deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { protectPage } from "./router.js";
import { showToast, openModal, closeModal, skeleton, formatTanggal, esc, warnaPeran, inisial, logActivity, formatWaktu } from "./utils.js";

let ME = null;
let BULAN_INI = new Date();
let SEMUA_JADWAL = [];

const WARNA_JENIS = {
  Rapat: "bg-blue-500",
  Latihan: "bg-orange-500",
  Gladi: "bg-red-500",
  Pementasan: "bg-yellow-500",
  Evaluasi: "bg-purple-500",
  Produksi: "bg-green-500",
  Fitting: "bg-pink-500",
  Briefing: "bg-cyan-500",
};

const BULAN = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

/* =========================================================
 * KALENDER
 * ========================================================= */
function renderKalender() {
  const y = BULAN_INI.getFullYear();
  const m = BULAN_INI.getMonth();
  document.getElementById("kalender-judul").textContent = `${BULAN[m]} ${y}`;

  const first = new Date(y, m, 1);
  const lastDay = new Date(y, m + 1, 0).getDate();
  let startDow = first.getDay() - 1; if (startDow < 0) startDow = 6; // Senin = 0

  const grid = document.getElementById("kalender-grid");
  grid.innerHTML = "";
  for (let i = 0; i < startDow; i++) grid.innerHTML += `<div></div>`;

  for (let d = 1; d <= lastDay; d++) {
    const tglStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dayJadwal = SEMUA_JADWAL.filter((j) => j.tanggal === tglStr);
    const dots = dayJadwal.slice(0, 3).map((j) => `<span class="w-1.5 h-1.5 rounded-full ${WARNA_JENIS[j.jenis] || "bg-gray-500"}"></span>`).join("");
    const today = new Date().toDateString() === new Date(y, m, d).toDateString();
    grid.innerHTML += `
      <button data-tgl="${tglStr}" class="kalender-cell aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 text-xs transition ${today ? "bg-primary text-on-primary font-bold" : "hover:bg-surface-container"}">
        ${d}
        <div class="flex gap-0.5">${dots}</div>
      </button>`;
  }

  grid.querySelectorAll(".kalender-cell").forEach((b) =>
    b.addEventListener("click", () => {
      const tgl = b.dataset.tgl;
      const list = SEMUA_JADWAL.filter((j) => j.tanggal === tgl);
      if (!list.length) { showToast("Tidak ada jadwal di tanggal ini.", "info"); return; }
      alert(list.map((j) => `• ${j.judul} (${j.jamMulai}-${j.jamSelesai}) @ ${j.lokasi}`).join("\n"));
    })
  );
}

/* =========================================================
 * LIST JADWAL
 * ========================================================= */
function renderListJadwal() {
  const list = document.getElementById("jadwal-list");
  const upcoming = SEMUA_JADWAL
    .filter((j) => j.tanggal >= new Date().toISOString().slice(0, 10))
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal))
    .slice(0, 10);

  if (!upcoming.length) {
    list.innerHTML = `<p class="text-sm text-on-surface-variant text-center py-8">Belum ada jadwal</p>`;
    return;
  }

  list.innerHTML = upcoming.map((j) => `
    <div class="p-3 rounded-xl bg-surface-container flex items-center gap-3 border-l-4 ${WARNA_JENIS[j.jenis]?.replace("bg-", "border-") || "border-gray-500"}">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <p class="text-sm font-medium truncate">${esc(j.judul)}</p>
          <span class="text-[10px] px-2 py-0.5 rounded-full bg-surface-container-high">${esc(j.jenis)}</span>
        </div>
        <p class="text-xs text-on-surface-variant mt-1">📅 ${formatTanggal(j.tanggal)} · ${j.jamMulai}-${j.jamSelesai} · 📍 ${esc(j.lokasi)}</p>
      </div>
      <button class="btn-hadir px-2 py-1 rounded text-[10px] bg-primary-container text-primary font-medium" data-id="${j.id}">Hadir</button>
    </div>`).join("");

  list.querySelectorAll(".btn-hadir").forEach((b) =>
    b.addEventListener("click", async () => {
      b.textContent = "✓ Hadir"; b.classList.add("bg-green-600", "text-white");
      showToast("Konfirmasi kehadiran tersimpan", "success");
    })
  );
}

/* =========================================================
 * BOOKING ALAT
 * ========================================================= */
async function renderBooking() {
  const list = document.getElementById("booking-list");
  try {
    const snap = await getDocs(query(collection(db, "bookingAlat"), orderBy("waktuMulai", "desc")));
    if (snap.empty) { list.innerHTML = `<p class="text-sm text-on-surface-variant text-center py-6">Belum ada booking</p>`; return; }
    list.innerHTML = snap.docs.slice(0, 5).map((d) => {
      const b = d.data();
      const badge = b.status === "Approved" ? "bg-green-600" : b.status === "Rejected" ? "bg-error" : "bg-yellow-500";
      return `<div class="p-3 rounded-xl bg-surface-container flex items-center justify-between">
        <div><p class="text-sm font-medium">${esc(b.alat)}</p><p class="text-xs text-on-surface-variant">${esc(b.waktuMulai)} → ${esc(b.waktuSelesai)}</p></div>
        <span class="text-[10px] px-2 py-1 rounded-full ${badge} text-white">${esc(b.status || "Pending")}</span>
      </div>`;
    }).join("");
  } catch (e) {
    list.innerHTML = `<p class="text-sm text-on-surface-variant text-center py-6">Belum ada booking</p>`;
  }
}

/* =========================================================
 * HAK BUAT JADWAL
 * ========================================================= */
function bolehBuatJadwal() {
  const p = ME.profile.peran, r = ME.profile.role;
  return r === "guru" || r === "admin" ||
    ["Pimpinan Produksi", "Sekretaris", "Sutradara", "Asisten Sutradara"].includes(p) ||
    p.startsWith("Koordinator");
}

/* =========================================================
 * INIT
 * ========================================================= */
(async function init() {
  const { uid, profile } = await protectPage();
  ME = { uid, profile };

  // Sidebar & header
  const menu = [
    { icon: "dashboard", label: "Dashboard", href: "dashboard.html" },
    { icon: "grade", label: "Nilai", href: "nilai.html" },
    { icon: "calendar_month", label: "Jadwal", href: "jadwal.html" },
    { icon: "fact_check", label: "Absensi", href: "absensi.html" },
    { icon: "checklist", label: "Checklist", href: "checklist.html" },
    { icon: "groups", label: "Struktur", href: "struktur.html" },
    { icon: "folder", label: "Arsip", href: "arsip.html" },
    { icon: "support_agent", label: "Aduan", href: "aduan.html" },
    { icon: "description", label: "Rapor", href: "rapor.html" },
  ];
  document.getElementById("sidebar-nav").innerHTML = menu.map((m) => `
    <a href="${m.href}" class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition text-sm ${m.href === "jadwal.html" ? "bg-primary-container text-primary font-medium" : "text-on-surface-variant hover:bg-surface-container"}">
      <span class="material-symbols-outlined text-xl">${m.icon}</span>${m.label}
    </a>`).join("");

  document.getElementById("header-avatar").textContent = inisial(profile.nama);
  const badge = document.getElementById("badge-role");
  badge.className = `hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${warnaPeran(profile.peran)}`;
  badge.textContent = profile.peran;

  // Bottom nav
  document.getElementById("bottom-nav").innerHTML = [
    { icon: "dashboard", label: "Home", href: "dashboard.html" },
    { icon: "grade", label: "Nilai", href: "nilai.html" },
    { icon: "calendar_month", label: "Jadwal", href: "jadwal.html" },
    { icon: "checklist", label: "Tugas", href: "checklist.html" },
    { icon: "groups", label: "Kerabat", href: "struktur.html" },
  ].map((i) => `<a href="${i.href}" class="flex flex-col items-center justify-center py-2 text-[10px] gap-0.5 ${i.href === "jadwal.html" ? "text-primary" : "text-on-surface-variant"}"><span class="material-symbols-outlined text-xl">${i.icon}</span>${i.label}</a>`).join("");

  // Theme & logout
  const html = document.documentElement;
  const saved = localStorage.getItem("theme");
  if (saved === "light") html.classList.remove("dark");
  const btnT = document.getElementById("btn-theme"), iconT = document.getElementById("theme-icon");
  const setIcon = () => (iconT.textContent = html.classList.contains("dark") ? "light_mode" : "dark_mode");
  setIcon();
  btnT.addEventListener("click", () => { html.classList.toggle("dark"); localStorage.setItem("theme", html.classList.contains("dark") ? "dark" : "light"); setIcon(); });
  document.getElementById("btn-logout").addEventListener("click", async () => { if (confirm("Keluar?")) { await logActivity(ME.uid, "logout"); await signOut(auth); window.location.replace("index.html"); } });
  document.getElementById("btn-menu").addEventListener("click", () => { const sb = document.getElementById("sidebar"); sb.classList.toggle("hidden"); sb.classList.toggle("flex"); });

  // Load data
  const load = async () => {
    const snap = await getDocs(query(collection(db, "jadwal"), orderBy("tanggal", "asc")));
    SEMUA_JADWAL = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderKalender();
    renderListJadwal();
  };
  await load();
  await renderBooking();

  // Kalender nav
  document.getElementById("prev-month").addEventListener("click", () => { BULAN_INI.setMonth(BULAN_INI.getMonth() - 1); renderKalender(); });
  document.getElementById("next-month").addEventListener("click", () => { BULAN_INI.setMonth(BULAN_INI.getMonth() + 1); renderKalender(); });

  // Tampilkan tombol tambah jika berhak
  if (bolehBuatJadwal()) {
    const btn = document.getElementById("btn-tambah-jadwal");
    btn.classList.remove("hidden");
    btn.addEventListener("click", () => openModal("modal-jadwal"));
  }

  // Form submit
  document.getElementById("form-jadwal").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, "jadwal"), {
        judul: document.getElementById("j-judul").value.trim(),
        jenis: document.getElementById("j-jenis").value,
        tanggal: document.getElementById("j-tanggal").value,
        jamMulai: document.getElementById("j-mulai").value,
        jamSelesai: document.getElementById("j-selesai").value,
        lokasi: document.getElementById("j-lokasi").value.trim(),
        cakupan: document.getElementById("j-cakupan").value,
        picUid: ME.uid,
        createdBy: ME.uid,
        createdAt: serverTimestamp(),
      });
      await logActivity(ME.uid, "buat_jadwal");
      showToast("Jadwal ditambahkan!", "success");
      closeModal("modal-jadwal");
      e.target.reset();
      await load();
    } catch (err) { showToast("Gagal tambah jadwal.", "error"); }
  });

  // Booking
  document.getElementById("btn-booking").addEventListener("click", async () => {
    const alat = prompt("Nama alat (Speaker/Mic/Properti/dll):");
    if (!alat) return;
    try {
      await addDoc(collection(db, "bookingAlat"), {
        alat, waktuMulai: new Date().toISOString(), waktuSelesai: "", pemohonUid: ME.uid, status: "Pending",
      });
      showToast("Booking diajukan!", "success");
      await renderBooking();
    } catch (e) { showToast("Gagal booking.", "error"); }
  });
})();
