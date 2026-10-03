/**
 * SP-PPT — Dashboard Dinamis per Role
 * Menyesuaikan tampilan berdasarkan peran user yang login.
 */

import { auth, db, PERAN_DIVISI } from "./firebase-init.js";
import {
  doc, getDoc, collection, query, where, getDocs, orderBy, limit,
  onSnapshot, updateDoc, serverTimestamp, addDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { protectPage } from "./router.js";
import {
  showToast, openModal, closeModal, skeleton, formatTanggal, formatWaktu,
  waktuRelatif, countdown, predikat, warnaPeran, inisial, logActivity, esc,
} from "./utils.js";

/* =========================================================
 * STATE
 * ========================================================= */
let ME = null; // { uid, profile }

/* =========================================================
 * MENU SIDEBAR per ROLE
 * ========================================================= */
const MENU_BASE = [
  { icon: "dashboard", label: "Dashboard", href: "dashboard.html" },
  { icon: "grade", label: "Nilai Saya", href: "nilai.html" },
  { icon: "calendar_month", label: "Jadwal", href: "jadwal.html" },
  { icon: "fact_check", label: "Absensi", href: "absensi.html" },
  { icon: "checklist", label: "Checklist Tugas", href: "checklist.html" },
  { icon: "campaign", label: "Broadcast", href: "broadcast.html" },
  { icon: "groups", label: "Struktur Kerabat", href: "struktur.html" },
  { icon: "folder", label: "Arsip Dokumen", href: "arsip.html" },
  { icon: "support_agent", label: "Aduan & Bantuan", href: "aduan.html" },
  { icon: "description", label: "Rapor PDF", href: "rapor.html" },
];

const MENU_GURU = [
  { icon: "dashboard", label: "Dashboard", href: "dashboard.html" },
  { icon: "school", label: "Kelola Kelas", href: "dashboard.html#kelas" },
  { icon: "grading", label: "Penilaian", href: "nilai.html" },
  { icon: "analytics", label: "Rekap Nilai", href: "nilai.html#rekap" },
  { icon: "shield", label: "Moderasi", href: "nilai.html#moderasi" },
  { icon: "calendar_month", label: "Jadwal", href: "jadwal.html" },
  { icon: "fact_check", label: "Absensi", href: "absensi.html" },
  { icon: "campaign", label: "Broadcast", href: "broadcast.html" },
  { icon: "groups", label: "Struktur", href: "struktur.html" },
  { icon: "folder", label: "Arsip", href: "arsip.html" },
  { icon: "description", label: "Rapor PDF", href: "rapor.html" },
];

/* =========================================================
 * RENDER MENU
 * ========================================================= */
function renderSidebar(role) {
  const menu = role === "siswa" ? MENU_BASE : MENU_GURU;
  const nav = document.getElementById("sidebar-nav");
  const currentPage = window.location.pathname.split("/").pop() || "dashboard.html";

  nav.innerHTML = menu
    .map(
      (m) => `
      <a href="${m.href}" class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition text-sm ${
        m.href.split("#")[0] === currentPage
          ? "bg-primary-container text-primary font-medium"
          : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
      }">
        <span class="material-symbols-outlined text-xl">${m.icon}</span>
        ${m.label}
      </a>`
    )
    .join("");
}

function renderBottomNav(role) {
  const items =
    role === "siswa"
      ? [
          { icon: "dashboard", label: "Home", href: "dashboard.html" },
          { icon: "grade", label: "Nilai", href: "nilai.html" },
          { icon: "calendar_month", label: "Jadwal", href: "jadwal.html" },
          { icon: "checklist", label: "Tugas", href: "checklist.html" },
          { icon: "groups", label: "Kerabat", href: "struktur.html" },
        ]
      : [
          { icon: "dashboard", label: "Home", href: "dashboard.html" },
          { icon: "grading", label: "Nilai", href: "nilai.html" },
          { icon: "fact_check", label: "Absen", href: "absensi.html" },
          { icon: "groups", label: "Struktur", href: "struktur.html" },
          { icon: "folder", label: "Arsip", href: "arsip.html" },
        ];

  const page = window.location.pathname.split("/").pop() || "dashboard.html";
  document.getElementById("bottom-nav").innerHTML = items
    .map(
      (i) => `
      <a href="${i.href}" class="flex flex-col items-center justify-center py-2 text-[10px] gap-0.5 ${
        i.href === page ? "text-primary" : "text-on-surface-variant"
      }">
        <span class="material-symbols-outlined text-xl">${i.icon}</span>
        ${i.label}
      </a>`
    )
    .join("");
}

/* =========================================================
 * RENDER HEADER
 * ========================================================= */
function renderHeader(profile) {
  document.getElementById("header-avatar").textContent = inisial(profile.nama);
  const badge = document.getElementById("badge-role");
  badge.className = `hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${warnaPeran(profile.peran)}`;
  badge.innerHTML = `<span class="material-symbols-outlined text-sm">badge</span>${esc(profile.peran)}`;
}

/* =========================================================
 * KARTU UMUM
 * ========================================================= */
function cardProfil(profile) {
  return `
  <div class="glass rounded-2xl p-5 flex items-center gap-4">
    <div class="w-16 h-16 rounded-full bg-primary-container text-primary flex items-center justify-center text-xl font-bold border border-outline-variant/40">
      ${inisial(profile.nama)}
    </div>
    <div class="flex-1 min-w-0">
      <h3 class="font-headline font-semibold text-lg truncate">${esc(profile.nama)}</h3>
      <div class="flex flex-wrap gap-1.5 mt-1">
        <span class="px-2 py-0.5 rounded-full text-[10px] border ${warnaPeran(profile.peran)}">${esc(profile.peran)}</span>
        <span class="px-2 py-0.5 rounded-full text-[10px] bg-surface-container-high border border-outline-variant">${esc(profile.divisi || "-")}</span>
        <span class="px-2 py-0.5 rounded-full text-[10px] bg-surface-container-high border border-outline-variant">${esc(profile.kelas || "-")}</span>
      </div>
    </div>
  </div>`;
}

function cardQuickActions(profile) {
  const actions = [
    { icon: "grade", label: "Nilai Saya", href: "nilai.html", roles: "all" },
    { icon: "calendar_month", label: "Jadwal", href: "jadwal.html", roles: "all" },
    { icon: "fact_check", label: "Absensi", href: "absensi.html", roles: "all" },
    { icon: "checklist", label: "Tugas", href: "checklist.html", roles: "all" },
    { icon: "groups", label: "Kerabat", href: "struktur.html", roles: "all" },
    { icon: "description", label: "Rapor PDF", href: "rapor.html", roles: "all" },
  ];
  return `
  <div class="glass rounded-2xl p-5">
    <h3 class="font-headline font-semibold mb-3 flex items-center gap-2">
      <span class="material-symbols-outlined text-primary">bolt</span> Aksi Cepat
    </h3>
    <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">
      ${actions
        .map(
          (a) => `
        <a href="${a.href}" class="flex flex-col items-center justify-center gap-1 p-3 rounded-xl bg-surface-container hover:bg-surface-container-high transition group">
          <span class="material-symbols-outlined text-primary group-hover:scale-110 transition">${a.icon}</span>
          <span class="text-[10px] text-center">${a.label}</span>
        </a>`
        )
        .join("")}
    </div>
  </div>`;
}
function cardBroadcastCepat(profile) {
  const boleh = profile.role === "guru" || profile.role === "admin" ||
    ["Pimpinan Produksi", "Sekretaris", "Sutradara", "Asisten Sutradara", "Bendahara"].includes(profile.peran) ||
    profile.peran.startsWith("Koordinator");

  if (!boleh) return "";

  return `
  <div class="glass rounded-2xl p-5 border-l-4 border-secondary">
    <div class="flex items-center justify-between mb-3">
      <h3 class="font-headline font-semibold flex items-center gap-2">
        <span class="material-symbols-outlined text-secondary">campaign</span> Broadcast Cepat
      </h3>
      <a href="broadcast.html" class="text-xs text-primary hover:underline">Buka →</a>
    </div>
    <p class="text-xs text-on-surface-variant mb-3">Kirim pengumuman ke peran/divisi/semua siswa.</p>
    <a href="broadcast.html" class="block w-full py-2.5 rounded-lg bg-secondary text-on-secondary font-medium text-sm text-center">
      📢 Buat Broadcast Baru
    </a>
  </div>`;
}
function cardProgresProduksi() {
  return `
  <div class="glass rounded-2xl p-5">
    <div class="flex items-center justify-between mb-3">
      <h3 class="font-headline font-semibold flex items-center gap-2">
        <span class="material-symbols-outlined text-secondary">trending_up</span> Progres Produksi
      </h3>
      <span class="text-sm text-on-surface-variant">Tahap: <b class="text-primary">Persiapan</b></span>
    </div>
    <div class="h-3 rounded-full bg-surface-container-high overflow-hidden">
      <div class="h-full bg-gradient-to-r from-primary to-secondary transition-all" style="width: 35%"></div>
    </div>
    <div class="grid grid-cols-4 gap-2 mt-4 text-center text-[10px]">
      <div><div class="w-full h-1.5 rounded bg-primary mb-1"></div><span class="text-primary font-medium">Persiapan</span></div>
      <div><div class="w-full h-1.5 rounded bg-surface-container-high mb-1"></div><span class="text-on-surface-variant">Pelaksanaan</span></div>
      <div><div class="w-full h-1.5 rounded bg-surface-container-high mb-1"></div><span class="text-on-surface-variant">Pertunjukan</span></div>
      <div><div class="w-full h-1.5 rounded bg-surface-container-high mb-1"></div><span class="text-on-surface-variant">Pasca</span></div>
    </div>
  </div>`;
}

function cardJadwalTerdekat(list = []) {
  const items = list.length
    ? list
    : [{ judul: "Belum ada jadwal", tanggal: null, jam: "-", lokasi: "-" }];
  return `
  <div class="glass rounded-2xl p-5">
    <h3 class="font-headline font-semibold mb-3 flex items-center gap-2">
      <span class="material-symbols-outlined text-tertiary">event</span> Jadwal Terdekat
    </h3>
    <div class="space-y-2">
      ${items
        .slice(0, 3)
        .map(
          (j) => `
        <div class="flex items-center gap-3 p-3 rounded-xl bg-surface-container hover:bg-surface-container-high transition">
          <div class="w-10 h-10 rounded-lg bg-tertiary-container text-tertiary flex items-center justify-center">
            <span class="material-symbols-outlined">event</span>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">${esc(j.judul)}</p>
            <p class="text-xs text-on-surface-variant">${j.tanggal ? formatTanggal(j.tanggal) + " · " + (j.jam || "-") : "-"}</p>
          </div>
          <button class="px-2 py-1 rounded text-[10px] bg-primary-container text-primary font-medium">Hadir</button>
        </div>`
        )
        .join("")}
    </div>
  </div>`;
}

function cardDeadline(list = []) {
  const items = list.length
    ? list
    : [{ judul: "Tidak ada deadline", deadline: null }];
  return `
  <div class="glass rounded-2xl p-5">
    <h3 class="font-headline font-semibold mb-3 flex items-center gap-2">
      <span class="material-symbols-outlined text-error">schedule</span> Deadline Terdekat
    </h3>
    <div class="space-y-2">
      ${items
        .slice(0, 3)
        .map(
          (t) => `
        <div class="flex items-center gap-3 p-3 rounded-xl bg-surface-container">
          <span class="material-symbols-outlined text-error">flag</span>
          <div class="flex-1">
            <p class="text-sm font-medium">${esc(t.judul)}</p>
            <p class="text-xs text-on-surface-variant">${t.deadline ? countdown(t.deadline) + " lagi" : "-"}</p>
          </div>
        </div>`
        )
        .join("")}
    </div>
  </div>`;
}

function cardNotifikasi(list = []) {
  const items = list.length
    ? list
    : [{ judul: "Belum ada notifikasi", pesan: "Notifikasi baru akan muncul di sini", waktu: null, jenis: "info" }];
  const colorMap = {
    Tugas: "text-blue-400",
    Instruksi: "text-purple-400",
    Info: "text-green-400",
    Urgent: "text-red-400",
    Reminder: "text-orange-400",
    Feedback: "text-pink-400",
    Sistem: "text-gray-400",
  };
  return `
  <div class="glass rounded-2xl p-5">
    <div class="flex items-center justify-between mb-3">
      <h3 class="font-headline font-semibold flex items-center gap-2">
        <span class="material-symbols-outlined text-primary">notifications</span> Notifikasi
      </h3>
      <button id="btn-all-notif" class="text-xs text-primary hover:underline">Lihat Semua</button>
    </div>
    <div class="space-y-2">
      ${items
        .slice(0, 5)
        .map(
          (n) => `
        <div class="flex items-start gap-3 p-3 rounded-xl bg-surface-container">
          <span class="material-symbols-outlined ${colorMap[n.jenis] || "text-gray-400"} mt-0.5">circle_notifications</span>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">${esc(n.judul)}</p>
            <p class="text-xs text-on-surface-variant line-clamp-2">${esc(n.pesan || "")}</p>
            <p class="text-[10px] text-on-surface-variant mt-1">${n.waktu ? waktuRelatif(n.waktu) : "-"}</p>
          </div>
        </div>`
        )
        .join("")}
    </div>
  </div>`;
}

function cardStatistik(profile) {
  return `
  <div class="glass rounded-2xl p-5">
    <h3 class="font-headline font-semibold mb-3 flex items-center gap-2">
      <span class="material-symbols-outlined text-secondary">insights</span> Statistik Pribadi
    </h3>
    <div class="grid grid-cols-3 gap-3 text-center">
      <div class="p-3 rounded-xl bg-surface-container">
        <p class="text-2xl font-bold text-green-400">85%</p>
        <p class="text-[10px] text-on-surface-variant">Kehadiran</p>
      </div>
      <div class="p-3 rounded-xl bg-surface-container">
        <p class="text-2xl font-bold text-primary">87.5</p>
        <p class="text-[10px] text-on-surface-variant">Nilai</p>
      </div>
      <div class="p-3 rounded-xl bg-surface-container">
        <p class="text-2xl font-bold text-secondary">62%</p>
        <p class="text-[10px] text-on-surface-variant">Tugas</p>
      </div>
    </div>
  </div>`;
}

/* =========================================================
 * KARTU KHUSUS PER ROLE
 * ========================================================= */
function cardPimpinan() {
  return `
  <div class="glass rounded-2xl p-5 border-l-4 border-secondary">
    <h3 class="font-headline font-semibold mb-3 flex items-center gap-2">
      <span class="material-symbols-outlined text-secondary">campaign</span> Kartu Komando
    </h3>
    <div class="grid grid-cols-2 gap-3 mb-4">
      <div class="p-3 rounded-xl bg-green-500/10 border border-green-500/30">
        <p class="text-xs text-green-400 font-medium">Status Produksi</p>
        <p class="font-headline font-bold text-green-400 text-lg">On-Track</p>
      </div>
      <div class="p-3 rounded-xl bg-surface-container">
        <p class="text-xs text-on-surface-variant">Progres 7 Divisi</p>
        <p class="font-headline font-bold text-lg">5/7</p>
      </div>
    </div>
    <button class="w-full py-2.5 rounded-lg bg-secondary text-on-secondary font-medium text-sm">📢 Broadcast Cepat</button>
  </div>`;
}

function cardSutradara() {
  return `
  <div class="glass rounded-2xl p-5 border-l-4 border-secondary">
    <h3 class="font-headline font-semibold mb-3 flex items-center gap-2">
      <span class="material-symbols-outlined text-secondary">movie</span> Visi Artistik & Latihan
    </h3>
    <div class="p-3 rounded-xl bg-surface-container mb-3">
      <p class="text-xs text-on-surface-variant">Visi Artistik</p>
      <p class="text-sm">"Menghidupkan kisah rakyat Kalimantan Timur"</p>
    </div>
    <div class="space-y-2">
      <div>
        <div class="flex justify-between text-xs mb-1"><span>Adegan 1</span><span>80%</span></div>
        <div class="h-2 rounded-full bg-surface-container-high"><div class="h-full rounded-full bg-secondary" style="width:80%"></div></div>
      </div>
      <div>
        <div class="flex justify-between text-xs mb-1"><span>Adegan 2</span><span>60%</span></div>
        <div class="h-2 rounded-full bg-surface-container-high"><div class="h-full rounded-full bg-secondary" style="width:60%"></div></div>
      </div>
    </div>
  </div>`;
}

function cardSekretaris() {
  return `
  <div class="glass rounded-2xl p-5 border-l-4 border-tertiary">
    <h3 class="font-headline font-semibold mb-3 flex items-center gap-2">
      <span class="material-symbols-outlined text-tertiary">fact_check</span> Presensi & Jadwal Hari Ini
    </h3>
    <div class="grid grid-cols-2 gap-3">
      <div class="p-3 rounded-xl bg-surface-container">
        <p class="text-xs text-on-surface-variant">Sudah Absen</p>
        <p class="font-headline font-bold text-lg text-green-400">18/24</p>
      </div>
      <div class="p-3 rounded-xl bg-surface-container">
        <p class="text-xs text-on-surface-variant">Jadwal Hari Ini</p>
        <p class="font-headline font-bold text-lg text-tertiary">3</p>
      </div>
    </div>
  </div>`;
}

function cardBendahara() {
  return `
  <div class="glass rounded-2xl p-5 border-l-4 border-green-500">
    <h3 class="font-headline font-semibold mb-3 flex items-center gap-2">
      <span class="material-symbols-outlined text-green-400">account_balance_wallet</span> Keuangan
    </h3>
    <div class="p-3 rounded-xl bg-surface-container mb-3">
      <p class="text-xs text-on-surface-variant">Saldo Kas</p>
      <p class="font-headline font-bold text-2xl text-green-400">Rp 2.450.000</p>
    </div>
    <div class="text-xs space-y-1">
      <div class="flex justify-between"><span>Pengeluaran Terakhir</span><span class="text-error">-Rp 125.000</span></div>
      <div class="flex justify-between text-on-surface-variant"><span>RAB Total</span><span>Rp 5.000.000</span></div>
    </div>
  </div>`;
}

function cardKoordinator(profile) {
  return `
  <div class="glass rounded-2xl p-5 border-l-4 border-tertiary">
    <h3 class="font-headline font-semibold mb-3 flex items-center gap-2">
      <span class="material-symbols-outlined text-tertiary">groups</span> Divisi ${esc(profile.divisi || "")}
    </h3>
    <div class="space-y-2">
      <div class="flex justify-between text-sm"><span>Progres Divisi</span><b class="text-tertiary">65%</b></div>
      <div class="h-2 rounded-full bg-surface-container-high"><div class="h-full rounded-full bg-tertiary" style="width:65%"></div></div>
      <div class="grid grid-cols-3 gap-2 mt-3 text-center text-xs">
        <div class="p-2 rounded bg-surface-container"><b class="text-green-400">5</b><br>Hadir</div>
        <div class="p-2 rounded bg-surface-container"><b class="text-primary">6</b><br>Anggota</div>
        <div class="p-2 rounded bg-surface-container"><b class="text-secondary">3</b><br>Tugas</div>
      </div>
    </div>
  </div>`;
}

function cardGuru() {
  return `
  <div class="glass rounded-2xl p-5 border-l-4 border-primary">
    <h3 class="font-headline font-semibold mb-3 flex items-center gap-2">
      <span class="material-symbols-outlined text-primary">school</span> Statistik Kelas
    </h3>
    <div class="grid grid-cols-3 gap-2 text-center mb-4">
      <div class="p-3 rounded-xl bg-surface-container">
        <p class="text-2xl font-bold text-primary">6</p>
        <p class="text-[10px] text-on-surface-variant">Kelas</p>
      </div>
      <div class="p-3 rounded-xl bg-surface-container">
        <p class="text-2xl font-bold text-secondary">144</p>
        <p class="text-[10px] text-on-surface-variant">Siswa</p>
      </div>
      <div class="p-3 rounded-xl bg-surface-container">
        <p class="text-2xl font-bold text-tertiary">12</p>
        <p class="text-[10px] text-on-surface-variant">Belum Dinilai</p>
      </div>
    </div>
    <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">
      ${["Rekap", "Struktur", "Jadwal", "Absensi", "Notifikasi", "Backup", "Broadcast", "Ekspor"]
        .map(
          (a) => `<button class="p-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-[11px]">${a}</button>`
        )
        .join("")}
    </div>
  </div>`;
}

function cardAdmin() {
  return `
  <div class="glass rounded-2xl p-5 border-l-4 border-error">
    <h3 class="font-headline font-semibold mb-3 flex items-center gap-2">
      <span class="material-symbols-outlined text-error">admin_panel_settings</span> Panel Admin
    </h3>
    <div class="grid grid-cols-2 gap-2">
      ${["Kelola Akun Guru", "Semua Kelas", "Backup/Restore", "Pengaturan Sistem", "Log Sistem", "Maintenance"]
        .map(
          (a) => `<button class="p-2.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-xs">${a}</button>`
        )
        .join("")}
    </div>
  </div>`;
}

function cardPengumuman(list = []) {
  const items = list.length
    ? list
    : [{ judul: "Selamat datang di SP-PPT!", isi: "Aplikasi penilaian produksi teater SMPN 10 Samarinda.", waktu: null, pin: true }];
  return `
  <div class="glass rounded-2xl p-5">
    <h3 class="font-headline font-semibold mb-3 flex items-center gap-2">
      <span class="material-symbols-outlined text-secondary">campaign</span> Pengumuman
    </h3>
    <div class="space-y-2">
      ${items
        .slice(0, 3)
        .map(
          (i) => `
        <div class="p-3 rounded-xl bg-surface-container">
          <div class="flex items-start justify-between gap-2">
            <p class="text-sm font-medium">${i.pin ? "📌 " : ""}${esc(i.judul)}</p>
            <span class="text-[10px] text-on-surface-variant">${i.waktu ? waktuRelatif(i.waktu) : "-"}</span>
          </div>
          <p class="text-xs text-on-surface-variant mt-1">${esc(i.isi)}</p>
        </div>`
        )
        .join("")}
    </div>
  </div>`;
}

/* =========================================================
 * AMBIL DATA DARI FIRESTORE
 * ========================================================= */
async function ambilJadwalTerdekat(uid) {
  try {
    const snap = await getDocs(query(collection(db, "jadwal"), orderBy("tanggal", "desc"), limit(3)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    return [];
  }
}

async function ambilDeadline(uid) {
  try {
    const snap = await getDocs(query(collection(db, "tugas"), orderBy("deadline", "asc"), limit(3)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    return [];
  }
}

async function ambilNotifikasi(uid) {
  try {
    const snap = await getDocs(
      query(collection(db, "notifikasi"), where("penerimaUid", "==", uid), orderBy("waktu", "desc"), limit(5))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    return [];
  }
}

async function ambilInformasi() {
  try {
    const snap = await getDocs(query(collection(db, "informasi"), orderBy("waktu", "desc"), limit(3)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    return [];
  }
}

/* =========================================================
 * RENDER DASHBOARD
 * ========================================================= */
async function renderDashboard(uid, profile) {
  const [jadwal, tugas, notif, info] = await Promise.all([
    ambilJadwalTerdekat(uid),
    ambilDeadline(uid),
    ambilNotifikasi(uid),
    ambilInformasi(),
  ]);

  let specialCards = "";
  const peran = profile.peran;

  if (peran === "Pimpinan Produksi") specialCards += cardPimpinan();
  if (peran === "Sutradara") specialCards += cardSutradara();
  if (peran === "Sekretaris") specialCards += cardSekretaris();
  if (peran === "Bendahara") specialCards += cardBendahara();
  if (peran.startsWith("Koordinator")) specialCards += cardKoordinator(profile);
  if (profile.role === "guru") specialCards += cardGuru();
  if (profile.role === "admin") specialCards += cardGuru() + cardAdmin();

  document.getElementById("content").innerHTML = `
    ${cardProfil(profile)}
    ${specialCards}
    ${cardProgresProduksi()}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      ${cardJadwalTerdekat(jadwal)}
      ${cardDeadline(tugas)}
    </div>
    ${cardQuickActions(profile)}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      ${cardNotifikasi(notif)}
      ${cardPengumuman(info)}
    </div>
    ${cardStatistik(profile)}
    <p class="text-center text-xs text-on-surface-variant pb-4">SP-PPT v1.0 · SMPN 10 Samarinda · 2025</p>
  `;

  // Bind tombol lihat semua notif
  document.getElementById("btn-all-notif")?.addEventListener("click", bukaPanelNotif);
}

/* =========================================================
 * PANEL NOTIFIKASI
 * ========================================================= */
async function bukaPanelNotif() {
  const panel = document.getElementById("notif-panel");
  const drawer = document.getElementById("notif-drawer");
  panel.classList.remove("hidden");
  setTimeout(() => drawer.classList.remove("translate-x-full"), 10);

  const list = await ambilNotifikasi(ME.uid);
  const el = document.getElementById("notif-list");
  if (!list.length) {
    el.innerHTML = `<div class="text-center py-10 text-on-surface-variant">
      <span class="material-symbols-outlined text-4xl block mb-2">notifications_off</span>
      <p class="text-sm">Belum ada notifikasi</p>
    </div>`;
    return;
  }
  el.innerHTML = list
    .map(
      (n) => `
    <div class="p-3 rounded-xl bg-surface-container ${n.dibaca ? "" : "border-l-4 border-primary"}">
      <p class="text-sm font-medium">${esc(n.judul)}</p>
      <p class="text-xs text-on-surface-variant mt-1">${esc(n.pesan || "")}</p>
      <p class="text-[10px] text-on-surface-variant mt-1">${waktuRelatif(n.waktu)}</p>
    </div>`
    )
    .join("");
}

document.addEventListener("click", (e) => {
  if (e.target.closest("[data-close-notif]")) {
    const drawer = document.getElementById("notif-drawer");
    drawer.classList.add("translate-x-full");
    setTimeout(() => document.getElementById("notif-panel").classList.add("hidden"), 300);
  }
});

/* =========================================================
 * THEME TOGGLE
 * ========================================================= */
function initTheme() {
  const html = document.documentElement;
  const saved = localStorage.getItem("theme");
  if (saved === "light") html.classList.remove("dark");
  else html.classList.add("dark");

  const btn = document.getElementById("btn-theme");
  const icon = document.getElementById("theme-icon");
  const updateIcon = () => (icon.textContent = html.classList.contains("dark") ? "light_mode" : "dark_mode");
  updateIcon();

  btn?.addEventListener("click", () => {
    html.classList.toggle("dark");
    localStorage.setItem("theme", html.classList.contains("dark") ? "dark" : "light");
    updateIcon();
  });
}

/* =========================================================
 * FAB ACTIONS
 * ========================================================= */
function initFAB() {
  document.querySelectorAll("[data-fab]").forEach((b) =>
    b.addEventListener("click", () => {
      const type = b.dataset.fab;
      if (type === "kerabat") window.location.href = "struktur.html";
      if (type === "panduan") openModal("modal-panduan");
      if (type === "aduan-wa") {
        const no = "6281234567890"; // Ganti nomor WA guru
        const msg = encodeURIComponent("Halo Pak/Bu, saya ingin menyampaikan aduan melalui SP-PPT.");
        window.open(`https://wa.me/${no}?text=${msg}`, "_blank");
      }
      if (type === "darurat") openModal("modal-darurat");
    })
  );

  document.getElementById("confirm-darurat")?.addEventListener("click", async () => {
    const pesan = document.getElementById("darurat-pesan").value.trim();
    if (!pesan) return showToast("Isi pesan darurat.", "warning");
    try {
      // Kirim ke guru & pimpinan
      const usersSnap = await getDocs(query(collection(db, "users"), where("peran", "in", ["Guru Pembina", "Pimpinan Produksi"])));
      for (const u of usersSnap.docs) {
        await addDoc(collection(db, "notifikasi"), {
          penerimaUid: u.id,
          jenis: "Urgent",
          judul: "🚨 DARURAT dari " + (ME.profile.nama || ""),
          pesan,
          dibaca: false,
          waktu: serverTimestamp(),
        });
      }
      showToast("Notifikasi darurat terkirim!", "success");
      closeModal("modal-darurat");
    } catch (e) {
      showToast("Gagal kirim darurat.", "error");
    }
  });
}

/* =========================================================
 * LOGOUT
 * ========================================================= */
function initLogout() {
  document.getElementById("btn-logout")?.addEventListener("click", () => openModal("modal-logout"));
  document.getElementById("confirm-logout")?.addEventListener("click", async () => {
    await logActivity(ME.uid, "logout");
    await signOut(auth);
    window.location.replace("index.html");
  });
}

/* =========================================================
 * MENU TOGGLE (Mobile)
 * ========================================================= */
function initMenuToggle() {
  document.getElementById("btn-menu")?.addEventListener("click", () => {
    const sb = document.getElementById("sidebar");
    sb.classList.toggle("hidden");
    sb.classList.toggle("flex");
  });
  document.getElementById("btn-notif")?.addEventListener("click", bukaPanelNotif);
}

/* =========================================================
 * INIT
 * ========================================================= */
(async function init() {
  try {
    const { uid, profile } = await protectPage();
    ME = { uid, profile };

    renderSidebar(profile.role);
    renderBottomNav(profile.role);
    renderHeader(profile);
    initTheme();
    initFAB();
    initLogout();
    initMenuToggle();

    await renderDashboard(uid, profile);
  } catch (e) {
    console.warn("[Init]", e);
  }
})();
