/**
 * SP-PPT — Modul Sutradara
 * Fitur: Visi Artistik, Casting, Catatan Harian, Penilaian Pemain, Call Sheet
 */

import { auth, db } from "./firebase-init.js";
import {
  doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  collection, query, where, getDocs, orderBy, serverTimestamp, limit,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { protectPage } from "./router.js";
import {
  showToast, openModal, closeModal, skeleton, formatTanggal, esc,
  warnaPeran, inisial, logActivity, waktuRelatif, countdown,
} from "./utils.js";
import { initNotifikasi, bukaPanelNotif, kirimNotifikasi, kirimNotifikasiBanyak } from "./notifikasi.js";
import { KRITERIA_PER_PERAN, skorKeNilai } from "./agregasi.js";

let ME = null;
let TAB = "visi";
let VISI = null;
let CASTING = [];
let CATATAN = [];
let PEMAIN = [];
let NILAI_TARGET = null;

/* =========================================================
 * TAB SWITCH
 * ========================================================= */
function switchTab(tab) {
  TAB = tab;
  document.querySelectorAll(".tab-btn").forEach((b) => {
    const aktif = b.dataset.tab === tab;
    b.className = `tab-btn px-4 py-2 rounded-xl text-sm font-medium transition flex items-center gap-1.5 ${
      aktif ? "bg-primary-container text-primary" : "text-on-surface-variant hover:bg-surface-container"
    }`;
  });
  if (tab === "visi") renderVisi();
  if (tab === "casting") renderCasting();
  if (tab === "catatan") renderCatatan();
  if (tab === "penilaian") renderPenilaian();
  if (tab === "call-sheet") renderCallSheet();
}

/* =========================================================
 * TAB: VISI ARTISTIK
 * ========================================================= */
async function renderVisi() {
  const c = document.getElementById("tab-content");
  c.innerHTML = `<div class="glass rounded-2xl p-5">${skeleton(4)}</div>`;

  const snap = await getDocs(query(collection(db, "visiArtistik"), where("kelas", "==", ME.profile.kelas), limit(1)));
  VISI = snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };

  c.innerHTML = `
  <div class="glass rounded-2xl p-5 border-l-4 border-secondary">
    <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
      <h3 class="font-headline font-semibold flex items-center gap-2">
        <span class="material-symbols-outlined text-secondary">palette</span> Visi Artistik Produksi
      </h3>
      <button id="btn-edit-visi" class="px-3 py-2 rounded-lg bg-secondary text-on-secondary text-xs font-medium flex items-center gap-1">
        <span class="material-symbols-outlined text-sm">${VISI ? "edit" : "add"}</span> ${VISI ? "Edit Visi" : "Buat Visi"}
      </button>
    </div>

    ${VISI ? `
      <div class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="p-3 rounded-xl bg-surface-container">
            <p class="text-xs text-on-surface-variant">Judul Produksi</p>
            <p class="font-headline font-bold text-lg">${esc(VISI.judul)}</p>
          </div>
          <div class="p-3 rounded-xl bg-surface-container">
            <p class="text-xs text-on-surface-variant">Gaya Penyutradaraan</p>
            <p class="font-medium">${esc(VISI.gaya)}</p>
          </div>
        </div>
        <div class="p-3 rounded-xl bg-surface-container">
          <p class="text-xs text-on-surface-variant mb-1">Tema Utama</p>
          <p class="text-sm">${esc(VISI.tema)}</p>
        </div>
        ${VISI.scene ? `
        <div class="p-3 rounded-xl bg-surface-container">
          <p class="text-xs text-on-surface-variant mb-1">Scene Breakdown</p>
          <p class="text-sm whitespace-pre-wrap">${esc(VISI.scene)}</p>
        </div>` : ""}
        ${VISI.moodboard ? `
        <div class="p-3 rounded-xl bg-surface-container">
          <p class="text-xs text-on-surface-variant mb-2">Moodboard</p>
          <a href="${esc(VISI.moodboard)}" target="_blank" class="text-primary text-xs underline break-all">${esc(VISI.moodboard)}</a>
        </div>` : ""}
        ${VISI.promptbook ? `
        <div class="p-3 rounded-xl bg-surface-container flex items-center justify-between">
          <div>
            <p class="text-xs text-on-surface-variant">Prompt Book PDF</p>
            <a href="${esc(VISI.promptbook)}" target="_blank" class="text-primary text-xs underline">Buka PDF</a>
          </div>
          <span class="material-symbols-outlined text-primary">description</span>
        </div>` : ""}
        <p class="text-[10px] text-on-surface-variant text-center">Dipublikasikan ${waktuRelatif(VISI.updatedAt || VISI.createdAt)}</p>
      </div>
    ` : `
      <div class="text-center py-10 text-on-surface-variant">
        <span class="material-symbols-outlined text-5xl block mb-2 opacity-40">palette</span>
        <p class="text-sm">Belum ada visi artistik</p>
        <p class="text-xs mt-1">Buat visi artistik untuk dipublikasikan ke pemain & tim</p>
      </div>
    `}
  </div>`;

  document.getElementById("btn-edit-visi").addEventListener("click", () => {
    if (VISI) {
      document.getElementById("v-judul").value = VISI.judul || "";
      document.getElementById("v-tema").value = VISI.tema || "";
      document.getElementById("v-gaya").value = VISI.gaya || "Realisme";
      document.getElementById("v-scene").value = VISI.scene || "";
      document.getElementById("v-moodboard").value = VISI.moodboard || "";
      document.getElementById("v-promptbook").value = VISI.promptbook || "";
    }
    openModal("modal-visi");
  });
}

