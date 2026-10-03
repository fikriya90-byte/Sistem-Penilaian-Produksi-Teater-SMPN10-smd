/**
 * SP-PPT — Modul Penilaian (versi lanjutan)
 * Fitur: Nilai Saya, Beri Nilai, Batch, Rekap, Moderasi, Revisi, Rekomendasi
 */

import { auth, db, PERAN_DIVISI } from "./firebase-init.js";
import {
  doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs,
  orderBy, addDoc, serverTimestamp, onSnapshot, deleteDoc, limit,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { protectPage } from "./router.js";
import {
  showToast, openModal, closeModal, skeleton, formatTanggal, waktuRelatif,
  predikat, warnaPeran, inisial, logActivity, esc, debounce,
} from "./utils.js";
import {
  KRITERIA_PER_PERAN, KRITERIA_REKAN, BOBOT_PENILAI_DEFAULT, BOBOT_TAHAPAN_DEFAULT,
  skorKeNilai, nilaiKePredikat, normalisasiBobot, normalisasiBobotKriteria,
  hitungNilaiPenilaian, hitungNilaiPerTahapan, hitungNilaiAkhir,
  generateRekomendasi, perbandinganKelas, hitungTrenNilai,
  deteksiAnomali, simpanRevisiNilai,
} from "./agregasi.js";

let ME = null;
let AKTIF_TAB = "saya";
let BATCH_MODE = false;
let SELECTED_SISWA = new Set();

function getKriteria(peran) {
  return KRITERIA_PER_PERAN[peran] || KRITERIA_PER_PERAN["Anggota Perlengkapan"];
}

function getKriteriaRekan(peran) {
  return KRITERIA_REKAN[peran] || KRITERIA_REKAN.default;
}
/* =========================================================
 * KONVERSI SKOR 1-4 → 100/80/60/40
 * ========================================================= */
function skorKeNilai(s) {
  return { 4: 100, 3: 80, 2: 60, 1: 40 }[s] || 0;
}

/* =========================================================
 * HITUNG NILAI AKHIR
 * ========================================================= */
function hitungNilaiAkhir(nilaiPerTahap, bobotTahap = { persiapan: 20, pelaksanaan: 35, pertunjukan: 30, pasca: 15 }) {
  let total = 0;
  Object.entries(bobotTahap).forEach(([k, b]) => {
    total += (nilaiPerTahap[k] || 0) * (b / 100);
  });
  return total;
}

/* =========================================================
 * TAB SAya — Tampilkan nilai sendiri
 * ========================================================= */
async function renderNilaiSaya() {
  const c = document.getElementById("tab-content");
  c.innerHTML = `<div class="glass rounded-2xl p-5">${skeleton(5)}</div>`;

  const snap = await getDocs(query(collection(db, "penilaian"), where("targetUid", "==", ME.uid)));
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const kriteria = getKriteria(ME.profile.peran);

  // Hitung menggunakan helper agregasi
  const hasil = hitungNilaiAkhir(list, kriteria, BOBOT_PENILAI_DEFAULT, BOBOT_TAHAPAN_DEFAULT);
  const pred = hasil.predikat;
  const nilaiAkhir = hasil.nilaiAkhir;

  // Komentar
  const komentars = [];
  list.forEach((p) => {
    (p.nilai || []).forEach((n) => {
      if (n.komentar) komentars.push({ dari: p.jenisPenilai, teks: n.komentar, waktu: p.updatedAt, tahapan: p.tahapan });
    });
  });

  // Rekomendasi otomatis
  const rekomendasi = generateRekomendasi(hasil, kriteria);

  // Perbandingan kelas
  const banding = await perbandinganKelas(ME.profile.kelas, nilaiAkhir);

  // Tren
  const tren = hitungTrenNilai(list);

  // Nilai per tahap untuk chart
  const labels = ["Persiapan", "Pelaksanaan", "Pertunjukan", "Pasca"];
  const tahapKeys = ["persiapan", "pelaksanaan", "pertunjukan", "pasca"];
  const values = tahapKeys.map((t) => hasil.perTahapan[t].nilai);

  const warnaKartu = {
    A: "from-yellow-500/20 to-yellow-500/5 border-yellow-500/40",
    B: "from-blue-500/20 to-blue-500/5 border-blue-500/40",
    C: "from-green-500/20 to-green-500/5 border-green-500/40",
    D: "from-orange-500/20 to-orange-500/5 border-orange-500/40",
    E: "from-red-500/20 to-red-500/5 border-red-500/40",
  }[pred.huruf];

  c.innerHTML = `
    <!-- Kartu Nilai Akhir -->
    <div class="bg-gradient-to-br ${warnaKartu} glass rounded-2xl p-6 border">
      <p class="text-xs text-on-surface-variant">Nilai Akhir Komposit</p>
      <div class="flex items-baseline gap-3 mt-1 flex-wrap">
        <span class="font-headline font-bold text-5xl">${nilaiAkhir.toFixed(2)}</span>
        <span class="font-headline text-3xl font-bold text-${pred.warna}-400">${pred.huruf}</span>
        <span class="text-sm text-on-surface-variant">${pred.label}</span>
      </div>
      <div class="grid grid-cols-3 gap-2 mt-4 text-xs">
        <div class="p-2 rounded-lg bg-surface-container/60">
          <p class="text-on-surface-variant">Guru (50%)</p>
          <p class="font-bold">${hasil.perTahapan.persiapan.nilaiJenis.guru?.toFixed(1) || "—"}</p>
        </div>
        <div class="p-2 rounded-lg bg-surface-container/60">
          <p class="text-on-surface-variant">Ketua (30%)</p>
          <p class="font-bold">${hasil.perTahapan.persiapan.nilaiJenis.ketua?.toFixed(1) || "—"}</p>
        </div>
        <div class="p-2 rounded-lg bg-surface-container/60">
          <p class="text-on-surface-variant">Rekan (20%)</p>
          <p class="font-bold">${hasil.perTahapan.persiapan.nilaiJenis.rekan?.toFixed(1) || "—"}</p>
        </div>
      </div>
    </div>

    <!-- Perbandingan Kelas -->
    ${banding ? `
    <div class="glass rounded-2xl p-5">
      <h3 class="font-headline font-semibold mb-3 flex items-center gap-2">
        <span class="material-symbols-outlined text-tertiary">analytics</span> Perbandingan Kelas
      </h3>
      <div class="grid grid-cols-3 gap-3 text-center">
        <div class="p-3 rounded-xl bg-surface-container">
          <p class="text-xs text-on-surface-variant">Nilai Anda</p>
          <p class="text-2xl font-bold text-primary">${nilaiAkhir.toFixed(1)}</p>
        </div>
        <div class="p-3 rounded-xl bg-surface-container">
          <p class="text-xs text-on-surface-variant">Rata-rata Kelas</p>
          <p class="text-2xl font-bold">${banding.rataKelas.toFixed(1)}</p>
        </div>
        <div class="p-3 rounded-xl ${banding.selisih >= 0 ? "bg-green-500/15" : "bg-orange-500/15"}">
          <p class="text-xs text-on-surface-variant">Selisih</p>
          <p class="text-2xl font-bold ${banding.selisih >= 0 ? "text-green-400" : "text-orange-400"}">${banding.selisih >= 0 ? "+" : ""}${banding.selisih.toFixed(1)}</p>
        </div>
      </div>
      <p class="text-xs text-on-surface-variant text-center mt-3">Posisi Anda <b class="text-primary">${banding.posisi}</b> dari ${banding.jumlahSiswa} siswa ${esc(ME.profile.kelas)}</p>
    </div>` : ""}

    <!-- Rekomendasi Otomatis -->
    <div class="glass rounded-2xl p-5">
      <h3 class="font-headline font-semibold mb-3 flex items-center gap-2">
        <span class="material-symbols-outlined text-secondary">lightbulb</span> Rekomendasi Perbaikan
      </h3>
      <div class="space-y-2">
        ${rekomendasi.map((r) => `
          <div class="p-3 rounded-xl bg-${r.warna}-500/10 border border-${r.warna}-500/30 flex items-start gap-3">
            <span class="material-symbols-outlined text-${r.warna}-400 mt-0.5">${r.ikon}</span>
            <div>
              <p class="text-sm font-medium text-${r.warna}-400">${esc(r.judul)}</p>
              <p class="text-xs text-on-surface-variant mt-0.5">${esc(r.pesan)}</p>
            </div>
          </div>`).join("")}
      </div>
    </div>

    <!-- Grafik Radar -->
    <div class="glass rounded-2xl p-5">
      <h3 class="font-headline font-semibold mb-3 flex items-center gap-2"><span class="material-symbols-outlined text-primary">radar</span> Radaran 4 Tahapan</h3>
      <div class="h-72"><canvas id="radar-chart"></canvas></div>
    </div>

    <!-- Grafik Batang -->
    <div class="glass rounded-2xl p-5">
      <h3 class="font-headline font-semibold mb-3 flex items-center gap-2"><span class="material-symbols-outlined text-tertiary">bar_chart</span> Perbandingan Tahapan</h3>
      <div class="h-64"><canvas id="bar-chart"></canvas></div>
    </div>

    <!-- Tren Nilai -->
    ${tren.length >= 2 ? `
    <div class="glass rounded-2xl p-5">
      <h3 class="font-headline font-semibold mb-3 flex items-center gap-2"><span class="material-symbols-outlined text-secondary">trending_up</span> Tren Nilai</h3>
      <div class="h-56"><canvas id="tren-chart"></canvas></div>
    </div>` : ""}

    <!-- Rincian Per Kriteria -->
    <div class="glass rounded-2xl p-5">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-headline font-semibold">📋 Rincian Kriteria (${esc(ME.profile.peran)})</h3>
        <span class="text-xs text-on-surface-variant">Bobot total dinormalisasi otomatis</span>
      </div>
      <div class="space-y-2">
        ${(() => {
          const { list: kriteriaNorm, normalized, total } = normalisasiBobotKriteria(kriteria);
          return kriteriaNorm.map((k) => `
            <div class="p-3 rounded-xl bg-surface-container flex items-center justify-between">
              <div>
                <p class="text-sm font-medium">${k.nama}</p>
                <p class="text-xs text-on-surface-variant">
                  Bobot ${k.bobot.toFixed(1)}%${normalized ? ` <span class="text-secondary">(dari ${kriteria.find(x=>x.nama===k.nama).bobot}%)</span>` : ""}
                </p>
              </div>
              <span class="font-headline font-bold text-primary">—</span>
            </div>`).join("");
        })()}
      </div>
    </div>

    <!-- Komentar -->
    <div class="glass rounded-2xl p-5">
      <h3 class="font-headline font-semibold mb-3">💬 Komentar Penilai</h3>
      <div class="flex gap-2 mb-3">
        <button data-filter="all" class="filter-komentar px-3 py-1.5 rounded-lg text-xs bg-primary-container text-primary font-medium">Semua</button>
        <button data-filter="positif" class="filter-komentar px-3 py-1.5 rounded-lg text-xs bg-surface-container">Positif</button>
        <button data-filter="perbaikan" class="filter-komentar px-3 py-1.5 rounded-lg text-xs bg-surface-container">Perbaikan</button>
      </div>
      <div id="komentar-list" class="space-y-2">
        ${komentarListHTML(komentars, "all")}
      </div>
    </div>

    <!-- Tombol Rapor -->
    <div class="glass rounded-2xl p-5 flex flex-wrap gap-3">
      <a href="rapor.html" class="flex-1 min-w-[180px] py-3 rounded-xl bg-primary text-on-primary font-headline font-semibold text-sm text-center hover:opacity-90 flex items-center justify-center gap-2">
        <span class="material-symbols-outlined">download</span> Unduh Rapor PDF Lengkap
      </a>
      <a href="rapor.html?ringkas=1" class="flex-1 min-w-[180px] py-3 rounded-xl bg-surface-container-high font-headline font-semibold text-sm text-center hover:bg-surface-container-highest flex items-center justify-center gap-2">
        <span class="material-symbols-outlined">description</span> Rapor Ringkas
      </a>
    </div>
  `;

  // Render charts
  renderCharts(values, tren);
  bindFilterKomentar(komentars);
}

function komentarListHTML(komentars, filter) {
  let list = komentars;
  if (filter === "positif") list = komentars.filter((k) => /baik|bagus|hebat|pertahankan|luar biasa|excellent|keren/i.test(k.teks));
  if (filter === "perbaikan") list = komentars.filter((k) => /kurang|perlu|tingkatkan|perbaiki|lemah|hindari/i.test(k.teks));

  if (!list.length) {
    return `<p class="text-sm text-on-surface-variant text-center py-6">Tidak ada komentar</p>`;
  }
  return list.map((k) => `
    <div class="p-3 rounded-xl bg-surface-container">
      <div class="flex items-center gap-2 mb-1">
        <span class="text-[10px] px-1.5 py-0.5 rounded bg-primary-container text-primary font-medium">${esc(k.dari || "-")}</span>
        <span class="text-[10px] text-on-surface-variant">${esc(k.tahapan || "")}</span>
        <span class="text-[10px] text-on-surface-variant">· ${k.waktu ? waktuRelatif(k.waktu) : "-"}</span>
      </div>
      <p class="text-sm">${esc(k.teks)}</p>
    </div>`).join("");
}

function bindFilterKomentar(komentars) {
  document.querySelectorAll(".filter-komentar").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll(".filter-komentar").forEach((x) => {
        x.className = "filter-komentar px-3 py-1.5 rounded-lg text-xs bg-surface-container";
      });
      b.className = "filter-komentar px-3 py-1.5 rounded-lg text-xs bg-primary-container text-primary font-medium";
      document.getElementById("komentar-list").innerHTML = komentarListHTML(komentars, b.dataset.filter);
    })
  );
}

