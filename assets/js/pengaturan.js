/**
 * SP-PPT — Modul Pengaturan & Aksesibilitas
 * Tema, warna aksen, aksesibilitas, mode fokus, hemat data, bahasa, install PWA
 */

import { auth, db } from "./firebase-init.js";
import {
  doc, getDoc, updateDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signOut, updatePassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { protectPage } from "./router.js";
import { showToast, esc, warnaPeran, inisial, logActivity, openModal, closeModal } from "./utils.js";

let ME = null;

const AKSEN_LIST = [
  { id: "indigo", label: "Indigo (Default)", color: "#c4c1fb" },
  { id: "biru", label: "Biru", color: "#7eb8ff" },
  { id: "hijau", label: "Hijau", color: "#9be89b" },
  { id: "ungu", label: "Ungu", color: "#d9a7ff" },
  { id: "merah", label: "Merah", color: "#ff8e8e" },
  { id: "oranye", label: "Oranye", color: "#ffbe7d" },
];

const LANG_LIST = [
  { id: "id", label: "Bahasa Indonesia" },
  { id: "en", label: "English" },
  { id: "jv", label: "Basa Jawa" },
];

/* =========================================================
 * RENDER
 * ========================================================= */
async function render() {
  const c = document.getElementById("content");

  // Ambil preferensi
  const pref = {
    theme: localStorage.getItem("theme") || "dark",
    aksen: localStorage.getItem("aksen") || "indigo",
    aksesibilitas: localStorage.getItem("aksesibilitas") === "1",
    modeFokus: localStorage.getItem("modeFokus") === "1",
    hematData: localStorage.getItem("hematData") === "1",
    bahasa: localStorage.getItem("bahasa") || "id",
    fontSize: localStorage.getItem("fontSize") || "normal",
  };

  c.innerHTML = `
    <!-- TEMA & AKSEN -->
    <div class="glass rounded-2xl p-5">
      <h3 class="font-headline font-semibold mb-4 flex items-center gap-2">
        <span class="material-symbols-outlined text-primary">palette</span> Tema & Warna
      </h3>

      <div class="mb-4">
        <p class="text-xs text-on-surface-variant mb-2">Mode Tema</p>
        <div class="grid grid-cols-3 gap-2">
          ${[
            { id: "light", label: "Terang", icon: "light_mode" },
            { id: "dark", label: "Gelap", icon: "dark_mode" },
            { id: "auto", label: "Otomatis", icon: "contrast" },
          ].map((m) => `
            <button data-theme="${m.id}" class="theme-btn p-3 rounded-xl border text-xs font-medium flex flex-col items-center gap-1 ${
              pref.theme === m.id ? "bg-primary-container text-primary border-primary/40" : "bg-surface-container border-outline-variant/40"
            }">
              <span class="material-symbols-outlined">${m.icon}</span>
              ${m.label}
            </button>
          `).join("")}
        </div>
      </div>

      <div>
        <p class="text-xs text-on-surface-variant mb-2">Warna Aksen</p>
        <div class="flex flex-wrap gap-2">
          ${AKSEN_LIST.map((a) => `
            <button data-aksen="${a.id}" class="aksen-btn w-10 h-10 rounded-full border-2 ${pref.aksen === a.id ? "border-white" : "border-transparent"} transition" style="background:${a.color}" title="${a.label}"></button>
          `).join("")}
        </div>
      </div>
    </div>

    <!-- AKSESIBILITAS -->
    <div class="glass rounded-2xl p-5">
      <h3 class="font-headline font-semibold mb-4 flex items-center gap-2">
        <span class="material-symbols-outlined text-primary">accessibility</span> Aksesibilitas
      </h3>

      <div class="space-y-3">
        <label class="flex items-center justify-between p-3 rounded-xl bg-surface-container cursor-pointer">
          <div>
            <p class="text-sm font-medium">Mode Aksesibilitas</p>
            <p class="text-xs text-on-surface-variant">Font lebih besar, kontras tinggi</p>
          </div>
          <input type="checkbox" id="t-akses" ${pref.aksesibilitas ? "checked" : ""} class="toggle w-10 h-5 rounded-full appearance-none bg-surface-container-high checked:bg-primary relative transition" />
        </label>

        <div class="p-3 rounded-xl bg-surface-container">
          <p class="text-sm font-medium mb-2">Ukuran Font</p>
          <div class="grid grid-cols-3 gap-2">
            ${["normal", "besar", "sangat-besar"].map((f) => `
              <button data-font="${f}" class="font-btn px-2 py-2 rounded-lg border text-xs ${pref.fontSize === f ? "bg-primary-container text-primary border-primary/40" : "bg-surface-container-high border-outline-variant/40"}">
                ${f === "normal" ? "Normal" : f === "besar" ? "Besar" : "Sangat Besar"}
              </button>
            `).join("")}
          </div>
        </div>

        <label class="flex items-center justify-between p-3 rounded-xl bg-surface-container cursor-pointer">
          <div>
            <p class="text-sm font-medium">Mode Fokus</p>
            <p class="text-xs text-on-surface-variant">Sembunyikan elemen non-esensial</p>
          </div>
          <input type="checkbox" id="t-fokus" ${pref.modeFokus ? "checked" : ""} class="toggle w-10 h-5 rounded-full appearance-none bg-surface-container-high checked:bg-primary relative transition" />
        </label>

        <label class="flex items-center justify-between p-3 rounded-xl bg-surface-container cursor-pointer">
          <div>
            <p class="text-sm font-medium">Mode Hemat Data</p>
            <p class="text-xs text-on-surface-variant">Nonaktifkan animasi, kurangi ukuran gambar</p>
          </div>
          <input type="checkbox" id="t-hemat" ${pref.hematData ? "checked" : ""} class="toggle w-10 h-5 rounded-full appearance-none bg-surface-container-high checked:bg-primary relative transition" />
        </label>
      </div>
    </div>

    <!-- BAHASA -->
    <div class="glass rounded-2xl p-5">
      <h3 class="font-headline font-semibold mb-4 flex items-center gap-2">
        <span class="material-symbols-outlined text-primary">language</span> Bahasa
      </h3>
      <div class="grid grid-cols-3 gap-2">
        ${LANG_LIST.map((l) => `
          <button data-lang="${l.id}" class="lang-btn px-3 py-2 rounded-lg border text-xs ${pref.bahasa === l.id ? "bg-primary-container text-primary border-primary/40" : "bg-surface-container border-outline-variant/40"}">${l.label}</button>
        `).join("")}
      </div>
    </div>

    <!-- PWA INSTALL -->
    <div class="glass rounded-2xl p-5">
      <h3 class="font-headline font-semibold mb-4 flex items-center gap-2">
        <span class="material-symbols-outlined text-primary">install_mobile</span> Install Aplikasi
      </h3>
      <p class="text-xs text-on-surface-variant mb-3">Pasang SP-PPT di layar utama HP Anda untuk akses cepat.</p>
      <button id="btn-install" class="w-full py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium flex items-center justify-center gap-2">
        <span class="material-symbols-outlined">download</span> Install SP-PPT
      </button>
      <p id="install-status" class="text-xs text-on-surface-variant mt-2 text-center"></p>
    </div>

    <!-- AKUN -->
    <div class="glass rounded-2xl p-5">
      <h3 class="font-headline font-semibold mb-4 flex items-center gap-2">
        <span class="material-symbols-outlined text-primary">manage_accounts</span> Akun
      </h3>
      <div class="space-y-2">
        <div class="p-3 rounded-xl bg-surface-container">
          <p class="text-xs text-on-surface-variant">Nama</p>
          <p class="text-sm font-medium">${esc(ME.profile.nama)}</p>
        </div>
        <div class="p-3 rounded-xl bg-surface-container">
          <p class="text-xs text-on-surface-variant">Email</p>
          <p class="text-sm font-medium">${esc(ME.profile.email || "-")}</p>
        </div>
        <div class="p-3 rounded-xl bg-surface-container">
          <p class="text-xs text-on-surface-variant">Peran</p>
          <p class="text-sm font-medium">${esc(ME.profile.peran)}</p>
        </div>
        <button id="btn-ganti-pass" class="w-full py-2.5 rounded-lg bg-surface-container-high text-sm font-medium flex items-center justify-center gap-2">
          <span class="material-symbols-outlined text-sm">lock</span> Ganti Password
        </button>
      </div>
    </div>

    <!-- TENTANG -->
    <div class="glass rounded-2xl p-5 text-center">
      <img src="https://iili.io/nBiviCX.png" class="w-12 h-12 mx-auto mb-2" />
      <p class="font-headline font-bold text-sm">SP-PPT v1.0.0</p>
      <p class="text-xs text-on-surface-variant mt-1">Sistem Penilaian & Manajemen Produksi Teater</p>
      <p class="text-[10px] text-on-surface-variant mt-2">SMP Negeri 10 Samarinda · 2025</p>
    </div>
  `;

  bindEvents(pref);
}