/* =========================================================
 * TAB: CASTING
 * ========================================================= */
async function renderCasting() {
  const c = document.getElementById("tab-content");
  c.innerHTML = `<div class="glass rounded-2xl p-5">${skeleton(4)}</div>`;

  const snap = await getDocs(query(collection(db, "casting"), where("kelas", "==", ME.profile.kelas), orderBy("tokoh", "asc")));
  CASTING = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  c.innerHTML = `
  <div class="glass rounded-2xl p-5">
    <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
      <h3 class="font-headline font-semibold flex items-center gap-2">
        <span class="material-symbols-outlined text-secondary">person_search</span> Casting & Audisi
      </h3>
      <button id="btn-add-casting" class="px-3 py-2 rounded-lg bg-secondary text-on-secondary text-xs font-medium flex items-center gap-1">
        <span class="material-symbols-outlined text-sm">add</span> Tambah Tokoh
      </button>
    </div>

    ${CASTING.length ? `
    <div class="overflow-x-auto">
      <table class="w-full text-xs">
        <thead class="text-on-surface-variant">
          <tr class="border-b border-outline-variant/40">
            <th class="text-left p-2">Tokoh</th>
            <th class="text-left p-2">Deskripsi</th>
            <th class="text-left p-2">Pemain</th>
            <th class="text-center p-2">Status</th>
            <th class="text-center p-2">Aksi</th>
          </tr>
        </thead>
        <tbody>
          ${CASTING.map((row) => `
            <tr class="border-b border-outline-variant/20 hover:bg-surface-container">
              <td class="p-2 font-medium">${esc(row.tokoh)}</td>
              <td class="p-2 text-on-surface-variant">${esc(row.deskripsi || "-")}</td>
              <td class="p-2">${esc(row.pemainNama || "-")}</td>
              <td class="p-2 text-center">
                <span class="text-[10px] px-2 py-0.5 rounded-full ${
                  row.status === "Final" ? "bg-green-600/20 text-green-400" :
                  row.status === "Cadangan" ? "bg-yellow-500/20 text-yellow-400" : "bg-blue-500/20 text-blue-400"
                }">${esc(row.status)}</span>
              </td>
              <td class="p-2 text-center">
                <button class="btn-del-casting text-error hover:opacity-70" data-id="${row.id}">
                  <span class="material-symbols-outlined text-sm">delete</span>
                </button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>` : `
      <div class="text-center py-10 text-on-surface-variant">
        <span class="material-symbols-outlined text-5xl block mb-2 opacity-40">person_search</span>
        <p class="text-sm">Belum ada casting</p>
      </div>`}
  </div>`;

  document.getElementById("btn-add-casting").addEventListener("click", async () => {
    // Load pemain
    const pSnap = await getDocs(query(collection(db, "users"), where("kelas", "==", ME.profile.kelas), where("role", "==", "siswa"), where("peran", "==", "Pemain")));
    PEMAIN = pSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    const sel = document.getElementById("c-pemain");
    sel.innerHTML = `<option value="">Pilih Pemain</option>` + PEMAIN.map((p) => `<option value="${p.uid}" data-nama="${esc(p.nama)}">${esc(p.nama)}</option>`).join("");
    openModal("modal-casting");
  });

  document.querySelectorAll(".btn-del-casting").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Hapus casting ini?")) return;
      try {
        await deleteDoc(doc(db, "casting", b.dataset.id));
        showToast("Casting dihapus.", "success");
        renderCasting();
      } catch (e) { showToast("Gagal hapus.", "error"); }
    })
  );
}

/* =========================================================
 * TAB: CATATAN HARIAN
 * ========================================================= */
async function renderCatatan() {
  const c = document.getElementById("tab-content");
  c.innerHTML = `<div class="glass rounded-2xl p-5">${skeleton(4)}</div>`;

  const snap = await getDocs(query(collection(db, "catatanHarian"), where("kelas", "==", ME.profile.kelas), orderBy("tanggal", "desc"), limit(30)));
  CATATAN = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  c.innerHTML = `
  <div class="glass rounded-2xl p-5">
    <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
      <h3 class="font-headline font-semibold flex items-center gap-2">
        <span class="material-symbols-outlined text-secondary">edit_note</span> Catatan Evaluasi Harian
      </h3>
      <button id="btn-add-catatan" class="px-3 py-2 rounded-lg bg-secondary text-on-secondary text-xs font-medium flex items-center gap-1">
        <span class="material-symbols-outlined text-sm">add</span> Tambah Catatan
      </button>
    </div>

    ${CATATAN.length ? `
    <div class="relative pl-6">
      <div class="absolute left-2 top-0 bottom-0 w-0.5 bg-outline-variant/40"></div>
      ${CATATAN.map((n) => `
        <div class="relative mb-4 last:mb-0">
          <div class="absolute -left-4 top-1 w-3 h-3 rounded-full ${
            n.status === "Baik" ? "bg-green-500" :
            n.status === "Perlu Perbaikan" ? "bg-yellow-500" : "bg-error"
          } border-2 border-surface"></div>
          <div class="p-3 rounded-xl bg-surface-container">
            <div class="flex items-center justify-between gap-2 mb-1 flex-wrap">
              <p class="text-sm font-medium">${esc(n.adegan)}</p>
              <span class="text-[10px] px-2 py-0.5 rounded-full ${
                n.status === "Baik" ? "bg-green-600/20 text-green-400" :
                n.status === "Perlu Perbaikan" ? "bg-yellow-500/20 text-yellow-400" : "bg-error/20 text-error"
              }">${esc(n.status)}</span>
            </div>
            <p class="text-xs text-on-surface-variant">${formatTanggal(n.tanggal)}</p>
            <p class="text-sm mt-2 whitespace-pre-wrap">${esc(n.catatan)}</p>
            ${n.taggedNama?.length ? `
              <div class="flex flex-wrap gap-1 mt-2">
                ${n.taggedNama.map((t) => `<span class="text-[10px] px-1.5 py-0.5 rounded bg-primary-container text-primary">${esc(t)}</span>`).join("")}
              </div>` : ""}
          </div>
        </div>
      `).join("")}
    </div>` : `
      <div class="text-center py-10 text-on-surface-variant">
        <span class="material-symbols-outlined text-5xl block mb-2 opacity-40">edit_note</span>
        <p class="text-sm">Belum ada catatan harian</p>
      </div>`}
  </div>`;

  document.getElementById("btn-add-catatan").addEventListener("click", async () => {
    document.getElementById("ch-tanggal").value = new Date().toISOString().slice(0, 10);
    // Load pemain
    const pSnap = await getDocs(query(collection(db, "users"), where("kelas", "==", ME.profile.kelas), where("role", "==", "siswa"), where("peran", "==", "Pemain")));
    PEMAIN = pSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    const sel = document.getElementById("ch-tag");
    sel.innerHTML = PEMAIN.map((p) => `<option value="${p.uid}" data-nama="${esc(p.nama)}">${esc(p.nama)}</option>`).join("");
    openModal("modal-catatan");
  });
}

/* =========================================================
 * TAB: PENILAIAN PEMAIN
 * ========================================================= */
async function renderPenilaian() {
  const c = document.getElementById("tab-content");
  c.innerHTML = `<div class="glass rounded-2xl p-5">${skeleton(4)}</div>`;

  const pSnap = await getDocs(query(collection(db, "users"), where("kelas", "==", ME.profile.kelas), where("role", "==", "siswa"), where("peran", "==", "Pemain")));
  PEMAIN = pSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));

  // Cek yang sudah dinilai
  const nilaiSnap = await getDocs(query(collection(db, "penilaian"), where("penilaiUid", "==", ME.uid)));
  const sudahDinilai = {};
  nilaiSnap.docs.forEach((d) => {
    const n = d.data();
    if (!sudahDinilai[n.targetUid]) sudahDinilai[n.targetUid] = [];
    sudahDinilai[n.targetUid].push(n.tahapan);
  });

  c.innerHTML = `
  <div class="glass rounded-2xl p-5">
    <h3 class="font-headline font-semibold mb-4 flex items-center gap-2">
      <span class="material-symbols-outlined text-secondary">grade</span> Penilaian Pemain (6 Kriteria)
    </h3>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      ${PEMAIN.map((p) => {
        const tahaps = sudahDinilai[p.uid] || [];
        return `
        <div class="p-3 rounded-xl bg-surface-container hover:bg-surface-container-high transition cursor-pointer btn-nilai" data-uid="${p.uid}" data-nama="${esc(p.nama)}">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-full bg-primary-container text-primary flex items-center justify-center font-bold">${inisial(p.nama)}</div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium truncate">${esc(p.nama)}</p>
              <p class="text-xs text-on-surface-variant">${esc(p.peran)}</p>
              <div class="flex flex-wrap gap-1 mt-1">
                ${["persiapan", "pelaksanaan", "pertunjukan", "pasca"].map((t) => `
                  <span class="text-[9px] px-1.5 py-0.5 rounded ${
                    tahaps.includes(t) ? "bg-green-600/20 text-green-400" : "bg-surface-container-high text-on-surface-variant"
                  }">${t.charAt(0).toUpperCase()}</span>`).join("")}
              </div>
            </div>
            <span class="material-symbols-outlined text-on-surface-variant">chevron_right</span>
          </div>
        </div>`;
      }).join("")}
    </div>

    ${!PEMAIN.length ? `<p class="text-center text-sm text-on-surface-variant py-8">Belum ada pemain di kelas ini</p>` : ""}
  </div>`;

  document.querySelectorAll(".btn-nilai").forEach((b) =>
    b.addEventListener("click", () => bukaFormNilai(b.dataset.uid, b.dataset.nama))
  );
}

function bukaFormNilai(uid, nama) {
  NILAI_TARGET = { uid, nama };
  const kriteria = KRITERIA_PER_PERAN.Pemain;

  document.getElementById("nilai-judul").textContent = `Penilaian: ${nama}`;
  document.getElementById("nilai-sub").textContent = "Pemain · 6 kriteria";

  const form = document.getElementById("nilai-form");
  form.innerHTML = `
    <div class="mb-3">
      <label class="text-xs text-on-surface-variant mb-1 block">Tahapan</label>
      <select id="nl-tahap" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm">
        <option value="persiapan">Persiapan (20%)</option>
        <option value="pelaksanaan">Pelaksanaan (35%)</option>
        <option value="pertunjukan">Pertunjukan (30%)</option>
        <option value="pasca">Pasca (15%)</option>
      </select>
    </div>
    ${kriteria.map((k) => `
      <div class="p-3 rounded-xl bg-surface-container">
        <div class="flex justify-between mb-2">
          <p class="text-sm font-medium">${k.nama}</p>
          <span class="text-xs text-on-surface-variant">${k.bobot}%</span>
        </div>
        <input type="range" min="1" max="4" value="3" data-kriteria="${k.nama}" data-bobot="${k.bobot}" class="slider-nilai w-full accent-primary" />
        <div class="flex justify-between text-[10px] text-on-surface-variant mt-1">
          <span>1 Kurang</span><span>2 Cukup</span><span>3 Baik</span><span>4 Sangat Baik</span>
        </div>
        <p class="text-xs text-primary mt-2 deskripsi-nilai">${k.deskripsi[2]}</p>
        <input type="text" placeholder="Komentar (wajib jika skor ≤ 2)" data-komentar="${k.nama}"
          class="komentar-input w-full mt-2 px-3 py-2 text-xs rounded-lg bg-surface-container-high border border-outline-variant" />
      </div>
    `).join("")}
    <div class="p-3 rounded-xl bg-primary-container/40 border border-primary/30">
      <p class="text-xs text-on-surface-variant">Preview Nilai</p>
      <p class="font-headline font-bold text-2xl text-primary" id="nl-preview">80.00</p>
    </div>
  `;

  const updatePreview = () => {
    let total = 0, totBob = 0;
    form.querySelectorAll(".slider-nilai").forEach((s) => {
      const skor = parseInt(s.value);
      const bob = parseInt(s.dataset.bobot);
      total += skorKeNilai(skor) * bob;
      totBob += bob;
      const k = kriteria.find((x) => x.nama === s.dataset.kriteria);
      if (k) s.closest(".p-3").querySelector(".deskripsi-nilai").textContent = k.deskripsi[skor - 1];
    });
    form.querySelector("#nl-preview").textContent = (totBob ? total / totBob : 0).toFixed(2);
  };

  form.querySelectorAll(".slider-nilai").forEach((s) => s.addEventListener("input", updatePreview));
  updatePreview();

  openModal("modal-nilai");
}

async function simpanNilai(status) {
  const form = document.getElementById("nilai-form");
  const tahap = document.getElementById("nl-tahap").value;
  const nilai = [];
  let valid = true;
  form.querySelectorAll(".slider-nilai").forEach((s) => {
    const skor = parseInt(s.value);
    const komentar = form.querySelector(`[data-komentar="${s.dataset.kriteria}"]`).value.trim();
    if (skor <= 2 && !komentar) { valid = false; showToast(`Komentar wajib untuk "${s.dataset.kriteria}"`, "warning"); return; }
    nilai.push({ kriteria: s.dataset.kriteria, skor, komentar });
  });
  if (!valid) return;

  try {
    // Cek existing
    const existing = await getDocs(query(
      collection(db, "penilaian"),
      where("penilaiUid", "==", ME.uid),
      where("targetUid", "==", NILAI_TARGET.uid),
      where("tahapan", "==", tahap)
    ));

    if (!existing.empty) {
      await updateDoc(doc(db, "penilaian", existing.docs[0].id), {
        nilai, status, updatedAt: serverTimestamp(),
        versi: (existing.docs[0].data().versi || 1) + 1,
      });
    } else {
      await addDoc(collection(db, "penilaian"), {
        penilaiUid: ME.uid,
        targetUid: NILAI_TARGET.uid,
        tahapan: tahap,
        jenisPenilai: "ketua",
        status, anonim: false,
        nilai,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    // Notifikasi ke pemain
    await kirimNotifikasi({
      penerimaUid: NILAI_TARGET.uid,
      jenis: "Info",
      judul: status === "final" ? "Nilai Baru dari Sutradara" : "Draft Nilai Tersimpan",
      pesan: `Sutradara memberi ${status === "final" ? "nilai final" : "draft nilai"} di tahap ${tahap}.`,
      dari: ME.profile.nama,
      link: "nilai.html",
    });

    await logActivity(ME.uid, `nilai_pemain_${status}`, NILAI_TARGET.uid);
    showToast(status === "final" ? "Nilai difinalisasi!" : "Draft disimpan!", "success");
    closeModal("modal-nilai");
    renderPenilaian();
  } catch (e) {
    console.error(e);
    showToast("Gagal simpan nilai.", "error");
  }
}

/* =========================================================
 * TAB: CALL SHEET
 * ========================================================= */
async function renderCallSheet() {
  const c = document.getElementById("tab-content");
  c.innerHTML = `<div class="glass rounded-2xl p-5">${skeleton(4)}</div>`;

  const snap = await getDocs(query(collection(db, "jadwal"), where("jenis", "in", ["Latihan", "Gladi", "Pementasan"]), orderBy("tanggal", "asc"), limit(20)));

  c.innerHTML = `
  <div class="glass rounded-2xl p-5">
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-headline font-semibold flex items-center gap-2">
        <span class="material-symbols-outlined text-secondary">call</span> Call Sheet
      </h3>
      <button id="btn-print-call" class="px-3 py-2 rounded-lg bg-primary text-on-primary text-xs font-medium flex items-center gap-1">
        <span class="material-symbols-outlined text-sm">print</span> Cetak
      </button>
    </div>
    <div id="call-list" class="space-y-3">
      ${snap.docs.map((d) => {
        const j = d.data();
        return `
          <div class="p-4 rounded-xl bg-surface-container border-l-4 border-secondary">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="font-medium text-sm">${esc(j.judul)}</p>
                <p class="text-xs text-on-surface-variant mt-1">${formatTanggal(j.tanggal)} · ${j.jamMulai}-${j.jamSelesai}</p>
                <p class="text-xs text-on-surface-variant">Lokasi: ${esc(j.lokasi)}</p>
                <p class="text-xs text-on-surface-variant">Jenis: ${esc(j.jenis)}</p>
              </div>
              <span class="material-symbols-outlined text-secondary">event</span>
            </div>
          </div>`;
      }).join("") || `<p class="text-center text-sm text-on-surface-variant py-8">Belum ada jadwal untuk call sheet</p>`}
    </div>
  </div>`;

  document.getElementById("btn-print-call").addEventListener("click", () => window.print());
}

/* =========================================================
 * INIT
 * ========================================================= */
(async function init() {
  const { uid, profile } = await protectPage();
  ME = { uid, profile };

  const menu = [
    { icon: "dashboard", label: "Dashboard", href: "dashboard.html" },
    { icon: "movie", label: "Panel Sutradara", href: "sutradara.html" },
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
      m.href === "sutradara.html" ? "bg-primary-container text-primary font-medium" : "text-on-surface-variant hover:bg-surface-container"
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
  ].map((i) => `<a href="${i.href}" class="flex flex-col items-center justify-center py-2 text-[10px] gap-0.5 ${
    i.href === "sutradara.html" ? "text-primary" : "text-on-surface-variant"
  }"><span class="material-symbols-outlined text-xl">${i.icon}</span>${i.label}</a>`).join("");

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

  // Form Visi
  document.getElementById("form-visi").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const data = {
        kelas: ME.profile.kelas,
        judul: document.getElementById("v-judul").value.trim(),
        tema: document.getElementById("v-tema").value.trim(),
        gaya: document.getElementById("v-gaya").value,
        scene: document.getElementById("v-scene").value.trim(),
        moodboard: document.getElementById("v-moodboard").value.trim(),
        promptbook: document.getElementById("v-promptbook").value.trim(),
        sutradaraUid: ME.uid,
        updatedAt: serverTimestamp(),
      };
      if (VISI) {
        await updateDoc(doc(db, "visiArtistik", VISI.id), data);
      } else {
        data.createdAt = serverTimestamp();
        await addDoc(collection(db, "visiArtistik"), data);
      }

      // Notifikasi ke semua siswa kelas
      const siswaSnap = await getDocs(query(collection(db, "users"), where("role", "==", "siswa"), where("kelas", "==", ME.profile.kelas)));
      const uids = siswaSnap.docs.map((d) => d.id);
      if (uids.length) {
        await kirimNotifikasiBanyak({
          penerimaUids: uids,
          jenis: "Instruksi",
          judul: "Visi Artistik Dipublikasikan",
          pesan: `${ME.profile.nama} mempublikasikan visi artistik produksi. Cek panel Sutradara untuk detail.`,
          dari: ME.profile.nama,
          link: "dashboard.html",
        });
      }

      await logActivity(ME.uid, "publish_visi");
      showToast("Visi artistik dipublikasikan!", "success");
      closeModal("modal-visi");
      renderVisi();
    } catch (err) {
      console.error(err);
      showToast("Gagal simpan visi.", "error");
    }
  });

  // Form Casting
  document.getElementById("form-casting").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pemainUid = document.getElementById("c-pemain").value;
    const pemainNama = document.getElementById("c-pemain").selectedOptions[0]?.dataset.nama || "";
    try {
      await addDoc(collection(db, "casting"), {
        kelas: ME.profile.kelas,
        tokoh: document.getElementById("c-tokoh").value.trim(),
        deskripsi: document.getElementById("c-desk").value.trim(),
        pemainUid,
        pemainNama,
        status: document.getElementById("c-status").value,
        sutradaraUid: ME.uid,
        createdAt: serverTimestamp(),
      });

      if (pemainUid) {
        await kirimNotifikasi({
          penerimaUid: pemainUid,
          jenis: "Info",
          judul: "Casting Diumumkan",
          pesan: `${ME.profile.nama} menetapkan Anda sebagai ${document.getElementById("c-tokoh").value}.`,
          dari: ME.profile.nama,
          link: "dashboard.html",
        });
      }

      await logActivity(ME.uid, "tambah_casting");
      showToast("Casting disimpan!", "success");
      closeModal("modal-casting");
      e.target.reset();
      renderCasting();
    } catch (err) { showToast("Gagal simpan casting.", "error"); }
  });

  // Form Catatan
  document.getElementById("form-catatan").addEventListener("submit", async (e) => {
    e.preventDefault();
    const sel = document.getElementById("ch-tag");
    const tagged = Array.from(sel.selectedOptions).map((o) => ({ uid: o.value, nama: o.dataset.nama }));

    try {
      await addDoc(collection(db, "catatanHarian"), {
        kelas: ME.profile.kelas,
        tanggal: document.getElementById("ch-tanggal").value,
        adegan: document.getElementById("ch-adegan").value.trim(),
        status: document.getElementById("ch-status").value,
        catatan: document.getElementById("ch-catatan").value.trim(),
        taggedUids: tagged.map((t) => t.uid),
        taggedNama: tagged.map((t) => t.nama),
        sutradaraUid: ME.uid,
        createdAt: serverTimestamp(),
      });

      // Notifikasi ke pemain yang di-tag
      if (tagged.length) {
        await kirimNotifikasiBanyak({
          penerimaUids: tagged.map((t) => t.uid),
          jenis: "Feedback",
          judul: `Catatan dari Sutradara: ${document.getElementById("ch-adegan").value}`,
          pesan: document.getElementById("ch-catatan").value.slice(0, 100),
          dari: ME.profile.nama,
          link: "sutradara.html",
        });
      }

      await logActivity(ME.uid, "tambah_catatan");
      showToast("Catatan tersimpan!", "success");
      closeModal("modal-catatan");
      e.target.reset();
      renderCatatan();
    } catch (err) { showToast("Gagal simpan catatan.", "error"); }
  });

  // Nilai draft/final
  document.getElementById("btn-nilai-draft").addEventListener("click", () => simpanNilai("draft"));
  document.getElementById("btn-nilai-final").addEventListener("click", () => {
    if (confirm("Finalisasi nilai?")) simpanNilai("final");
  });

  // Tabs
  document.querySelectorAll(".tab-btn").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));

  switchTab("visi");
})();
