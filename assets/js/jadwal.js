/**
 * SP-PPT — Modul Jadwal & Kalender (versi lanjutan)
 * Tabs: Kalender | Master Schedule | Booking Alat
 */

import { auth, db } from "./firebase-init.js";
import {
  doc, getDoc, addDoc, collection, query, where, getDocs, orderBy,
  serverTimestamp, onSnapshot, updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { protectPage } from "./router.js";
import {
  showToast, openModal, closeModal, skeleton, formatTanggal, formatWaktu,
  esc, warnaPeran, inisial, logActivity, waktuRelatif,
} from "./utils.js";
import { initNotifikasi, bukaPanelNotif } from "./notifikasi.js";
import {
  KATEGORI_ALAT, DAFTAR_ALAT, cekBentrok, formatRangeWaktu,
  badgeStatusBooking, subscribeBooking, bolehApprove,
  approveBooking, rejectBooking, batalkanBooking, buatBooking,
} from "./booking.js";

let ME = null;
let TAB = "kalender";
let BULAN_INI = new Date();
let SEMUA_JADWAL = [];
let SEMUA_BOOKING = [];
let UNSUB_BOOKING = null;

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
 * HAK BUAT JADWAL
 * ========================================================= */
function bolehBuatJadwal() {
  const p = ME.profile.peran, r = ME.profile.role;
  return r === "guru" || r === "admin" ||
    ["Pimpinan Produksi", "Sekretaris", "Sutradara", "Asisten Sutradara"].includes(p) ||
    p.startsWith("Koordinator");
}

/* =========================================================
 * TAB SWITCH
 * ========================================================= */
function switchTab(tab) {
  TAB = tab;
  document.querySelectorAll(".tab-btn").forEach((b) => {
    const aktif = b.dataset.tab === tab;
    b.className = `tab-btn px-4 py-2 rounded-xl text-sm font-medium transition ${
      aktif ? "bg-primary-container text-primary" : "text-on-surface-variant hover:bg-surface-container"
    }`;
  });
  if (tab === "kalender") renderKalenderTab();
  if (tab === "master") renderMasterTab();
  if (tab === "booking") renderBookingTab();
}

/* =========================================================
 * TAB: KALENDER
 * ========================================================= */
function renderKalenderTab() {
  const c = document.getElementById("tab-content");
  c.innerHTML = `
    <!-- Kalender -->
    <div class="glass rounded-2xl p-5 mb-5">
      <div class="flex items-center justify-between mb-4">
        <button id="prev-month" class="p-2 rounded-lg hover:bg-surface-container"><span class="material-symbols-outlined">chevron_left</span></button>
        <h3 id="kalender-judul" class="font-headline font-semibold text-lg"></h3>
        <button id="next-month" class="p-2 rounded-lg hover:bg-surface-container"><span class="material-symbols-outlined">chevron_right</span></button>
      </div>
      <div class="grid grid-cols-7 gap-1 mb-2 text-center text-[10px] text-on-surface-variant font-medium">
        <span>Sen</span><span>Sel</span><span>Rab</span><span>Kam</span><span>Jum</span><span>Sab</span><span>Min</span>
      </div>
      <div id="kalender-grid" class="grid grid-cols-7 gap-1"></div>
      <div class="flex flex-wrap gap-3 mt-4 text-[10px]">
        ${Object.entries(WARNA_JENIS).map(([j, w]) => `
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full ${w}"></span>${j}</span>
        `).join("")}
      </div>
    </div>

    <!-- Daftar Jadwal -->
    <div class="glass rounded-2xl p-5">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-headline font-semibold">📅 Jadwal Terdekat</h3>
        ${bolehBuatJadwal() ? `<button id="btn-tambah-jadwal" class="px-3 py-2 rounded-lg bg-primary text-on-primary text-xs font-medium">+ Tambah Jadwal</button>` : ""}
      </div>
      <div id="jadwal-list" class="space-y-2"></div>
    </div>
  `;

  renderKalender();
  renderListJadwal();

  document.getElementById("prev-month").addEventListener("click", () => { BULAN_INI.setMonth(BULAN_INI.getMonth() - 1); renderKalender(); });
  document.getElementById("next-month").addEventListener("click", () => { BULAN_INI.setMonth(BULAN_INI.getMonth() + 1); renderKalender(); });

  document.getElementById("btn-tambah-jadwal")?.addEventListener("click", () => openModal("modal-jadwal"));
}

function renderKalender() {
  const y = BULAN_INI.getFullYear();
  const m = BULAN_INI.getMonth();
  document.getElementById("kalender-judul").textContent = `${BULAN[m]} ${y}`;

  const first = new Date(y, m, 1);
  const lastDay = new Date(y, m + 1, 0).getDate();
  let startDow = first.getDay() - 1; if (startDow < 0) startDow = 6;

  const grid = document.getElementById("kalender-grid");
  grid.innerHTML = "";
  for (let i = 0; i < startDow; i++) grid.innerHTML += `<div></div>`;

  for (let d = 1; d <= lastDay; d++) {
    const tglStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dayJadwal = SEMUA_JADWAL.filter((j) => j.tanggal === tglStr);
    const dayBooking = SEMUA_BOOKING.filter((b) => {
      const bStart = new Date(b.waktuMulai).toISOString().slice(0, 10);
      return bStart === tglStr && b.status === "Approved";
    });
    const dots = [
      ...dayJadwal.slice(0, 2).map((j) => `<span class="w-1.5 h-1.5 rounded-full ${WARNA_JENIS[j.jenis] || "bg-gray-500"}"></span>`),
      ...dayBooking.slice(0, 1).map(() => `<span class="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>`),
    ].join("");
    const today = new Date().toDateString() === new Date(y, m, d).toDateString();
    grid.innerHTML += `
      <button data-tgl="${tglStr}" class="kalender-cell aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 text-xs transition ${
        today ? "bg-primary text-on-primary font-bold" : "hover:bg-surface-container"
      }">
        ${d}
        <div class="flex gap-0.5">${dots}</div>
      </button>`;
  }

  grid.querySelectorAll(".kalender-cell").forEach((b) =>
    b.addEventListener("click", () => {
      const tgl = b.dataset.tgl;
      const listJ = SEMUA_JADWAL.filter((j) => j.tanggal === tgl);
      const listB = SEMUA_BOOKING.filter((x) => new Date(x.waktuMulai).toISOString().slice(0, 10) === tgl && x.status !== "Rejected");
      if (!listJ.length && !listB.length) return showToast("Tidak ada kegiatan di tanggal ini.", "info");
      const txt = [
        ...listJ.map((j) => `📅 ${j.judul} (${j.jamMulai}-${j.jamSelesai}) @ ${j.lokasi}`),
        ...listB.map((b) => `🎤 Booking ${b.alat} oleh ${b.pemohonNama}`),
      ].join("\n");
      alert(txt);
    })
  );
}

function renderListJadwal() {
  const list = document.getElementById("jadwal-list");
  const todayStr = new Date().toISOString().slice(0, 10);
  const upcoming = SEMUA_JADWAL
    .filter((j) => j.tanggal >= todayStr)
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
 * TAB: MASTER SCHEDULE (Timeline Horizontal)
 * ========================================================= */
function renderMasterTab() {
  const c = document.getElementById("tab-content");

  // Gabungkan jadwal + booking + calendar konten
  const items = [
    ...SEMUA_JADWAL.map((j) => ({
      tipe: "jadwal",
      tanggal: j.tanggal,
      judul: j.judul,
      jenis: j.jenis,
      waktu: `${j.jamMulai}-${j.jamSelesai}`,
      lokasi: j.lokasi,
    })),
    ...SEMUA_BOOKING.filter((b) => b.status === "Approved").map((b) => ({
      tipe: "booking",
      tanggal: new Date(b.waktuMulai).toISOString().slice(0, 10),
      judul: `🎤 ${b.alat}`,
      jenis: "Booking",
      waktu: `${formatWaktu(b.waktuMulai)}-${formatWaktu(b.waktuSelesai)}`,
      lokasi: b.pemohonNama,
    })),
  ].sort((a, b) => a.tanggal.localeCompare(b.tanggal));

  if (!items.length) {
    c.innerHTML = `<div class="glass rounded-2xl p-10 text-center">
      <span class="material-symbols-outlined text-5xl text-on-surface-variant mb-3">timeline</span>
      <p class="text-sm text-on-surface-variant">Belum ada kegiatan untuk ditampilkan di timeline</p>
    </div>`;
    return;
  }

  // Kelompokkan per minggu/bulan
  const grup = {};
  items.forEach((i) => {
    const tgl = new Date(i.tanggal);
    const key = `${BULAN[tgl.getMonth()]} ${tgl.getFullYear()}`;
    if (!grup[key]) grup[key] = [];
    grup[key].push(i);
  });

  c.innerHTML = `
    <div class="glass rounded-2xl p-5">
      <div class="flex items-center justify-between mb-5">
        <h3 class="font-headline font-semibold flex items-center gap-2">
          <span class="material-symbols-outlined text-primary">timeline</span> Master Schedule
        </h3>
        <div class="flex gap-1">
          <button id="master-zoom-out" class="p-1.5 rounded hover:bg-surface-container"><span class="material-symbols-outlined">zoom_out</span></button>
          <button id="master-zoom-in" class="p-1.5 rounded hover:bg-surface-container"><span class="material-symbols-outlined">zoom_in</span></button>
        </div>
      </div>

      <div id="master-timeline" class="overflow-x-auto pb-4" style="scroll-behavior: smooth;">
        ${Object.entries(grup).map(([bulan, items]) => `
          <div class="mb-6 min-w-max">
            <div class="sticky left-0 inline-block px-3 py-1 rounded-lg bg-primary-container text-primary text-xs font-semibold mb-3">${bulan}</div>
            <div class="relative">
              <!-- Garis timeline horizontal -->
              <div class="absolute left-0 right-0 top-8 h-0.5 bg-gradient-to-r from-primary via-secondary to-tertiary"></div>
              <!-- Items -->
              <div class="flex gap-6 relative pt-4">
                ${items.map((i, idx) => {
                  const warna = i.tipe === "booking" ? "cyan" :
                    i.jenis === "Rapat" ? "blue" :
                    i.jenis === "Latihan" ? "orange" :
                    i.jenis === "Gladi" ? "red" :
                    i.jenis === "Pementasan" ? "yellow" :
                    i.jenis === "Evaluasi" ? "purple" :
                    i.jenis === "Produksi" ? "green" :
                    i.jenis === "Fitting" ? "pink" : "gray";
                  return `
                    <div class="timeline-item relative min-w-[180px]" data-tgl="${i.tanggal}">
                      <!-- Titik -->
                      <div class="w-4 h-4 rounded-full bg-${warna}-500 border-4 border-surface shadow-lg mx-auto mb-2"></div>
                      <!-- Kartu -->
                      <div class="p-3 rounded-xl bg-surface-container border border-outline-variant/40 hover:border-${warna}-500/60 hover:bg-surface-container-high transition cursor-pointer">
                        <p class="text-[10px] text-${warna}-400 font-medium mb-1">${formatTanggal(i.tanggal)}</p>
                        <p class="text-xs font-medium line-clamp-2">${esc(i.judul)}</p>
                        <p class="text-[10px] text-on-surface-variant mt-1">⏰ ${esc(i.waktu)}</p>
                        <p class="text-[10px] text-on-surface-variant">📍 ${esc(i.lokasi || "-")}</p>
                      </div>
                    </div>`;
                }).join("")}
              </div>
            </div>
          </div>
        `).join("")}
      </div>

      <!-- Legend -->
      <div class="flex flex-wrap gap-3 mt-4 pt-4 border-t border-outline-variant/40 text-[10px]">
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-blue-500"></span>Rapat</span>
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-orange-500"></span>Latihan</span>
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-red-500"></span>Gladi</span>
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-yellow-500"></span>Pementasan</span>
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-purple-500"></span>Evaluasi</span>
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-green-500"></span>Produksi</span>
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-pink-500"></span>Fitting</span>
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-cyan-500"></span>Booking</span>
      </div>
    </div>`;

  let zoomLevel = 180;
  document.getElementById("master-zoom-in").addEventListener("click", () => {
    zoomLevel = Math.min(zoomLevel + 60, 400);
    document.querySelectorAll(".timeline-item").forEach((el) => (el.style.minWidth = zoomLevel + "px"));
  });
  document.getElementById("master-zoom-out").addEventListener("click", () => {
    zoomLevel = Math.max(zoomLevel - 60, 120);
    document.querySelectorAll(".timeline-item").forEach((el) => (el.style.minWidth = zoomLevel + "px"));
  });

  document.querySelectorAll(".timeline-item").forEach((el) =>
    el.addEventListener("click", () => {
      const tgl = el.dataset.tgl;
      const j = SEMUA_JADWAL.find((x) => x.tanggal === tgl);
      if (j) alert(`${j.judul}\n📅 ${formatTanggal(j.tanggal)}\n⏰ ${j.jamMulai}-${j.jamSelesai}\n📍 ${j.lokasi}`);
    })
  );
}

/* =========================================================
 * TAB: BOOKING ALAT
 * ========================================================= */
function renderBookingTab() {
  const c = document.getElementById("tab-content");
  const bisaApprove = bolehApprove(ME.profile);

  // Statistik
  const stats = {
    pending: SEMUA_BOOKING.filter((b) => b.status === "Pending").length,
    approved: SEMUA_BOOKING.filter((b) => b.status === "Approved").length,
    rejected: SEMUA_BOOKING.filter((b) => b.status === "Rejected").length,
    milikSaya: SEMUA_BOOKING.filter((b) => b.pemohonUid === ME.uid).length,
  };

  c.innerHTML = `
    <!-- Statistik -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
      <div class="glass rounded-xl p-4">
        <p class="text-xs text-on-surface-variant">Pending</p>
        <p class="text-2xl font-bold text-yellow-400">${stats.pending}</p>
      </div>
      <div class="glass rounded-xl p-4">
        <p class="text-xs text-on-surface-variant">Disetujui</p>
        <p class="text-2xl font-bold text-green-400">${stats.approved}</p>
      </div>
      <div class="glass rounded-xl p-4">
        <p class="text-xs text-on-surface-variant">Ditolak</p>
        <p class="text-2xl font-bold text-error">${stats.rejected}</p>
      </div>
      <div class="glass rounded-xl p-4">
        <p class="text-xs text-on-surface-variant">Booking Saya</p>
        <p class="text-2xl font-bold text-primary">${stats.milikSaya}</p>
      </div>
    </div>

    <!-- Header + Tombol -->
    <div class="glass rounded-2xl p-5">
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 class="font-headline font-semibold">🎤 Daftar Booking</h3>
        <div class="flex gap-2">
          <select id="booking-filter" class="px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-xs">
            <option value="all">Semua Status</option>
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
            <option value="saya">Booking Saya</option>
            ${bisaApprove ? `<option value="perlu_approve">Perlu Approval</option>` : ""}
          </select>
          <button id="btn-booking-baru" class="px-3 py-2 rounded-lg bg-secondary text-on-secondary text-xs font-medium">+ Booking Baru</button>
        </div>
      </div>
      <div id="booking-list" class="space-y-3"></div>
    </div>
  `;

  renderBookingList("all");

  document.getElementById("booking-filter").addEventListener("change", (e) => renderBookingList(e.target.value));
  document.getElementById("btn-booking-baru").addEventListener("click", () => bukaFormBooking());
}

function renderBookingList(filter) {
  const el = document.getElementById("booking-list");
  let list = [...SEMUA_BOOKING];

  if (filter === "saya") list = list.filter((b) => b.pemohonUid === ME.uid);
  else if (filter === "perlu_approve") list = list.filter((b) => b.status === "Pending");
  else if (filter !== "all") list = list.filter((b) => b.status === filter);

  if (!list.length) {
    el.innerHTML = `<div class="text-center py-8 text-on-surface-variant">
      <span class="material-symbols-outlined text-4xl opacity-40 mb-2 block">event_busy</span>
      <p class="text-sm">Tidak ada booking</p>
    </div>`;
    return;
  }

  const bisaApprove = bolehApprove(ME.profile);
  const kini = Date.now();

  el.innerHTML = list.map((b) => {
    const isMine = b.pemohonUid === ME.uid;
    const selesai = new Date(b.waktuSelesai).getTime() < kini && b.status === "Approved";
    const kat = KATEGORI_ALAT[b.kategori] || KATEGORI_ALAT.Lainnya;

    return `
    <div class="p-4 rounded-xl bg-surface-container border border-outline-variant/40 ${
      b.status === "Pending" ? "border-l-4 border-l-yellow-500" :
      b.status === "Approved" ? "border-l-4 border-l-green-500" :
      "border-l-4 border-l-red-500"
    }">
      <div class="flex items-start justify-between gap-3 flex-wrap">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap mb-1">
            <div class="w-9 h-9 rounded-lg ${kat.bg} flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-base ${kat.warna}">${kat.icon}</span>
            </div>
            <div>
              <p class="text-sm font-medium">${esc(b.alat)}</p>
              <p class="text-[10px] text-on-surface-variant">${esc(b.kategori || "Lainnya")}</p>
            </div>
            ${badgeStatusBooking(b.status)}
            ${selesai ? `<span class="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">Selesai</span>` : ""}
          </div>
          <p class="text-xs text-on-surface-variant mt-2">⏰ ${formatRangeWaktu(b.waktuMulai, b.waktuSelesai)}</p>
          ${b.keperluan ? `<p class="text-xs text-on-surface-variant mt-1">📝 ${esc(b.keperluan)}</p>` : ""}
          <p class="text-[10px] text-on-surface-variant mt-2">
            Pemohon: <b>${esc(b.pemohonNama || "-")}</b> (${esc(b.pemohonPeran || "-")})
            ${isMine ? '<span class="px-1.5 py-0.5 rounded bg-primary-container text-primary font-medium ml-1">ANDA</span>' : ""}
          </p>
          ${b.status === "Approved" && b.approvedByName ? `
            <p class="text-[10px] text-green-400 mt-1">✓ Disetujui oleh ${esc(b.approvedByName)} · ${b.approvedAt ? waktuRelatif(b.approvedAt) : ""}</p>
          ` : ""}
          ${b.status === "Rejected" && b.rejectedByName ? `
            <p class="text-[10px] text-error mt-1">✗ Ditolak oleh ${esc(b.rejectedByName)}${b.alasanReject ? ` · ${esc(b.alasanReject)}` : ""}</p>
          ` : ""}
        </div>

        <!-- Actions -->
        <div class="flex flex-col gap-1 min-w-[100px]">
          ${bisaApprove && b.status === "Pending" ? `
            <button class="btn-approve px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium flex items-center justify-center gap-1" data-id="${b.id}">
              <span class="material-symbols-outlined text-xs">check</span> Setujui
            </button>
            <button class="btn-reject px-3 py-1.5 rounded-lg bg-error text-white text-xs font-medium flex items-center justify-center gap-1" data-id="${b.id}">
              <span class="material-symbols-outlined text-xs">close</span> Tolak
            </button>` : ""}
          ${isMine && b.status === "Pending" ? `
            <button class="btn-cancel px-3 py-1.5 rounded-lg bg-surface-container-high text-xs" data-id="${b.id}">Batalkan</button>
          ` : ""}
          ${bisaApprove ? `
            <button class="btn-detail-booking px-3 py-1.5 rounded-lg bg-surface-container-high text-xs" data-id="${b.id}">Detail</button>
          ` : ""}
        </div>
      </div>
    </div>`;
  }).join("");

  // Bind events
  el.querySelectorAll(".btn-approve").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const catatan = prompt("Catatan persetujuan (opsional):") || "";
      const ok = await approveBooking(btn.dataset.id, catatan, ME.uid, ME.profile.nama);
      if (ok) {
        showToast("Booking disetujui!", "success");
        await logActivity(ME.uid, "approve_booking", btn.dataset.id);
      } else showToast("Gagal menyetujui.", "error");
    })
  );

  el.querySelectorAll(".btn-reject").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const alasan = prompt("Alasan penolakan (wajib):");
      if (!alasan?.trim()) return showToast("Alasan wajib diisi.", "warning");
      const ok = await rejectBooking(btn.dataset.id, alasan, ME.uid, ME.profile.nama);
      if (ok) {
        showToast("Booking ditolak.", "success");
        await logActivity(ME.uid, "reject_booking", btn.dataset.id);
      } else showToast("Gagal menolak.", "error");
    })
  );

  el.querySelectorAll(".btn-cancel").forEach((btn) =>
    btn.addEventListener("click", async () => {
      if (!confirm("Batalkan booking ini?")) return;
      const ok = await batalkanBooking(btn.dataset.id, ME.uid, ME.profile.nama);
      if (ok) showToast("Booking dibatalkan.", "success");
    })
  );

  el.querySelectorAll(".btn-detail-booking").forEach((btn) =>
    btn.addEventListener("click", () => {
      const b = SEMUA_BOOKING.find((x) => x.id === btn.dataset.id);
      if (!b) return;
      alert(`Detail Booking\n\nAlat: ${b.alat}\nKategori: ${b.kategori}\nWaktu: ${formatRangeWaktu(b.waktuMulai, b.waktuSelesai)}\nKeperluan: ${b.keperluan || "-"}\nPemohon: ${b.pemohonNama} (${b.pemohonPeran})\nStatus: ${b.status}\n${b.approvedByName ? `\nDisetujui: ${b.approvedByName}` : ""}\n${b.catatanApproval ? `Catatan: ${b.catatanApproval}` : ""}`);
    })
  );
}

