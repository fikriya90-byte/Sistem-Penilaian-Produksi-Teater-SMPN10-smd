/**
 * SP-PPT — Modul Penilaian
 * Nilai Saya, Beri Nilai (slider), Rekap, Moderasi, Radar Chart
 */

import { auth, db, PERAN_DIVISI } from "./firebase-init.js";
import {
  doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs,
  orderBy, addDoc, serverTimestamp, onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { protectPage } from "./router.js";
import {
  showToast, openModal, closeModal, skeleton, formatTanggal, waktuRelatif,
  predikat, warnaPeran, inisial, logActivity, esc, debounce,
} from "./utils.js";

let ME = null;
let AKTIF_TAB = "saya";

/* =========================================================
 * KRITERIA PER PERAN
 * ========================================================= */
const KRITERIA = {
  Pemain: [
    { nama: "Hafalan Dialog", bobot: 20, desc: ["<50% hafal", "70% hafal", "90% hafal", "100% hafal"] },
    { nama: "Penjiwaan Karakter", bobot: 25, desc: ["Tidak mendalami", "Datar", "Jelas", "Hidup & presisi"] },
    { nama: "Proyeksi Suara & Intonasi", bobot: 15, desc: ["Sering tak terdengar", "Kadang tak terdengar", "Cukup", "Sampai baris belakang"] },
    { nama: "Blocking & Movement", bobot: 15, desc: ["Tidak ikut", "Kadang keluar", "Sesuai arahan", "Presisi & natural"] },
    { nama: "Interaksi Panggung", bobot: 15, desc: ["Pasif", "Kurang responsif", "Cukup", "Reaktif & hidup"] },
    { nama: "Kedisiplinan", bobot: 10, desc: ["<60% on-time", "75%", "90%", "100% on-time"] },
  ],
  "Asisten Sutradara": [
    { nama: "Prompt Book", bobot: 25, desc: ["Tidak ada", "Sebagian", "Lengkap", "Sangat detail"] },
    { nama: "Catatan Harian", bobot: 25, desc: ["Tidak ada", "Jarang", "Rutin", "Rutin & analitis"] },
    { nama: "Standby Cue", bobot: 25, desc: ["Tidak siap", "Kurang siap", "Siap", "Sangat presisi"] },
    { nama: "Evaluasi", bobot: 25, desc: ["Tidak ada", "Dangkal", "Baik", "Mendalam"] },
  ],
  default: [
    { nama: "Kerja Sama", bobot: 30, desc: ["Tidak kooperatif", "Kurang", "Baik", "Sangat baik"] },
    { nama: "Kualitas Kerja", bobot: 30, desc: ["Buruk", "Cukup", "Baik", "Sangat baik"] },
    { nama: "Disiplin", bobot: 20, desc: ["Sering telat", "Kadang telat", "Tepat waktu", "Selalu tepat"] },
    { nama: "Inisiatif", bobot: 20, desc: ["Pasif", "Kurang", "Baik", "Sangat proaktif"] },
  ],
};

function getKriteria(peran) {
  if (KRITERIA[peran]) return KRITERIA[peran];
  if (peran.startsWith("Koordinator Perlengkapan")) return KRITERIA.default;
  if (peran.startsWith("Anggota Perlengkapan")) return KRITERIA.default;
  return KRITERIA.default;
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

  // Ambil semua penilaian di mana target = saya
  const snap = await getDocs(query(
    collection(db, "penilaian"),
    where("targetUid", "==", ME.uid)
  ));
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Kelompokkan per tahapan
  const perTahap = { persiapan: [], pelaksanaan: [], pertunjukan: [], pasca: [] };
  list.forEach((p) => {
    if (perTahap[p.tahapan]) perTahap[p.tahapan].push(p);
  });

  // Hitung rata-rata per tahapan
  const nilaiPerTahap = {};
  Object.keys(perTahap).forEach((t) => {
    const arr = perTahap[t];
    if (!arr.length) { nilaiPerTahap[t] = 0; return; }
    let sum = 0;
    arr.forEach((p) => {
      const kr = getKriteria(ME.profile.peran);
      const n = p.nilai || [];
      let total = 0, totBob = 0;
      n.forEach((item) => {
        const k = kr.find((x) => x.nama === item.kriteria);
        const bob = k ? k.bobot : 10;
        total += skorKeNilai(item.skor) * bob;
        totBob += bob;
      });
      sum += totBob ? total / totBob : 0;
    });
    nilaiPerTahap[t] = sum / arr.length;
  });

  const nilaiAkhir = hitungNilaiAkhir(nilaiPerTahap);
  const pred = predikat(nilaiAkhir);

  // Ambil komentar
  const komentars = [];
  list.forEach((p) => {
    (p.nilai || []).forEach((n) => {
      if (n.komentar) komentars.push({ dari: p.jenisPenilai, teks: n.komentar, waktu: p.updatedAt });
    });
  });

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
      <div class="flex items-baseline gap-3 mt-1">
        <span class="font-headline font-bold text-5xl">${nilaiAkhir.toFixed(2)}</span>
        <span class="font-headline text-3xl font-bold ${pred.warna}">${pred.huruf}</span>
      </div>
      <p class="text-sm text-on-surface-variant mt-1">${pred.label}</p>
      <div class="grid grid-cols-3 gap-2 mt-4 text-xs">
        <div class="p-2 rounded-lg bg-surface-container/60"><p class="text-on-surface-variant">Guru (50%)</p><p class="font-bold">—</p></div>
        <div class="p-2 rounded-lg bg-surface-container/60"><p class="text-on-surface-variant">Ketua (30%)</p><p class="font-bold">—</p></div>
        <div class="p-2 rounded-lg bg-surface-container/60"><p class="text-on-surface-variant">Rekan (20%)</p><p class="font-bold">—</p></div>
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

    <!-- Rincian Per Kriteria -->
    <div class="glass rounded-2xl p-5">
      <h3 class="font-headline font-semibold mb-3">📋 Rincian Kriteria (${esc(ME.profile.peran)})</h3>
      <div class="space-y-2">
        ${getKriteria(ME.profile.peran).map((k) => `
          <div class="p-3 rounded-xl bg-surface-container flex items-center justify-between">
            <div><p class="text-sm font-medium">${k.nama}</p><p class="text-xs text-on-surface-variant">Bobot ${k.bobot}%</p></div>
            <span class="font-headline font-bold text-primary">—</span>
          </div>`).join("")}
      </div>
    </div>

    <!-- Komentar -->
    <div class="glass rounded-2xl p-5">
      <h3 class="font-headline font-semibold mb-3">💬 Komentar Penilai</h3>
      <div class="flex gap-2 mb-3">
        <button data-filter="all" class="filter-komentar px-3 py-1.5 rounded-lg text-xs bg-primary-container text-primary font-medium">Semua</button>
        <button data-filter="positif" class="filter-komentar px-3 py-1.5 rounded-lg text-xs bg-surface-container">Positif</button>
      </div>
      <div id="komentar-list" class="space-y-2">
        ${komentars.length ? komentars.map((k) => `
          <div class="p-3 rounded-xl bg-surface-container">
            <p class="text-xs text-on-surface-variant mb-1">${esc(k.dari || "-")} · ${k.waktu ? waktuRelatif(k.waktu) : "-"}</p>
            <p class="text-sm">${esc(k.teks)}</p>
          </div>`).join("") : `<p class="text-sm text-on-surface-variant text-center py-6">Belum ada komentar</p>`}
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

  // Render Chart.js
  const labels = ["Persiapan", "Pelaksanaan", "Pertunjukan", "Pasca"];
  const values = [nilaiPerTahap.persiapan, nilaiPerTahap.pelaksanaan, nilaiPerTahap.pertunjukan, nilaiPerTahap.pasca];

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

  // Filter komentar
  document.querySelectorAll(".filter-komentar").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll(".filter-komentar").forEach((x) => {
        x.className = "filter-komentar px-3 py-1.5 rounded-lg text-xs bg-surface-container";
      });
      b.className = "filter-komentar px-3 py-1.5 rounded-lg text-xs bg-primary-container text-primary font-medium";
      const f = b.dataset.filter;
      const filtered = f === "positif" ? komentars.filter((k) => /baik|bagus|hebat|pertahankan|luar biasa|excellent/i.test(k.teks)) : komentars;
      document.getElementById("komentar-list").innerHTML = filtered.length
        ? filtered.map((k) => `<div class="p-3 rounded-xl bg-surface-container"><p class="text-xs text-on-surface-variant mb-1">${esc(k.dari||"-")}</p><p class="text-sm">${esc(k.teks)}</p></div>`).join("")
        : `<p class="text-sm text-on-surface-variant text-center py-6">Tidak ada komentar</p>`;
    })
  );
}

