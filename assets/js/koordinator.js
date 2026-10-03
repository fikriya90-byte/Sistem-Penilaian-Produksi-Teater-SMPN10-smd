/**
 * SP-PPT — Modul Koordinator Divisi (6 Divisi Dinamis)
 * Menyesuaikan konten berdasarkan divisi user:
 * - Perlengkapan: Properti, Inventaris, Bahan
 * - Publikasi & Dokumentasi: Konten, Poster, Media Library, Aftermovie
 * - Tata Panggung: Desain Set, Konstruksi, Gladi Kering
 * - Tata Rias: Desain Rias, Higienitas, Fitting, Touch-up
 * - Tata Busana: Desain Kostum, Proses Produksi, Fitting, Quick Change
 * - Tata Musik & Suara: Konsep Musik, Cue Sheet, Audio Library, Check Sound
 */

import { auth, db } from "./firebase-init.js";
import {
  doc, getDoc, addDoc, updateDoc, deleteDoc,
  collection, query, where, getDocs, orderBy, serverTimestamp, limit,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { protectPage } from "./router.js";
import {
  showToast, openModal, closeModal, skeleton, formatTanggal, esc,
  warnaPeran, inisial, logActivity, waktuRelatif,
} from "./utils.js";
import { initNotifikasi, bukaPanelNotif, kirimNotifikasiBanyak, kirimNotifikasi } from "./notifikasi.js";

let ME = null;
let DIVISI = "";
let TAB = "utama";
let ANGGOTA = [];
let TIMER = null;
let TIMER_DETIK = 0;

const TABS_PER_DIVISI = {
  Perlengkapan: [
    { id: "properti", label: "Properti", icon: "chair" },
    { id: "inventaris", label: "Inventaris", icon: "inventory_2" },
    { id: "bahan", label: "Bahan", icon: "category" },
  ],
  "Publikasi & Dokumentasi": [
    { id: "konten", label: "Strategi Konten", icon: "campaign" },
    { id: "poster", label: "Poster & Logo", icon: "image" },
    { id: "media", label: "Media Library", icon: "photo_library" },
    { id: "aftermovie", label: "Aftermovie", icon: "movie" },
  ],
  "Tata Panggung": [
    { id: "desain-set", label: "Desain Set", icon: "architecture" },
    { id: "konstruksi", label: "Konstruksi", icon: "construction" },
    { id: "gladi-kering", label: "Gladi Kering", icon: "timer" },
  ],
  "Tata Rias": [
    { id: "desain-rias", label: "Desain Rias", icon: "brush" },
    { id: "higienitas", label: "Higienitas Alat", icon: "sanitizer" },
    { id: "fitting", label: "Fitting", icon: "face_retouching_natural" },
    { id: "touchup", label: "Touch-Up Live", icon: "auto_fix_high" },
  ],
  "Tata Busana": [
    { id: "kostum", label: "Desain Kostum", icon: "checkroom" },
    { id: "produksi", label: "Produksi", icon: "content_cut" },
    { id: "fitting-busana", label: "Fitting", icon: "straighten" },
    { id: "quick-change", label: "Quick Change", icon: "bolt" },
  ],
  "Tata Musik & Suara": [
    { id: "konsep-musik", label: "Konsep Musik", icon: "music_note" },
    { id: "cue-sheet", label: "Cue Sheet", icon: "queue_music" },
    { id: "audio-lib", label: "Audio Library", icon: "library_music" },
    { id: "check-sound", label: "Check Sound", icon: "hearing" },
  ],
};

const JENIS_MUSIK = [
  "Overture (Pembuka)", "Penutup", "Pergantian Babak", "Ilustrasi",
  "Sound Track", "Theme Song", "Penokohan", "Aksentuasi", "Setting", "Pelebur Emosi",
];

const FOLDER_KONTEN = ["H-30", "H-14", "H-7", "H-1", "Hari-H"];
const KATEGORI_MEDIA = ["Latihan", "Persiapan", "BTS", "Pertunjukan", "Poster"];

/* =========================================================
 * HELPERS
 * ========================================================= */
function isKoordinator() {
  return ME.profile.peran.startsWith("Koordinator");
}

function renderTabs() {
  const c = document.getElementById("tabs-container");
  const tabs = TABS_PER_DIVISI[DIVISI] || [];
  c.innerHTML = tabs.map((t) => `
    <button data-tab="${t.id}" class="tab-btn px-4 py-2 rounded-xl text-sm font-medium transition flex items-center gap-1.5 ${
      t.id === TAB ? "bg-primary-container text-primary" : "text-on-surface-variant hover:bg-surface-container"
    }">
      <span class="material-symbols-outlined text-base">${t.icon}</span> ${t.label}
    </button>
  `).join("");

  c.querySelectorAll(".tab-btn").forEach((b) =>
    b.addEventListener("click", () => {
      TAB = b.dataset.tab;
      renderTabs();
      renderTabContent();
    })
  );
}

function renderTabContent() {
  const c = document.getElementById("tab-content");
  c.innerHTML = `<div class="glass rounded-2xl p-5">${skeleton(4)}</div>`;
  const renderer = RENDERERS[TAB];
  if (renderer) renderer(c);
  else c.innerHTML = `<div class="glass rounded-2xl p-10 text-center">
    <span class="material-symbols-outlined text-5xl text-on-surface-variant mb-3">construction</span>
    <p class="text-sm text-on-surface-variant">Fitur ini sedang dalam pengembangan</p>
  </div>`;
}

/* =========================================================
 * REUSABLE: CARD + CRUD GENERIC
 * ========================================================= */
async function loadKoleksi(nama) {
  try {
    const snap = await getDocs(query(collection(db, nama), where("kelas", "==", ME.profile.kelas), orderBy("createdAt", "desc"), limit(100)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    const snap = await getDocs(query(collection(db, nama), where("kelas", "==", ME.profile.kelas)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
}

async function hapusItem(nama, id, onDone) {
  if (!confirm("Hapus item ini?")) return;
  await deleteDoc(doc(db, nama, id));
  showToast("Item dihapus.", "success");
  onDone();
}

function cardItem({ title, subtitle, badge, badgeColor, actions, content }) {
  return `
  <div class="p-3 rounded-xl bg-surface-container border border-outline-variant/40">
    <div class="flex items-start justify-between gap-2 mb-1">
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium truncate">${esc(title)}</p>
        ${subtitle ? `<p class="text-xs text-on-surface-variant mt-0.5">${esc(subtitle)}</p>` : ""}
      </div>
      ${badge ? `<span class="text-[10px] px-2 py-0.5 rounded-full ${badgeColor || "bg-surface-container-high"} whitespace-nowrap">${esc(badge)}</span>` : ""}
    </div>
    ${content || ""}
    ${actions ? `<div class="flex gap-2 mt-2">${actions}</div>` : ""}
  </div>`;
}

/* =========================================================
 * RENDERERS
 * ========================================================= */
const RENDERERS = {};

/* --- PERLENGKAPAN: PROPERTI --- */
RENDERERS.properti = async (c) => {
  const list = await loadKoleksi("properti");
  c.innerHTML = `
    <div class="glass rounded-2xl p-5">
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 class="font-headline font-semibold flex items-center gap-2">
          <span class="material-symbols-outlined text-secondary">chair</span> Manajemen Properti
        </h3>
        <button id="btn-add" class="px-3 py-2 rounded-lg bg-secondary text-on-secondary text-xs font-medium flex items-center gap-1">
          <span class="material-symbols-outlined text-sm">add</span> Tambah Properti
        </button>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        ${list.length ? list.map((p) => cardItem({
          title: p.nama,
          subtitle: `Adegan: ${p.adegan || "-"} | Bahan: ${p.bahan || "-"}`,
          badge: p.status || "Draft",
          badgeColor: p.status === "Selesai" ? "bg-green-600/20 text-green-400" : p.status === "Proses" ? "bg-yellow-500/20 text-yellow-400" : "bg-surface-container-high",
          content: p.pic ? `<p class="text-[10px] text-on-surface-variant mt-1">PIC: ${esc(p.pic)}</p>` : "",
          actions: `
            <button class="btn-edit px-2 py-1 rounded text-[10px] bg-surface-container-high" data-id="${p.id}">Edit</button>
            <button class="btn-del px-2 py-1 rounded text-[10px] bg-error/20 text-error" data-id="${p.id}">Hapus</button>
          `,
        })).join("") : `<p class="text-sm text-on-surface-variant text-center py-8 col-span-2">Belum ada properti</p>`}
      </div>
    </div>`;

  document.getElementById("btn-add").addEventListener("click", () => bukaFormProperti());
  c.querySelectorAll(".btn-del").forEach((b) =>
    b.addEventListener("click", () => hapusItem("properti", b.dataset.id, () => RENDERERS.properti(c)))
  );
  c.querySelectorAll(".btn-edit").forEach((b) =>
    b.addEventListener("click", () => {
      const item = list.find((x) => x.id === b.dataset.id);
      bukaFormProperti(item);
    })
  );
};

function bukaFormProperti(item = null) {
  document.getElementById("modal-title").textContent = item ? "Edit Properti" : "Tambah Properti";
  document.getElementById("modal-body").innerHTML = `
    <div class="space-y-3">
      <input id="f-nama" placeholder="Nama properti" value="${esc(item?.nama || "")}" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
      <input id="f-adegan" placeholder="Adegan" value="${esc(item?.adegan || "")}" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
      <input id="f-bahan" placeholder="Bahan" value="${esc(item?.bahan || "")}" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
      <input id="f-pic" placeholder="PIC (penanggung jawab)" value="${esc(item?.pic || "")}" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
      <select id="f-status" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm">
        ${["Draft", "Proses", "Selesai", "Revisi"].map((s) => `<option ${item?.status === s ? "selected" : ""}>${s}</option>`).join("")}
      </select>
      <input id="f-sketsa" type="url" placeholder="URL sketsa desain (opsional)" value="${esc(item?.sketsa || "")}" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
      <div class="flex gap-2">
        <button data-close-modal class="flex-1 py-2.5 rounded-lg bg-surface-container-high text-sm">Batal</button>
        <button id="f-submit" class="flex-1 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium">Simpan</button>
      </div>
    </div>`;
  openModal("modal-form");

  document.getElementById("f-submit").onclick = async () => {
    const data = {
      kelas: ME.profile.kelas,
      nama: document.getElementById("f-nama").value.trim(),
      adegan: document.getElementById("f-adegan").value.trim(),
      bahan: document.getElementById("f-bahan").value.trim(),
      pic: document.getElementById("f-pic").value.trim(),
      status: document.getElementById("f-status").value,
      sketsa: document.getElementById("f-sketsa").value.trim(),
      updatedAt: serverTimestamp(),
    };
    if (!data.nama) return showToast("Nama wajib diisi.", "warning");
    try {
      if (item) await updateDoc(doc(db, "properti", item.id), data);
      else { data.createdAt = serverTimestamp(); await addDoc(collection(db, "properti"), data); }
      showToast("Properti tersimpan!", "success");
      closeModal("modal-form");
      renderTabContent();
    } catch (e) { showToast("Gagal simpan.", "error"); }
  };
}

/* --- PERLENGKAPAN: INVENTARIS --- */
RENDERERS.inventaris = async (c) => {
  const list = await loadKoleksi("inventaris");
  c.innerHTML = `
    <div class="glass rounded-2xl p-5">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-headline font-semibold flex items-center gap-2">
          <span class="material-symbols-outlined text-secondary">inventory_2</span> Inventaris & Pengembalian
        </h3>
        <button id="btn-add" class="px-3 py-2 rounded-lg bg-secondary text-on-secondary text-xs font-medium flex items-center gap-1">
          <span class="material-symbols-outlined text-sm">add</span> Tambah
        </button>
      </div>
      <div class="space-y-2">
        ${list.length ? list.map((i) => cardItem({
          title: i.nama,
          subtitle: `${i.jenis || "-"} · Jumlah: ${i.jumlah || 1}`,
          badge: i.kondisi || "Baik",
          badgeColor: i.kondisi === "Hilang" ? "bg-error/20 text-error" : i.kondisi === "Rusak Berat" ? "bg-red-500/20 text-red-400" : i.kondisi === "Rusak Ringan" ? "bg-yellow-500/20 text-yellow-400" : "bg-green-600/20 text-green-400",
          actions: `<button class="btn-del px-2 py-1 rounded text-[10px] bg-error/20 text-error" data-id="${i.id}">Hapus</button>`,
        })).join("") : `<p class="text-sm text-on-surface-variant text-center py-8">Belum ada inventaris</p>`}
      </div>
    </div>`;

  document.getElementById("btn-add").addEventListener("click", () => {
    document.getElementById("modal-title").textContent = "Tambah Inventaris";
    document.getElementById("modal-body").innerHTML = `
      <div class="space-y-3">
        <input id="f-nama" placeholder="Nama barang" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <input id="f-jenis" placeholder="Jenis (Properti/Kostum/Alat)" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <input id="f-jumlah" type="number" placeholder="Jumlah" value="1" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <select id="f-kondisi" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm">
          <option>Baik</option><option>Rusak Ringan</option><option>Rusak Berat</option><option>Hilang</option>
        </select>
        <button id="f-submit" class="w-full py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium">Simpan</button>
      </div>`;
    openModal("modal-form");
    document.getElementById("f-submit").onclick = async () => {
      await addDoc(collection(db, "inventaris"), {
        kelas: ME.profile.kelas,
        nama: document.getElementById("f-nama").value.trim(),
        jenis: document.getElementById("f-jenis").value.trim(),
        jumlah: parseInt(document.getElementById("f-jumlah").value) || 1,
        kondisi: document.getElementById("f-kondisi").value,
        createdAt: serverTimestamp(),
      });
      showToast("Inventaris tersimpan!", "success");
      closeModal("modal-form");
      renderTabContent();
    };
  });
  c.querySelectorAll(".btn-del").forEach((b) =>
    b.addEventListener("click", () => hapusItem("inventaris", b.dataset.id, () => RENDERERS.inventaris(c)))
  );
};

/* --- PERLENGKAPAN: BAHAN --- */
const BAHAN_KATALOG = ["Kayu", "Kertas Mache", "Busa Poliuretan", "Kain", "Logam", "Plastik", "Keramik", "Bambu"];
RENDERERS.bahan = async (c) => {
  const list = await loadKoleksi("bahan");
  c.innerHTML = `
    <div class="glass rounded-2xl p-5">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-headline font-semibold flex items-center gap-2">
          <span class="material-symbols-outlined text-secondary">category</span> Katalog Bahan
        </h3>
        <button id="btn-add" class="px-3 py-2 rounded-lg bg-secondary text-on-secondary text-xs font-medium flex items-center gap-1">
          <span class="material-symbols-outlined text-sm">add</span> Tambah Bahan
        </button>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        ${BAHAN_KATALOG.map((b) => `<div class="p-2 rounded-lg bg-surface-container text-xs text-center">${b}</div>`).join("")}
      </div>
      <div class="space-y-2">
        ${list.length ? list.map((b) => cardItem({
          title: b.nama,
          subtitle: `Estimasi: Rp ${(b.biaya || 0).toLocaleString("id-ID")} · ${b.jumlah || 1} unit`,
          actions: `<button class="btn-del px-2 py-1 rounded text-[10px] bg-error/20 text-error" data-id="${b.id}">Hapus</button>`,
        })).join("") : `<p class="text-sm text-on-surface-variant text-center py-8">Belum ada data bahan</p>`}
      </div>
    </div>`;

  document.getElementById("btn-add").addEventListener("click", () => {
    document.getElementById("modal-title").textContent = "Tambah Bahan";
    document.getElementById("modal-body").innerHTML = `
      <div class="space-y-3">
        <input id="f-nama" placeholder="Nama bahan" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <input id="f-jumlah" type="number" placeholder="Jumlah" value="1" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <input id="f-biaya" type="number" placeholder="Estimasi biaya (Rp)" value="0" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <input id="f-nota" type="url" placeholder="URL nota pembelian (opsional)" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <button id="f-submit" class="w-full py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium">Simpan</button>
      </div>`;
    openModal("modal-form");
    document.getElementById("f-submit").onclick = async () => {
      await addDoc(collection(db, "bahan"), {
        kelas: ME.profile.kelas,
        nama: document.getElementById("f-nama").value.trim(),
        jumlah: parseInt(document.getElementById("f-jumlah").value) || 1,
        biaya: parseInt(document.getElementById("f-biaya").value) || 0,
        nota: document.getElementById("f-nota").value.trim(),
        createdAt: serverTimestamp(),
      });
      showToast("Bahan tersimpan!", "success");
      closeModal("modal-form");
      renderTabContent();
    };
  });
  c.querySelectorAll(".btn-del").forEach((b) =>
    b.addEventListener("click", () => hapusItem("bahan", b.dataset.id, () => RENDERERS.bahan(c)))
  );
};

/* --- PUBLIKASI: KONTEN --- */
RENDERERS.konten = async (c) => {
  const list = await loadKoleksi("konten");
  c.innerHTML = `
    <div class="glass rounded-2xl p-5">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-headline font-semibold flex items-center gap-2">
          <span class="material-symbols-outlined text-tertiary">campaign</span> Strategi & Kalender Konten
        </h3>
        <button id="btn-add" class="px-3 py-2 rounded-lg bg-tertiary text-on-tertiary text-xs font-medium flex items-center gap-1">
          <span class="material-symbols-outlined text-sm">add</span> Tambah Konten
        </button>
      </div>
      <div class="flex flex-wrap gap-2 mb-4">
        ${FOLDER_KONTEN.map((f) => `<span class="text-[10px] px-2 py-1 rounded bg-surface-container">${f}</span>`).join("")}
      </div>
      <div class="space-y-2">
        ${list.length ? list.map((k) => cardItem({
          title: k.judul,
          subtitle: `${k.platform || "-"} · ${k.target || "-"}`,
          badge: k.waktu || "-",
          badgeColor: "bg-tertiary/20 text-tertiary",
          content: k.caption ? `<p class="text-xs text-on-surface-variant mt-1 line-clamp-2">${esc(k.caption)}</p>` : "",
          actions: `<button class="btn-del px-2 py-1 rounded text-[10px] bg-error/20 text-error" data-id="${k.id}">Hapus</button>`,
        })).join("") : `<p class="text-sm text-on-surface-variant text-center py-8">Belum ada konten</p>`}
      </div>
    </div>`;

  document.getElementById("btn-add").addEventListener("click", () => {
    document.getElementById("modal-title").textContent = "Tambah Konten";
    document.getElementById("modal-body").innerHTML = `
      <div class="space-y-3">
        <input id="f-judul" placeholder="Judul konten" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <select id="f-waktu" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm">
          ${FOLDER_KONTEN.map((f) => `<option>${f}</option>`).join("")}
        </select>
        <input id="f-platform" placeholder="Platform (IG/TikTok/WA)" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <input id="f-target" placeholder="Target audiens" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <textarea id="f-caption" rows="3" placeholder="Caption & hashtag" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm"></textarea>
        <button id="f-submit" class="w-full py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium">Simpan</button>
      </div>`;
    openModal("modal-form");
    document.getElementById("f-submit").onclick = async () => {
      await addDoc(collection(db, "konten"), {
        kelas: ME.profile.kelas,
        judul: document.getElementById("f-judul").value.trim(),
        waktu: document.getElementById("f-waktu").value,
        platform: document.getElementById("f-platform").value.trim(),
        target: document.getElementById("f-target").value.trim(),
        caption: document.getElementById("f-caption").value.trim(),
        createdAt: serverTimestamp(),
      });
      showToast("Konten tersimpan!", "success");
      closeModal("modal-form");
      renderTabContent();
    };
  });
  c.querySelectorAll(".btn-del").forEach((b) =>
    b.addEventListener("click", () => hapusItem("konten", b.dataset.id, () => RENDERERS.konten(c)))
  );
};

/* --- PUBLIKASI: POSTER --- */
RENDERERS.poster = async (c) => {
  const list = await loadKoleksi("poster");
  c.innerHTML = `
    <div class="glass rounded-2xl p-5">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-headline font-semibold flex items-center gap-2">
          <span class="material-symbols-outlined text-tertiary">image</span> Galeri Poster & Logo
        </h3>
        <button id="btn-add" class="px-3 py-2 rounded-lg bg-tertiary text-on-tertiary text-xs font-medium flex items-center gap-1">
          <span class="material-symbols-outlined text-sm">add</span> Upload
        </button>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
        ${list.length ? list.map((p) => `
          <div class="rounded-xl overflow-hidden bg-surface-container border border-outline-variant/40">
            ${p.url ? `<img src="${esc(p.url)}" class="w-full h-40 object-cover" onerror="this.style.display='none'" />` : ""}
            <div class="p-2">
              <p class="text-xs font-medium truncate">${esc(p.nama)}</p>
              <p class="text-[10px] text-on-surface-variant">${waktuRelatif(p.createdAt)}</p>
              <div class="flex gap-1 mt-1">
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-tertiary/20 text-tertiary">${p.votes || 0} votes</span>
                <button class="btn-vote text-[10px] px-1.5 py-0.5 rounded bg-primary-container text-primary" data-id="${p.id}">Vote</button>
                <button class="btn-del text-[10px] px-1.5 py-0.5 rounded bg-error/20 text-error" data-id="${p.id}">Hapus</button>
              </div>
            </div>
          </div>
        `).join("") : `<p class="text-sm text-on-surface-variant text-center py-8 col-span-3">Belum ada poster</p>`}
      </div>
    </div>`;

  document.getElementById("btn-add").addEventListener("click", () => {
    document.getElementById("modal-title").textContent = "Upload Poster";
    document.getElementById("modal-body").innerHTML = `
      <div class="space-y-3">
        <input id="f-nama" placeholder="Nama poster/logo" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <input id="f-url" type="url" placeholder="URL gambar (max 5MB)" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <button id="f-submit" class="w-full py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium">Simpan</button>
      </div>`;
    openModal("modal-form");
    document.getElementById("f-submit").onclick = async () => {
      await addDoc(collection(db, "poster"), {
        kelas: ME.profile.kelas,
        nama: document.getElementById("f-nama").value.trim(),
        url: document.getElementById("f-url").value.trim(),
        votes: 0,
        createdAt: serverTimestamp(),
      });
      showToast("Poster tersimpan!", "success");
      closeModal("modal-form");
      renderTabContent();
    };
  });

  c.querySelectorAll(".btn-vote").forEach((b) =>
    b.addEventListener("click", async () => {
      const item = list.find((x) => x.id === b.dataset.id);
      await updateDoc(doc(db, "poster", item.id), { votes: (item.votes || 0) + 1 });
      showToast("Vote tersimpan!", "success");
      renderTabContent();
    })
  );
  c.querySelectorAll(".btn-del").forEach((b) =>
    b.addEventListener("click", () => hapusItem("poster", b.dataset.id, () => RENDERERS.poster(c)))
  );
};

/* --- PUBLIKASI: MEDIA --- */
RENDERERS.media = async (c) => {
  const list = await loadKoleksi("media");
  c.innerHTML = `
    <div class="glass rounded-2xl p-5">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-headline font-semibold flex items-center gap-2">
          <span class="material-symbols-outlined text-tertiary">photo_library</span> Media Library
        </h3>
        <button id="btn-add" class="px-3 py-2 rounded-lg bg-tertiary text-on-tertiary text-xs font-medium flex items-center gap-1">
          <span class="material-symbols-outlined text-sm">add</span> Upload Media
        </button>
      </div>
      <div class="flex flex-wrap gap-2 mb-4">
        ${KATEGORI_MEDIA.map((k) => `<span class="text-[10px] px-2 py-1 rounded bg-surface-container">#${k}</span>`).join("")}
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
        ${list.length ? list.map((m) => `
          <div class="rounded-lg overflow-hidden bg-surface-container border border-outline-variant/40">
            ${m.tipe === "video" ? `<div class="h-24 bg-black flex items-center justify-center"><span class="material-symbols-outlined text-white text-3xl">play_circle</span></div>` : m.url ? `<img src="${esc(m.url)}" class="w-full h-24 object-cover" onerror="this.style.display='none'" />` : ""}
            <div class="p-2">
              <p class="text-[10px] font-medium truncate">${esc(m.caption || m.url?.split("/").pop() || "media")}</p>
              <div class="flex items-center justify-between mt-1">
                <span class="text-[9px] px-1.5 py-0.5 rounded bg-tertiary/20 text-tertiary">#${esc(m.tag || "BTS")}</span>
                <button class="btn-del text-[9px] text-error" data-id="${m.id}">×</button>
              </div>
            </div>
          </div>
        `).join("") : `<p class="text-sm text-on-surface-variant text-center py-8 col-span-4">Belum ada media</p>`}
      </div>
    </div>`;

  document.getElementById("btn-add").addEventListener("click", () => {
    document.getElementById("modal-title").textContent = "Upload Media";
    document.getElementById("modal-body").innerHTML = `
      <div class="space-y-3">
        <input id="f-url" type="url" placeholder="URL media (foto/video)" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <select id="f-tipe" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm">
          <option value="foto">Foto</option><option value="video">Video</option>
        </select>
        <select id="f-tag" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm">
          ${KATEGORI_MEDIA.map((t) => `<option>${t}</option>`).join("")}
        </select>
        <input id="f-caption" placeholder="Caption" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <button id="f-submit" class="w-full py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium">Simpan</button>
      </div>`;
    openModal("modal-form");
    document.getElementById("f-submit").onclick = async () => {
      await addDoc(collection(db, "media"), {
        kelas: ME.profile.kelas,
        url: document.getElementById("f-url").value.trim(),
        tipe: document.getElementById("f-tipe").value,
        tag: document.getElementById("f-tag").value,
        caption: document.getElementById("f-caption").value.trim(),
        createdAt: serverTimestamp(),
      });
      showToast("Media tersimpan!", "success");
      closeModal("modal-form");
      renderTabContent();
    };
  });
  c.querySelectorAll(".btn-del").forEach((b) =>
    b.addEventListener("click", () => hapusItem("media", b.dataset.id, () => RENDERERS.media(c)))
  );
};

/* --- PUBLIKASI: AFTERMOVIE --- */
RENDERERS.aftermovie = async (c) => {
  const list = await loadKoleksi("aftermovie");
  c.innerHTML = `
    <div class="glass rounded-2xl p-5">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-headline font-semibold flex items-center gap-2">
          <span class="material-symbols-outlined text-tertiary">movie</span> Aftermovie Project
        </h3>
        <button id="btn-add" class="px-3 py-2 rounded-lg bg-tertiary text-on-tertiary text-xs font-medium flex items-center gap-1">
          <span class="material-symbols-outlined text-sm">add</span> Tambah Klip
        </button>
      </div>
      ${list.length ? `
        <div class="space-y-2">
          ${list.map((k, i) => `
            <div class="p-3 rounded-xl bg-surface-container flex items-center gap-3">
              <span class="text-xs font-bold text-tertiary w-6">${i + 1}</span>
              <div class="flex-1">
                <p class="text-sm">${esc(k.judul || "Klip")}</p>
                <p class="text-[10px] text-on-surface-variant">${esc(k.durasi || "0:00")} · ${esc(k.url || "")}</p>
              </div>
              <button class="btn-del text-error text-xs" data-id="${k.id}">Hapus</button>
            </div>
          `).join("")}
        </div>
        <div class="mt-4 p-3 rounded-lg bg-secondary/10 border border-secondary/30">
          <p class="text-xs text-secondary font-medium mb-1">Export MP4</p>
          <p class="text-[10px] text-on-surface-variant mb-2">Durasi total: ${list.reduce((s, k) => s + (parseFloat(k.durasi) || 0), 0).toFixed(1)} detik</p>
          <div class="flex gap-2">
            <button class="px-3 py-1.5 rounded bg-secondary text-on-secondary text-xs">720p</button>
            <button class="px-3 py-1.5 rounded bg-secondary text-on-secondary text-xs">1080p</button>
          </div>
        </div>
      ` : `<p class="text-sm text-on-surface-variant text-center py-8">Belum ada klip</p>`}
    </div>`;

  document.getElementById("btn-add")?.addEventListener("click", () => {
    document.getElementById("modal-title").textContent = "Tambah Klip";
    document.getElementById("modal-body").innerHTML = `
      <div class="space-y-3">
        <input id="f-judul" placeholder="Judul klip" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <input id="f-url" type="url" placeholder="URL video klip" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <input id="f-durasi" type="number" step="0.1" placeholder="Durasi (detik)" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <button id="f-submit" class="w-full py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium">Simpan</button>
      </div>`;
    openModal("modal-form");
    document.getElementById("f-submit").onclick = async () => {
      await addDoc(collection(db, "aftermovie"), {
        kelas: ME.profile.kelas,
        judul: document.getElementById("f-judul").value.trim(),
        url: document.getElementById("f-url").value.trim(),
        durasi: document.getElementById("f-durasi").value,
        createdAt: serverTimestamp(),
      });
      showToast("Klip tersimpan!", "success");
      closeModal("modal-form");
      renderTabContent();
    };
  });
  c.querySelectorAll(".btn-del").forEach((b) =>
    b.addEventListener("click", () => hapusItem("aftermovie", b.dataset.id, () => RENDERERS.aftermovie(c)))
  );
};

/* --- PANGGUNG: DESAIN SET --- */
RENDERERS["desain-set"] = async (c) => {
  const list = await loadKoleksi("desainSet");
  c.innerHTML = `
    <div class="glass rounded-2xl p-5">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-headline font-semibold flex items-center gap-2">
          <span class="material-symbols-outlined text-tertiary">architecture</span> Desain Set Panggung
        </h3>
        <button id="btn-add" class="px-3 py-2 rounded-lg bg-tertiary text-on-tertiary text-xs font-medium flex items-center gap-1">
          <span class="material-symbols-outlined text-sm">add</span> Tambah Desain
        </button>
      </div>
      ${list.length ? list.map((d) => `
        <div class="p-3 rounded-xl bg-surface-container mb-2">
          <div class="flex justify-between items-center mb-2">
            <p class="text-sm font-medium">${esc(d.nama)}</p>
            <button class="btn-del text-error text-xs" data-id="${d.id}">Hapus</button>
          </div>
          <div class="grid grid-cols-3 gap-1 max-w-xs">
            ${Array.from({ length: 9 }).map((_, i) => `
              <div class="aspect-square rounded bg-surface-container-high border border-outline-variant/40 text-[10px] flex items-center justify-center text-on-surface-variant">
                ${esc(d.elemen?.[i] || "")}
              </div>
            `).join("")}
          </div>
          <p class="text-[10px] text-on-surface-variant mt-2">Dimensi: ${d.panjang || "-"} × ${d.lebar || "-"} × ${d.tinggi || "-"} m</p>
        </div>
      `).join("") : `<p class="text-sm text-on-surface-variant text-center py-8">Belum ada desain set</p>`}
    </div>`;

  document.getElementById("btn-add").addEventListener("click", () => {
    document.getElementById("modal-title").textContent = "Desain Set Baru";
    document.getElementById("modal-body").innerHTML = `
      <div class="space-y-3">
        <input id="f-nama" placeholder="Nama desain" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <div class="grid grid-cols-3 gap-2">
          <input id="f-panjang" type="number" placeholder="Panjang (m)" class="px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
          <input id="f-lebar" type="number" placeholder="Lebar (m)" class="px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
          <input id="f-tinggi" type="number" placeholder="Tinggi (m)" class="px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        </div>
        <p class="text-xs text-on-surface-variant">Klik 9 kotak untuk menempatkan elemen:</p>
        <div id="f-grid" class="grid grid-cols-3 gap-1">
          ${Array.from({ length: 9 }).map((_, i) => `<button class="grid-cell aspect-square rounded bg-surface-container-high border border-outline-variant/40 text-[10px] hover:bg-primary-container/40" data-i="${i}"></button>`).join("")}
        </div>
        <button id="f-submit" class="w-full py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium">Simpan</button>
      </div>`;
    openModal("modal-form");

    const elemen = {};
    document.querySelectorAll(".grid-cell").forEach((b) =>
      b.addEventListener("click", () => {
        const v = prompt(`Elemen untuk area ${parseInt(b.dataset.i) + 1} (mis: Dekorasi, Furnitur):`);
        if (v === null) return;
        elemen[b.dataset.i] = v;
        b.textContent = v;
      })
    );

    document.getElementById("f-submit").onclick = async () => {
      await addDoc(collection(db, "desainSet"), {
        kelas: ME.profile.kelas,
        nama: document.getElementById("f-nama").value.trim(),
        panjang: document.getElementById("f-panjang").value,
        lebar: document.getElementById("f-lebar").value,
        tinggi: document.getElementById("f-tinggi").value,
        elemen,
        createdAt: serverTimestamp(),
      });
      showToast("Desain set tersimpan!", "success");
      closeModal("modal-form");
      renderTabContent();
    };
  });
  c.querySelectorAll(".btn-del").forEach((b) =>
    b.addEventListener("click", () => hapusItem("desainSet", b.dataset.id, () => RENDERERS["desain-set"](c)))
  );
};

/* --- PANGGUNG: KONSTRUKSI --- */
RENDERERS.konstruksi = async (c) => {
  c.innerHTML = `
    <div class="glass rounded-2xl p-5">
      <h3 class="font-headline font-semibold mb-4 flex items-center gap-2">
        <span class="material-symbols-outlined text-tertiary">construction</span> Panduan Konstruksi
      </h3>
      <div class="space-y-3">
        <div class="p-3 rounded-xl bg-surface-container">
          <p class="text-sm font-medium mb-2">Tutorial Cara Membuat Set</p>
          <ul class="text-xs text-on-surface-variant space-y-1 pl-4 list-disc">
            <li>Potong kayu sesuai dimensi desain</li>
            <li>Rakit kerangka dengan sekrup & paku</li>
            <li>Perkuat sambungan dengan bracket</li>
            <li>Cat dengan warna dasar</li>
            <li>Finishing dekoratif</li>
          </ul>
        </div>
        <div class="p-3 rounded-xl bg-error/10 border border-error/30">
          <p class="text-sm font-medium text-error mb-2 flex items-center gap-1">
            <span class="material-symbols-outlined text-sm">health_and_safety</span> Checklist Keselamatan
          </p>
          <div class="space-y-1 text-xs">
            ${[
              "Pakai sarung tangan saat memotong",
              "Pakai masker saat mengecat",
              "Pastikan tangga stabil",
              "Periksa kestabilan struktur",
              "Tidak ada paku menonjol",
              "Jalur evakuasi tidak terhalang",
            ].map((item) => `
              <label class="flex items-center gap-2 p-1 rounded hover:bg-surface-container-high cursor-pointer">
                <input type="checkbox" class="rounded accent-green-500 safety-chk" />
                <span>${item}</span>
              </label>`).join("")}
          </div>
        </div>
        <div class="p-3 rounded-xl bg-surface-container">
          <p class="text-sm font-medium mb-2">Daftar Alat Tukang</p>
          <div class="grid grid-cols-2 gap-2 text-xs">
            ${["Gergaji", "Palu", "Obeng", "Meteran", "Bor", "Kuas Cat", "Tangga", "Lem"].map((a) => `<div class="p-1.5 rounded bg-surface-container-high">${a}</div>`).join("")}
          </div>
        </div>
      </div>
    </div>`;

  c.querySelectorAll(".safety-chk").forEach((chk) =>
    chk.addEventListener("change", () => {
      const all = c.querySelectorAll(".safety-chk");
      const checked = c.querySelectorAll(".safety-chk:checked");
      if (all.length === checked.length) showToast("Semua checklist keselamatan OK!", "success");
    })
  );
};

/* --- PANGGUNG: GLADI KERING --- */
RENDERERS["gladi-kering"] = async (c) => {
  const list = await loadKoleksi("gladiKering");
  c.innerHTML = `
    <div class="glass rounded-2xl p-5">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-headline font-semibold flex items-center gap-2">
          <span class="material-symbols-outlined text-tertiary">timer</span> Gladi Kering (Dry Run)
        </h3>
        <button id="btn-add" class="px-3 py-2 rounded-lg bg-tertiary text-on-tertiary text-xs font-medium flex items-center gap-1">
          <span class="material-symbols-outlined text-sm">add</span> Catat Waktu
        </button>
      </div>
      <div class="grid grid-cols-2 gap-3 mb-4">
        <div class="p-4 rounded-xl bg-surface-container text-center">
          <p class="text-xs text-on-surface-variant">Target Pasang</p>
          <p class="text-3xl font-bold text-primary">10:00</p>
        </div>
        <div class="p-4 rounded-xl bg-surface-container text-center">
          <p class="text-xs text-on-surface-variant">Target Bongkar</p>
          <p class="text-3xl font-bold text-primary">05:00</p>
        </div>
      </div>
      <div class="space-y-2">
        ${list.length ? list.map((g) => `
          <div class="p-3 rounded-xl bg-surface-container flex items-center justify-between">
            <div>
              <p class="text-sm font-medium">${formatTanggal(g.tanggal)}</p>
              <p class="text-xs text-on-surface-variant">Pasang: ${g.pasang || "-"} | Bongkar: ${g.bongkar || "-"}</p>
            </div>
            <span class="text-xs ${parseFloat(g.pasang) <= 10 ? "text-green-400" : "text-error"}">${parseFloat(g.pasang) <= 10 ? "OK" : "Over"}</span>
          </div>
        `).join("") : `<p class="text-sm text-on-surface-variant text-center py-4">Belum ada log</p>`}
      </div>
    </div>`;

  document.getElementById("btn-add").addEventListener("click", () => {
    document.getElementById("modal-title").textContent = "Catat Gladi Kering";
    document.getElementById("modal-body").innerHTML = `
      <div class="space-y-3">
        <input id="f-tanggal" type="date" value="${new Date().toISOString().slice(0, 10)}" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <input id="f-pasang" type="number" step="0.1" placeholder="Waktu pasang (menit)" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <input id="f-bongkar" type="number" step="0.1" placeholder="Waktu bongkar (menit)" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <textarea id="f-catatan" rows="2" placeholder="Catatan evaluasi" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm"></textarea>
        <button id="f-submit" class="w-full py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium">Simpan</button>
      </div>`;
    openModal("modal-form");
    document.getElementById("f-submit").onclick = async () => {
      await addDoc(collection(db, "gladiKering"), {
        kelas: ME.profile.kelas,
        tanggal: document.getElementById("f-tanggal").value,
        pasang: document.getElementById("f-pasang").value,
        bongkar: document.getElementById("f-bongkar").value,
        catatan: document.getElementById("f-catatan").value.trim(),
        createdAt: serverTimestamp(),
      });
      showToast("Log gladi tersimpan!", "success");
      closeModal("modal-form");
      renderTabContent();
    };
  });
};

/* --- RIAS: DESAIN RIAS --- */
RENDERERS["desain-rias"] = async (c) => {
  const list = await loadKoleksi("desainRias");
  c.innerHTML = `
    <div class="glass rounded-2xl p-5">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-headline font-semibold flex items-center gap-2">
          <span class="material-symbols-outlined text-tertiary">brush</span> Desain Rias
        </h3>
        <button id="btn-add" class="px-3 py-2 rounded-lg bg-tertiary text-on-tertiary text-xs font-medium flex items-center gap-1">
          <span class="material-symbols-outlined text-sm">add</span> Tambah Desain
        </button>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        ${list.length ? list.map((r) => cardItem({
          title: r.tokoh || r.nama,
          subtitle: `Jenis: ${r.jenis}`,
          badge: r.jenis,
          badgeColor: "bg-tertiary/20 text-tertiary",
          content: r.detail ? `<p class="text-xs text-on-surface-variant mt-1">${esc(r.detail)}</p>` : "",
          actions: `<button class="btn-del px-2 py-1 rounded text-[10px] bg-error/20 text-error" data-id="${r.id}">Hapus</button>`,
        })).join("") : `<p class="text-sm text-on-surface-variant text-center py-8 col-span-2">Belum ada desain rias</p>`}
      </div>
    </div>`;

  document.getElementById("btn-add").addEventListener("click", () => {
    document.getElementById("modal-title").textContent = "Desain Rias Baru";
    document.getElementById("modal-body").innerHTML = `
      <div class="space-y-3">
        <input id="f-tokoh" placeholder="Nama tokoh" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <select id="f-jenis" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm">
          <option>Rias Korektif</option><option>Rias Karakter</option><option>Rias Fantasi</option>
        </select>
        <textarea id="f-detail" rows="3" placeholder="Detail: umur, sifat, efek khusus, dll" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm"></textarea>
        <input id="f-moodboard" type="url" placeholder="URL moodboard" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <button id="f-submit" class="w-full py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium">Simpan</button>
      </div>`;
    openModal("modal-form");
    document.getElementById("f-submit").onclick = async () => {
      await addDoc(collection(db, "desainRias"), {
        kelas: ME.profile.kelas,
        tokoh: document.getElementById("f-tokoh").value.trim(),
        jenis: document.getElementById("f-jenis").value,
        detail: document.getElementById("f-detail").value.trim(),
        moodboard: document.getElementById("f-moodboard").value.trim(),
        createdAt: serverTimestamp(),
      });
      showToast("Desain rias tersimpan!", "success");
      closeModal("modal-form");
      renderTabContent();
    };
  });
  c.querySelectorAll(".btn-del").forEach((b) =>
    b.addEventListener("click", () => hapusItem("desainRias", b.dataset.id, () => RENDERERS["desain-rias"](c)))
  );
};

/* --- RIAS: HIGIENITAS --- */
RENDERERS.higienitas = async (c) => {
  const ALAT = ["Foundation", "Eyeshadow", "Eyeliner", "Lipstick", "Blush", "Pensil Alis", "Kuas", "Spons"];
  const snap = await getDocs(query(collection(db, "higienitas"), where("kelas", "==", ME.profile.kelas)));
  const map = {};
  snap.docs.forEach((d) => { map[d.data().alat] = { id: d.id, ...d.data() }; });

  c.innerHTML = `
    <div class="glass rounded-2xl p-5">
      <h3 class="font-headline font-semibold mb-4 flex items-center gap-2">
        <span class="material-symbols-outlined text-tertiary">sanitizer</span> Higienitas Alat Rias
      </h3>
      <div class="space-y-2">
        ${ALAT.map((a) => {
          const h = map[a] || { status: "Bersih" };
          return `
            <div class="p-3 rounded-xl bg-surface-container flex items-center justify-between">
              <div>
                <p class="text-sm font-medium">${a}</p>
                <p class="text-[10px] text-on-surface-variant">${h.updatedAt ? "Update " + waktuRelatif(h.updatedAt) : "Belum dicek"}</p>
              </div>
              <select class="status-alat px-2 py-1 rounded bg-surface-container-high border border-outline-variant text-xs" data-alat="${a}">
                <option ${h.status === "Bersih" ? "selected" : ""}>Bersih</option>
                <option ${h.status === "Kotor" ? "selected" : ""}>Kotor</option>
                <option ${h.status === "Perlu Steril" ? "selected" : ""}>Perlu Steril</option>
              </select>
            </div>`;
        }).join("")}
      </div>
      <button id="btn-save-hyg" class="mt-4 w-full py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium">Simpan Status</button>
    </div>`;

  document.getElementById("btn-save-hyg").addEventListener("click", async () => {
    const selects = c.querySelectorAll(".status-alat");
    for (const s of selects) {
      const alat = s.dataset.alat;
      const status = s.value;
      if (map[alat]?.id) {
        await updateDoc(doc(db, "higienitas", map[alat].id), { status, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, "higienitas"), { kelas: ME.profile.kelas, alat, status, updatedAt: serverTimestamp() });
      }
    }
    showToast("Status higienitas tersimpan!", "success");
  });
};

/* --- RIAS: FITTING --- */
RENDERERS.fitting = async (c) => {
  const list = await loadKoleksi("fittingRias");
  c.innerHTML = `
    <div class="glass rounded-2xl p-5">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-headline font-semibold flex items-center gap-2">
          <span class="material-symbols-outlined text-tertiary">face_retouching_natural</span> Uji Coba Rias (Fitting)
        </h3>
        <button id="btn-add" class="px-3 py-2 rounded-lg bg-tertiary text-on-tertiary text-xs font-medium flex items-center gap-1">
          <span class="material-symbols-outlined text-sm">add</span> Jadwalkan
        </button>
      </div>
      <div class="space-y-2">
        ${list.length ? list.map((f) => cardItem({
          title: f.pemainNama,
          subtitle: `Jadwal: ${formatTanggal(f.tanggal)} · ${f.jam || "-"}`,
          badge: f.kenyamanan ? `${f.kenyamanan}/5` : "-",
          badgeColor: "bg-secondary/20 text-secondary",
          content: f.feedback ? `<p class="text-xs text-on-surface-variant mt-1">${esc(f.feedback)}</p>` : "",
          actions: `<button class="btn-del px-2 py-1 rounded text-[10px] bg-error/20 text-error" data-id="${f.id}">Hapus</button>`,
        })).join("") : `<p class="text-sm text-on-surface-variant text-center py-8">Belum ada fitting</p>`}
      </div>
    </div>`;

  document.getElementById("btn-add").addEventListener("click", async () => {
    const pSnap = await getDocs(query(collection(db, "users"), where("kelas", "==", ME.profile.kelas), where("role", "==", "siswa"), where("peran", "==", "Pemain")));
    const pemain = pSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));

    document.getElementById("modal-title").textContent = "Jadwalkan Fitting Rias";
    document.getElementById("modal-body").innerHTML = `
      <div class="space-y-3">
        <select id="f-pemain" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm">
          <option value="">Pilih Pemain</option>
          ${pemain.map((p) => `<option value="${p.uid}" data-nama="${esc(p.nama)}">${esc(p.nama)}</option>`).join("")}
        </select>
        <input id="f-tanggal" type="date" value="${new Date().toISOString().slice(0, 10)}" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <input id="f-jam" type="time" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <input id="f-kenyamanan" type="number" min="1" max="5" placeholder="Rating kenyamanan (1-5)" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <textarea id="f-feedback" rows="2" placeholder="Feedback pemain" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm"></textarea>
        <button id="f-submit" class="w-full py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium">Simpan</button>
      </div>`;
    openModal("modal-form");
    document.getElementById("f-submit").onclick = async () => {
      const sel = document.getElementById("f-pemain");
      await addDoc(collection(db, "fittingRias"), {
        kelas: ME.profile.kelas,
        pemainUid: sel.value,
        pemainNama: sel.selectedOptions[0]?.dataset.nama || "",
        tanggal: document.getElementById("f-tanggal").value,
        jam: document.getElementById("f-jam").value,
        kenyamanan: parseInt(document.getElementById("f-kenyamanan").value) || 0,
        feedback: document.getElementById("f-feedback").value.trim(),
        createdAt: serverTimestamp(),
      });
      showToast("Fitting tersimpan!", "success");
      closeModal("modal-form");
      renderTabContent();
    };
  });
  c.querySelectorAll(".btn-del").forEach((b) =>
    b.addEventListener("click", () => hapusItem("fittingRias", b.dataset.id, () => RENDERERS.fitting(c)))
  );
};

/* --- RIAS: TOUCH-UP --- */
RENDERERS.touchup = async (c) => {
  c.innerHTML = `
    <div class="glass rounded-2xl p-5">
      <h3 class="font-headline font-semibold mb-4 flex items-center gap-2">
        <span class="material-symbols-outlined text-tertiary">auto_fix_high</span> Touch-Up Live Mode
      </h3>
      <div class="text-center py-8 rounded-2xl bg-surface-container mb-4">
        <p id="touch-timer" class="font-headline font-bold text-6xl text-primary">15:00</p>
        <p class="text-sm text-on-surface-variant mt-2">Timer touch-up (15 menit)</p>
      </div>
      <div class="flex gap-2 justify-center mb-4">
        <button id="btn-touch-start" class="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium">Mulai</button>
        <button id="btn-touch-reset" class="px-4 py-2 rounded-lg bg-surface-container-high text-sm font-medium">Reset</button>
      </div>
      <div class="p-3 rounded-xl bg-error/10 border border-error/30">
        <p class="text-sm font-medium text-error mb-2">Kit Darurat Backstage</p>
        <div class="grid grid-cols-2 gap-2 text-xs">
          ${["Bedak", "Lipstik", "Kuas", "Cotton bud", "Tissue", "Setting spray"].map((item) => `
            <label class="flex items-center gap-1.5">
              <input type="checkbox" class="rounded accent-primary" />${item}
            </label>`).join("")}
        </div>
      </div>
    </div>`;

  let detik = 900;
  document.getElementById("btn-touch-start").addEventListener("click", () => {
    if (TIMER) clearInterval(TIMER);
    TIMER = setInterval(() => {
      detik--;
      const m = Math.floor(detik / 60);
      const s = detik % 60;
      document.getElementById("touch-timer").textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      if (detik <= 0) {
        clearInterval(TIMER);
        showToast("Waktu touch-up habis!", "warning");
      }
    }, 1000);
  });
  document.getElementById("btn-touch-reset").addEventListener("click", () => {
    clearInterval(TIMER);
    detik = 900;
    document.getElementById("touch-timer").textContent = "15:00";
  });
};

/* --- BUSANA: KOSTUM --- */
RENDERERS.kostum = async (c) => {
  const list = await loadKoleksi("kostum");
  c.innerHTML = `
    <div class="glass rounded-2xl p-5">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-headline font-semibold flex items-center gap-2">
          <span class="material-symbols-outlined text-tertiary">checkroom</span> Desain Kostum
        </h3>
        <button id="btn-add" class="px-3 py-2 rounded-lg bg-tertiary text-on-tertiary text-xs font-medium flex items-center gap-1">
          <span class="material-symbols-outlined text-sm">add</span> Tambah Kostum
        </button>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        ${list.length ? list.map((k) => cardItem({
          title: k.tokoh,
          subtitle: `Jenis: ${k.jenis} · ${k.warna || "-"}`,
          badge: k.tahap || "Desain",
          badgeColor: k.tahap === "Finishing" ? "bg-green-600/20 text-green-400" : "bg-tertiary/20 text-tertiary",
          content: `
            <p class="text-xs text-on-surface-variant mt-1">Kain: ${k.kain || 0}m · Ukuran: ${k.ukuran || "-"}</p>
            ${k.moodboard ? `<a href="${esc(k.moodboard)}" target="_blank" class="text-[10px] text-primary underline">Moodboard</a>` : ""}
          `,
          actions: `<button class="btn-del px-2 py-1 rounded text-[10px] bg-error/20 text-error" data-id="${k.id}">Hapus</button>`,
        })).join("") : `<p class="text-sm text-on-surface-variant text-center py-8 col-span-2">Belum ada kostum</p>`}
      </div>
    </div>`;

  document.getElementById("btn-add").addEventListener("click", () => {
    document.getElementById("modal-title").textContent = "Desain Kostum Baru";
    document.getElementById("modal-body").innerHTML = `
      <div class="space-y-3">
        <input id="f-tokoh" placeholder="Nama tokoh" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <select id="f-jenis" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm">
          <option>Sejarah</option><option>Tradisional</option><option>Fantasi</option><option>Modern</option>
        </select>
        <input id="f-warna" placeholder="Warna dominan" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <input id="f-kain" type="number" step="0.1" placeholder="Estimasi kain (m)" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <input id="f-ukuran" placeholder="Ukuran (L:..., P:..., XL:...)" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <input id="f-moodboard" type="url" placeholder="URL moodboard" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <button id="f-submit" class="w-full py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium">Simpan</button>
      </div>`;
    openModal("modal-form");
    document.getElementById("f-submit").onclick = async () => {
      await addDoc(collection(db, "kostum"), {
        kelas: ME.profile.kelas,
        tokoh: document.getElementById("f-tokoh").value.trim(),
        jenis: document.getElementById("f-jenis").value,
        warna: document.getElementById("f-warna").value.trim(),
        kain: parseFloat(document.getElementById("f-kain").value) || 0,
        ukuran: document.getElementById("f-ukuran").value.trim(),
        moodboard: document.getElementById("f-moodboard").value.trim(),
        tahap: "Desain",
        createdAt: serverTimestamp(),
      });
      showToast("Kostum tersimpan!", "success");
      closeModal("modal-form");
      renderTabContent();
    };
  });
  c.querySelectorAll(".btn-del").forEach((b) =>
    b.addEventListener("click", () => hapusItem("kostum", b.dataset.id, () => RENDERERS.kostum(c)))
  );
};

/* --- BUSANA: PRODUKSI --- */
RENDERERS.produksi = async (c) => {
  const list = await loadKoleksi("kostum");
  const TAHAP = ["Desain", "Potong", "Jahit", "Fitting", "Finishing"];
  c.innerHTML = `
    <div class="glass rounded-2xl p-5">
      <h3 class="font-headline font-semibold mb-4 flex items-center gap-2">
        <span class="material-symbols-outlined text-tertiary">content_cut</span> Timeline Produksi Kostum
      </h3>
      ${list.length ? list.map((k) => {
        const idxTahap = TAHAP.indexOf(k.tahap || "Desain");
        return `
          <div class="p-3 rounded-xl bg-surface-container mb-2">
            <div class="flex justify-between mb-2">
              <p class="text-sm font-medium">${esc(k.tokoh)}</p>
              <span class="text-[10px] px-2 py-0.5 rounded bg-tertiary/20 text-tertiary">${k.tahap}</span>
            </div>
            <div class="flex items-center gap-1">
              ${TAHAP.map((t, i) => `
                <div class="flex-1">
                  <div class="h-1.5 rounded-full ${i <= idxTahap ? "bg-tertiary" : "bg-surface-container-high"}"></div>
                  <p class="text-[8px] mt-1 text-center ${i <= idxTahap ? "text-tertiary" : "text-on-surface-variant"}">${t}</p>
                </div>
              `).join("")}
            </div>
            <select class="tahap-sel mt-2 px-2 py-1 rounded bg-surface-container-high border border-outline-variant text-[10px]" data-id="${k.id}">
              ${TAHAP.map((t) => `<option ${k.tahap === t ? "selected" : ""}>${t}</option>`).join("")}
            </select>
          </div>`;
      }).join("") : `<p class="text-sm text-on-surface-variant text-center py-8">Belum ada kostum dalam produksi</p>`}
    </div>`;

  c.querySelectorAll(".tahap-sel").forEach((sel) =>
    sel.addEventListener("change", async () => {
      await updateDoc(doc(db, "kostum", sel.dataset.id), { tahap: sel.value });
      showToast("Tahapan diupdate!", "success");
      renderTabContent();
    })
  );
};

/* --- BUSANA: FITTING --- */
RENDERERS["fitting-busana"] = async (c) => {
  const list = await loadKoleksi("fittingBusana");
  c.innerHTML = `
    <div class="glass rounded-2xl p-5">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-headline font-semibold flex items-center gap-2">
          <span class="material-symbols-outlined text-tertiary">straighten</span> Fitting Kostum
        </h3>
        <button id="btn-add" class="px-3 py-2 rounded-lg bg-tertiary text-on-tertiary text-xs font-medium flex items-center gap-1">
          <span class="material-symbols-outlined text-sm">add</span> Fitting Baru
        </button>
      </div>
      <div class="space-y-2">
        ${list.length ? list.map((f) => cardItem({
          title: f.pemainNama,
          subtitle: `Tanggal: ${formatTanggal(f.tanggal)} (15 menit)`,
          badge: f.sesuai ? "Sesuai" : "Perlu Modifikasi",
          badgeColor: f.sesuai ? "bg-green-600/20 text-green-400" : "bg-yellow-500/20 text-yellow-400",
          content: f.catatan ? `<p class="text-xs text-on-surface-variant mt-1">${esc(f.catatan)}</p>` : "",
          actions: `<button class="btn-del px-2 py-1 rounded text-[10px] bg-error/20 text-error" data-id="${f.id}">Hapus</button>`,
        })).join("") : `<p class="text-sm text-on-surface-variant text-center py-8">Belum ada fitting</p>`}
      </div>
    </div>`;

  document.getElementById("btn-add").addEventListener("click", async () => {
    const pSnap = await getDocs(query(collection(db, "users"), where("kelas", "==", ME.profile.kelas), where("role", "==", "siswa"), where("peran", "==", "Pemain")));
    document.getElementById("modal-title").textContent = "Fitting Kostum";
    document.getElementById("modal-body").innerHTML = `
      <div class="space-y-3">
        <select id="f-pemain" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm">
          <option value="">Pilih Pemain</option>
          ${pSnap.docs.map((d) => `<option value="${d.id}" data-nama="${esc(d.data().nama)}">${esc(d.data().nama)}</option>`).join("")}
        </select>
        <input id="f-tanggal" type="date" value="${new Date().toISOString().slice(0, 10)}" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" id="f-sesuai" class="rounded accent-primary" /> Kostum sesuai</label>
        <textarea id="f-catatan" rows="2" placeholder="Catatan modifikasi" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm"></textarea>
        <button id="f-submit" class="w-full py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium">Simpan</button>
      </div>`;
    openModal("modal-form");
    document.getElementById("f-submit").onclick = async () => {
      const sel = document.getElementById("f-pemain");
      await addDoc(collection(db, "fittingBusana"), {
        kelas: ME.profile.kelas,
        pemainUid: sel.value,
        pemainNama: sel.selectedOptions[0]?.dataset.nama || "",
        tanggal: document.getElementById("f-tanggal").value,
        sesuai: document.getElementById("f-sesuai").checked,
        catatan: document.getElementById("f-catatan").value.trim(),
        createdAt: serverTimestamp(),
      });
      showToast("Fitting tersimpan!", "success");
      closeModal("modal-form");
      renderTabContent();
    };
  });
  c.querySelectorAll(".btn-del").forEach((b) =>
    b.addEventListener("click", () => hapusItem("fittingBusana", b.dataset.id, () => RENDERERS["fitting-busana"](c)))
  );
};

/* --- BUSANA: QUICK CHANGE --- */
RENDERERS["quick-change"] = async (c) => {
  c.innerHTML = `
    <div class="glass rounded-2xl p-5">
      <h3 class="font-headline font-semibold mb-4 flex items-center gap-2">
        <span class="material-symbols-outlined text-tertiary">bolt</span> Simulasi Quick Change
      </h3>
      <div class="p-3 rounded-xl bg-secondary/10 border border-secondary/30 mb-4">
        <p class="text-sm text-secondary font-medium">Target: &lt; 2 menit per pemain</p>
      </div>
      <div class="text-center py-8 rounded-2xl bg-surface-container mb-4">
        <p id="qc-timer" class="font-headline font-bold text-6xl text-primary">02:00</p>
      </div>
      <div class="flex gap-2 justify-center">
        <button id="qc-start" class="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium">Mulai</button>
        <button id="qc-stop" class="px-4 py-2 rounded-lg bg-error text-white text-sm font-medium">Stop & Catat</button>
        <button id="qc-reset" class="px-4 py-2 rounded-lg bg-surface-container-high text-sm font-medium">Reset</button>
      </div>
    </div>`;

  let detik = 120;
  let interval = null;
  const display = document.getElementById("qc-timer");

  document.getElementById("qc-start").addEventListener("click", () => {
    if (interval) clearInterval(interval);
    interval = setInterval(() => {
      detik++;
      const m = Math.floor(detik / 60);
      const s = detik % 60;
      display.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }, 1000);
  });
  document.getElementById("qc-stop").addEventListener("click", () => {
    clearInterval(interval);
    const pemain = prompt("Nama pemain:");
    if (!pemain) return;
    addDoc(collection(db, "quickChange"), {
      kelas: ME.profile.kelas,
      pemainNama: pemain,
      detik,
      createdAt: serverTimestamp(),
    }).then(() => {
      showToast(`Waktu ${detik}s dicatat!`, "success");
      detik = 120;
      display.textContent = "02:00";
    });
  });
  document.getElementById("qc-reset").addEventListener("click", () => {
    clearInterval(interval);
    detik = 120;
    display.textContent = "02:00";
  });
};

/* --- MUSIK: KONSEP MUSIK --- */
RENDERERS["konsep-musik"] = async (c) => {
  const list = await loadKoleksi("konsepMusik");
  c.innerHTML = `
    <div class="glass rounded-2xl p-5">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-headline font-semibold flex items-center gap-2">
          <span class="material-symbols-outlined text-tertiary">music_note</span> Konsep Musik (10 Jenis)
        </h3>
        <button id="btn-add" class="px-3 py-2 rounded-lg bg-tertiary text-on-tertiary text-xs font-medium flex items-center gap-1">
          <span class="material-symbols-outlined text-sm">add</span> Tambah
        </button>
      </div>
      <div class="flex flex-wrap gap-2 mb-4">
        ${JENIS_MUSIK.map((j) => `<span class="text-[10px] px-2 py-1 rounded bg-surface-container">${j}</span>`).join("")}
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        ${list.length ? list.map((k) => cardItem({
          title: k.judul,
          subtitle: `Jenis: ${k.jenis} · ${k.durasi || "-"}`,
          badge: k.jenis,
          badgeColor: "bg-tertiary/20 text-tertiary",
          content: k.adegan ? `<p class="text-xs text-on-surface-variant mt-1">Adegan: ${esc(k.adegan)}</p>` : "",
          actions: `<button class="btn-del px-2 py-1 rounded text-[10px] bg-error/20 text-error" data-id="${k.id}">Hapus</button>`,
        })).join("") : `<p class="text-sm text-on-surface-variant text-center py-8 col-span-2">Belum ada konsep musik</p>`}
      </div>
    </div>`;

  document.getElementById("btn-add").addEventListener("click", () => {
    document.getElementById("modal-title").textContent = "Konsep Musik Baru";
    document.getElementById("modal-body").innerHTML = `
      <div class="space-y-3">
        <input id="f-judul" placeholder="Judul musik" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <select id="f-jenis" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm">
          ${JENIS_MUSIK.map((j) => `<option>${j}</option>`).join("")}
        </select>
        <input id="f-adegan" placeholder="Adegan terkait" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <input id="f-durasi" placeholder="Durasi (mm:ss)" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <input id="f-url" type="url" placeholder="URL audio (MP3/WAV max 20MB)" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <button id="f-submit" class="w-full py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium">Simpan</button>
      </div>`;
    openModal("modal-form");
    document.getElementById("f-submit").onclick = async () => {
      await addDoc(collection(db, "konsepMusik"), {
        kelas: ME.profile.kelas,
        judul: document.getElementById("f-judul").value.trim(),
        jenis: document.getElementById("f-jenis").value,
        adegan: document.getElementById("f-adegan").value.trim(),
        durasi: document.getElementById("f-durasi").value.trim(),
        url: document.getElementById("f-url").value.trim(),
        createdAt: serverTimestamp(),
      });
      showToast("Konsep musik tersimpan!", "success");
      closeModal("modal-form");
      renderTabContent();
    };
  });
  c.querySelectorAll(".btn-del").forEach((b) =>
    b.addEventListener("click", () => hapusItem("konsepMusik", b.dataset.id, () => RENDERERS["konsep-musik"](c)))
  );
};

/* --- MUSIK: CUE SHEET --- */
RENDERERS["cue-sheet"] = async (c) => {
  const list = await loadKoleksi("soundCue");
  c.innerHTML = `
    <div class="glass rounded-2xl p-5">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-headline font-semibold flex items-center gap-2">
          <span class="material-symbols-outlined text-tertiary">queue_music</span> Sound Cue Sheet
        </h3>
        <button id="btn-add" class="px-3 py-2 rounded-lg bg-tertiary text-on-tertiary text-xs font-medium flex items-center gap-1">
          <span class="material-symbols-outlined text-sm">add</span> Tambah Cue
        </button>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead class="text-on-surface-variant">
            <tr class="border-b border-outline-variant/40">
              <th class="text-left p-2">Adegan</th>
              <th class="text-left p-2">Waktu</th>
              <th class="text-left p-2">Jenis</th>
              <th class="text-center p-2">Volume</th>
              <th class="text-center p-2">Durasi</th>
              <th class="text-center p-2">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${list.length ? list.map((c2) => `
              <tr class="border-b border-outline-variant/20">
                <td class="p-2">${esc(c2.adegan)}</td>
                <td class="p-2">${esc(c2.waktu)}</td>
                <td class="p-2">${esc(c2.jenis)}</td>
                <td class="p-2 text-center">${c2.volume || 70}%</td>
                <td class="p-2 text-center">${esc(c2.durasi || "-")}</td>
                <td class="p-2 text-center">
                  <button class="btn-del text-error" data-id="${c2.id}">
                    <span class="material-symbols-outlined text-sm">delete</span>
                  </button>
                </td>
              </tr>
            `).join("") : `<tr><td colspan="6" class="p-4 text-center text-on-surface-variant">Belum ada cue</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;

  document.getElementById("btn-add").addEventListener("click", () => {
    document.getElementById("modal-title").textContent = "Sound Cue Baru";
    document.getElementById("modal-body").innerHTML = `
      <div class="space-y-3">
        <input id="f-adegan" placeholder="Adegan" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <input id="f-waktu" placeholder="Waktu (mm:ss)" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <select id="f-jenis" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm">
          ${JENIS_MUSIK.map((j) => `<option>${j}</option>`).join("")}
        </select>
        <input id="f-volume" type="number" min="0" max="100" placeholder="Volume %" value="70" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <input id="f-durasi" placeholder="Durasi (mm:ss)" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <button id="f-submit" class="w-full py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium">Simpan</button>
      </div>`;
    openModal("modal-form");
    document.getElementById("f-submit").onclick = async () => {
      await addDoc(collection(db, "soundCue"), {
        kelas: ME.profile.kelas,
        adegan: document.getElementById("f-adegan").value.trim(),
        waktu: document.getElementById("f-waktu").value.trim(),
        jenis: document.getElementById("f-jenis").value,
        volume: parseInt(document.getElementById("f-volume").value) || 70,
        durasi: document.getElementById("f-durasi").value.trim(),
        createdAt: serverTimestamp(),
      });
      showToast("Cue tersimpan!", "success");
      closeModal("modal-form");
      renderTabContent();
    };
  });
  c.querySelectorAll(".btn-del").forEach((b) =>
    b.addEventListener("click", () => hapusItem("soundCue", b.dataset.id, () => RENDERERS["cue-sheet"](c)))
  );
};

/* --- MUSIK: AUDIO LIBRARY --- */
RENDERERS["audio-lib"] = async (c) => {
  const list = await loadKoleksi("audioLibrary");
  c.innerHTML = `
    <div class="glass rounded-2xl p-5">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-headline font-semibold flex items-center gap-2">
          <span class="material-symbols-outlined text-tertiary">library_music</span> Audio Library
        </h3>
        <button id="btn-add" class="px-3 py-2 rounded-lg bg-tertiary text-on-tertiary text-xs font-medium flex items-center gap-1">
          <span class="material-symbols-outlined text-sm">add</span> Upload Audio
        </button>
      </div>
      <div class="space-y-2">
        ${list.length ? list.map((a) => `
          <div class="p-3 rounded-xl bg-surface-container flex items-center gap-3">
            <span class="material-symbols-outlined text-tertiary text-3xl">audiotrack</span>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium truncate">${esc(a.judul)}</p>
              <p class="text-[10px] text-on-surface-variant">${esc(a.artis || "-")} · ${esc(a.durasi || "-")} · Mood: ${esc(a.mood || "-")}</p>
            </div>
            ${a.url ? `<audio controls class="hidden md:block" style="height:32px;width:200px"><source src="${esc(a.url)}" /></audio>` : ""}
            <button class="btn-del text-error text-xs" data-id="${a.id}">×</button>
          </div>
        `).join("") : `<p class="text-sm text-on-surface-variant text-center py-8">Belum ada audio</p>`}
      </div>
    </div>`;

  document.getElementById("btn-add").addEventListener("click", () => {
    document.getElementById("modal-title").textContent = "Upload Audio";
    document.getElementById("modal-body").innerHTML = `
      <div class="space-y-3">
        <input id="f-judul" placeholder="Judul audio" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <input id="f-artis" placeholder="Artis / Sumber" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <input id="f-durasi" placeholder="Durasi (mm:ss)" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <input id="f-mood" placeholder="Mood (sedih, gembira, tegang...)" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <input id="f-url" type="url" placeholder="URL audio (MP3/WAV max 20MB)" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <button id="f-submit" class="w-full py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium">Simpan</button>
      </div>`;
    openModal("modal-form");
    document.getElementById("f-submit").onclick = async () => {
      await addDoc(collection(db, "audioLibrary"), {
        kelas: ME.profile.kelas,
        judul: document.getElementById("f-judul").value.trim(),
        artis: document.getElementById("f-artis").value.trim(),
        durasi: document.getElementById("f-durasi").value.trim(),
        mood: document.getElementById("f-mood").value.trim(),
        url: document.getElementById("f-url").value.trim(),
        createdAt: serverTimestamp(),
      });
      showToast("Audio tersimpan!", "success");
      closeModal("modal-form");
      renderTabContent();
    };
  });
  c.querySelectorAll(".btn-del").forEach((b) =>
    b.addEventListener("click", () => hapusItem("audioLibrary", b.dataset.id, () => RENDERERS["audio-lib"](c)))
  );
};

/* --- MUSIK: CHECK SOUND --- */
RENDERERS["check-sound"] = async (c) => {
  const CHECK_ITEMS = [
    "Mic 1 berfungsi",
    "Mic 2 berfungsi",
    "Mic 3 berfungsi",
    "Mic 4 berfungsi",
    "Volume seimbang",
    "Kabel rapi",
    "Backup file audio siap",
    "Speaker utama OK",
    "Speaker monitor OK",
    "Mixer setting benar",
  ];
  c.innerHTML = `
    <div class="glass rounded-2xl p-5">
      <h3 class="font-headline font-semibold mb-4 flex items-center gap-2">
        <span class="material-symbols-outlined text-tertiary">hearing</span> Check Sound (10 menit sebelum)
      </h3>
      <div class="p-3 rounded-xl bg-tertiary/10 border border-tertiary/30 mb-4">
        <p class="text-xs text-tertiary">Checklist wajib dilakukan 10 menit sebelum pementasan</p>
      </div>
      <div class="space-y-1.5">
        ${CHECK_ITEMS.map((item) => `
          <label class="flex items-center gap-2 p-2 rounded-lg hover:bg-surface-container-high cursor-pointer">
            <input type="checkbox" class="check-sound rounded accent-primary" data-item="${esc(item)}" />
            <span class="text-sm">${item}</span>
          </label>
        `).join("")}
      </div>
      <div class="mt-4 p-3 rounded-lg bg-surface-container">
        <p class="text-xs font-medium mb-2">Volume Control</p>
        <input id="vol-slider" type="range" min="0" max="100" value="70" class="w-full accent-primary" />
        <p class="text-xs text-on-surface-variant text-center mt-1">Master: <span id="vol-val">70</span>%</p>
      </div>
      <button id="btn-simpan-check" class="mt-4 w-full py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium">Simpan Log Check Sound</button>
    </div>`;

  document.getElementById("vol-slider").addEventListener("input", (e) => (document.getElementById("vol-val").textContent = e.target.value));

  document.getElementById("btn-simpan-check").addEventListener("click", async () => {
    const checked = Array.from(c.querySelectorAll(".check-sound:checked")).map((x) => x.dataset.item);
    await addDoc(collection(db, "checkSound"), {
      kelas: ME.profile.kelas,
      items: checked,
      total: CHECK_ITEMS.length,
      volume: parseInt(document.getElementById("vol-slider").value),
      waktu: new Date().toISOString(),
      createdAt: serverTimestamp(),
    });
    showToast(`Check sound tersimpan (${checked.length}/${CHECK_ITEMS.length})`, "success");
  });
};

/* =========================================================
 * INIT
 * ========================================================= */
(async function init() {
  const { uid, profile } = await protectPage();
  ME = { uid, profile };

  if (!isKoordinator()) {
    document.getElementById("tab-content").innerHTML = `
      <div class="glass rounded-2xl p-10 text-center">
        <span class="material-symbols-outlined text-5xl text-on-surface-variant mb-3">lock</span>
        <p class="text-sm">Halaman ini hanya untuk Koordinator Divisi.</p>
        <a href="dashboard.html" class="inline-block mt-3 px-4 py-2 rounded-lg bg-primary text-on-primary text-sm">Kembali ke Dashboard</a>
      </div>`;
    return;
  }

  DIVISI = profile.divisi;
  document.getElementById("page-title").textContent = `Koordinator ${DIVISI}`;

  const menu = [
    { icon: "dashboard", label: "Dashboard", href: "dashboard.html" },
    { icon: "engineering", label: `Panel ${DIVISI}`, href: "koordinator.html" },
    { icon: "grade", label: "Nilai", href: "nilai.html" },
    { icon: "calendar_month", label: "Jadwal", href: "jadwal.html" },
    { icon: "fact_check", label: "Absensi", href: "absensi.html" },
    { icon: "checklist", label: "Checklist", href: "checklist.html" },
    { icon: "campaign", label: "Broadcast", href: "broadcast.html" },
    { icon: "groups", label: "Struktur", href: "struktur.html" },
    { icon: "folder", label: "Arsip", href: "arsip.html" },
    { icon: "support_agent", label: "Aduan", href: "aduan.html" },
    { icon: "description", label: "Rapor", href: "rapor.html" },
  ];
  document.getElementById("sidebar-nav").innerHTML = menu.map((m) => `
    <a href="${m.href}" class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition text-sm ${
      m.href === "koordinator.html" ? "bg-primary-container text-primary font-medium" : "text-on-surface-variant hover:bg-surface-container"
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
    { icon: "groups", label: "Kerabat", href: "struktur.html" },
  ].map((i) => `<a href="${i.href}" class="flex flex-col items-center justify-center py-2 text-[10px] gap-0.5 text-on-surface-variant"><span class="material-symbols-outlined text-xl">${i.icon}</span>${i.label}</a>`).join("");

  const html = document.documentElement;
  if (localStorage.getItem("theme") === "light") html.classList.remove("dark");
  const btnT = document.getElementById("btn-theme"), iconT = document.getElementById("theme-icon");
  const setIcon = () => (iconT.textContent = html.classList.contains("dark") ? "light_mode" : "dark_mode");
  setIcon();
  btnT.addEventListener("click", () => {
    html.classList.toggle("dark");
    localStorage.setItem("theme", html.classList.contains("dark") ? "dark" : "light");
    setIcon();
  });
  document.getElementById("btn-logout").addEventListener("click", async () => {
    if (confirm("Keluar?")) { await logActivity(ME.uid, "logout"); await signOut(auth); window.location.replace("index.html"); }
  });
  document.getElementById("btn-menu").addEventListener("click", () => {
    const sb = document.getElementById("sidebar"); sb.classList.toggle("hidden"); sb.classList.toggle("flex");
  });

  initNotifikasi(uid, profile);
  document.getElementById("btn-notif").addEventListener("click", bukaPanelNotif);

  TAB = (TABS_PER_DIVISI[DIVISI] || [])[0]?.id || "utama";
  renderTabs();
  renderTabContent();
})();