/* =========================================================
 * FORM BOOKING BARU (dengan validasi bentrok real-time)
 * ========================================================= */
function bukaFormBooking() {
  const c = document.getElementById("tab-content");

  const form = document.createElement("div");
  form.id = "booking-form-modal";
  form.className = "fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto";
  form.innerHTML = `
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" data-close-bf></div>
    <div class="relative glass rounded-2xl max-w-lg w-full my-8 p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-headline font-semibold flex items-center gap-2">
          <span class="material-symbols-outlined text-secondary">event_available</span> Booking Alat
        </h3>
        <button data-close-bf class="p-1 rounded hover:bg-surface-container"><span class="material-symbols-outlined">close</span></button>
      </div>

      <div class="space-y-3">
        <div>
          <label class="text-xs text-on-surface-variant mb-1 block">Kategori Alat</label>
          <select id="bf-kategori" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm">
            ${Object.keys(KATEGORI_ALAT).map((k) => `<option value="${k}">${k}</option>`).join("")}
          </select>
        </div>

        <div>
          <label class="text-xs text-on-surface-variant mb-1 block">Pilih Alat *</label>
          <select id="bf-alat" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm"></select>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="text-xs text-on-surface-variant mb-1 block">Mulai *</label>
            <input id="bf-mulai" type="datetime-local" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
          </div>
          <div>
            <label class="text-xs text-on-surface-variant mb-1 block">Selesai *</label>
            <input id="bf-selesai" type="datetime-local" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
          </div>
        </div>

        <div>
          <label class="text-xs text-on-surface-variant mb-1 block">Keperluan</label>
          <textarea id="bf-keperluan" rows="2" placeholder="Contoh: latihan adegan 2" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm"></textarea>
        </div>

        <div id="bf-warning" class="hidden p-3 rounded-lg bg-error/10 border border-error/30 text-xs text-error"></div>
        <div id="bf-info" class="hidden p-3 rounded-lg bg-tertiary/10 border border-tertiary/30 text-xs text-tertiary"></div>
      </div>

      <div class="flex gap-2 mt-5">
        <button type="button" data-close-bf class="flex-1 py-2.5 rounded-lg bg-surface-container-high text-sm">Batal</button>
        <button id="bf-submit" class="flex-1 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium flex items-center justify-center gap-1">
          <span class="material-symbols-outlined text-sm">send</span> Ajukan Booking
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(form);
  document.body.style.overflow = "hidden";

  const close = () => {
    form.remove();
    document.body.style.overflow = "";
  };
  form.querySelectorAll("[data-close-bf]").forEach((el) => el.addEventListener("click", close));

  // Populate alat
  const populateAlat = () => {
    const kat = document.getElementById("bf-kategori").value;
    const sel = document.getElementById("bf-alat");
    const filtered = DAFTAR_ALAT.filter((a) => a.kategori === kat);
    sel.innerHTML = filtered.map((a) => `<option value="${a.nama}">${a.nama}</option>`).join("") ||
      `<option value="">(Tidak ada alat)</option>`;
    validasiBentrok();
  };

  // Validasi bentrok real-time
  const validasiBentrok = () => {
    const alat = document.getElementById("bf-alat").value;
    const mulai = document.getElementById("bf-mulai").value;
    const selesai = document.getElementById("bf-selesai").value;
    const warn = document.getElementById("bf-warning");
    const info = document.getElementById("bf-info");

    warn.classList.add("hidden");
    info.classList.add("hidden");

    if (!alat || !mulai || !selesai) return;

    const hasil = cekBentrok(mulai, selesai, SEMUA_BOOKING.filter((b) => b.alat === alat));

    if (hasil?.error) {
      warn.textContent = hasil.error;
      warn.classList.remove("hidden");
      return;
    }
    if (hasil?.bentrok?.length) {
      warn.innerHTML = `⚠️ <b>BENTROK</b> dengan:<br>${hasil.bentrok.map((b) => `• ${b.pemohonNama} (${formatRangeWaktu(b.waktuMulai, b.waktuSelesai)})`).join("<br>")}`;
      warn.classList.remove("hidden");
    } else {
      info.innerHTML = `✅ Waktu tersedia untuk <b>${esc(alat)}</b>`;
      info.classList.remove("hidden");
    }
  };

  document.getElementById("bf-kategori").addEventListener("change", populateAlat);
  document.getElementById("bf-alat").addEventListener("change", validasiBentrok);
  document.getElementById("bf-mulai").addEventListener("input", validasiBentrok);
  document.getElementById("bf-selesai").addEventListener("input", validasiBentrok);
  populateAlat();

  // Submit
  document.getElementById("bf-submit").addEventListener("click", async () => {
    const btn = document.getElementById("bf-submit");
    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-outlined animate-spin text-sm">progress_activity</span> Mengirim...`;

    try {
      await buatBooking({
        alat: document.getElementById("bf-alat").value,
        kategori: document.getElementById("bf-kategori").value,
        waktuMulai: document.getElementById("bf-mulai").value,
        waktuSelesai: document.getElementById("bf-selesai").value,
        keperluan: document.getElementById("bf-keperluan").value.trim(),
        pemohonUid: ME.uid,
        pemohonNama: ME.profile.nama,
        pemohonPeran: ME.profile.peran,
      });
      await logActivity(ME.uid, "buat_booking", document.getElementById("bf-alat").value);
      showToast("Booking diajukan! Menunggu persetujuan.", "success");
      close();
    } catch (e) {
      showToast(e.message || "Gagal membuat booking.", "error", 5000);
      btn.disabled = false;
      btn.innerHTML = `<span class="material-symbols-outlined text-sm">send</span> Ajukan Booking`;
    }
  });
}

