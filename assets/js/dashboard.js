/**
 * SP-PPT — Dashboard (final)
 * - Guru/Admin: pilih kelas dulu → baru tampil data
 * - Siswa: langsung tampil data
 */

import { db } from "./firebase-init.js";
import {
  collection, getDocs, query, limit, where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { protectPage, clearSession } from "./router.js";
import {
  showToast, formatTanggal, countdown, warnaPeran, inisial, logActivity, esc, waktuRelatif,
} from "./utils.js";

let ME = null;
let KELAS_AKTIF = null;
let DAFTAR_KELAS = [];

const MENU_SISWA = [
  { icon: "dashboard", label: "Dashboard", href: "dashboard.html" },
  { icon: "grade", label: "Nilai", href: "nilai.html" },
  { icon: "calendar_month", label: "Jadwal", href: "jadwal.html" },
  { icon: "fact_check", label: "Absensi", href: "absensi.html" },
  { icon: "checklist", label: "Checklist", href: "checklist.html" },
  { icon: "campaign", label: "Broadcast", href: "broadcast.html" },
  { icon: "groups", label: "Struktur", href: "struktur.html" },
  { icon: "folder", label: "Arsip", href: "arsip.html" },
  { icon: "support_agent", label: "Aduan", href: "aduan.html" },
  { icon: "description", label: "Rapor", href: "rapor.html" },
  { icon: "settings", label: "Pengaturan", href: "pengaturan.html" },
];

const MENU_GURU = [
  { icon: "dashboard", label: "Dashboard", href: "dashboard.html" },
  { icon: "admin_panel_settings", label: "Panel Admin", href: "admin.html" },
  { icon: "grade", label: "Nilai", href: "nilai.html" },
  { icon: "calendar_month", label: "Jadwal", href: "jadwal.html" },
  { icon: "fact_check", label: "Absensi", href: "absensi.html" },
  { icon: "checklist", label: "Checklist", href: "checklist.html" },
  { icon: "campaign", label: "Broadcast", href: "broadcast.html" },
  { icon: "groups", label: "Struktur", href: "struktur.html" },
  { icon: "folder", label: "Arsip", href: "arsip.html" },
  { icon: "description", label: "Rapor", href: "rapor.html" },
  { icon: "settings", label: "Pengaturan", href: "pengaturan.html" },
];

function renderSidebar(role) {
  const menu = role === "siswa" ? MENU_SISWA : MENU_GURU;
  const page = window.location.pathname.split("/").pop() || "dashboard.html";
  document.getElementById("sidebar-nav").innerHTML = menu.map((m) => `
    <a href="${m.href}" class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition text-sm ${
      m.href.split("#")[0] === page ? "bg-primary-container text-primary font-medium" : "text-on-surface-variant hover:bg-surface-container"
    }"><span class="material-symbols-outlined text-xl">${m.icon}</span>${m.label}</a>`).join("");
}

function renderBottomNav(role) {
  const items = role === "siswa" ? [
    { icon: "dashboard", label: "Home", href: "dashboard.html" },
    { icon: "grade", label: "Nilai", href: "nilai.html" },
    { icon: "calendar_month", label: "Jadwal", href: "jadwal.html" },
    { icon: "checklist", label: "Tugas", href: "checklist.html" },
    { icon: "groups", label: "Kerabat", href: "struktur.html" },
  ] : [
    { icon: "dashboard", label: "Home", href: "dashboard.html" },
    { icon: "admin_panel_settings", label: "Panel", href: "admin.html" },
    { icon: "grade", label: "Nilai", href: "nilai.html" },
    { icon: "groups", label: "Struktur", href: "struktur.html" },
    { icon: "settings", label: "Setting", href: "pengaturan.html" },
  ];
  const page = window.location.pathname.split("/").pop() || "dashboard.html";
  document.getElementById("bottom-nav").innerHTML = items.map((i) => `
    <a href="${i.href}" class="flex flex-col items-center justify-center py-2 text-[10px] gap-0.5 ${i.href === page ? "text-primary" : "text-on-surface-variant"}">
      <span class="material-symbols-outlined text-xl">${i.icon}</span>${i.label}
    </a>`).join("");
}

function renderHeader(profile) {
  const av = document.getElementById("header-avatar");
  if (av) av.textContent = inisial(profile.nama);
  const badge = document.getElementById("badge-role");
  if (badge) {
    badge.className = `hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${warnaPeran(profile.peran)}`;
    badge.innerHTML = `<span class="material-symbols-outlined text-sm">badge</span>${esc(profile.peran)}`;
  }
}

/* =========================================================
 * KARTU-KARTU
 * ========================================================= */
function cardProfil(p) {
  return `<div class="glass rounded-2xl p-5 flex items-center gap-4">
    <div class="w-16 h-16 rounded-full bg-primary-container text-primary flex items-center justify-center text-xl font-bold border border-outline-variant/40">${inisial(p.nama)}</div>
    <div class="flex-1 min-w-0">
      <h3 class="font-headline font-semibold text-lg truncate">${esc(p.nama)}</h3>
      <div class="flex flex-wrap gap-1.5 mt-1">
        <span class="px-2 py-0.5 rounded-full text-[10px] border ${warnaPeran(p.peran)}">${esc(p.peran)}</span>
        <span class="px-2 py-0.5 rounded-full text-[10px] bg-surface-container-high border border-outline-variant">${esc(p.divisi || "-")}</span>
        ${p.kelas ? `<span class="px-2 py-0.5 rounded-full text-[10px] bg-surface-container-high border border-outline-variant">${esc(p.kelas)}</span>` : ""}
      </div>
    </div>
  </div>`;
}

function cardSelectorKelasGuru() {
  return `
  <div class="glass rounded-2xl p-5 border-l-4 border-secondary">
    <h3 class="font-headline font-semibold mb-3 flex items-center gap-2">
      <span class="material-symbols-outlined text-secondary">school</span> Pilih Kelas
    </h3>
    <p class="text-xs text-on-surface-variant mb-3">Pilih kelas untuk melihat data siswa dan statistik.</p>
    <select id="pilih-kelas-guru" class="w-full px-4 py-3 rounded-xl bg-surface-container border border-outline-variant text-sm focus:border-primary outline-none">
      <option value="">— Pilih Kelas —</option>
      ${DAFTAR_KELAS.map((k) => `<option value="${k.id}">${esc(k.name)} (${k.students?.length || 0} siswa)</option>`).join("")}
    </select>
  </div>`;
}

function cardInfoKelas(kelas) {
  const total = kelas.students?.length || 0;
  return `
  <div class="glass rounded-2xl p-5 border-l-4 border-primary">
    <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
      <div>
        <h3 class="font-headline font-semibold text-lg">${esc(kelas.name)}</h3>
        <p class="text-xs text-on-surface-variant">Kode Kelas: <b class="text-primary">${esc(kelas.code || "-")}</b></p>
      </div>
      <span class="px-3 py-1 rounded-full bg-primary-container text-primary text-xs font-medium">${total} Siswa</span>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      <div class="p-3 rounded-xl bg-surface-container text-center">
        <p class="text-xs text-on-surface-variant">Siswa</p>
        <p class="text-2xl font-bold text-primary">${total}</p>
      </div>
      <div class="p-3 rounded-xl bg-surface-container text-center">
        <p class="text-xs text-on-surface-variant">Pemain</p>
        <p class="text-2xl font-bold text-secondary">${(kelas.students || []).filter((s) => !s.peran || s.peran === "Pemain").length}</p>
      </div>
      <div class="p-3 rounded-xl bg-surface-container text-center">
        <p class="text-xs text-on-surface-variant">Divisi</p>
        <p class="text-2xl font-bold text-tertiary">6</p>
      </div>
      <div class="p-3 rounded-xl bg-surface-container text-center">
        <p class="text-xs text-on-surface-variant">Aktif</p>
        <p class="text-2xl font-bold text-green-400">100%</p>
      </div>
    </div>

    <h4 class="text-sm font-medium mb-2">Daftar Siswa</h4>
    <div class="space-y-1.5 max-h-72 overflow-y-auto">
      ${(kelas.students || []).length ? kelas.students.map((s, i) => `
        <div class="p-2.5 rounded-lg bg-surface-container flex items-center gap-3">
          <div class="w-9 h-9 rounded-full bg-primary-container text-primary flex items-center justify-center text-xs font-semibold">${inisial(s.name)}</div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">${esc(s.name)}</p>
            <p class="text-[10px] text-on-surface-variant truncate">${esc(s.email)}</p>
          </div>
          <span class="text-[10px] px-2 py-0.5 rounded-full bg-surface-container-high">${esc(s.peran || "Pemain")}</span>
        </div>
      `).join("") : `<p class="text-sm text-on-surface-variant text-center py-4">Belum ada siswa di kelas ini</p>`}
    </div>
  </div>`;
}

function cardAksiGuru() {
  const items = [
    { l: "Rekap Nilai", h: "nilai.html", i: "analytics" },
    { l: "Struktur", h: "struktur.html", i: "groups" },
    { l: "Jadwal", h: "jadwal.html", i: "calendar_month" },
    { l: "Absensi", h: "absensi.html", i: "fact_check" },
    { l: "Broadcast", h: "broadcast.html", i: "campaign" },
    { l: "Rapor PDF", h: "rapor.html", i: "description" },
    { l: "Panel Admin", h: "admin.html", i: "admin_panel_settings" },
    { l: "Pengaturan", h: "pengaturan.html", i: "settings" },
  ];
  return `<div class="glass rounded-2xl p-5">
    <h3 class="font-headline font-semibold mb-3 flex items-center gap-2"><span class="material-symbols-outlined text-primary">bolt</span> Aksi Cepat Guru</h3>
    <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">
      ${items.map((a) => `<a href="${a.h}" class="flex flex-col items-center gap-1 p-3 rounded-xl bg-surface-container hover:bg-surface-container-high transition">
        <span class="material-symbols-outlined text-primary">${a.i}</span>
        <span class="text-[10px] text-center">${a.l}</span></a>`).join("")}
    </div></div>`;
}

function cardProgres() {
  return `<div class="glass rounded-2xl p-5">
    <div class="flex items-center justify-between mb-3">
      <h3 class="font-headline font-semibold flex items-center gap-2"><span class="material-symbols-outlined text-secondary">trending_up</span> Progres Produksi</h3>
      <span class="text-sm text-on-surface-variant">Tahap: <b class="text-primary">Persiapan</b></span>
    </div>
    <div class="h-3 rounded-full bg-surface-container-high overflow-hidden">
      <div class="h-full bg-gradient-to-r from-primary to-secondary" style="width:35%"></div>
    </div>
    <div class="grid grid-cols-4 gap-2 mt-4 text-center text-[10px]">
      <div><div class="w-full h-1.5 rounded bg-primary mb-1"></div><span class="text-primary font-medium">Persiapan</span></div>
      <div><div class="w-full h-1.5 rounded bg-surface-container-high mb-1"></div><span class="text-on-surface-variant">Pelaksanaan</span></div>
      <div><div class="w-full h-1.5 rounded bg-surface-container-high mb-1"></div><span class="text-on-surface-variant">Pertunjukan</span></div>
      <div><div class="w-full h-1.5 rounded bg-surface-container-high mb-1"></div><span class="text-on-surface-variant">Pasca</span></div>
    </div></div>`;
}

function cardQuickActionsSiswa() {
  const actions = [
    { icon: "grade", label: "Nilai", href: "nilai.html" },
    { icon: "calendar_month", label: "Jadwal", href: "jadwal.html" },
    { icon: "fact_check", label: "Absensi", href: "absensi.html" },
    { icon: "checklist", label: "Tugas", href: "checklist.html" },
    { icon: "groups", label: "Kerabat", href: "struktur.html" },
    { icon: "description", label: "Rapor", href: "rapor.html" },
  ];
  return `<div class="glass rounded-2xl p-5">
    <h3 class="font-headline font-semibold mb-3 flex items-center gap-2"><span class="material-symbols-outlined text-primary">bolt</span> Aksi Cepat</h3>
    <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">
      ${actions.map((a) => `<a href="${a.href}" class="flex flex-col items-center gap-1 p-3 rounded-xl bg-surface-container hover:bg-surface-container-high transition">
        <span class="material-symbols-outlined text-primary">${a.icon}</span>
        <span class="text-[10px] text-center">${a.label}</span></a>`).join("")}
    </div></div>`;
}

function cardJadwal(list) {
  const items = list.length ? list : [{ judul: "Belum ada jadwal", tanggal: null }];
  return `<div class="glass rounded-2xl p-5">
    <h3 class="font-headline font-semibold mb-3 flex items-center gap-2"><span class="material-symbols-outlined text-tertiary">event</span> Jadwal Terdekat</h3>
    <div class="space-y-2">${items.slice(0, 3).map((j) => `
      <div class="flex items-center gap-3 p-3 rounded-xl bg-surface-container">
        <div class="w-10 h-10 rounded-lg bg-tertiary-container text-tertiary flex items-center justify-center"><span class="material-symbols-outlined">event</span></div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium truncate">${esc(j.judul)}</p>
          <p class="text-xs text-on-surface-variant">${j.tanggal ? formatTanggal(j.tanggal) : "-"}</p>
        </div></div>`).join("")}</div></div>`;
}

function cardDeadline(list) {
  const items = list.length ? list : [{ judul: "Tidak ada deadline", deadline: null }];
  return `<div class="glass rounded-2xl p-5">
    <h3 class="font-headline font-semibold mb-3 flex items-center gap-2"><span class="material-symbols-outlined text-error">schedule</span> Deadline Terdekat</h3>
    <div class="space-y-2">${items.slice(0, 3).map((t) => `
      <div class="flex items-center gap-3 p-3 rounded-xl bg-surface-container">
        <span class="material-symbols-outlined text-error">flag</span>
        <div class="flex-1"><p class="text-sm font-medium">${esc(t.judul)}</p>
        <p class="text-xs text-on-surface-variant">${t.deadline ? countdown(t.deadline) + " lagi" : "-"}</p></div>
      </div>`).join("")}</div></div>`;
}

function cardPanelKhusus(p) {
  const map = {
    "Sutradara": { label: "Panel Sutradara", href: "sutradara.html", icon: "movie", desc: "Visi artistik, casting, catatan harian" },
    "Asisten Sutradara": { label: "Panel Asisten", href: "asisten.html", icon: "book", desc: "Prompt book, standby cue" },
    "Pemain": { label: "Panel Pemain", href: "pemain.html", icon: "theater_comedy", desc: "Naskah, latihan dialog, rekaman" },
  };
  const info = map[p.peran] || (p.peran?.startsWith("Koordinator") ? {
    label: `Panel ${p.divisi}`, href: "koordinator.html", icon: "engineering", desc: "Kelola divisi & inventaris"
  } : null);
  if (!info) return "";
  return `<a href="${info.href}" class="glass rounded-2xl p-5 border-l-4 border-secondary hover:bg-surface-container transition block">
    <div class="flex items-center gap-3">
      <div class="w-12 h-12 rounded-xl bg-secondary/20 flex items-center justify-center">
        <span class="material-symbols-outlined text-secondary text-2xl">${info.icon}</span>
      </div>
      <div class="flex-1"><p class="font-headline font-semibold">${info.label}</p>
        <p class="text-xs text-on-surface-variant mt-0.5">${info.desc}</p></div>
      <span class="material-symbols-outlined text-secondary">arrow_forward</span>
    </div></a>`;
}

/* =========================================================
 * RENDER DASHBOARD
 * ========================================================= */
function renderDashboardSiswa() {
  const c = document.getElementById("content");
  c.innerHTML = `
    ${cardProfil(ME.profile)}
    ${cardPanelKhusus(ME.profile)}
    ${cardProgres()}
    ${cardQuickActionsSiswa()}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4" id="dyn">
      ${cardJadwal([])}${cardDeadline([])}
    </div>
    <p class="text-center text-xs text-on-surface-variant pb-4">SP-PPT v1.0 · SMPN 10 Samarinda · 2025</p>`;
  loadDynamicCards();
}

function renderDashboardGuru() {
  const c = document.getElementById("content");
  c.innerHTML = `
    ${cardProfil(ME.profile)}
    ${cardSelectorKelasGuru()}
    <div id="kelas-content"></div>
    ${cardAksiGuru()}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4" id="dyn">
      ${cardJadwal([])}${cardDeadline([])}
    </div>
    <p class="text-center text-xs text-on-surface-variant pb-4">SP-PPT v1.0 · SMPN 10 Samarinda · 2025</p>`;

  // Event listener pilih kelas
  document.getElementById("pilih-kelas-guru").addEventListener("change", (e) => {
    const kelasId = e.target.value;
    const k = DAFTAR_KELAS.find((x) => x.id === kelasId);
    const kc = document.getElementById("kelas-content");
    if (!k) { kc.innerHTML = ""; return; }
    KELAS_AKTIF = k;
    kc.innerHTML = cardInfoKelas(k);
  });

  loadDynamicCards();
}

async function loadDynamicCards() {
  setTimeout(async () => {
    try {
      const jSnap = await getDocs(query(collection(db, "jadwal"), limit(5)));
      const tSnap = await getDocs(query(collection(db, "tugas"), limit(5)));
      const jadwal = jSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.tanggal || "").localeCompare(b.tanggal || ""));
      const tugas = tSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => new Date(a.deadline || 0) - new Date(b.deadline || 0));
      const dyn = document.getElementById("dyn");
      if (dyn) dyn.innerHTML = cardJadwal(jadwal) + cardDeadline(tugas);
    } catch (e) { console.warn("Dynamic load:", e); }
  }, 100);
}