function renderCharts(values, tren) {
  const labels = ["Persiapan", "Pelaksanaan", "Pertunjukan", "Pasca"];

  new Chart(document.getElementById("radar-chart"), {
    type: "radar",
    data: {
      labels,
      datasets: [{
        label: "Nilai",
        data: values,
        borderColor: "#c4c1fb",
        backgroundColor: "rgba(196,193,251,0.25)",
        pointBackgroundColor: "#c4c1fb",
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        r: {
          min: 0, max: 100,
          grid: { color: "rgba(71,70,79,0.5)" },
          angleLines: { color: "rgba(71,70,79,0.5)" },
          pointLabels: { color: "#c8c5d0", font: { size: 12 } },
          ticks: { color: "#c8c5d0", backdropColor: "transparent", stepSize: 25 },
        },
      },
      plugins: { legend: { display: false } },
    },
  });

  new Chart(document.getElementById("bar-chart"), {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Nilai",
        data: values,
        backgroundColor: ["#c4c1fb", "#ffb77d", "#b4c5ff", "#a5d6a7"],
        borderRadius: 8,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, max: 100, grid: { color: "rgba(71,70,79,0.4)" }, ticks: { color: "#c8c5d0" } },
        x: { grid: { display: false }, ticks: { color: "#c8c5d0" } },
      },
      plugins: { legend: { display: false } },
    },
  });

  if (tren.length >= 2 && document.getElementById("tren-chart")) {
    new Chart(document.getElementById("tren-chart"), {
      type: "line",
      data: {
        labels: tren.map((t) => `#${t.urutan}`),
        datasets: [{
          label: "Nilai",
          data: tren.map((t) => t.nilai),
          borderColor: "#ffb77d",
          backgroundColor: "rgba(255,183,125,0.15)",
          tension: 0.35,
          fill: true,
          pointBackgroundColor: "#ffb77d",
          pointRadius: 4,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true, max: 100, grid: { color: "rgba(71,70,79,0.4)" }, ticks: { color: "#c8c5d0" } },
          x: { grid: { display: false }, ticks: { color: "#c8c5d0" } },
        },
        plugins: { legend: { display: false } },
      },
    });
  }
}
/* =========================================================
 * TAB BERI NILAI — Form Penilaian
 * ========================================================= */