/* =========================================================
 * INIT
 * ========================================================= */
(async function init() {
  const { uid, profile } = await protectPage();
  ME = { uid, profile };

  // Sidebar
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
  ];
  document.getElementById("sidebar-nav").innerHTML = menu.map((m) => `
    <a href="${m.href}" class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition text-sm ${
      m.href === "jadwal.html" ? "bg-primary-container text-primary font-medium" : "text-on-surface-variant hover:bg-surface-container"
    }">
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
  ].map((i) => `<a href="${i.href}" class="flex flex-col items-center justify-center py-2 text-[10px] gap-0.5 ${
    i.href === "jadwal.html" ? "text-primary" : "text-on-surface-variant"
  }"><span class="material-symbols-outlined text-xl">${i.icon}</span>${i.label}</a>`).join("");

  // Theme
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
    if (confirm("Keluar?")) {
      await logActivity(ME.uid, "logout");
      await signOut(auth);
      window.location.replace("index.html");
    }
  });
  document.getElementById("btn-menu").addEventListener("click", () => {
    const sb = document.getElementById("sidebar");
    sb.classList.toggle("hidden"); sb.classList.toggle("flex");
  });

  // Init notifikasi
  initNotifikasi(uid, profile);

  // Load jadwal
  const loadJadwal = async () => {
    const snap = await getDocs(query(collection(db, "jadwal"), orderBy("tanggal", "asc")));
    SEMUA_JADWAL = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  };
  await loadJadwal();

  // Subscribe booking realtime
  UNSUB_BOOKING = subscribeBooking((list) => {
    SEMUA_BOOKING = list;
    if (TAB === "booking") renderBookingTab();
    if (TAB === "master") renderMasterTab();
    if (TAB === "kalender") renderKalender();
  });

  // Tabs
  document.querySelectorAll(".tab-btn").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));

  // Form jadwal
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
      await loadJadwal();
      if (TAB === "kalender") renderKalenderTab();
      if (TAB === "master") renderMasterTab();
    } catch (err) { showToast("Gagal tambah jadwal.", "error"); }
  });

  switchTab("kalender");
})();
