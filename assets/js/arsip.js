/**
 * SP-PPT — Arsip Informasi & Dokumen
 * List dokumen dari collection `informasi`, filter, search, download
 */

import { db } from "./firebase-init.js";
import {
  collection, getDocs, query, where, orderBy, serverTimestamp, addDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { protectPage, clearSession } from "./router.js";
import {
  showToast, formatTanggal, waktuRelatif, warnaPeran, inisial, logActivity, esc, skeleton,
} from "./utils.js";
import { initNotifikasi, bukaPanelNotif, tutupPanelNotif } from "./notifikasi.js";

let ME = null;
let DAFTAR_ARSIP = [];
let KATEGORI_SET = new Set();

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
  const page = "arsip.html";
  document.getElementById("sidebar-nav").innerHTML = menu.map((m) => `
    <a href="${m.href}" class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition text-sm ${
      m.href === page ? "bg-primary-container text-primary font-medium" : "text-on-surface-variant hover:bg-surface-container"
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
  const page = "arsip.html";
  document.getElementById("bottom-nav").innerHTML = items
    .map((i) => `
    <a href="${i.href}" class="flex flex-col items-center justify-center py-2 text-[10px] gap-0.5 ${
      i.href === page ? "text-primary" : "text-on-surface-variant"
    }">
      <span class="material-symbols-outlined text-xl">${i.icon}</span>${i.label}
    </a>`)
    .join("");
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

async function loadArsip() {
  try {
    const snap = await getDocs(query(collection(db, "informasi"), orderBy("createdAt", "desc")));
    DAFTAR_ARSIP = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    DAFTAR_ARSIP.forEach((a) => {
      if (a.kategori) KATEGORI_SET.add(a.kategori);
    });
    renderKategoriSelect();
    renderList(DAFTAR_ARSIP);
  } catch (e) {
    console.error("[Arsip] Load gagal:", e);
    document.getElementById("arsip-content").innerHTML = `
      <div class="glass rounded-2xl p-10 text-center">
        <span class="material-symbols-outlined text-5xl text-error mb-3">error</span>
        <p class="text-sm text-on-surface-variant">Gagal memuat arsip. Silakan refresh halaman.</p>
      </div>`;
  }
}

function renderKategoriSelect() {
  const sel = document.getElementById("arsip-kategori");
  if (!sel) return;
  const opt = Array.from(KATEGORI_SET).sort();
  sel.innerHTML = `<option value="">Semua Kategori</option>` + opt.map((k) => `<option value="${esc(k)}">${esc(k)}</option>`).join("");
}

function renderList(list) {
  const el = document.getElementById("arsip-content");
  if (!list.length) {
    el.innerHTML = `
      <div class="glass rounded-2xl p-10 text-center">
        <span class="material-symbols-outlined text-5xl text-on-surface-variant mb-3 opacity-40">folder_open</span>
        <p class="text-sm text-on-surface-variant">Tidak ada dokumen</p>
      </div>`;
    return;
  }

  el.innerHTML = list
    .map((a) => `
    <div class="glass rounded-2xl p-5 border-l-4 border-tertiary">
      <div class="flex items-start justify-between gap-4 mb-3">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap mb-1">
            <h3 class="font-headline font-semibold text-lg">${esc(a.judul)}</h3>
            ${a.kategori ? `<span class="text-[10px] px-2 py-0.5 rounded-full bg-tertiary/20 text-tertiary">${esc(a.kategori)}</span>` : ""}
          </div>
          ${a.deskripsi ? `<p class="text-sm text-on-surface-variant mb-2">${esc(a.deskripsi)}</p>` : ""}
          <div class="flex flex-wrap gap-2 text-[10px] text-on-surface-variant">
            ${a.penulis ? `<span>📝 ${esc(a.penulis)}</span>` : ""}
            <span>📅 ${formatTanggal(a.createdAt)}</span>
            ${a.downloadUrl ? `<span class="text-green-400">✓ File tersedia</span>` : ""}
          </div>
        </div>
        ${a.downloadUrl ? `<a href="${esc(a.downloadUrl)}" target="_blank" class="shrink-0 px-4 py-2 rounded-lg bg-primary text-on-primary text-xs font-medium hover:bg-primary-container transition flex items-center gap-1">
          <span class="material-symbols-outlined text-sm">download</span> Unduh
        </a>` : ""}
      </div>
    </div>`)
    .join("");
}

function filterList() {
  const search = document.getElementById("arsip-search")?.value.toLowerCase() || "";
  const kategori = document.getElementById("arsip-kategori")?.value || "";

  let filtered = DAFTAR_ARSIP;
  if (search) {
    filtered = filtered.filter(
      (a) =>
        (a.judul || "").toLowerCase().includes(search) ||
        (a.deskripsi || "").toLowerCase().includes(search)
    );
  }
  if (kategori) {
    filtered = filtered.filter((a) => a.kategori === kategori);
  }

  renderList(filtered);
}

(async function init() {
  try {
    const { uid, profile } = await protectPage();
    ME = { uid, profile };

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

    // Notifikasi
    initNotifikasi(uid, profile);
    document.getElementById("btn-notif")?.addEventListener("click", bukaPanelNotif);

    // Filter
    document.getElementById("arsip-search")?.addEventListener("input", filterList);
    document.getElementById("arsip-kategori")?.addEventListener("change", filterList);
    document.getElementById("btn-filter-reset")?.addEventListener("click", () => {
      document.getElementById("arsip-search").value = "";
      document.getElementById("arsip-kategori").value = "";
      filterList();
    });

    // Load data
    await loadArsip();
  } catch (e) {
    console.error("[Arsip Init] gagal:", e);
    document.getElementById("arsip-content").innerHTML = `
      <div class="glass rounded-2xl p-10 text-center">
        <span class="material-symbols-outlined text-5xl text-error mb-3">lock</span>
        <p class="text-sm text-on-surface-variant">Akses ditolak atau terjadi kesalahan.</p>
      </div>`;
  }
})();