/* =========================================================
 * BIND EVENTS
 * ========================================================= */
function bindEvents(pref) {
  // Tema
  document.querySelectorAll(".theme-btn").forEach((b) =>
    b.addEventListener("click", () => {
      const t = b.dataset.theme;
      localStorage.setItem("theme", t);
      applyTheme(t);
      render();
      showToast("Tema diubah.", "success");
    })
  );

  // Aksen
  document.querySelectorAll(".aksen-btn").forEach((b) =>
    b.addEventListener("click", () => {
      const a = b.dataset.aksen;
      localStorage.setItem("aksen", a);
      applyAksen(a);
      render();
      showToast("Warna aksen diubah.", "success");
    })
  );

  // Aksesibilitas
  document.getElementById("t-akses")?.addEventListener("change", (e) => {
    localStorage.setItem("aksesibilitas", e.target.checked ? "1" : "0");
    applyAksesibilitas(e.target.checked);
    showToast(e.target.checked ? "Mode aksesibilitas aktif." : "Mode aksesibilitas nonaktif.", "info");
  });

  document.getElementById("t-fokus")?.addEventListener("change", (e) => {
    localStorage.setItem("modeFokus", e.target.checked ? "1" : "0");
    applyModeFokus(e.target.checked);
    showToast(e.target.checked ? "Mode fokus aktif." : "Mode fokus nonaktif.", "info");
  });

  document.getElementById("t-hemat")?.addEventListener("change", (e) => {
    localStorage.setItem("hematData", e.target.checked ? "1" : "0");
    applyHematData(e.target.checked);
    showToast(e.target.checked ? "Mode hemat data aktif." : "Mode hemat data nonaktif.", "info");
  });

  // Font size
  document.querySelectorAll(".font-btn").forEach((b) =>
    b.addEventListener("click", () => {
      const f = b.dataset.font;
      localStorage.setItem("fontSize", f);
      applyFontSize(f);
      render();
    })
  );

  // Bahasa
  document.querySelectorAll(".lang-btn").forEach((b) =>
    b.addEventListener("click", () => {
      localStorage.setItem("bahasa", b.dataset.lang);
      showToast("Bahasa disimpan. (Terjemahan penuh butuh waktu)", "info");
      render();
    })
  );

  // Install PWA
  document.getElementById("btn-install")?.addEventListener("click", async () => {
    if (window.deferredPrompt) {
      window.deferredPrompt.prompt();
      const { outcome } = await window.deferredPrompt.userChoice;
      document.getElementById("install-status").textContent = outcome === "accepted" ? "Aplikasi terinstall!" : "Install dibatalkan";
      window.deferredPrompt = null;
    } else {
      document.getElementById("install-status").textContent = "Aplikasi sudah terinstall atau browser tidak mendukung.";
    }
  });

  // Ganti password
  document.getElementById("btn-ganti-pass")?.addEventListener("click", () => {
    document.getElementById("modal-title")?.remove();
    const c = document.getElementById("content");
    const modal = document.createElement("div");
    modal.id = "modal-pass";
    modal.className = "fixed inset-0 z-50 flex items-center justify-center p-4";
    modal.innerHTML = `
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" data-close-pass></div>
      <div class="relative glass rounded-2xl max-w-md w-full p-6">
        <h3 class="font-headline font-semibold mb-4">Ganti Password</h3>
        <div class="space-y-3">
          <input id="pass-baru" type="password" minlength="8" placeholder="Password baru (min 8)" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
          <input id="pass-konf" type="password" minlength="8" placeholder="Konfirmasi password" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
          <div class="flex gap-2">
            <button data-close-pass class="flex-1 py-2.5 rounded-lg bg-surface-container-high text-sm">Batal</button>
            <button id="pass-submit" class="flex-1 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium">Simpan</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);

    modal.querySelectorAll("[data-close-pass]").forEach((el) =>
      el.addEventListener("click", () => modal.remove())
    );

    document.getElementById("pass-submit").addEventListener("click", async () => {
      const p1 = document.getElementById("pass-baru").value;
      const p2 = document.getElementById("pass-konf").value;
      if (p1.length < 8) return showToast("Minimal 8 karakter.", "warning");
      if (p1 !== p2) return showToast("Password tidak cocok.", "warning");
      try {
        await updatePassword(auth.currentUser, p1);
        await logActivity(ME.uid, "ganti_password");
        showToast("Password berhasil diubah!", "success");
        modal.remove();
      } catch (e) {
        showToast("Gagal ubah password. Login ulang diperlukan.", "error");
      }
    });
  });
}

/* =========================================================
 * APPLY FUNCTIONS
 * ========================================================= */
function applyTheme(t) {
  const html = document.documentElement;
  if (t === "light") html.classList.remove("dark");
  else if (t === "dark") html.classList.add("dark");
  else {
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    html.classList.toggle("dark", isDark);
  }
}

function applyAksen(a) {
  const warna = AKSEN_LIST.find((x) => x.id === a)?.color || "#c4c1fb";
  document.documentElement.style.setProperty("--primary", warna);
}

function applyAksesibilitas(aktif) {
  document.documentElement.classList.toggle("aksesibilitas", aktif);
  document.body.classList.toggle("kontras-tinggi", aktif);
}

function applyModeFokus(aktif) {
  document.body.classList.toggle("mode-fokus", aktif);
}

function applyHematData(aktif) {
  document.body.classList.toggle("hemat-data", aktif);
}

function applyFontSize(f) {
  document.documentElement.classList.remove("font-besar", "font-sangat-besar");
  if (f === "besar") document.documentElement.classList.add("font-besar");
  if (f === "sangat-besar") document.documentElement.classList.add("font-sangat-besar");
}

/* =========================================================
 * INIT
 * ========================================================= */
(async function init() {
  const { uid, profile } = await protectPage();
  ME = { uid, profile };

  const menu = [
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
  document.getElementById("sidebar-nav").innerHTML = menu.map((m) => `
    <a href="${m.href}" class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition text-sm ${
      m.href === "pengaturan.html" ? "bg-primary-container text-primary font-medium" : "text-on-surface-variant hover:bg-surface-container"
    }"><span class="material-symbols-outlined text-xl">${m.icon}</span>${m.label}</a>`).join("");

  document.getElementById("header-avatar").textContent = inisial(profile.nama);
  const badge = document.getElementById("badge-role");
  badge.className = `hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${warnaPeran(profile.peran)}`;
  badge.textContent = profile.peran;

  document.getElementById("bottom-nav").innerHTML = [
    { icon: "dashboard", label: "Home", href: "dashboard.html" },
    { icon: "grade", label: "Nilai", href: "nilai.html" },
    { icon: "calendar_month", label: "Jadwal", href: "jadwal.html" },
    { icon: "checklist", label: "Tugas", href: "checklist.html" },
    { icon: "settings", label: "Setting", href: "pengaturan.html" },
  ].map((i) => `<a href="${i.href}" class="flex flex-col items-center justify-center py-2 text-[10px] gap-0.5 ${
    i.href === "pengaturan.html" ? "text-primary" : "text-on-surface-variant"
  }"><span class="material-symbols-outlined text-xl">${i.icon}</span>${i.label}</a>`).join("");

  document.getElementById("btn-logout").addEventListener("click", async () => {
    if (confirm("Keluar?")) { await logActivity(ME.uid, "logout"); await signOut(auth); window.location.replace("index.html"); }
  });
  document.getElementById("btn-menu").addEventListener("click", () => {
    const sb = document.getElementById("sidebar"); sb.classList.toggle("hidden"); sb.classList.toggle("flex");
  });

  // Terapkan preferensi saat init
  applyTheme(localStorage.getItem("theme") || "dark");
  applyAksen(localStorage.getItem("aksen") || "indigo");
  applyAksesibilitas(localStorage.getItem("aksesibilitas") === "1");
  applyModeFokus(localStorage.getItem("modeFokus") === "1");
  applyHematData(localStorage.getItem("hematData") === "1");
  applyFontSize(localStorage.getItem("fontSize") || "normal");

  // PWA install prompt capture
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    window.deferredPrompt = e;
    const status = document.getElementById("install-status");
    if (status) status.textContent = "Siap untuk diinstall!";
  });

  await render();
})();
