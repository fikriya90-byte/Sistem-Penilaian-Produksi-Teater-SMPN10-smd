/**
 * SP-PPT — Dashboard (Tanpa Firebase Auth)
 * Baca session dari localStorage via router.js
 */

import { db } from "./firebase-init.js";
import {
  collection, getDocs, query, where, orderBy, limit, doc, updateDoc,
  addDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { protectPage, clearSession } from "./router.js";
import {
  showToast, openModal, closeModal, formatTanggal, waktuRelatif, countdown,
  warnaPeran, inisial, logActivity, esc,
} from "./utils.js";
import { initNotifikasi, bukaPanelNotif, kirimNotifikasiBanyak } from "./notifikasi.js";

let ME = null;

const MENU_BASE = [
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
  const menu = role === "siswa" ? MENU_BASE : MENU_GURU;
  const currentPage = window.location.pathname.split("/").pop() || "dashboard.html";
  document.getElementById("sidebar-nav").innerHTML = menu.map((m) => `
    <a href="${m.href}" class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition text-sm ${
      m.href.split("#")[0] === currentPage
        ? "bg-primary-container text-primary font-medium"
        : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
    }">
      <span class="material-symbols-outlined text-xl">${m.icon}</span>${m.label}
    </a>`).join("");
}

function renderBottomNav(role) {
  const items = role === "siswa"
    ? [
        { icon: "dashboard", label: "Home", href: "dashboard.html" },
        { icon: "grade", label: "Nilai", href: "nilai.html" },
        { icon: "calendar_month", label: "Jadwal", href: "jadwal.html" },
        { icon: "checklist", label: "Tugas", href: "checklist.html" },
        { icon: "groups", label: "Kerabat", href: "struktur.html" },
      ]
    : [
        { icon: "dashboard", label: "Home", href: "dashboard.html" },
        { icon: "admin_panel_settings", label: "Panel", href: "admin.html" },
        { icon: "grade", label: "Nilai", href: "nilai.html" },
        { icon: "groups", label: "Struktur", href: "struktur.html" },
        { icon: "settings", label: "Setting", href: "pengaturan.html" },
      ];
  const page = window.location.pathname.split("/").pop() || "dashboard.html";
  document.getElementById("bottom-nav").innerHTML = items.map((i) => `
    <a href="${i.href}" class="flex flex-col items-center justify-center py-2 text-[10px] gap-0.5 ${
      i.href === page ? "text-primary" : "text-on-surface-variant"
    }">
      <span class="material-symbols-outlined text-xl">${i.icon}</span>${i.label}
    </a>`).join("");
}

function renderHeader(profile) {
  document.getElementById("header-avatar").textContent = inisial(profile.nama);
  const badge = document.getElementById("badge-role");
  badge.className = `hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${warnaPeran(profile.peran)}`;
  badge.innerHTML = `<span class="material-symbols-outlined text-sm">badge</span>${esc(profile.peran)}`;
}

/* =========================================================
 * KARTU-KARTU
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
    { icon: "grade", label: "Nilai", href: "nilai.html" },
    { icon: "calendar_month", label: "Jadwal", href: "jadwal.html" },
    { icon: "fact_check", label: "Absensi", href: "absensi.html" },
    { icon: "checklist", label: "Tugas", href: "checklist.html" },
    { icon: "groups", label: "Kerabat", href: "struktur.html" },
    { icon: "description", label: "Rapor", href: "rapor.html" },
  ];
  return `
  <div class="glass rounded-2xl p-5">
    <h3 class="font-headline font-semibold mb-3 flex items-center gap-2">
      <span class="material-symbols-outlined text-primary">bolt</span> Aksi Cepat
    </h3>
    <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">
      ${actions.map((a) => `
        <a href="${a.href}" class="flex flex-col items-center justify-center gap-1 p-3 rounded-xl bg-surface-container hover:bg-surface-container-high transition">
          <span class="material-symbols-outlined text-primary">${a.icon}</span>
          <span class="text-[10px] text-center">${a.label}</span>
        </a>`).join("")}
    </div>
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
      <div class="h-full bg-gradient-to-r from-primary to-secondary" style="width: 35%"></div>
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
  const items = list.length ? list : [{ judul: "Belum ada jadwal", tanggal: null, jam: "-", lokasi: "-" }];
  return `
  <div class="glass rounded-2xl p-5">
    <h3 class="font-headline font-semibold mb-3 flex items-center gap-2">
      <span class="material-symbols-outlined text-tertiary">event</span> Jadwal Terdekat
    </h3>
    <div class="space-y-2">
      ${items.slice(0, 3).map((j) => `
        <div class="flex items-center gap-3 p-3 rounded-xl bg-surface-container">
          <div class="w-10 h-10 rounded-lg bg-tertiary-container text-tertiary flex items-center justify-center">
            <span class="material-symbols-outlined">event</span>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">${esc(j.judul)}</p>
            <p class="text-xs text-on-surface-variant">${j.tanggal ? formatTanggal(j.tanggal) + " · " + (j.jamMulai || "-") : "-"}</p>
          </div>
        </div>`).join("")}
    </div>
  </div>`;
}

function cardDeadline(list = []) {
  const items = list.length ? list : [{ judul: "Tidak ada deadline", deadline: null }];
  return `
  <div class="glass rounded-2xl p-5">
    <h3 class="font-headline font-semibold mb-3 flex items-center gap-2">
      <span class="material-symbols-outlined text-error">schedule</span> Deadline Terdekat
    </h3>
    <div class="space-y-2">
      ${items.slice(0, 3).map((t) => `
        <div class="flex items-center gap-3 p-3 rounded-xl bg-surface-container">
          <span class="material-symbols-outlined text-error">flag</span>
          <div class="flex-1">
            <p class="text-sm font-medium">${esc(t.judul)}</p>
            <p class="text-xs text-on-surface-variant">${t.deadline ? countdown(t.deadline) + " lagi" : "-"}</p>
          </div>
        </div>`).join("")}
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
        <p class="text-2xl font-bold text-green-400">-</p>
        <p class="text-[10px] text-on-surface-variant">Kehadiran</p>
      </div>
      <div class="p-3 rounded-xl bg-surface-container">
        <p class="text-2xl font-bold text-primary">-</p>
        <p class="text-[10px] text-on-surface-variant">Nilai</p>
      </div>
      <div class="p-3 rounded-xl bg-surface-container">
        <p class="text-2xl font-bold text-secondary">-</p>
        <p class="text-[10px] text-on-surface-variant">Tugas</p>
      </div>
    </div>
  </div>`;
}

function cardGuru() {
  return `
  <div class="glass rounded-2xl p-5 border-l-4 border-primary">
    <h3 class="font-headline font-semibold mb-3 flex items-center gap-2">
      <span class="material-symbols-outlined text-primary">school</span> Panel Guru
    </h3>
    <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">
      ${[
        { l: "Rekap Nilai", h: "nilai.html", i: "analytics" },
        { l: "Struktur", h: "struktur.html", i: "groups" },
        { l: "Jadwal", h: "jadwal.html", i: "calendar_month" },
        { l: "Absensi", h: "absensi.html", i: "fact_check" },
        { l: "Broadcast", h: "broadcast.html", i: "campaign" },
        { l: "Rapor PDF", h: "rapor.html", i: "description" },
        { l: "Panel Admin", h: "admin.html", i: "admin_panel_settings" },
        { l: "Pengaturan", h: "pengaturan.html", i: "settings" },
      ].map((a) => `
        <a href="${a.h}" class="flex flex-col items-center gap-1 p-3 rounded-xl bg-surface-container hover:bg-surface-container-high transition">
          <span class="material-symbols-outlined text-primary">${a.i}</span>
          <span class="text-[10px] text-center">${a.l}</span>
        </a>`).join("")}
    </div>
  </div>`;
}

function cardPanelKhusus(profile) {
  const map = {
    "Sutradara": { label: "Panel Sutradara", href: "sutradara.html", icon: "movie", desc: "Visi artistik, casting, catatan harian" },
    "Asisten Sutradara": { label: "Panel Asisten", href: "asisten.html", icon: "book", desc: "Prompt book, catatan harian, standby cue" },
    "Pemain": { label: "Panel Pemain", href: "pemain.html", icon: "theater_comedy", desc: "Naskah digital, latihan dialog, rekaman" },
  };
  const info = map[profile.peran] || (profile.peran?.startsWith("Koordinator") ? {
    label: `Panel ${profile.divisi}`, href: "koordinator.html", icon: "engineering",
    desc: "Kelola divisi, tugas anggota, inventaris"
  } : null);
  if (!info) return "";
  return `
  <a href="${info.href}" class="glass rounded-2xl p-5 border-l-4 border-secondary hover:bg-surface-container transition block">
    <div class="flex items-center gap-3">
      <div class="w-12 h-12 rounded-xl bg-secondary/20 flex items-center justify-center">
        <span class="material-symbols-outlined text-secondary text-2xl">${info.icon}</span>
      </div>
      <div class="flex-1">
        <p class="font-headline font-semibold">${info.label}</p>
        <p class="text-xs text-on-surface-variant mt-0.5">${info.desc}</p>
      </div>
      <span class="material-symbols-outlined text-secondary">arrow_forward</span>
    </div>
  </a>`;
}

function cardBroadcastCepat(profile) {
  const boleh = profile.role === "guru" || profile.role === "admin" ||
    ["Pimpinan Produksi", "Sekretaris", "Sutradara", "Asisten Sutradara", "Bendahara"].includes(profile.peran) ||
    profile.peran?.startsWith("Koordinator");
  if (!boleh) return "";
  return `
  <div class="glass rounded-2xl p-5 border-l-4 border-secondary">
    <h3 class="font-headline font-semibold mb-3 flex items-center gap-2">
      <span class="material-symbols-outlined text-secondary">campaign</span> Broadcast Cepat
    </h3>
    <a href="broadcast.html" class="block w-full py-2.5 rounded-lg bg-secondary text-on-secondary font-medium text-sm text-center">
      Buat Broadcast Baru
    </a>
  </div>`;
}

/* =========================================================
 * LOAD DATA (dengan timeout + fallback)
 * ========================================================= */
async function safeQuery(fn, fallback = [], timeoutMs = 5000) {
  try {
    const promise = fn();
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs));
    return await Promise.race([promise, timeout]);
  } catch (e) {
    console.warn("[Dashboard] query gagal:", e.message);
    return fallback;
  }
}

