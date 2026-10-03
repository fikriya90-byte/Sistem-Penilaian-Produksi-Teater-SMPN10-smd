/**
 * SP-PPT — Modul Rapor PDF
 * Generate rapor dengan kop resmi + logo + QR verifikasi.
 */

import { auth, db } from "./firebase-init.js";
import {
  doc, getDoc, collection, query, where, getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { protectPage } from "./router.js";
import { showToast, esc, warnaPeran, inisial, logActivity, formatTanggal } from "./utils.js";

const LOGO_SEKOLAH = "https://iili.io/nBiviCX.png";
const LOGO_MAPEL = "https://iili.io/n50AB.png".replace("n50AB", "nap50AB");

let ME = null;

const KRITERIA_PEMAIN = [
  { nama: "Hafalan Dialog", bobot: 20 },
  { nama: "Penjiwaan Karakter", bobot: 25 },
  { nama: "Proyeksi Suara & Intonasi", bobot: 15 },
  { nama: "Blocking & Movement", bobot: 15 },
  { nama: "Interaksi Panggung", bobot: 15 },
  { nama: "Kedisiplinan", bobot: 10 },
];

function skorKeNilai(s) { return { 4: 100, 3: 80, 2: 60, 1: 40 }[s] || 0; }

function predikat(n) {
  if (n >= 90) return { huruf: "A", label: "Mahir, teladan" };
  if (n >= 80) return { huruf: "B", label: "Kompeten, andal" };
  if (n >= 70) return { huruf: "C", label: "Memenuhi standar" };
  if (n >= 60) return { huruf: "D", label: "Perlu perbaikan" };
  return { huruf: "E", label: "Tidak memenuhi" };
}

/* =========================================================
 * RENDER RAPOR
 * ========================================================= */
async function renderRapor(targetUid) {
  const uSnap = await getDoc(doc(db, "users", targetUid));
  if (!uSnap.exists()) { showToast("Siswa tidak ditemukan.", "error"); return; }
  const siswa = uSnap.data();

  // Ambil semua penilaian
  const pSnap = await getDocs(query(collection(db, "penilaian"), where("targetUid", "==", targetUid)));
  const penilaian = pSnap.docs.map((d) => d.data());

  // Kelompok per tahap
  const tahapLabel = { persiapan: "Persiapan", pelaksanaan: "Pelaksanaan", pertunjukan: "Pertunjukan", pasca: "Pasca" };
  const nilaiPerTahap = { persiapan: 0, pelaksanaan: 0, pertunjukan: 0, pasca: 0 };

  Object.keys(nilaiPerTahap).forEach((t) => {
    const arr = penilaian.filter((p) => p.tahapan === t);
    if (!arr.length) return;
    let total = 0;
    arr.forEach((p) => {
      let t2 = 0, tb = 0;
      (p.nilai || []).forEach((n) => {
        const kr = KRITERIA_PEMAIN.find((x) => x.nama === n.kriteria) || { bobot: 10 };
        t2 += skorKeNilai(n.skor) * kr.bobot;
        tb += kr.bobot;
      });
      if (tb) total += t2 / tb;
    });
    nilaiPerTahap[t] = total / arr.length;
  });

  const bobot = { persiapan: 20, pelaksanaan: 35, pertunjukan: 30, pasca: 15 };
  const nilaiAkhir = Object.keys(nilaiPerTahap).reduce((s, t) => s + nilaiPerTahap[t] * bobot[t] / 100, 0);
  const pred = predikat(nilaiAkhir);

  // Breakdown penilai
  const breakdown = { guru: [], ketua: [], rekan: [] };
  penilaian.forEach((p) => {
    breakdown[p.jenisPenilai]?.push(p);
  });

  const nilaiGuru = breakdown.guru.length ? breakdown.guru.reduce((s, p) => s + (p.nilai || []).reduce((a, n) => a + skorKeNilai(n.skor), 0) / (p.nilai?.length || 1), 0) / breakdown.guru.length : 0;
  const nilaiKetua = breakdown.ketua.length ? breakdown.ketua.reduce((s, p) => s + (p.nilai || []).reduce((a, n) => a + skorKeNilai(n.skor), 0) / (p.nilai?.length || 1), 0) / breakdown.ketua.length : 0;
  const nilaiRekan = breakdown.rekan.length ? breakdown.rekan.reduce((s, p) => s + (p.nilai || []).reduce((a, n) => a + skorKeNilai(n.skor), 0) / (p.nilai?.length || 1), 0) / breakdown.rekan.length : 0;

  // Komentar
  const komentars = [];
  penilaian.forEach((p) => (p.nilai || []).forEach((n) => n.komentar && komentars.push(n.komentar)));

  // QR
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(location.origin + "/rapor.html?uid=" + targetUid)}`;

  const el = document.getElementById("rapor-content");
  el.innerHTML = `
    <!-- KOP -->
    <div class="border-b-4 border-double border-black pb-3 mb-6">
      <div class="flex items-center gap-4">
        <img src="${LOGO_SEKOLAH}" alt="" class="w-20 h-20 object-contain" />
        <div class="flex-1 text-center">
          <p class="text-sm font-medium">PEMERINTAH KOTA SAMARINDA</p>
          <p class="text-sm font-medium">DINAS PENDIDIKAN DAN KEBUDAYAAN</p>
          <p class="text-xl font-bold">SMP NEGERI 10 SAMARINDA</p>
          <p class="text-[10px]">Jl. Teuku Umar No. 10, Karang Anyar, Kec. Sungai Kunjang, Kota Samarinda, Kaltim</p>
        </div>
        <img src="${LOGO_MAPEL}" alt="" class="w-20 h-20 object-contain" />
      </div>
    </div>

    <!-- JUDUL -->
    <h2 class="text-center font-bold text-base mb-1">RAPOR KOMPREHENSIF PRODUKSI PEMENTASAN TEATER (SP-PPT)</h2>
    <p class="text-center text-xs mb-6">TAHUN AJARAN 2025/2026</p>

    <!-- BIODATA -->
    <table class="w-full text-xs mb-5">
      <tbody>
        <tr><td class="py-1 w-40 font-medium">Nama</td><td>: <b>${esc(siswa.nama)}</b></td></tr>
        <tr><td class="py-1 font-medium">NIS</td><td>: ${esc(siswa.nis || "-")}</td></tr>
        <tr><td class="py-1 font-medium">Kelas</td><td>: ${esc(siswa.kelas || "-")}</td></tr>
        <tr><td class="py-1 font-medium">Peran Utama</td><td>: <b>${esc(siswa.peran)}</b></td></tr>
        <tr><td class="py-1 font-medium">Divisi</td><td>: ${esc(siswa.divisi || "-")}</td></tr>
        <tr><td class="py-1 font-medium">Status Kelulusan</td><td>: <b>${nilaiAkhir >= 60 ? "LULUS" : "PERLU PERBAIKAN"}</b></td></tr>
      </tbody>
    </table>

    <!-- NILAI AKHIR -->
    <div class="border-2 border-black p-4 mb-5 flex items-center gap-6">
      <div class="text-center flex-1">
        <p class="text-xs">NILAI AKHIR KOMPOSIT</p>
        <p class="text-4xl font-bold">${nilaiAkhir.toFixed(2)}</p>
      </div>
      <div class="text-center flex-1 border-x border-black">
        <p class="text-xs">PREDIKAT</p>
        <p class="text-4xl font-bold">${pred.huruf}</p>
        <p class="text-[10px]">${pred.label}</p>
      </div>
      <div class="text-xs flex-1">
        <p>Guru (50%): <b>${nilaiGuru.toFixed(1)}</b></p>
        <p>Ketua (30%): <b>${nilaiKetua.toFixed(1)}</b></p>
        <p>Rekan (20%): <b>${nilaiRekan.toFixed(1)}</b></p>
      </div>
    </div>

    <!-- TABEL PER TAHAPAN -->
    <p class="font-bold text-sm mb-2">A. Penilaian Per Tahapan</p>
    <table class="w-full text-xs border border-black mb-5">
      <thead class="bg-gray-200"><tr><th class="border border-black p-2">Tahapan</th><th class="border border-black p-2">Bobot</th><th class="border border-black p-2">Nilai</th></tr></thead>
      <tbody>
        ${Object.keys(tahapLabel).map((t) => `
          <tr><td class="border border-black p-2">${tahapLabel[t]}</td><td class="border border-black p-2 text-center">${bobot[t]}%</td><td class="border border-black p-2 text-center font-bold">${nilaiPerTahap[t].toFixed(2)}</td></tr>`).join("")}
      </tbody>
    </table>

    <!-- RINCIAN KRITERIA -->
    <p class="font-bold text-sm mb-2">B. Rincian Kompetensi Utama</p>
    <table class="w-full text-xs border border-black mb-5">
      <thead class="bg-gray-200"><tr><th class="border border-black p-2 text-left">Kriteria</th><th class="border border-black p-2">Bobot</th><th class="border border-black p-2">Nilai</th></tr></thead>
      <tbody>
        ${KRITERIA_PEMAIN.map((k) => `<tr><td class="border border-black p-2">${k.nama}</td><td class="border border-black p-2 text-center">${k.bobot}%</td><td class="border border-black p-2 text-center">—</td></tr>`).join("")}
      </tbody>
    </table>

    <!-- CATATAN -->
    <p class="font-bold text-sm mb-2">C. Catatan</p>
    <div class="border border-black p-3 text-xs mb-5 min-h-[80px]">
      <p class="font-medium mb-1">Guru Pengampu:</p>
      <p class="text-gray-700 mb-3">"${esc(komentars[0] || "Terus pertahankan semangat belajar dan berkarya.")}"</p>
      <p class="font-medium mb-1">Ketua Produksi:</p>
      <p class="text-gray-700">"${esc(komentars[1] || "Kerja sama tim yang baik, tingkatkan lagi.")}"</p>
    </div>

    <!-- TTD & QR -->
    <div class="grid grid-cols-3 gap-4 text-xs mb-4">
      <div class="text-center">
        <img src="${qrUrl}" alt="QR" class="w-20 h-20 mx-auto mb-1" />
        <p class="text-[9px]">Verifikasi Dokumen</p>
      </div>
      <div class="text-center">
        <p>Samarinda, ${formatTanggal(new Date())}</p>
        <p>Guru Pembina,</p>
        <div class="h-16"></div>
        <p class="font-bold border-t border-black pt-1">(............................)</p>
      </div>
      <div class="text-center">
        <p>&nbsp;</p>
        <p>Kepala Sekolah,</p>
        <div class="h-16"></div>
        <p class="font-bold border-t border-black pt-1">(............................)</p>
      </div>
    </div>

    <p class="text-[9px] text-gray-500 text-center mt-4 italic">Dokumen ini digenerate otomatis oleh SP-PPT — Sistem Penilaian & Manajemen Produksi Teater · SMPN 10 Samarinda</p>
  `;
}

/* =========================================================
 * EXPORT PDF
 * ========================================================= */
async function exportPDF(ringkas = false) {
  const { jsPDF } = window.jspdf;
  const el = document.getElementById("rapor-content");
  showToast("Menyiapkan PDF...", "info");

  try {
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff" });
    const img = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const w = 210, h = (canvas.height * w) / canvas.width;

    if (!ringkas) {
      pdf.addImage(img, "PNG", 0, 0, w, h);
    } else {
      // Versi ringkas: ambil bagian atas saja
      pdf.addImage(img, "PNG", 0, 0, w, Math.min(h, 200));
    }
    pdf.save(`rapor_${ME.profile.nama.replace(/\s+/g, "_")}_${Date.now()}.pdf`);
    showToast("PDF berhasil diunduh!", "success");
  } catch (e) {
    console.error(e);
    showToast("Gagal export PDF.", "error");
  }
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
    <a href="${m.href}" class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition text-sm ${m.href === "rapor.html" ? "bg-primary-container text-primary font-medium" : "text-on-surface-variant hover:bg-surface-container"}">
      <span class="material-symbols-outlined text-xl">${m.icon}</span>${m.label}
    </a>`).join("");

  document.getElementById("bottom-nav").innerHTML = [
    { icon: "dashboard", label: "Home", href: "dashboard.html" },
    { icon: "grade", label: "Nilai", href: "nilai.html" },
    { icon: "calendar_month", label: "Jadwal", href: "jadwal.html" },
    { icon: "checklist", label: "Tugas", href: "checklist.html" },
    { icon: "groups", label: "Kerabat", href: "struktur.html" },
  ].map((i) => `<a href="${i.href}" class="flex flex-col items-center justify-center py-2 text-[10px] gap-0.5 ${i.href === "rapor.html" ? "text-primary" : "text-on-surface-variant"}"><span class="material-symbols-outlined text-xl">${i.icon}</span>${i.label}</a>`).join("");

  const html = document.documentElement;
  if (localStorage.getItem("theme") === "light") html.classList.remove("dark");
  document.getElementById("btn-menu").addEventListener("click", () => { const sb = document.getElementById("sidebar"); sb.classList.toggle("hidden"); sb.classList.toggle("flex"); });
  document.getElementById("btn-logout").addEventListener("click", async () => { if (confirm("Keluar?")) { await logActivity(ME.uid, "logout"); await signOut(auth); window.location.replace("index.html"); } });

  // Target UID dari URL atau diri sendiri
  const params = new URLSearchParams(location.search);
  const targetUid = params.get("uid") || ME.uid;
  if (targetUid !== ME.uid && !["guru", "admin"].includes(profile.role)) {
    showToast("Akses ditolak.", "error");
    return;
  }

  await renderRapor(targetUid);

  document.getElementById("btn-cetak").addEventListener("click", () => window.print());
  document.getElementById("btn-pdf-lengkap").addEventListener("click", () => exportPDF(false));
  document.getElementById("btn-pdf-ringkas").addEventListener("click", () => exportPDF(true));
})();
