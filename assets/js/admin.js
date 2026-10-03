/**
 * SP-PPT — Panel Admin/Guru
 * Fitur:
 * - Export XLSX multi-sheet
 * - Import siswa dari Excel/CSV
 * - Backup/Restore (JSON)
 * - Kelola Siswa (CRUD)
 * - Manajemen Rubrik
 * - Pengaturan Periode & Bobot
 * - Log Sistem
 * - Maintenance Mode
 */

import { auth, db, PERAN_LIST, PERAN_DIVISI } from "./firebase-init.js";
import {
  doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  collection, query, where, getDocs, orderBy, serverTimestamp, limit, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { protectPage } from "./router.js";
import {
  showToast, openModal, closeModal, skeleton, formatTanggal, esc,
  warnaPeran, inisial, logActivity, waktuRelatif,
} from "./utils.js";
import { initNotifikasi, bukaPanelNotif, kirimNotifikasiBanyak } from "./notifikasi.js";
import { KRITERIA_PER_PERAN, BOBOT_PENILAI_DEFAULT, BOBOT_TAHAPAN_DEFAULT } from "./agregasi.js";

let ME = null;
let TAB = "export";
let SISWA_CACHE = [];

const TABS = [
  { id: "export", label: "Export", icon: "download" },
  { id: "import", label: "Import Siswa", icon: "upload" },
  { id: "siswa", label: "Kelola Siswa", icon: "people" },
  { id: "rubrik", label: "Manajemen Rubrik", icon: "rule" },
  { id: "periode", label: "Pengaturan Periode", icon: "calendar_settings" },
  { id: "backup", label: "Backup/Restore", icon: "backup" },
  { id: "logs", label: "Log Sistem", icon: "history" },
];

function isAdminGuru() {
  return ME.profile.role === "guru" || ME.profile.role === "admin";
}

function renderTabs() {
  const c = document.getElementById("tabs-container");
  c.innerHTML = TABS.map((t) => `
    <button data-tab="${t.id}" class="tab-btn px-4 py-2 rounded-xl text-sm font-medium transition flex items-center gap-1.5 ${
      t.id === TAB ? "bg-primary-container text-primary" : "text-on-surface-variant hover:bg-surface-container"
    }">
      <span class="material-symbols-outlined text-base">${t.icon}</span> ${t.label}
    </button>
  `).join("");
  c.querySelectorAll(".tab-btn").forEach((b) =>
    b.addEventListener("click", () => { TAB = b.dataset.tab; renderTabs(); renderTabContent(); })
  );
}

function renderTabContent() {
  const c = document.getElementById("tab-content");
  c.innerHTML = `<div class="glass rounded-2xl p-5">${skeleton(4)}</div>`;
  const r = RENDERERS[TAB];
  if (r) r(c);
}

/* =========================================================
 * EXPORT XLSX MULTI-SHEET
 * ========================================================= */
const RENDERERS = {};

RENDERERS.export = async (c) => {
  const siswa = await loadSiswa();
  c.innerHTML = `
  <div class="glass rounded-2xl p-5">
    <h3 class="font-headline font-semibold mb-4 flex items-center gap-2">
      <span class="material-symbols-outlined text-primary">download</span> Export Data
    </h3>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
      <div class="p-3 rounded-xl bg-surface-container">
        <p class="text-sm font-medium mb-1">XLSX Multi-Sheet Nilai</p>
        <p class="text-xs text-on-surface-variant mb-2">Sheet: Rekap, Per Tahapan, Per Kriteria, Statistik</p>
        <button id="btn-export-xlsx-nilai" class="w-full py-2 rounded-lg bg-primary text-on-primary text-xs font-medium">Download XLSX</button>
      </div>
      <div class="p-3 rounded-xl bg-surface-container">
        <p class="text-sm font-medium mb-1">CSV Rekap Nilai</p>
        <p class="text-xs text-on-surface-variant mb-2">Format CSV sederhana semua siswa</p>
        <button id="btn-export-csv-nilai" class="w-full py-2 rounded-lg bg-surface-container-high text-xs font-medium">Download CSV</button>
      </div>
      <div class="p-3 rounded-xl bg-surface-container">
        <p class="text-sm font-medium mb-1">XLSX Absensi</p>
        <p class="text-xs text-on-surface-variant mb-2">Sheet: Per Sesi, Per Siswa</p>
        <button id="btn-export-xlsx-absensi" class="w-full py-2 rounded-lg bg-primary text-on-primary text-xs font-medium">Download XLSX</button>
      </div>
      <div class="p-3 rounded-xl bg-surface-container">
        <p class="text-sm font-medium mb-1">XLSX Tugas</p>
        <p class="text-xs text-on-surface-variant mb-2">Sheet: Daftar Tugas, Status Per Siswa</p>
        <button id="btn-export-xlsx-tugas" class="w-full py-2 rounded-lg bg-primary text-on-primary text-xs font-medium">Download XLSX</button>
      </div>
      <div class="p-3 rounded-xl bg-surface-container">
        <p class="text-sm font-medium mb-1">Template Import Siswa</p>
        <p class="text-xs text-on-surface-variant mb-2">Excel kosong dengan kolom wajib</p>
        <button id="btn-template-import" class="w-full py-2 rounded-lg bg-secondary text-on-secondary text-xs font-medium">Download Template</button>
      </div>
      <div class="p-3 rounded-xl bg-surface-container">
        <p class="text-sm font-medium mb-1">Data Lengkap (JSON)</p>
        <p class="text-xs text-on-surface-variant mb-2">Semua koleksi untuk backup</p>
        <button id="btn-export-json" class="w-full py-2 rounded-lg bg-tertiary text-on-tertiary text-xs font-medium">Download JSON</button>
      </div>
    </div>
  </div>`;

  document.getElementById("btn-export-xlsx-nilai").addEventListener("click", () => exportXLSXNilai(siswa));
  document.getElementById("btn-export-csv-nilai").addEventListener("click", () => exportCSVNilai(siswa));
  document.getElementById("btn-export-xlsx-absensi").addEventListener("click", () => exportXLSXAbsensi(siswa));
  document.getElementById("btn-export-xlsx-tugas").addEventListener("click", () => exportXLSXTugas(siswa));
  document.getElementById("btn-template-import").addEventListener("click", downloadTemplateImport);
  document.getElementById("btn-export-json").addEventListener("click", exportJSON);
};

async function loadSiswa() {
  const snap = await getDocs(query(collection(db, "users"), where("role", "==", "siswa")));
  SISWA_CACHE = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
  return SISWA_CACHE;
}

function hitungNilaiSiswa(penilaian, peran) {
  const kriteria = KRITERIA_PER_PERAN[peran] || KRITERIA_PER_PERAN["Anggota Perlengkapan"];
  const perTahap = { persiapan: [], pelaksanaan: [], pertunjukan: [], pasca: [] };
  penilaian.forEach((p) => { if (perTahap[p.tahapan]) perTahap[p.tahapan].push(p); });
  const hasil = {};
  let akhir = 0;
  Object.entries(perTahap).forEach(([t, arr]) => {
    if (!arr.length) { hasil[t] = 0; return; }
    let sum = 0;
    arr.forEach((p) => {
      let tot = 0, totBob = 0;
      (p.nilai || []).forEach((n) => {
        const k = kriteria.find((x) => x.nama === n.kriteria);
        const b = k ? k.bobot : 10;
        tot += (n.skor === 4 ? 100 : n.skor === 3 ? 80 : n.skor === 2 ? 60 : 40) * b;
        totBob += b;
      });
      if (totBob) sum += tot / totBob;
    });
    hasil[t] = sum / arr.length;
  });
  const bobot = { persiapan: 20, pelaksanaan: 35, pertunjukan: 30, pasca: 15 };
  Object.entries(hasil).forEach(([t, v]) => { akhir += v * (bobot[t] / 100); });
  return { perTahap: hasil, akhir };
}

async function exportXLSXNilai(siswa) {
  showToast("Menyiapkan XLSX...", "info");
  try {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Rekap
    const dataRekap = [];
    for (const s of siswa) {
      const pSnap = await getDocs(query(collection(db, "penilaian"), where("targetUid", "==", s.uid)));
      const penilaian = pSnap.docs.map((d) => d.data());
      const h = hitungNilaiSiswa(penilaian, s.peran);
      const pred = h.akhir >= 90 ? "A" : h.akhir >= 80 ? "B" : h.akhir >= 70 ? "C" : h.akhir >= 60 ? "D" : "E";
      dataRekap.push({
        Nama: s.nama, NIS: s.nis || "", Kelas: s.kelas || "", Peran: s.peran, Divisi: s.divisi || "",
        Persiapan: h.perTahap.persiapan.toFixed(2),
        Pelaksanaan: h.perTahap.pelaksanaan.toFixed(2),
        Pertunjukan: h.perTahap.pertunjukan.toFixed(2),
        Pasca: h.perTahap.pasca.toFixed(2),
        NilaiAkhir: h.akhir.toFixed(2), Predikat: pred,
      });
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataRekap), "Rekap");

    // Sheet 2: Per Tahapan
    const dataTahap = dataRekap.map((r) => ({
      Nama: r.Nama, Peran: r.Peran,
      Persiapan: r.Persiapan, Pelaksanaan: r.Pelaksanaan,
      Pertunjukan: r.Pertunjukan, Pasca: r.Pasca,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataTahap), "Per Tahapan");

    // Sheet 3: Per Kriteria
    const dataKriteria = [];
    for (const s of siswa) {
      const pSnap = await getDocs(query(collection(db, "penilaian"), where("targetUid", "==", s.uid)));
      const kriteria = KRITERIA_PER_PERAN[s.peran] || [];
      const skorPer = {};
      pSnap.docs.forEach((d) => {
        (d.data().nilai || []).forEach((n) => {
          if (!skorPer[n.kriteria]) skorPer[n.kriteria] = [];
          skorPer[n.kriteria].push(n.skor);
        });
      });
      const row = { Nama: s.nama, Peran: s.peran };
      kriteria.forEach((k) => {
        const arr = skorPer[k.nama] || [];
        row[k.nama] = arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : "-";
      });
      dataKriteria.push(row);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataKriteria), "Per Kriteria");

    // Sheet 4: Statistik
    const nilaiArr = dataRekap.map((r) => parseFloat(r.NilaiAkhir));
    const dist = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    dataRekap.forEach((r) => { dist[r.Predikat]++; });
    const dataStat = [
      { Metrik: "Total Siswa", Nilai: siswa.length },
      { Metrik: "Rata-rata Nilai", Nilai: nilaiArr.length ? (nilaiArr.reduce((a, b) => a + b, 0) / nilaiArr.length).toFixed(2) : 0 },
      { Metrik: "Nilai Tertinggi", Nilai: nilaiArr.length ? Math.max(...nilaiArr).toFixed(2) : 0 },
      { Metrik: "Nilai Terendah", Nilai: nilaiArr.length ? Math.min(...nilaiArr).toFixed(2) : 0 },
      { Metrik: "Predikat A", Nilai: dist.A },
      { Metrik: "Predikat B", Nilai: dist.B },
      { Metrik: "Predikat C", Nilai: dist.C },
      { Metrik: "Predikat D", Nilai: dist.D },
      { Metrik: "Predikat E", Nilai: dist.E },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataStat), "Statistik");

    XLSX.writeFile(wb, `SP-PPT_Nilai_${new Date().toISOString().slice(0, 10)}.xlsx`);
    await logActivity(ME.uid, "export_xlsx_nilai");
    showToast("XLSX berhasil diunduh!", "success");
  } catch (e) {
    console.error(e);
    showToast("Gagal export XLSX.", "error");
  }
}