async function renderBeriNilai() {
  const c = document.getElementById("tab-content");
  const peran = ME.profile.peran;
  const bolehMenilai = ME.profile.role === "guru" || ME.profile.role === "admin" ||
    ["Pimpinan Produksi", "Sutradara", "Asisten Sutradara"].includes(peran) ||
    peran.startsWith("Koordinator");

  if (!bolehMenilai) {
    c.innerHTML = `<div class="glass rounded-2xl p-10 text-center">
      <span class="material-symbols-outlined text-5xl text-on-surface-variant mb-3">lock</span>
      <p class="text-sm text-on-surface-variant">Anda tidak memiliki hak untuk memberi nilai.</p>
    </div>`;
    return;
  }

  c.innerHTML = `
  <div class="glass rounded-2xl p-5">
    <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
      <h3 class="font-headline font-semibold">✍️ Form Penilaian</h3>
      <div class="flex gap-2">
        <button id="btn-batch-toggle" class="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-container-high flex items-center gap-1">
          <span class="material-symbols-outlined text-sm">checklist</span> Mode Batch
        </button>
      </div>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
      <div>
        <label class="text-xs text-on-surface-variant mb-1 block">Kelas</label>
        <select id="p-kelas" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm">
          <option value="">Pilih Kelas</option>
          <option value="IX-A">IX-A</option><option value="IX-B">IX-B</option>
          <option value="IX-C">IX-C</option><option value="IX-D">IX-D</option>
          <option value="IX-E">IX-E</option><option value="IX-F">IX-F</option>
        </select>
      </div>
      <div>
        <label class="text-xs text-on-surface-variant mb-1 block">Tahapan</label>
        <select id="p-tahap" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm">
          <option value="persiapan">Persiapan (20%)</option>
          <option value="pelaksanaan">Pelaksanaan (35%)</option>
          <option value="pertunjukan">Pertunjukan (30%)</option>
          <option value="pasca">Pasca (15%)</option>
        </select>
      </div>
      <div>
        <label class="text-xs text-on-surface-variant mb-1 block">Filter Peran</label>
        <select id="p-filter-peran" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm">
          <option value="">Semua Peran</option>
        </select>
      </div>
    </div>
    <div id="batch-info" class="hidden mb-3 p-3 rounded-lg bg-primary-container/30 border border-primary/30 text-xs">
      <div class="flex items-center justify-between">
        <span><b id="batch-count">0</b> siswa dipilih</span>
        <button id="btn-batch-proses" class="px-3 py-1.5 rounded-lg bg-primary text-on-primary font-medium">Nilai Terpilih</button>
      </div>
    </div>
    <div id="p-siswa-list" class="space-y-2">
      <p class="text-xs text-on-surface-variant text-center py-6">Pilih kelas untuk memuat siswa</p>
    </div>
  </div>
  <div id="p-form-inline"></div>
  `;

  // Isi filter peran
  const filterPeranSel = document.getElementById("p-filter-peran");
  Object.keys(KRITERIA_PER_PERAN).forEach((p) => {
    filterPeranSel.innerHTML += `<option value="${p}">${p}</option>`;
  });

  let DAFTAR_SISWA = [];

  const loadSiswa = async () => {
    const kls = document.getElementById("p-kelas").value;
    const filterPeran = document.getElementById("p-filter-peran").value;
    if (!kls) return;
    const list = document.getElementById("p-siswa-list");
    list.innerHTML = `<p class="text-xs text-center py-3">${skeleton(3)}</p>`;

    let q = query(collection(db, "users"), where("kelas", "==", kls), where("role", "==", "siswa"));
    const snap = await getDocs(q);
    DAFTAR_SISWA = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));

    if (filterPeran) DAFTAR_SISWA = DAFTAR_SISWA.filter((s) => s.peran === filterPeran);

    if (!DAFTAR_SISWA.length) {
      list.innerHTML = `<p class="text-xs text-center py-6 text-on-surface-variant">Tidak ada siswa</p>`;
      return;
    }

    list.innerHTML = DAFTAR_SISWA.map((s) => `
      <div class="flex items-center gap-3 p-3 rounded-xl bg-surface-container hover:bg-surface-container-high transition">
        ${BATCH_MODE ? `<input type="checkbox" class="batch-chk w-4 h-4 rounded accent-primary" data-uid="${s.uid}" />` : ""}
        <div class="w-10 h-10 rounded-full bg-primary-container text-primary flex items-center justify-center font-semibold text-sm">${inisial(s.nama)}</div>
        <div class="flex-1 min-w-0 btn-nilai-siswa cursor-pointer" data-uid="${s.uid}" data-nama="${esc(s.nama)}" data-peran="${esc(s.peran)}">
          <p class="text-sm font-medium truncate">${esc(s.nama)}</p>
          <p class="text-xs text-on-surface-variant">${esc(s.peran)}</p>
        </div>
        ${!BATCH_MODE ? `<span class="material-symbols-outlined text-on-surface-variant">chevron_right</span>` : ""}
      </div>`).join("");

    if (BATCH_MODE) {
      list.querySelectorAll(".batch-chk").forEach((chk) =>
        chk.addEventListener("change", updateBatchInfo)
      );
      updateBatchInfo();
    } else {
      list.querySelectorAll(".btn-nilai-siswa").forEach((el) =>
        el.addEventListener("click", () => bukaFormNilai(el.dataset))
      );
    }
  };

  const updateBatchInfo = () => {
    SELECTED_SISWA.clear();
    document.querySelectorAll(".batch-chk:checked").forEach((c) => SELECTED_SISWA.add(c.dataset.uid));
    document.getElementById("batch-count").textContent = SELECTED_SISWA.size;
  };

  document.getElementById("p-kelas").addEventListener("change", loadSiswa);
  document.getElementById("p-filter-peran").addEventListener("change", loadSiswa);
  document.getElementById("p-tahap").addEventListener("change", () => {
    if (BATCH_MODE) showToast("Tahapan berubah. Silakan pilih siswa lagi.", "info");
  });

  document.getElementById("btn-batch-toggle").addEventListener("click", () => {
    BATCH_MODE = !BATCH_MODE;
    const btn = document.getElementById("btn-batch-toggle");
    btn.className = `px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 ${BATCH_MODE ? "bg-primary text-on-primary" : "bg-surface-container-high"}`;
    document.getElementById("batch-info").classList.toggle("hidden", !BATCH_MODE);
    SELECTED_SISWA.clear();
    loadSiswa();
  });

  document.getElementById("btn-batch-proses").addEventListener("click", () => {
    if (!SELECTED_SISWA.size) return showToast("Pilih minimal 1 siswa.", "warning");
    bukaBatchForm([...SELECTED_SISWA], DAFTAR_SISWA);
  });
}