async function ambilJadwalTerdekat() {
  return await safeQuery(async () => {
    const snap = await getDocs(query(collection(db, "jadwal"), limit(5)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.tanggal || "").localeCompare(b.tanggal || ""));
  }, []);
}

async function ambilDeadline() {
  return await safeQuery(async () => {
    const snap = await getDocs(query(collection(db, "tugas"), limit(5)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(a.deadline || 0) - new Date(b.deadline || 0));
  }, []);
}

/* =========================================================
 * RENDER DASHBOARD
 * ========================================================= */
async function renderDashboard(profile) {
  const c = document.getElementById("content");

  // Render kartu statis dulu (biar user tidak lihat skeleton lama)
  c.innerHTML = `
    ${cardProfil(profile)}
    ${cardPanelKhusus(profile)}
    ${cardProgresProduksi()}
    ${cardBroadcastCepat(profile)}
    ${cardQuickActions(profile)}
    ${cardGuru.call(null)}
    ${cardStatistik(profile)}
    <p class="text-center text-xs text-on-surface-variant pb-4">SP-PPT v1.0 · SMPN 10 Samarinda · 2025</p>
  `;

  // Load jadwal & deadline paralel dengan timeout
  const [jadwal, tugas] = await Promise.all([
    ambilJadwalTerdekat(),
    ambilDeadline(),
  ]);

  // Sisipkan kartu dinamis setelah profil
  const dynamicHTML = document.createElement("div");
  dynamicHTML.className = "grid grid-cols-1 lg:grid-cols-2 gap-4";
  dynamicHTML.innerHTML = cardJadwalTerdekat(jadwal) + cardDeadline(tugas);

  const gridProgres = c.children[2]; // Setelah cardProfil + cardPanelKhusus
  if (gridProgres) gridProgres.after(dynamicHTML);
}

/* =========================================================
 * INIT THEME
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
 * LOGOUT
 * ========================================================= */
function initLogout() {
  document.getElementById("btn-logout")?.addEventListener("click", () => {
    if (confirm("Yakin ingin keluar?")) {
      logActivity(ME.uid, "logout").catch(() => {});
      clearSession();
      window.location.replace("index.html?logout=1");
    }
  });
}

/* =========================================================
 * FAB
 * ========================================================= */
function initFAB() {
  document.querySelectorAll("[data-fab]").forEach((b) =>
    b.addEventListener("click", () => {
      const type = b.dataset.fab;
      if (type === "kerabat") window.location.href = "struktur.html";
      if (type === "panduan") openModal("modal-panduan");
      if (type === "aduan-wa") {
        const no = "6281234567890";
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
      const usersSnap = await getDocs(query(collection(db, "teachers")));
      const uids = usersSnap.docs.map((d) => `teacher_${d.data().email}`);
      if (uids.length) {
        await kirimNotifikasiBanyak({
          penerimaUids: uids,
          jenis: "Urgent",
          judul: `DARURAT dari ${ME.profile.nama}`,
          pesan,
          dari: ME.profile.nama,
          link: "dashboard.html",
        });
      }
      showToast(`Notifikasi darurat terkirim ke ${uids.length} guru!`, "success");
      closeModal("modal-darurat");
      document.getElementById("darurat-pesan").value = "";
    } catch (e) {
      console.error(e);
      showToast("Gagal kirim darurat.", "error");
    }
  });
}

/* =========================================================
 * MENU TOGGLE
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
    initNotifikasi(uid, profile);

    await renderDashboard(profile);
  } catch (e) {
    console.warn("[Init]", e);
  }
})();