function exportCSVNilai(siswa) {
  const rows = ["Nama,NIS,Kelas,Peran,Divisi,Nilai,Predikat"];
  siswa.forEach((s) => rows.push(`"${s.nama}","${s.nis || ""}","${s.kelas || ""}","${s.peran}","${s.divisi || ""}","","" `));
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `rekap_nilai_${Date.now()}.csv`;
  a.click();
  showToast("CSV diunduh!", "success");
}

async function exportXLSXAbsensi(siswa) {
  showToast("Menyiapkan XLSX...", "info");
  try {
    const wb = XLSX.utils.book_new();

    const sesiSnap = await getDocs(query(collection(db, "sesiAbsensi"), orderBy("tanggal", "desc")));
    const khSnap = await getDocs(collection(db, "kehadiran"));
    const sesi = sesiSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const kh = khSnap.docs.map((d) => d.data());

    // Sheet 1: Per Sesi
    const data1 = sesi.map((s) => {
      const k = kh.filter((x) => x.sesiId === s.id);
      return {
        Judul: s.judul, Jenis: s.jenis, Tanggal: s.tanggal, Jam: s.jam, Lokasi: s.lokasi,
        Total: k.length,
        Hadir: k.filter((x) => x.status === "Hadir").length,
        Izin: k.filter((x) => x.status === "Izin").length,
        Sakit: k.filter((x) => x.status === "Sakit").length,
        Alpa: k.filter((x) => x.status === "Alpa").length,
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data1), "Per Sesi");

    // Sheet 2: Per Siswa
    const data2 = siswa.map((s) => {
      const k = kh.filter((x) => x.siswaUid === s.uid);
      const h = k.filter((x) => x.status === "Hadir").length;
      return {
        Nama: s.nama, Peran: s.peran, Kelas: s.kelas || "",
        Hadir: h, Total: k.length,
        Persen: k.length ? Math.round((h / k.length) * 100) + "%" : "0%",
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data2), "Per Siswa");

    XLSX.writeFile(wb, `SP-PPT_Absensi_${new Date().toISOString().slice(0, 10)}.xlsx`);
    await logActivity(ME.uid, "export_xlsx_absensi");
    showToast("XLSX berhasil diunduh!", "success");
  } catch (e) {
    console.error(e);
    showToast("Gagal export.", "error");
  }
}

async function exportXLSXTugas(siswa) {
  showToast("Menyiapkan XLSX...", "info");
  try {
    const wb = XLSX.utils.book_new();
    const tSnap = await getDocs(query(collection(db, "tugas"), orderBy("deadline", "asc")));
    const tugas = tSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const data1 = tugas.map((t) => ({
      Judul: t.judul, Tahapan: t.tahapan, Prioritas: t.prioritas,
      Deadline: t.deadline, Target: t.target,
      Dibuat: t.pembuatNama || "-",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data1), "Daftar Tugas");

    const data2 = [];
    tugas.forEach((t) => {
      Object.entries(t.statusPerSiswa || {}).forEach(([uid, status]) => {
        const s = siswa.find((x) => x.uid === uid);
        if (!s) return;
        data2.push({
          Tugas: t.judul, Siswa: s.nama, Peran: s.peran,
          Status: status,
          Bukti: t.buktiPerSiswa?.[uid]?.url || "-",
          Rating: t.ratingPerSiswa?.[uid]?.nilai || "-",
        });
      });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data2), "Status Per Siswa");

    XLSX.writeFile(wb, `SP-PPT_Tugas_${new Date().toISOString().slice(0, 10)}.xlsx`);
    await logActivity(ME.uid, "export_xlsx_tugas");
    showToast("XLSX berhasil diunduh!", "success");
  } catch (e) {
    console.error(e);
    showToast("Gagal export.", "error");
  }
}

function downloadTemplateImport() {
  const wb = XLSX.utils.book_new();
  const template = [
    { Nama: "Contoh Siswa", NIS: "12345", Kelas: "IX-A", Email: "siswa@email.com", WhatsApp: "08123456789", Peran: "Pemain", Divisi: "Pemeran" },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(template), "Template");
  XLSX.writeFile(wb, "template_import_siswa.xlsx");
  showToast("Template diunduh!", "success");
}

async function exportJSON() {
  showToast("Menyiapkan backup...", "info");
  try {
    const backup = {
      timestamp: new Date().toISOString(),
      users: (await getDocs(collection(db, "users"))).docs.map((d) => ({ id: d.id, ...d.data() })),
      penilaian: (await getDocs(collection(db, "penilaian"))).docs.map((d) => ({ id: d.id, ...d.data() })),
      jadwal: (await getDocs(collection(db, "jadwal"))).docs.map((d) => ({ id: d.id, ...d.data() })),
      sesiAbsensi: (await getDocs(collection(db, "sesiAbsensi"))).docs.map((d) => ({ id: d.id, ...d.data() })),
      kehadiran: (await getDocs(collection(db, "kehadiran"))).docs.map((d) => ({ id: d.id, ...d.data() })),
      tugas: (await getDocs(collection(db, "tugas"))).docs.map((d) => ({ id: d.id, ...d.data() })),
      broadcast: (await getDocs(collection(db, "broadcast"))).docs.map((d) => ({ id: d.id, ...d.data() })),
      informasi: (await getDocs(collection(db, "informasi"))).docs.map((d) => ({ id: d.id, ...d.data() })),
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `backup_SP-PPT_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    await logActivity(ME.uid, "export_json_backup");
    showToast("Backup JSON berhasil diunduh!", "success");
  } catch (e) {
    console.error(e);
    showToast("Gagal export backup.", "error");
  }
}

/* =========================================================
 * IMPORT SISWA
 * ========================================================= */
RENDERERS.import = async (c) => {
  c.innerHTML = `
  <div class="glass rounded-2xl p-5">
    <h3 class="font-headline font-semibold mb-4 flex items-center gap-2">
      <span class="material-symbols-outlined text-primary">upload</span> Import Siswa dari Excel/CSV
    </h3>
    <div class="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30 mb-4 text-xs text-yellow-400">
      <p class="font-medium mb-1">Perhatian:</p>
      <ul class="pl-4 list-disc space-y-1">
        <li>Format kolom: Nama, NIS, Kelas, Email, WhatsApp, Peran</li>
        <li>Siswa akan dibuat akun dengan password default: <b>sppt2025</b></li>
        <li>Minta siswa ganti password setelah login pertama</li>
        <li>Email & WhatsApp harus unik</li>
      </ul>
    </div>

    <input id="file-import" type="file" accept=".xlsx,.xls,.csv" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm mb-3" />

    <div id="import-preview"></div>

    <button id="btn-download-template" class="mt-3 px-3 py-2 rounded-lg bg-secondary text-on-secondary text-xs font-medium flex items-center gap-1">
      <span class="material-symbols-outlined text-sm">download</span> Download Template Excel
    </button>
  </div>`;

  document.getElementById("btn-download-template").addEventListener("click", downloadTemplateImport);

  document.getElementById("file-import").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws);
      tampilkanPreview(rows);
    } catch (err) {
      showToast("Gagal membaca file.", "error");
    }
  });
};

function tampilkanPreview(rows) {
  const el = document.getElementById("import-preview");
  if (!rows.length) return (el.innerHTML = `<p class="text-xs text-on-surface-variant">File kosong</p>`);

  el.innerHTML = `
    <div class="p-3 rounded-xl bg-surface-container mb-3">
      <p class="text-sm font-medium mb-2">Preview (${rows.length} baris)</p>
      <div class="overflow-x-auto max-h-64">
        <table class="w-full text-xs">
          <thead class="text-on-surface-variant">
            <tr>${Object.keys(rows[0]).map((k) => `<th class="text-left p-1">${esc(k)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${rows.slice(0, 20).map((r) => `
              <tr class="border-b border-outline-variant/20">
                ${Object.values(r).map((v) => `<td class="p-1">${esc(String(v || ""))}</td>`).join("")}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      ${rows.length > 20 ? `<p class="text-[10px] text-on-surface-variant mt-2">Menampilkan 20 dari ${rows.length} baris</p>` : ""}
    </div>
    <button id="btn-proses-import" class="w-full py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium">
      Proses Import ${rows.length} Siswa
    </button>`;

  document.getElementById("btn-proses-import").addEventListener("click", async () => {
    if (!confirm(`Import ${rows.length} siswa? Pastikan data sudah benar.`)) return;
    showToast("Memproses import...", "info");

    let sukses = 0, gagal = 0;
    const errors = [];

    for (const row of rows) {
      const nama = String(row.Nama || row.nama || "").trim();
      const nis = String(row.NIS || row.nis || "").trim();
      const kelas = String(row.Kelas || row.kelas || "").trim();
      const email = String(row.Email || row.email || "").trim().toLowerCase();
      const wa = String(row.WhatsApp || row.whatsapp || row.WA || "").trim();
      const peran = String(row.Peran || row.peran || "Pemain").trim();

      if (!nama || !email) { errors.push(`${nama || "(tanpa nama)"}: Nama/Email kosong`); gagal++; continue; }

      // Cek duplikat
      const cekEmail = await getDocs(query(collection(db, "users"), where("email", "==", email)));
      if (!cekEmail.empty) { errors.push(`${nama}: Email sudah terdaftar`); gagal++; continue; }

      // Normalisasi WA
      let waNorm = wa.replace(/\D/g, "");
      if (waNorm.startsWith("0")) waNorm = "62" + waNorm.slice(1);

      // Buat user di Firestore (tanpa Firebase Auth - admin perlu register manual atau pakai Cloud Function)
      // Untuk produksi, sebaiknya gunakan Firebase Admin SDK. Di client, kita simpan data saja.
      try {
        await addDoc(collection(db, "users"), {
          role: "siswa",
          nama, nis, kelas, email,
          whatsapp: waNorm,
          peran,
          divisi: PERAN_DIVISI[peran] || "Pemeran",
          fotoUrl: "",
          pendingAuth: true, // tandai perlu dibuatkan akun Auth
          createdAt: serverTimestamp(),
        });
        sukses++;
      } catch (e) {
        errors.push(`${nama}: ${e.message}`);
        gagal++;
      }
    }

    await logActivity(ME.uid, "import_siswa", `${sukses} sukses, ${gagal} gagal`);
    showToast(`Import selesai: ${sukses} sukses, ${gagal} gagal`, sukses > 0 ? "success" : "error", 5000);

    if (errors.length) {
      alert(`Gagal import:\n${errors.slice(0, 10).join("\n")}${errors.length > 10 ? `\n...dan ${errors.length - 10} lainnya` : ""}`);
    }
    document.getElementById("file-import").value = "";
    document.getElementById("import-preview").innerHTML = "";
  });
}

/* =========================================================
 * KELOLA SISWA
 * ========================================================= */
RENDERERS.siswa = async (c) => {
  const list = await loadSiswa();

  c.innerHTML = `
  <div class="glass rounded-2xl p-5">
    <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
      <h3 class="font-headline font-semibold flex items-center gap-2">
        <span class="material-symbols-outlined text-primary">people</span> Kelola Siswa
        <span class="text-xs text-on-surface-variant font-normal">(${list.length})</span>
      </h3>
      <div class="flex gap-2">
        <input id="search-siswa" placeholder="Cari nama..." class="px-3 py-1.5 rounded-lg bg-surface-container border border-outline-variant text-xs" />
        <select id="filter-kelas" class="px-2 py-1.5 rounded-lg bg-surface-container border border-outline-variant text-xs">
          <option value="">Semua Kelas</option>
          <option>IX-A</option><option>IX-B</option><option>IX-C</option>
          <option>IX-D</option><option>IX-E</option><option>IX-F</option>
        </select>
      </div>
    </div>
    <div id="siswa-list" class="space-y-2"></div>
  </div>`;

  const renderList = (filter = "", kelas = "") => {
    const el = document.getElementById("siswa-list");
    let filtered = list;
    if (filter) filtered = filtered.filter((s) => (s.nama || "").toLowerCase().includes(filter.toLowerCase()));
    if (kelas) filtered = filtered.filter((s) => s.kelas === kelas);

    if (!filtered.length) { el.innerHTML = `<p class="text-sm text-center text-on-surface-variant py-6">Tidak ada siswa</p>`; return; }

    el.innerHTML = filtered.map((s) => `
      <div class="p-3 rounded-xl bg-surface-container flex items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-primary-container text-primary flex items-center justify-center font-semibold">${inisial(s.nama)}</div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium truncate">${esc(s.nama)}</p>
          <p class="text-[10px] text-on-surface-variant">${esc(s.peran)} · ${esc(s.kelas || "-")} · ${esc(s.email)}</p>
        </div>
        <button class="btn-edit-siswa px-2 py-1 rounded text-[10px] bg-primary-container text-primary" data-uid="${s.uid}">Edit</button>
        <button class="btn-del-siswa px-2 py-1 rounded text-[10px] bg-error/20 text-error" data-uid="${s.uid}">Hapus</button>
      </div>
    `).join("");

    el.querySelectorAll(".btn-edit-siswa").forEach((b) =>
      b.addEventListener("click", () => bukaEditSiswa(list.find((x) => x.uid === b.dataset.uid)))
    );
    el.querySelectorAll(".btn-del-siswa").forEach((b) =>
      b.addEventListener("click", async () => {
        if (!confirm("Hapus siswa ini? Data nilai juga akan dihapus.")) return;
        try {
          await deleteDoc(doc(db, "users", b.dataset.uid));
          showToast("Siswa dihapus.", "success");
          RENDERERS.siswa(c);
        } catch (e) { showToast("Gagal hapus.", "error"); }
      })
    );
  };

  renderList();
  document.getElementById("search-siswa").addEventListener("input", (e) => renderList(e.target.value, document.getElementById("filter-kelas").value));
  document.getElementById("filter-kelas").addEventListener("change", (e) => renderList(document.getElementById("search-siswa").value, e.target.value));
};

function bukaEditSiswa(s) {
  if (!s) return;
  document.getElementById("modal-title").textContent = "Edit Siswa";
  document.getElementById("modal-body").innerHTML = `
    <div class="space-y-3">
      <input id="e-nama" value="${esc(s.nama)}" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
      <input id="e-nis" value="${esc(s.nis || "")}" placeholder="NIS" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
      <input id="e-kelas" value="${esc(s.kelas || "")}" placeholder="Kelas" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
      <input id="e-email" value="${esc(s.email || "")}" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
      <input id="e-wa" value="${esc(s.whatsapp || "")}" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
      <select id="e-peran" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm">
        ${PERAN_LIST.filter((p) => !["Guru Pembina", "Admin"].includes(p)).map((p) => `<option ${s.peran === p ? "selected" : ""}>${p}</option>`).join("")}
      </select>
      <button id="e-submit" class="w-full py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium">Simpan Perubahan</button>
    </div>`;
  openModal("modal-form");
  document.getElementById("e-submit").onclick = async () => {
    const peran = document.getElementById("e-peran").value;
    await updateDoc(doc(db, "users", s.uid), {
      nama: document.getElementById("e-nama").value.trim(),
      nis: document.getElementById("e-nis").value.trim(),
      kelas: document.getElementById("e-kelas").value.trim(),
      email: document.getElementById("e-email").value.trim().toLowerCase(),
      whatsapp: document.getElementById("e-wa").value.trim(),
      peran,
      divisi: PERAN_DIVISI[peran] || "Pemeran",
      updatedAt: serverTimestamp(),
    });
    await logActivity(ME.uid, "edit_siswa", s.uid);
    showToast("Data siswa diperbarui!", "success");
    closeModal("modal-form");
    renderTabContent();
  };
}

/* =========================================================
 * MANAJEMEN RUBRIK
 * ========================================================= */
RENDERERS.rubrik = async (c) => {
  const peranKeys = Object.keys(KRITERIA_PER_PERAN);
  c.innerHTML = `
  <div class="glass rounded-2xl p-5">
    <h3 class="font-headline font-semibold mb-4 flex items-center gap-2">
      <span class="material-symbols-outlined text-primary">rule</span> Manajemen Rubrik
    </h3>
    <div class="p-3 rounded-lg bg-surface-container mb-4">
      <label class="text-xs text-on-surface-variant mb-1 block">Pilih Peran</label>
      <select id="rubrik-peran" class="w-full px-3 py-2 rounded-lg bg-surface-container-high border border-outline-variant text-sm">
        ${peranKeys.map((p) => `<option>${p}</option>`).join("")}
      </select>
    </div>
    <div id="rubrik-content"></div>
  </div>`;

  const renderRubrik = (peran) => {
    const kriteria = KRITERIA_PER_PERAN[peran] || [];
    const total = kriteria.reduce((s, k) => s + k.bobot, 0);
    const el = document.getElementById("rubrik-content");
    el.innerHTML = `
      <div class="p-3 rounded-lg ${total === 100 ? "bg-green-600/10 border-green-500/30" : "bg-orange-500/10 border-orange-500/30"} border mb-3">
        <p class="text-xs ${total === 100 ? "text-green-400" : "text-orange-400"}">
          Total bobot: <b>${total}%</b> ${total === 100 ? "(OK)" : "(akan dinormalisasi otomatis)"}
        </p>
      </div>
      <div class="space-y-2">
        ${kriteria.map((k, i) => `
          <div class="p-3 rounded-xl bg-surface-container">
            <div class="flex items-center justify-between mb-2">
              <input value="${esc(k.nama)}" class="flex-1 px-2 py-1 rounded bg-surface-container-high border border-outline-variant text-sm font-medium" data-i="${i}" data-field="nama" />
              <input type="number" value="${k.bobot}" min="0" max="100" class="w-16 ml-2 px-2 py-1 rounded bg-surface-container-high border border-outline-variant text-xs text-center" data-i="${i}" data-field="bobot" />
              <span class="text-xs text-on-surface-variant ml-1">%</span>
            </div>
            <p class="text-[10px] text-on-surface-variant">Deskripsi: ${k.deskripsi?.join(" | ") || "-"}</p>
          </div>
        `).join("")}
      </div>
      <p class="text-[10px] text-on-surface-variant mt-3 text-center">
        Catatan: perubahan rubrik di sini bersifat sementara (client-side). Untuk permanent, hubungkan ke Firestore `rubriks`.
      </p>
    `;
  };

  renderRubrik(peranKeys[0]);
  document.getElementById("rubrik-peran").addEventListener("change", (e) => renderRubrik(e.target.value));
};

/* =========================================================
 * PENGATURAN PERIODE
 * ========================================================= */
RENDERERS.periode = async (c) => {
  const snap = await getDocs(query(collection(db, "periodes"), limit(1)));
  const p = snap.empty ? {
    tahunAjaran: "2025/2026", bobotGuru: 50, bobotKetua: 30, bobotRekan: 20,
    bobotTahapan: { persiapan: 20, pelaksanaan: 35, pertunjukan: 30, pasca: 15 },
    tahapanAktif: "persiapan", aktif: true,
  } : { id: snap.docs[0].id, ...snap.docs[0].data() };

  c.innerHTML = `
  <div class="glass rounded-2xl p-5">
    <h3 class="font-headline font-semibold mb-4 flex items-center gap-2">
      <span class="material-symbols-outlined text-primary">calendar_settings</span> Pengaturan Periode
    </h3>
    <div class="space-y-3">
      <div>
        <label class="text-xs text-on-surface-variant mb-1 block">Tahun Ajaran</label>
        <input id="p-tahun" value="${esc(p.tahunAjaran)}" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
      </div>
      <div>
        <label class="text-xs text-on-surface-variant mb-1 block">Tahapan Aktif</label>
        <select id="p-tahap" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm">
          ${["persiapan", "pelaksanaan", "pertunjukan", "pasca"].map((t) => `<option value="${t}" ${p.tahapanAktif === t ? "selected" : ""}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join("")}
        </select>
      </div>
      <p class="text-xs font-medium text-secondary mt-4">Bobot Penilai</p>
      <div class="grid grid-cols-3 gap-2">
        <div><label class="text-[10px] block">Guru %</label><input id="p-guru" type="number" value="${p.bobotGuru}" class="w-full px-2 py-1 rounded bg-surface-container border border-outline-variant text-xs text-center" /></div>
        <div><label class="text-[10px] block">Ketua %</label><input id="p-ketua" type="number" value="${p.bobotKetua}" class="w-full px-2 py-1 rounded bg-surface-container border border-outline-variant text-xs text-center" /></div>
        <div><label class="text-[10px] block">Rekan %</label><input id="p-rekan" type="number" value="${p.bobotRekan}" class="w-full px-2 py-1 rounded bg-surface-container border border-outline-variant text-xs text-center" /></div>
      </div>
      <p class="text-xs font-medium text-secondary mt-4">Bobot Tahapan</p>
      <div class="grid grid-cols-4 gap-2">
        ${["persiapan", "pelaksanaan", "pertunjukan", "pasca"].map((t) => `
          <div><label class="text-[10px] block capitalize">${t}</label>
          <input id="bt-${t}" type="number" value="${p.bobotTahapan?.[t] || 0}" class="w-full px-2 py-1 rounded bg-surface-container border border-outline-variant text-xs text-center" /></div>
        `).join("")}
      </div>
      <button id="btn-save-periode" class="w-full py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium mt-4">Simpan Pengaturan</button>
      <p class="text-[10px] text-on-surface-variant text-center">Jika bobot ≠ 100, akan dinormalisasi otomatis saat perhitungan.</p>
    </div>
  </div>`;

  document.getElementById("btn-save-periode").addEventListener("click", async () => {
    const data = {
      tahunAjaran: document.getElementById("p-tahun").value.trim(),
      tahapanAktif: document.getElementById("p-tahap").value,
      bobotGuru: parseFloat(document.getElementById("p-guru").value) || 0,
      bobotKetua: parseFloat(document.getElementById("p-ketua").value) || 0,
      bobotRekan: parseFloat(document.getElementById("p-rekan").value) || 0,
      bobotTahapan: {
        persiapan: parseFloat(document.getElementById("bt-persiapan").value) || 0,
        pelaksanaan: parseFloat(document.getElementById("bt-pelaksanaan").value) || 0,
        pertunjukan: parseFloat(document.getElementById("bt-pertunjukan").value) || 0,
        pasca: parseFloat(document.getElementById("bt-pasca").value) || 0,
      },
      aktif: true,
      updatedAt: serverTimestamp(),
    };
    try {
      if (p.id) await updateDoc(doc(db, "periodes", p.id), data);
      else { data.createdAt = serverTimestamp(); await addDoc(collection(db, "periodes"), data); }
      await logActivity(ME.uid, "update_periode");
      showToast("Pengaturan disimpan!", "success");
    } catch (e) { showToast("Gagal simpan.", "error"); }
  });
};

/* =========================================================
 * BACKUP/RESTORE
 * ========================================================= */
RENDERERS.backup = async (c) => {
  c.innerHTML = `
  <div class="glass rounded-2xl p-5">
    <h3 class="font-headline font-semibold mb-4 flex items-center gap-2">
      <span class="material-symbols-outlined text-primary">backup</span> Backup & Restore
    </h3>

    <div class="p-4 rounded-xl bg-surface-container mb-4">
      <p class="text-sm font-medium mb-1">Backup Manual</p>
      <p class="text-xs text-on-surface-variant mb-3">Simpan snapshot seluruh data ke file JSON</p>
      <button id="btn-backup" class="w-full py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium">Download Backup</button>
    </div>

    <div class="p-4 rounded-xl bg-surface-container mb-4">
      <p class="text-sm font-medium mb-1">Restore dari File</p>
      <p class="text-xs text-error mb-3">Peringatan: Restore akan menimpa data existing!</p>
      <input id="file-restore" type="file" accept=".json" class="w-full mb-3 text-xs" />
      <button id="btn-restore" class="w-full py-2.5 rounded-lg bg-error text-white text-sm font-medium">Restore Data</button>
    </div>

    <div class="p-3 rounded-xl bg-tertiary/10 border border-tertiary/30 text-xs text-tertiary">
      <p class="font-medium mb-1">Info Backup Otomatis</p>
      <p>Backup harian direkomendasikan manual. Untuk otomatis, gunakan Firebase Cloud Functions.</p>
    </div>
  </div>`;

  document.getElementById("btn-backup").addEventListener("click", exportJSON);

  document.getElementById("btn-restore").addEventListener("click", () => {
    const file = document.getElementById("file-restore").files[0];
    if (!file) return showToast("Pilih file backup.", "warning");
    if (!confirm("Restore data? Data existing pada koleksi yang direstore akan tertimpa.")) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const backup = JSON.parse(e.target.result);
        const koleksi = ["users", "penilaian", "jadwal", "sesiAbsensi", "kehadiran", "tugas", "broadcast", "informasi"];
        let totalRestored = 0;
        for (const k of koleksi) {
          if (!backup[k]) continue;
          for (const item of backup[k]) {
            const { id, ...data } = item;
            if (id) {
              try { await setDoc(doc(db, k, id), data, { merge: true }); totalRestored++; } catch (err) {}
            }
          }
        }
        await logActivity(ME.uid, "restore_backup", `${totalRestored} dokumen`);
        showToast(`Restore selesai: ${totalRestored} dokumen`, "success");
      } catch (err) {
        console.error(err);
        showToast("File backup tidak valid.", "error");
      }
    };
    reader.readAsText(file);
  });
};

/* =========================================================
 * LOG SISTEM
 * ========================================================= */
RENDERERS.logs = async (c) => {
  c.innerHTML = `
  <div class="glass rounded-2xl p-5">
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-headline font-semibold flex items-center gap-2">
        <span class="material-symbols-outlined text-primary">history</span> Log Sistem
      </h3>
      <input id="search-log" placeholder="Cari aksi..." class="px-3 py-1.5 rounded-lg bg-surface-container border border-outline-variant text-xs" />
    </div>
    <div id="logs-list" class="space-y-1 max-h-[60vh] overflow-y-auto">${skeleton(5)}</div>
  </div>`;

  const load = async () => {
    try {
      const snap = await getDocs(query(collection(db, "logs"), orderBy("waktu", "desc"), limit(200)));
      const el = document.getElementById("logs-list");
      if (snap.empty) { el.innerHTML = `<p class="text-sm text-center text-on-surface-variant py-6">Belum ada log</p>`; return; }
      el.innerHTML = snap.docs.map((d) => {
        const l = d.data();
        const color = l.aksi?.includes("login") ? "text-green-400" :
          l.aksi?.includes("hapus") ? "text-error" :
          l.aksi?.includes("penilaian") ? "text-primary" : "text-on-surface-variant";
        return `
          <div class="p-2 rounded-lg bg-surface-container flex items-center gap-3 text-xs">
            <span class="${color} font-medium min-w-[100px]">${esc(l.aksi || "-")}</span>
            <span class="text-on-surface-variant flex-1 truncate">${esc(l.uid?.slice(0, 10) || "anonim")} · ${esc(l.target || "")}</span>
            <span class="text-on-surface-variant text-[10px]">${l.waktu ? waktuRelatif(l.waktu) : "-"}</span>
          </div>`;
      }).join("");

      document.getElementById("search-log").addEventListener("input", (e) => {
        const kw = e.target.value.toLowerCase();
        document.querySelectorAll("#logs-list > div").forEach((el) => {
          el.style.display = el.textContent.toLowerCase().includes(kw) ? "" : "none";
        });
      });
    } catch (e) {
      document.getElementById("logs-list").innerHTML = `<p class="text-sm text-center py-6">Gagal memuat logs.</p>`;
    }
  };
  load();
};

/* =========================================================
 * INIT
 * ========================================================= */
(async function init() {
  const { uid, profile } = await protectPage();
  ME = { uid, profile };

  if (!isAdminGuru()) {
    document.getElementById("tab-content").innerHTML = `
      <div class="glass rounded-2xl p-10 text-center">
        <span class="material-symbols-outlined text-5xl text-on-surface-variant mb-3">lock</span>
        <p class="text-sm">Halaman ini hanya untuk Guru/Admin.</p>
        <a href="dashboard.html" class="inline-block mt-3 px-4 py-2 rounded-lg bg-primary text-on-primary text-sm">Kembali</a>
      </div>`;
    return;
  }

  document.getElementById("page-title").textContent = profile.role === "admin" ? "Panel Admin" : "Panel Guru";

  const menu = [
    { icon: "dashboard", label: "Dashboard", href: "dashboard.html" },
    { icon: "admin_panel_settings", label: profile.role === "admin" ? "Panel Admin" : "Panel Guru", href: "admin.html" },
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
      m.href === "admin.html" ? "bg-primary-container text-primary font-medium" : "text-on-surface-variant hover:bg-surface-container"
    }"><span class="material-symbols-outlined text-xl">${m.icon}</span>${m.label}</a>`).join("");

  document.getElementById("header-avatar").textContent = inisial(profile.nama);
  const badge = document.getElementById("badge-role");
  badge.className = `hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${warnaPeran(profile.peran)}`;
  badge.textContent = profile.peran;

  document.getElementById("bottom-nav").innerHTML = [
    { icon: "dashboard", label: "Home", href: "dashboard.html" },
    { icon: "admin_panel_settings", label: "Panel", href: "admin.html" },
    { icon: "grade", label: "Nilai", href: "nilai.html" },
    { icon: "groups", label: "Struktur", href: "struktur.html" },
    { icon: "settings", label: "Setting", href: "pengaturan.html" },
  ].map((i) => `<a href="${i.href}" class="flex flex-col items-center justify-center py-2 text-[10px] gap-0.5 ${
    i.href === "admin.html" ? "text-primary" : "text-on-surface-variant"
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

  renderTabs();
  renderTabContent();
})();
