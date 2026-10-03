/**
 * SP-PPT — Modul Struktur Kerabat Kerja
 */

import { auth, db } from "./firebase-init.js";
import { collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { protectPage } from "./router.js";
import { showToast, skeleton, esc, warnaPeran, inisial, logActivity } from "./utils.js";

let ME = null;
let ANGGOTA = [];

const URUTAN_DIVISI = [
  "Pengurus Inti", "Artistik",
  "Perlengkapan", "Publikasi & Dokumentasi",
  "Tata Panggung", "Tata Rias", "Tata Busana",
  "Tata Musik & Suara", "Pemeran",
];

const WARNA_DIVISI = {
  "Pengurus Inti": "border-secondary",
  "Artistik": "border-secondary",
  "Perlengkapan": "border-tertiary",
  "Publikasi & Dokumentasi": "border-tertiary",
  "Tata Panggung": "border-tertiary",
  "Tata Rias": "border-tertiary",
  "Tata Busana": "border-tertiary",
  "Tata Musik & Suara": "border-tertiary",
  "Pemeran": "border-primary",
};

/* =========================================================
 * RENDER STRUKTUR
 * ========================================================= */
function renderStruktur(filter = "") {
  const container = document.getElementById("struktur-container");
  const list = filter
    ? ANGGOTA.filter((a) => (a.nama || "").toLowerCase().includes(filter.toLowerCase()))
    : ANGGOTA;

  if (!list.length) {
    container.innerHTML = `<div class="glass rounded-2xl p-10 text-center">
      <span class="material-symbols-outlined text-5xl text-on-surface-variant mb-3">person_search</span>
      <p class="text-sm text-on-surface-variant">Tidak ada anggota ditemukan</p>
    </div>`;
    return;
  }

  // Kelompokkan per divisi
  const grup = {};
  list.forEach((a) => {
    const d = a.divisi || "Lainnya";
    if (!grup[d]) grup[d] = [];
    grup[d].push(a);
  });

  const urutDiv = [...new Set([...URUTAN_DIVISI, ...Object.keys(grup)])];
  container.innerHTML = urutDiv
    .filter((d) => grup[d]?.length)
    .map((d) => {
      const anggota = grup[d].sort((a, b) => (a.nama || "").localeCompare(b.nama || ""));
      return `
      <div class="glass rounded-2xl p-5 border-l-4 ${WARNA_DIVISI[d] || "border-outline-variant"}">
        <h3 class="font-headline font-semibold mb-4 flex items-center gap-2">
          <span class="material-symbols-outlined text-primary">group</span>
          Divisi ${esc(d)} <span class="text-xs text-on-surface-variant">(${anggota.length})</span>
        </h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          ${anggota.map((a) => {
            const isMe = a.uid === ME.uid;
            return `
            <div class="p-3 rounded-xl bg-surface-container hover:bg-surface-container-high transition ${isMe ? "ring-2 ring-primary" : ""}">
              <div class="flex items-start gap-3">
                <div class="w-12 h-12 rounded-full bg-primary-container text-primary flex items-center justify-center font-bold border border-outline-variant/40">
                  ${inisial(a.nama)}
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-1 flex-wrap">
                    <p class="text-sm font-medium truncate">${esc(a.nama)}</p>
                    ${isMe ? `<span class="text-[9px] px-1.5 py-0.5 rounded-full bg-primary text-on-primary font-bold">ANDA</span>` : ""}
                  </div>
                  <span class="text-[10px] px-2 py-0.5 rounded-full border ${warnaPeran(a.peran)} inline-block mt-1">${esc(a.peran)}</span>
                  <p class="text-[10px] text-on-surface-variant mt-1">${esc(a.kelas || "")}</p>
                </div>
              </div>
              ${a.whatsapp ? `
                <a href="https://wa.me/${a.whatsapp}" target="_blank" class="mt-2 w-full py-1.5 rounded-lg bg-green-600/20 hover:bg-green-600/30 text-green-400 text-[11px] font-medium flex items-center justify-center gap-1">
                  <span class="material-symbols-outlined text-sm">chat</span> WhatsApp
                </a>` : ""}
            </div>`;
          }).join("")}
        </div>
      </div>`;
    })
    .join("");
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
    { icon: "groups", label: "Struktur", href: "struktur.html" },
    { icon: "folder", label: "Arsip", href: "arsip.html" },
    { icon: "support_agent", label: "Aduan", href: "aduan.html" },
    { icon: "description", label: "Rapor", href: "rapor.html" },
  ];
  document.getElementById("sidebar-nav").innerHTML = menu.map((m) => `
    <a href="${m.href}" class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition text-sm ${m.href === "struktur.html" ? "bg-primary-container text-primary font-medium" : "text-on-surface-variant hover:bg-surface-container"}">
      <span class="material-symbols-outlined text-xl">${m.icon}</span>${m.label}
    </a>`).join("");

  document.getElementById("header-avatar").textContent = inisial(profile.nama);
  const badge = document.getElementById("badge-role");
  badge.className = `hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${warnaPeran(profile.peran)}`;
  badge.textContent = profile.peran;

  document.getElementById("bottom-nav").innerHTML = [
    { icon: "dashboard", label: "Home", href: "dashboard.html" },
    { icon: "grade", label: "Nilai", href: "nilai.html" },
    { icon: "calendar_month", label: "Jadwal", href: "jadwal.html" },
    { icon: "checklist", label: "Tugas", href: "checklist.html" },
    { icon: "groups", label: "Kerabat", href: "struktur.html" },
  ].map((i) => `<a href="${i.href}" class="flex flex-col items-center justify-center py-2 text-[10px] gap-0.5 ${i.href === "struktur.html" ? "text-primary" : "text-on-surface-variant"}"><span class="material-symbols-outlined text-xl">${i.icon}</span>${i.label}</a>`).join("");

  const html = document.documentElement;
  const saved = localStorage.getItem("theme");
  if (saved === "light") html.classList.remove("dark");
  const btnT = document.getElementById("btn-theme"), iconT = document.getElementById("theme-icon");
  const setIcon = () => (iconT.textContent = html.classList.contains("dark") ? "light_mode" : "dark_mode");
  setIcon();
  btnT.addEventListener("click", () => { html.classList.toggle("dark"); localStorage.setItem("theme", html.classList.contains("dark") ? "dark" : "light"); setIcon(); });
  document.getElementById("btn-logout").addEventListener("click", async () => { if (confirm("Keluar?")) { await logActivity(ME.uid, "logout"); await signOut(auth); window.location.replace("index.html"); } });
  document.getElementById("btn-menu").addEventListener("click", () => { const sb = document.getElementById("sidebar"); sb.classList.toggle("hidden"); sb.classList.toggle("flex"); });

  // Load anggota
  const snap = await getDocs(query(collection(db, "users"), where("role", "==", "siswa")));
  ANGGOTA = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));

  // Kelas info
  const kelasSet = new Set(ANGGOTA.map((a) => a.kelas));
  document.getElementById("judul-kelas").textContent = kelasSet.size === 1 ? `Kerabat Kerja ${[...kelasSet][0]}` : "Kerabat Kerja Semua Kelas";
  document.getElementById("jumlah-anggota").textContent = `${ANGGOTA.length} anggota · ${kelasSet.size} kelas`;

  renderStruktur();

  // Search
  document.getElementById("search-anggota").addEventListener("input", (e) => renderStruktur(e.target.value));

  // Kontak saya
  document.getElementById("btn-kontak-saya").addEventListener("click", () => {
    const atasan = ANGGOTA.filter((a) => {
      const d = a.divisi;
      if (ME.profile.peran.startsWith("Anggota")) return a.peran === `Koordinator ${d}`;
      if (ME.profile.peran === "Pemain") return ["Sutradara", "Asisten Sutradara"].includes(a.peran);
      if (ME.profile.peran.startsWith("Koordinator")) return a.peran === "Pimpinan Produksi";
      return false;
    });
    const bawahan = ANGGOTA.filter((a) => {
      if (ME.profile.peran.startsWith("Koordinator")) return a.divisi === ME.profile.divisi && a.uid !== ME.uid;
      if (ME.profile.peran === "Sutradara") return a.peran === "Pemain";
      if (ME.profile.peran === "Pimpinan Produksi") return a.peran.startsWith("Koordinator");
      return false;
    });
    alert(`👤 ATASAN LANGSUNG:\n${atasan.map((a) => `• ${a.nama} (${a.peran}) - wa.me/${a.whatsapp}`).join("\n") || "-"}\n\n👥 BAWAHAN LANGSUNG:\n${bawahan.map((a) => `• ${a.nama} (${a.peran})`).join("\n") || "-"}`);
  });

  // Share WA
  document.getElementById("btn-share-wa").addEventListener("click", () => {
    const teks = `*Struktur Kerabat Kerja SP-PPT*\n\n` + ANGGOTA.map((a) => `• ${a.nama} — ${a.peran} (${a.divisi})`).join("\n");
    const url = `https://wa.me/?text=${encodeURIComponent(teks)}`;
    window.open(url, "_blank");
  });
})();