function bukaFormNilai({ uid, nama, peran }) {
  const kriteria = getKriteria(peran);
  const tahap = document.getElementById("p-tahap").value;
  const form = document.getElementById("p-form-inline");

  form.innerHTML = `
  <div class="glass rounded-2xl p-5 border-l-4 border-primary mt-5">
    <div class="flex items-center justify-between mb-4">
      <div>
        <p class="text-xs text-on-surface-variant">Menilai:</p>
        <h3 class="font-headline font-semibold text-lg">${esc(nama)}</h3>
        <p class="text-xs text-on-surface-variant">${esc(peran)} · Tahap: ${tahap}</p>
      </div>
      <button id="btn-tutup-form" class="p-2 rounded hover:bg-surface-container"><span class="material-symbols-outlined">close</span></button>
    </div>
    <div class="space-y-4">
      ${kriteria.map((k, i) => `
        <div class="p-3 rounded-xl bg-surface-container">
          <div class="flex justify-between items-center mb-2">
            <p class="text-sm font-medium">${k.nama}</p>
            <span class="text-xs text-on-surface-variant">Bobot ${k.bobot}%</span>
          </div>
          <input type="range" min="1" max="4" value="3" data-kriteria="${k.nama}" data-bobot="${k.bobot}" class="slider-nilai w-full accent-primary" />
          <div class="flex justify-between text-[10px] text-on-surface-variant mt-1">
            <span>1 Kurang</span><span>2 Cukup</span><span>3 Baik</span><span>4 Sangat Baik</span>
          </div>
          <p class="text-xs text-primary mt-2 deskripsi-nilai" data-i="${i}">${k.desc[2]}</p>
          <input type="text" placeholder="Komentar (wajib jika skor ≤ 2)" data-komentar="${k.nama}"
            class="komentar-input w-full mt-2 px-3 py-2 text-xs rounded-lg bg-surface-container-high border border-outline-variant" />
        </div>
      `).join("")}
    </div>
    <div class="mt-4 p-3 rounded-xl bg-primary-container/40 border border-primary/30">
      <p class="text-xs text-on-surface-variant">Preview Nilai</p>
      <p class="font-headline font-bold text-2xl text-primary" id="preview-nilai">80.00</p>
    </div>
    <div class="flex gap-2 mt-4">
      <button id="btn-draft" class="flex-1 py-2.5 rounded-lg bg-surface-container-high text-sm font-medium">Simpan Draft</button>
      <button id="btn-final" class="flex-1 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium">Finalisasi</button>
    </div>
  </div>`;

  form.scrollIntoView({ behavior: "smooth", block: "start" });

  const updatePreview = () => {
    let total = 0, totBob = 0;
    form.querySelectorAll(".slider-nilai").forEach((s) => {
      const skor = parseInt(s.value);
      const bob = parseInt(s.dataset.bobot);
      total += skorKeNilai(skor) * bob;
      totBob += bob;
      const idx = s.closest(".p-3").querySelector(".deskripsi-nilai").dataset.i;
      const k = kriteria.find((x) => x.nama === s.dataset.kriteria);
      if (k) s.closest(".p-3").querySelector(".deskripsi-nilai").textContent = k.desc[skor - 1];
    });
    const hasil = totBob ? total / totBob : 0;
    form.querySelector("#preview-nilai").textContent = hasil.toFixed(2);
  };

  form.querySelectorAll(".slider-nilai").forEach((s) => s.addEventListener("input", updatePreview));
  updatePreview();

  form.querySelector("#btn-tutup-form").addEventListener("click", () => (form.innerHTML = ""));

  const simpan = async (status) => {
    const nilai = [];
    let valid = true;
    form.querySelectorAll(".slider-nilai").forEach((s) => {
      const skor = parseInt(s.value);
      const komentar = form.querySelector(`[data-komentar="${s.dataset.kriteria}"]`).value.trim();
      if (skor <= 2 && !komentar) { valid = false; showToast(`Komentar wajib untuk "${s.dataset.kriteria}" (skor ≤ 2).`, "warning"); return; }
      nilai.push({ kriteria: s.dataset.kriteria, skor, komentar });
    });
    if (!valid) return;

    const jenisPenilai = ME.profile.role === "guru" ? "guru" :
      (["Pimpinan Produksi", "Sutradara", "Asisten Sutradara"].includes(ME.profile.peran) ? "ketua" : "rekan");

    try {
      await addDoc(collection(db, "penilaian"), {
        penilaiUid: ME.uid,
        targetUid: uid,
        tahapan: tahap,
        jenisPenilai,
        status,
        anonim: false,
        nilai,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await logActivity(ME.uid, `penilaian_${status}`, `target=${uid},tahap=${tahap}`);
      showToast(status === "final" ? "Nilai difinalisasi!" : "Draft disimpan!", "success");
      form.innerHTML = "";
    } catch (e) {
      console.error(e);
      showToast("Gagal menyimpan nilai.", "error");
    }
  };

  form.querySelector("#btn-draft").addEventListener("click", () => simpan("draft"));
  form.querySelector("#btn-final").addEventListener("click", () => simpan("final"));
}

/* =========================================================
 * TAB REKAP
 * ========================================================= */
async function renderRekap() {
  const c = document.getElementById("tab-content");
  if (!["guru", "admin"].includes(ME.profile.role)) {
    c.innerHTML = `<div class="glass rounded-2xl p-10 text-center"><span class="material-symbols-outlined text-5xl text-on-surface-variant mb-3">lock</span><p class="text-sm">Hanya guru/admin.</p></div>`;
    return;
  }

  c.innerHTML = `
  <div class="glass rounded-2xl p-5">
    <h3 class="font-headline font-semibold mb-4">📋 Rekap Nilai</h3>
    <div class="flex flex-wrap gap-2 mb-4">
      <select id="r-kelas" class="px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm">
        <option value="">Semua Kelas</option>
        <option>IX-A</option><option>IX-B</option><option>IX-C</option>
        <option>IX-D</option><option>IX-E</option><option>IX-F</option>
      </select>
      <button id="btn-export-csv" class="px-3 py-2 rounded-lg bg-primary-container text-primary text-sm font-medium">📥 Export CSV</button>
      <button id="btn-export-xlsx" class="px-3 py-2 rounded-lg bg-secondary-container text-white text-sm font-medium">📊 Export XLSX</button>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-xs">
        <thead class="text-on-surface-variant">
          <tr class="border-b border-outline-variant/40">
            <th class="text-left p-2">Nama</th>
            <th class="text-left p-2">Kelas</th>
            <th class="text-left p-2">Peran</th>
            <th class="text-center p-2">Nilai</th>
            <th class="text-center p-2">Predikat</th>
          </tr>
        </thead>
        <tbody id="rekap-body"><tr><td colspan="5" class="p-6 text-center text-on-surface-variant">Memuat...</td></tr></tbody>
      </table>
    </div>
  </div>`;

  const load = async (kls) => {
    const body = document.getElementById("rekap-body");
    body.innerHTML = `<tr><td colspan="5" class="p-6 text-center">${skeleton(2)}</td></tr>`;
    const q = kls
      ? query(collection(db, "users"), where("role", "==", "siswa"), where("kelas", "==", kls))
      : query(collection(db, "users"), where("role", "==", "siswa"));
    const snap = await getDocs(q);
    if (snap.empty) { body.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-on-surface-variant">Tidak ada data</td></tr>`; return; }
    const rows = [];
    for (const d of snap.docs) {
      const s = d.data();
      const pSnap = await getDocs(query(collection(db, "penilaian"), where("targetUid", "==", d.id)));
      const arr = pSnap.docs.map((x) => x.data());
      let total = 0, cnt = 0;
      arr.forEach((p) => {
        const kr = getKriteria(s.peran);
        let t = 0, tb = 0;
        (p.nilai || []).forEach((n) => {
          const k = kr.find((x) => x.nama === n.kriteria);
          const bob = k ? k.bobot : 10;
          t += skorKeNilai(n.skor) * bob; tb += bob;
        });
        if (tb) { total += t / tb; cnt++; }
      });
      const akhir = cnt ? total / cnt : 0;
      const pr = predikat(akhir);
      rows.push({ nama: s.nama, kelas: s.kelas, peran: s.peran, nilai: akhir, predikat: pr.huruf });
    }
    rows.sort((a, b) => b.nilai - a.nilai);
    body.innerHTML = rows.map((r) => `
      <tr class="border-b border-outline-variant/20 hover:bg-surface-container">
        <td class="p-2 font-medium">${esc(r.nama)}</td>
        <td class="p-2">${esc(r.kelas)}</td>
        <td class="p-2">${esc(r.peran)}</td>
        <td class="p-2 text-center font-bold text-primary">${r.nilai.toFixed(2)}</td>
        <td class="p-2 text-center font-bold">${r.predikat}</td>
      </tr>`).join("");

    document.getElementById("btn-export-csv").onclick = () => {
      const csv = ["Nama,Kelas,Peran,Nilai,Predikat", ...rows.map((r) => `"${r.nama}","${r.kelas}","${r.peran}",${r.nilai.toFixed(2)},${r.predikat}`)].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `rekap_nilai_${Date.now()}.csv`;
      a.click();
    };
  };

  document.getElementById("r-kelas").addEventListener("change", (e) => load(e.target.value));
  load("");
}

/* =========================================================
 * TAB MODERASI
 * ========================================================= */
async function renderModerasi() {
  const c = document.getElementById("tab-content");
  if (!["guru", "admin"].includes(ME.profile.role)) {
    c.innerHTML = `<div class="glass rounded-2xl p-10 text-center"><span class="material-symbols-outlined text-5xl text-on-surface-variant mb-3">lock</span><p class="text-sm">Hanya guru/admin.</p></div>`;
    return;
  }
  c.innerHTML = `
  <div class="glass rounded-2xl p-5">
    <h3 class="font-headline font-semibold mb-3">🛡️ Moderasi Penilaian</h3>
    <p class="text-xs text-on-surface-variant mb-4">Deteksi anomali: nilai ekstrem, gap > 1.5, submit < 10 detik, pola seragam.</p>
    <div id="anomali-list" class="space-y-2">${skeleton(4)}</div>
  </div>`;

  try {
    const snap = await getDocs(query(collection(db, "penilaian"), orderBy("updatedAt", "desc"), limit(30)));
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const anomali = [];
    list.forEach((p) => {
      const skor = (p.nilai || []).map((n) => n.skor);
      if (!skor.length) return;
      const semuaSama = skor.every((s) => s === skor[0]);
      const semua4 = skor.every((s) => s === 4);
      const semua1 = skor.every((s) => s === 1);
      if (semua4 || semua1 || semuaSama) {
        anomali.push({ id: p.id, alasan: semua4 ? "Nilai semua 4 (ekstrem tinggi)" : semua1 ? "Nilai semua 1 (ekstrem rendah)" : "Pola seragam", data: p });
      }
    });

    const el = document.getElementById("anomali-list");
    if (!anomali.length) {
      el.innerHTML = `<p class="text-sm text-on-surface-variant text-center py-8">Tidak ada anomali terdeteksi ✓</p>`;
    } else {
      el.innerHTML = anomali.map((a) => `
        <div class="p-3 rounded-xl bg-error/10 border border-error/30">
          <p class="text-sm font-medium text-error">⚠️ ${esc(a.alasan)}</p>
          <p class="text-xs text-on-surface-variant mt-1">Penilai: ${esc(a.data.jenisPenilai)} · Target: ${esc(a.data.targetUid.slice(0,8))}...</p>
          <div class="flex gap-2 mt-2">
            <button data-id="${a.id}" class="btn-valid px-3 py-1 rounded-lg bg-green-600 text-white text-xs">Valid</button>
            <button data-id="${a.id}" class="btn-tolak px-3 py-1 rounded-lg bg-error text-white text-xs">Tolak</button>
          </div>
        </div>
      `).join("");

      el.querySelectorAll(".btn-valid, .btn-tolak").forEach((b) =>
        b.addEventListener("click", async () => {
          const id = b.dataset.id;
          const aksi = b.classList.contains("btn-valid") ? "validasi" : "tolak";
          try {
            await updateDoc(doc(db, "penilaian", id), { status: aksi === "validasi" ? "final" : "rejected", moderatedAt: serverTimestamp(), moderatedBy: ME.uid });
            await logActivity(ME.uid, `moderasi_${aksi}`, `penilaian=${id}`);
            showToast(`Penilaian di-${aksi}.`, "success");
            b.closest("div").remove();
          } catch (e) { showToast("Gagal.", "error"); }
        })
      );
    }
  } catch (e) {
    document.getElementById("anomali-list").innerHTML = `<p class="text-sm text-on-surface-variant text-center py-6">Gagal memuat data.</p>`;
  }
}

/* =========================================================
 * TAB SWITCH
 * ========================================================= */
function switchTab(tab) {
  AKTIF_TAB = tab;
  document.querySelectorAll(".tab-btn").forEach((b) => {
    const aktif = b.dataset.tab === tab;
    b.className = `tab-btn px-4 py-2 rounded-xl text-sm font-medium transition ${aktif ? "bg-primary-container text-primary" : "text-on-surface-variant hover:bg-surface-container"}`;
  });
  if (tab === "saya") renderNilaiSaya();
  if (tab === "input") renderBeriNilai();
  if (tab === "rekap") renderRekap();
  if (tab === "moderasi") renderModerasi();
}

/* =========================================================
 * INIT
 * ========================================================= */
(async function init() {
  const { uid, profile } = await protectPage();
  ME = { uid, profile };

  // Sidebar & header
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
    <a href="${m.href}" class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition text-sm ${m.href === "nilai.html" ? "bg-primary-container text-primary font-medium" : "text-on-surface-variant hover:bg-surface-container"}">
      <span class="material-symbols-outlined text-xl">${m.icon}</span>${m.label}
    </a>`).join("");

  document.getElementById("header-avatar").textContent = inisial(profile.nama);
  const badge = document.getElementById("badge-role");
  badge.className = `hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${warnaPeran(profile.peran)}`;
  badge.textContent = profile.peran;

  // Bottom nav
  const bottomItems = [
    { icon: "dashboard", label: "Home", href: "dashboard.html" },
    { icon: "grade", label: "Nilai", href: "nilai.html" },
    { icon: "calendar_month", label: "Jadwal", href: "jadwal.html" },
    { icon: "checklist", label: "Tugas", href: "checklist.html" },
    { icon: "groups", label: "Kerabat", href: "struktur.html" },
  ];
  document.getElementById("bottom-nav").innerHTML = bottomItems.map((i) => `
    <a href="${i.href}" class="flex flex-col items-center justify-center py-2 text-[10px] gap-0.5 ${i.href === "nilai.html" ? "text-primary" : "text-on-surface-variant"}">
      <span class="material-symbols-outlined text-xl">${i.icon}</span>${i.label}
    </a>`).join("");

  // Theme
  const html = document.documentElement;
  const saved = localStorage.getItem("theme");
  if (saved === "light") html.classList.remove("dark");
  const btnT = document.getElementById("btn-theme"), iconT = document.getElementById("theme-icon");
  const setIcon = () => (iconT.textContent = html.classList.contains("dark") ? "light_mode" : "dark_mode");
  setIcon();
  btnT.addEventListener("click", () => { html.classList.toggle("dark"); localStorage.setItem("theme", html.classList.contains("dark") ? "dark" : "light"); setIcon(); });

  // Logout
  document.getElementById("btn-logout").addEventListener("click", async () => {
    if (confirm("Yakin ingin keluar?")) {
      await logActivity(ME.uid, "logout");
      await signOut(auth);
      window.location.replace("index.html");
    }
  });

  // Mobile menu
  document.getElementById("btn-menu").addEventListener("click", () => {
    const sb = document.getElementById("sidebar");
    sb.classList.toggle("hidden"); sb.classList.toggle("flex");
  });

  // Tabs
  document.querySelectorAll(".tab-btn").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));

  switchTab("saya");
})();