/* =========================================================
 * TAB BERI NILAI — Form Penilaian
 * ========================================================= */
async function renderBeriNilai() {
  const c = document.getElementById("tab-content");

  // Hak penilai: guru, pimpinan, sutradara, asisten, koordinator
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
    <h3 class="font-headline font-semibold mb-4">✍️ Form Penilaian</h3>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
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
    </div>
    <div id="p-siswa-list" class="space-y-2">
      <p class="text-xs text-on-surface-variant text-center py-6">Pilih kelas untuk memuat siswa</p>
    </div>
  </div>

  <!-- Modal penilaian (inline) -->
  <div id="p-form-inline"></div>
  `;

  document.getElementById("p-kelas").addEventListener("change", async (e) => {
    const kls = e.target.value;
    if (!kls) return;
    const list = document.getElementById("p-siswa-list");
    list.innerHTML = `<p class="text-xs text-center py-3">${skeleton(3)}</p>`;
    const snap = await getDocs(query(collection(db, "users"), where("kelas", "==", kls), where("role", "==", "siswa")));
    if (snap.empty) {
      list.innerHTML = `<p class="text-xs text-center py-6 text-on-surface-variant">Tidak ada siswa di kelas ini</p>`;
      return;
    }
    list.innerHTML = snap.docs.map((d) => {
      const s = d.data();
      return `
      <div class="flex items-center gap-3 p-3 rounded-xl bg-surface-container hover:bg-surface-container-high transition cursor-pointer btn-nilai-siswa"
           data-uid="${d.id}" data-nama="${esc(s.nama)}" data-peran="${esc(s.peran)}">
        <div class="w-10 h-10 rounded-full bg-primary-container text-primary flex items-center justify-center font-semibold text-sm">${inisial(s.nama)}</div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium truncate">${esc(s.nama)}</p>
          <p class="text-xs text-on-surface-variant">${esc(s.peran)}</p>
        </div>
        <span class="material-symbols-outlined text-on-surface-variant">chevron_right</span>
      </div>`;
    }).join("");

    document.querySelectorAll(".btn-nilai-siswa").forEach((el) =>
      el.addEventListener("click", () => bukaFormNilai(el.dataset))
    );
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