/* =========================================================
 * INIT
 * ========================================================= */
(async function init() {
  console.log("[Init] Start");
  try {
    const { uid, profile } = await protectPage();
    ME = { uid, profile };
    console.log("[Init]", profile.nama, profile.role);

    renderSidebar(profile.role);
    renderBottomNav(profile.role);
    renderHeader(profile);

    // Theme
    const html = document.documentElement;
    if (localStorage.getItem("theme") === "light") html.classList.remove("dark");
    document.getElementById("btn-theme")?.addEventListener("click", () => {
      html.classList.toggle("dark");
      localStorage.setItem("theme", html.classList.contains("dark") ? "dark" : "light");
      const i = document.getElementById("theme-icon");
      if (i) i.textContent = html.classList.contains("dark") ? "light_mode" : "dark_mode";
    });

    // Logout
    document.getElementById("btn-logout")?.addEventListener("click", () => {
      if (confirm("Yakin ingin keluar?")) {
        logActivity(ME.uid, "logout").catch(() => {});
        clearSession();
        window.location.replace("index.html?logout=1");
      }
    });

    // Menu toggle
    document.getElementById("btn-menu")?.addEventListener("click", () => {
      const sb = document.getElementById("sidebar");
      sb.classList.toggle("hidden");
      sb.classList.toggle("flex");
    });

    // Render sesuai role
    if (profile.role === "guru" || profile.role === "admin") {
      // Load daftar kelas dari Firestore
      try {
        const kelasSnap = await getDocs(collection(db, "classes"));
        DAFTAR_KELAS = kelasSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        console.log("[Init] Kelas:", DAFTAR_KELAS.length);
      } catch (e) {
        console.warn("[Init] Gagal load kelas:", e);
        DAFTAR_KELAS = [];
      }
      renderDashboardGuru();
    } else {
      renderDashboardSiswa();
    }

    console.log("[Init] Selesai");
  } catch (e) {
    console.error("[Init] Fatal:", e);
    document.getElementById("content").innerHTML = `
      <div class="glass rounded-2xl p-8 text-center">
        <span class="material-symbols-outlined text-5xl text-error mb-3">error</span>
        <p class="text-sm font-medium text-error mb-2">Terjadi kesalahan</p>
        <p class="text-xs text-on-surface-variant mb-4">${esc(e.message || String(e))}</p>
        <button onclick="location.reload()" class="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm">Muat Ulang</button>
      </div>`;
  }
})();
