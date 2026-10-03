/**
 * SP-PPT — Modul Agregasi Nilai
 * Semua rumus perhitungan nilai terpusat di sini.
 * - Auto-normalisasi bobot
 * - Nilai individu (Guru/Ketua/Rekan)
 * - Nilai per tahapan
 * - Nilai akhir komposit
 * - Predikat
 * - Rekomendasi perbaikan
 */

import { doc, getDoc, collection, query, where, getDocs, serverTimestamp, addDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-init.js";

/* =========================================================
 * KONFIGURASI BOBOT DEFAULT
 * ========================================================= */
export const BOBOT_PENILAI_DEFAULT = {
  guru: 0.50,
  ketua: 0.30,
  rekan: 0.20,
};

export const BOBOT_TAHAPAN_DEFAULT = {
  persiapan: 20,
  pelaksanaan: 35,
  pertunjukan: 30,
  pasca: 15,
};

/* =========================================================
 * KRITERIA PER PERAN
 * ========================================================= */
export const KRITERIA_PER_PERAN = {
  Pemain: [
    { nama: "Hafalan Dialog", bobot: 20, deskripsi: ["<50% hafal", "70% hafal", "90% hafal", "100% hafal"] },
    { nama: "Penjiwaan Karakter", bobot: 25, deskripsi: ["Tidak mendalami", "Datar", "Jelas", "Hidup & presisi"] },
    { nama: "Proyeksi Suara & Intonasi", bobot: 15, deskripsi: ["Sering tak terdengar", "Kadang tak terdengar", "Cukup", "Sampai baris belakang"] },
    { nama: "Blocking & Movement", bobot: 15, deskripsi: ["Tidak ikut", "Kadang keluar", "Sesuai arahan", "Presisi & natural"] },
    { nama: "Interaksi Panggung", bobot: 15, deskripsi: ["Pasif", "Kurang responsif", "Cukup", "Reaktif & hidup"] },
    { nama: "Kedisiplinan", bobot: 10, deskripsi: ["<60% on-time", "75%", "90%", "100% on-time"] },
  ],
  "Asisten Sutradara": [
    { nama: "Prompt Book", bobot: 25, deskripsi: ["Tidak ada", "Sebagian", "Lengkap", "Sangat detail"] },
    { nama: "Catatan Harian", bobot: 25, deskripsi: ["Tidak ada", "Jarang", "Rutin", "Rutin & analitis"] },
    { nama: "Standby Cue", bobot: 25, deskripsi: ["Tidak siap", "Kurang siap", "Siap", "Sangat presisi"] },
    { nama: "Evaluasi", bobot: 25, deskripsi: ["Tidak ada", "Dangkal", "Baik", "Mendalam"] },
  ],
  "Koordinator Perlengkapan": [
    { nama: "Kerja Sama", bobot: 30, deskripsi: ["Tidak kooperatif", "Kurang", "Baik", "Sangat baik"] },
    { nama: "Kualitas Kerja", bobot: 30, deskripsi: ["Buruk", "Cukup", "Baik", "Sangat baik"] },
    { nama: "Disiplin", bobot: 20, deskripsi: ["Sering telat", "Kadang telat", "Tepat waktu", "Selalu tepat"] },
    { nama: "Inisiatif", bobot: 20, deskripsi: ["Pasif", "Kurang", "Baik", "Sangat proaktif"] },
  ],
  "Anggota Perlengkapan": [
    { nama: "Kerja Sama", bobot: 30, deskripsi: ["Tidak kooperatif", "Kurang", "Baik", "Sangat baik"] },
    { nama: "Kualitas Kerja", bobot: 30, deskripsi: ["Buruk", "Cukup", "Baik", "Sangat baik"] },
    { nama: "Disiplin", bobot: 20, deskripsi: ["Sering telat", "Kadang telat", "Tepat waktu", "Selalu tepat"] },
    { nama: "Inisiatif", bobot: 20, deskripsi: ["Pasif", "Kurang", "Baik", "Sangat proaktif"] },
  ],
  "Koordinator Publikasi & Dokumentasi": [
    { nama: "Kreativitas", bobot: 30, deskripsi: ["Monoton", "Kurang variatif", "Kreatif", "Sangat inovatif"] },
    { nama: "Ketepatan Waktu", bobot: 25, deskripsi: ["Sering telat", "Kadang telat", "Tepat waktu", "Selalu lebih awal"] },
    { nama: "Kualitas Visual", bobot: 25, deskripsi: ["Buruk", "Cukup", "Menarik", "Sangat profesional"] },
    { nama: "Kerja Sama", bobot: 20, deskripsi: ["Tidak kooperatif", "Kurang", "Baik", "Sangat baik"] },
  ],
  "Anggota Publikasi & Dokumentasi": [
    { nama: "Kreativitas", bobot: 30, deskripsi: ["Monoton", "Kurang variatif", "Kreatif", "Sangat inovatif"] },
    { nama: "Ketepatan Waktu", bobot: 25, deskripsi: ["Sering telat", "Kadang telat", "Tepat waktu", "Selalu lebih awal"] },
    { nama: "Kualitas Visual", bobot: 25, deskripsi: ["Buruk", "Cukup", "Menarik", "Sangat profesional"] },
    { nama: "Kerja Sama", bobot: 20, deskripsi: ["Tidak kooperatif", "Kurang", "Baik", "Sangat baik"] },
  ],
  "Koordinator Tata Panggung": [
    { nama: "Ketepatan Waktu", bobot: 30, deskripsi: ["Sering telat", "Kadang telat", "Tepat waktu", "Selalu lebih awal"] },
    { nama: "Kualitas Konstruksi", bobot: 30, deskripsi: ["Rapuh", "Cukup", "Kokoh", "Sangat kokoh & estetis"] },
    { nama: "Kerja Sama", bobot: 20, deskripsi: ["Tidak kooperatif", "Kurang", "Baik", "Sangat baik"] },
    { nama: "Keselamatan", bobot: 20, deskripsi: ["Mengabaikan", "Kurang sadar", "Sesuai SOP", "Sangat teliti"] },
  ],
  "Anggota Tata Panggung": [
    { nama: "Ketepatan Waktu", bobot: 30, deskripsi: ["Sering telat", "Kadang telat", "Tepat waktu", "Selalu lebih awal"] },
    { nama: "Kualitas Konstruksi", bobot: 30, deskripsi: ["Rapuh", "Cukup", "Kokoh", "Sangat kokoh & estetis"] },
    { nama: "Kerja Sama", bobot: 20, deskripsi: ["Tidak kooperatif", "Kurang", "Baik", "Sangat baik"] },
    { nama: "Keselamatan", bobot: 20, deskripsi: ["Mengabaikan", "Kurang sadar", "Sesuai SOP", "Sangat teliti"] },
  ],
  "Koordinator Tata Rias": [
    { nama: "Kreativitas", bobot: 30, deskripsi: ["Monoton", "Kurang variatif", "Kreatif", "Sangat inovatif"] },
    { nama: "Higienitas", bobot: 25, deskripsi: ["Tidak higienis", "Kurang", "Bersih", "Sangat steril"] },
    { nama: "Ketepatan Waktu", bobot: 25, deskripsi: ["Sering telat", "Kadang telat", "Tepat waktu", "Selalu lebih awal"] },
    { nama: "Kerja Sama", bobot: 20, deskripsi: ["Tidak kooperatif", "Kurang", "Baik", "Sangat baik"] },
  ],
  "Anggota Tata Rias": [
    { nama: "Kreativitas", bobot: 30, deskripsi: ["Monoton", "Kurang variatif", "Kreatif", "Sangat inovatif"] },
    { nama: "Higienitas", bobot: 25, deskripsi: ["Tidak higienis", "Kurang", "Bersih", "Sangat steril"] },
    { nama: "Ketepatan Waktu", bobot: 25, deskripsi: ["Sering telat", "Kadang telat", "Tepat waktu", "Selalu lebih awal"] },
    { nama: "Kerja Sama", bobot: 20, deskripsi: ["Tidak kooperatif", "Kurang", "Baik", "Sangat baik"] },
  ],
  "Koordinator Tata Busana": [
    { nama: "Kreativitas", bobot: 30, deskripsi: ["Monoton", "Kurang variatif", "Kreatif", "Sangat inovatif"] },
    { nama: "Kerapian Jahitan", bobot: 25, deskripsi: ["Berantakan", "Cukup", "Rapi", "Sangat rapi"] },
    { nama: "Ketepatan Waktu", bobot: 25, deskripsi: ["Sering telat", "Kadang telat", "Tepat waktu", "Selalu lebih awal"] },
    { nama: "Kerja Sama", bobot: 20, deskripsi: ["Tidak kooperatif", "Kurang", "Baik", "Sangat baik"] },
  ],
  "Anggota Tata Busana": [
    { nama: "Kreativitas", bobot: 30, deskripsi: ["Monoton", "Kurang variatif", "Kreatif", "Sangat inovatif"] },
    { nama: "Kerapian Jahitan", bobot: 25, deskripsi: ["Berantakan", "Cukup", "Rapi", "Sangat rapi"] },
    { nama: "Ketepatan Waktu", bobot: 25, deskripsi: ["Sering telat", "Kadang telat", "Tepat waktu", "Selalu lebih awal"] },
    { nama: "Kerja Sama", bobot: 20, deskripsi: ["Tidak kooperatif", "Kurang", "Baik", "Sangat baik"] },
  ],
  "Koordinator Tata Musik & Suara": [
    { nama: "Ketepatan Cue", bobot: 30, deskripsi: ["Sering meleset", "Kadang meleset", "Tepat", "Sangat presisi"] },
    { nama: "Kualitas Audio", bobot: 25, deskripsi: ["Buruk", "Cukup", "Jernih", "Sangat jernih & seimbang"] },
    { nama: "Kerapian", bobot: 25, deskripsi: ["Berantakan", "Cukup", "Rapi", "Sangat rapi"] },
    { nama: "Kerja Sama", bobot: 20, deskripsi: ["Tidak kooperatif", "Kurang", "Baik", "Sangat baik"] },
  ],
  "Anggota Tata Musik & Suara": [
    { nama: "Ketepatan Cue", bobot: 30, deskripsi: ["Sering meleset", "Kadang meleset", "Tepat", "Sangat presisi"] },
    { nama: "Kualitas Audio", bobot: 25, deskripsi: ["Buruk", "Cukup", "Jernih", "Sangat jernih & seimbang"] },
    { nama: "Kerapian", bobot: 25, deskripsi: ["Berantakan", "Cukup", "Rapi", "Sangat rapi"] },
    { nama: "Kerja Sama", bobot: 20, deskripsi: ["Tidak kooperatif", "Kurang", "Baik", "Sangat baik"] },
  ],
};

/* =========================================================
 * KRITERIA REKAN (3 kriteria per divisi)
 * ========================================================= */
export const KRITERIA_REKAN = {
  default: [
    { nama: "Kerja Sama", bobot: 40, deskripsi: ["Tidak kooperatif", "Kurang", "Baik", "Sangat baik"] },
    { nama: "Kontribusi", bobot: 30, deskripsi: ["Pasif", "Kurang", "Cukup", "Sangat aktif"] },
    { nama: "Disiplin", bobot: 30, deskripsi: ["Sering telat", "Kadang telat", "Tepat waktu", "Selalu tepat"] },
  ],
  Pemain: [
    { nama: "Penjiwaan", bobot: 40, deskripsi: ["Datar", "Kurang", "Cukup", "Mendalam"] },
    { nama: "Kerja Sama", bobot: 30, deskripsi: ["Tidak kooperatif", "Kurang", "Baik", "Sangat baik"] },
    { nama: "Kedisiplinan", bobot: 30, deskripsi: ["Sering telat", "Kadang telat", "Tepat waktu", "Selalu tepat"] },
  ],
};

/* =========================================================
 * KONVERSI SKOR 1-4 → 100/80/60/40
 * ========================================================= */
export function skorKeNilai(s) {
  return { 4: 100, 3: 80, 2: 60, 1: 40 }[s] || 0;
}

export function nilaiKePredikat(n) {
  if (n >= 90) return { huruf: "A", label: "Mahir, teladan", warna: "yellow" };
  if (n >= 80) return { huruf: "B", label: "Kompeten, andal", warna: "blue" };
  if (n >= 70) return { huruf: "C", label: "Memenuhi standar", warna: "green" };
  if (n >= 60) return { huruf: "D", label: "Perlu perbaikan", warna: "orange" };
  return { huruf: "E", label: "Tidak memenuhi", warna: "red" };
}

/* =========================================================
 * AUTO-NORMALISASI BOBOT
 * ========================================================= */
export function normalisasiBobot(bobotObj) {
  const total = Object.values(bobotObj).reduce((s, v) => s + (Number(v) || 0), 0);
  if (total === 0 || total === 100) return { ...bobotObj, _normalized: false, _total: total };
  const hasil = {};
  Object.keys(bobotObj).forEach((k) => {
    hasil[k] = (Number(bobotObj[k]) / total) * 100;
  });
  return { ...hasil, _normalized: true, _total: total };
}

export function normalisasiBobotKriteria(kriteria) {
  const total = kriteria.reduce((s, k) => s + (Number(k.bobot) || 0), 0);
  if (total === 0 || total === 100) return { list: kriteria, normalized: false, total };
  const list = kriteria.map((k) => ({ ...k, bobot: (Number(k.bobot) / total) * 100 }));
  return { list, normalized: true, total };
}

/* =========================================================
 * HITUNG NILAI SATU PENILAIAN (dari 1 penilai, 1 tahapan)
 * ========================================================= */
export function hitungNilaiPenilaian(penilaian, kriteriaList) {
  if (!penilaian?.nilai?.length) return 0;
  const { list: kriteriaNorm } = normalisasiBobotKriteria(kriteriaList);

  let total = 0;
  let totalBobot = 0;
  penilaian.nilai.forEach((item) => {
    const k = kriteriaNorm.find((x) => x.nama === item.kriteria);
    const bobot = k ? k.bobot : 0;
    total += skorKeNilai(item.skor) * bobot;
    totalBobot += bobot;
  });

  if (totalBobot === 0) return 0;
  return total / totalBobot;
}

/* =========================================================
 * HITUNG NILAI PER TAHAPAN (dengan normalisasi penilai)
 * ========================================================= */
export function hitungNilaiPerTahapan(daftarPenilaian, kriteriaList, bobotPenilai = BOBOT_PENILAI_DEFAULT) {
  // Kelompokkan berdasarkan jenisPenilai
  const grup = { guru: [], ketua: [], rekan: [] };
  daftarPenilaian.forEach((p) => {
    const j = p.jenisPenilai || "rekan";
    if (grup[j]) grup[j].push(p);
  });

  // Hitung rata-rata per jenis penilai
  const nilaiJenis = {};
  let bobotAktif = {};

  Object.keys(grup).forEach((jenis) => {
    const arr = grup[jenis];
    if (!arr.length) {
      nilaiJenis[jenis] = null;
      bobotAktif[jenis] = 0;
      return;
    }
    const sum = arr.reduce((s, p) => s + hitungNilaiPenilaian(p, kriteriaList), 0);
    nilaiJenis[jenis] = sum / arr.length;
    bobotAktif[jenis] = bobotPenilai[jenis] || 0;
  });

  // Auto-normalisasi bobot (jika ada penilai kosong)
  const totalBobotAktif = Object.values(bobotAktif).reduce((s, v) => s + v, 0);
  if (totalBobotAktif === 0) {
    return { nilai: 0, nilaiJenis, bobotAktif, dinormalisasi: false };
  }

  const bobotFinal = {};
  Object.keys(bobotAktif).forEach((k) => {
    bobotFinal[k] = bobotAktif[k] / totalBobotAktif;
  });

  const nilaiAkhir = Object.keys(nilaiJenis).reduce((s, j) => {
    if (nilaiJenis[j] === null) return s;
    return s + nilaiJenis[j] * bobotFinal[j];
  }, 0);

  return {
    nilai: nilaiAkhir,
    nilaiJenis,
    bobotAktif: bobotFinal,
    dinormalisasi: totalBobotAktif !== 100,
    jenisKosong: Object.keys(nilaiJenis).filter((k) => nilaiJenis[k] === null),
  };
}

/* =========================================================
 * HITUNG NILAI AKHIR KOMPOSIT (semua tahapan)
 * ========================================================= */
export function hitungNilaiAkhir(daftarPenilaian, kriteriaList, bobotPenilai = BOBOT_PENILAI_DEFAULT, bobotTahapan = BOBOT_TAHAPAN_DEFAULT) {
  const tahapan = ["persiapan", "pelaksanaan", "pertunjukan", "pasca"];
  const hasilPerTahap = {};

  tahapan.forEach((t) => {
    const arr = daftarPenilaian.filter((p) => p.tahapan === t);
    hasilPerTahap[t] = hitungNilaiPerTahapan(arr, kriteriaList, bobotPenilai);
  });

  // Bobot tahapan — auto-normalisasi
  const { list: bobotTahapNorm } = (() => {
    const total = Object.values(bobotTahapan).reduce((s, v) => s + v, 0);
    if (total === 100 || total === 0) return { list: bobotTahapan };
    const n = {};
    Object.keys(bobotTahapan).forEach((k) => (n[k] = (bobotTahapan[k] / total) * 100));
    return { list: n };
  })();

  let nilaiAkhir = 0;
  tahapan.forEach((t) => {
    const bobot = bobotTahapNorm[t] || 0;
    nilaiAkhir += hasilPerTahap[t].nilai * (bobot / 100);
  });

  return {
    nilaiAkhir,
    predikat: nilaiKePredikat(nilaiAkhir),
    perTahapan: hasilPerTahap,
    bobotTahapanDipakai: bobotTahapNorm,
  };
}

/* =========================================================
 * REKOMENDASI PERBAIKAN OTOMATIS
 * ========================================================= */
export function generateRekomendasi(nilaiAkhirObj, kriteriaList) {
  const rekomendasi = [];
  const perTahap = nilaiAkhirObj.perTahapan;

  // Cari tahapan terendah
  const tahapArr = Object.entries(perTahap).map(([k, v]) => ({ tahap: k, nilai: v.nilai }));
  tahapArr.sort((a, b) => a.nilai - b.nilai);
  const tahapTerendah = tahapArr[0];

  if (tahapTerendah.nilai > 0 && tahapTerendah.nilai < 75) {
    rekomendasi.push({
      ikon: "warning",
      warna: "orange",
      judul: `Fokus pada tahap ${labelTahap(tahapTerendah.tahap)}`,
      pesan: `Nilai Anda di tahap ${labelTahap(tahapTerendah.tahap)} masih ${tahapTerendah.nilai.toFixed(1)}. Tingkatkan konsistensi dan kualitas di tahap ini.`,
    });
  }

  // Cari kriteria dengan skor rata-rata terendah (dari semua tahapan)
  const totalPerKriteria = {};
  Object.values(perTahap).forEach((t) => {
    if (!t.nilaiJenis) return;
    // Ambil dari agregat per kriteria (bisa tidak lengkap, kita ambil rata-rata per jenis)
  });

  // Untuk tiap tahapan dengan nilai < 70, sarankan kriteria terlemah
  Object.entries(perTahap).forEach(([tahap, h]) => {
    if (h.nilai >= 70 || h.nilai === 0) return;
    rekomendasi.push({
      ikon: "priority_high",
      warna: "red",
      judul: `Tingkatkan performa ${labelTahap(tahap)}`,
      pesan: `Nilai tahap ${labelTahap(tahap)} sebesar ${h.nilai.toFixed(1)} berada di bawah standar (70). Konsultasikan dengan ${kriteriaList === KRITERIA_PER_PERAN.Pemain ? "Sutradara" : "Koordinator Divisi"}.`,
    });
  });

  // Jika nilai sudah bagus
  if (nilaiAkhirObj.nilaiAkhir >= 85) {
    rekomendasi.push({
      ikon: "emoji_events",
      warna: "green",
      judul: "Pertahankan performa!",
      pesan: `Nilai Anda ${nilaiAkhirObj.nilaiAkhir.toFixed(1)} (${nilaiAkhirObj.predikat.huruf}). Terus jaga konsistensi dan bantu rekan yang masih perlu bimbingan.`,
    });
  }

  // Jika nilai cukup
  if (nilaiAkhirObj.nilaiAkhir >= 70 && nilaiAkhirObj.nilaiAkhir < 85) {
    rekomendasi.push({
      ikon: "trending_up",
      warna: "blue",
      judul: "Tingkatkan ke level mahir",
      pesan: `Anda sudah di jalur baik. Untuk mencapai predikat A (≥90), fokus pada konsistensi di semua tahapan dan aktif berkontribusi di divisi.`,
    });
  }

  if (!rekomendasi.length) {
    rekomendasi.push({
      ikon: "info",
      warna: "blue",
      judul: "Belum ada data cukup",
      pesan: "Nilai Anda akan muncul setelah penilai mengisi rubrik di setiap tahapan.",
    });
  }

  return rekomendasi;
}

function labelTahap(t) {
  return { persiapan: "Persiapan", pelaksanaan: "Pelaksanaan", pertunjukan: "Pertunjukan", pasca: "Pasca" }[t] || t;
}

/* =========================================================
 * PERBANDINGAN DENGAN RATA-RATA KELAS
 * ========================================================= */
export async function perbandinganKelas(kelas, nilaiSaya) {
  try {
    const usersSnap = await getDocs(
      query(collection(db, "users"), where("role", "==", "siswa"), where("kelas", "==", kelas))
    );

    let totalKelas = 0;
    let jumlahSiswa = 0;

    for (const u of usersSnap.docs) {
      const pSnap = await getDocs(query(collection(db, "penilaian"), where("targetUid", "==", u.id)));
      const arr = pSnap.docs.map((d) => d.data());
      if (!arr.length) continue;

      let sum = 0;
      arr.forEach((p) => {
        const skor = (p.nilai || []).map((n) => skorKeNilai(n.skor));
        sum += skor.length ? skor.reduce((a, b) => a + b, 0) / skor.length : 0;
      });
      totalKelas += sum / arr.length;
      jumlahSiswa++;
    }

    const rataKelas = jumlahSiswa ? totalKelas / jumlahSiswa : 0;
    const selisih = nilaiSaya - rataKelas;

    return {
      rataKelas,
      selisih,
      jumlahSiswa,
      posisi: selisih > 5 ? "di atas rata-rata" : selisih < -5 ? "di bawah rata-rata" : "setara rata-rata",
    };
  } catch (e) {
    console.warn("[Perbandingan] gagal:", e);
    return null;
  }
}

/* =========================================================
 * RIWAYAT TREN NILAI (per update)
 * ========================================================= */
export function hitungTrenNilai(daftarPenilaian) {
  // Urutkan berdasarkan updatedAt
  const sorted = [...daftarPenilaian]
    .filter((p) => p.updatedAt?.toDate)
    .sort((a, b) => a.updatedAt.toDate() - b.updatedAt.toDate());

  return sorted.map((p, i) => {
    const skor = (p.nilai || []).map((n) => skorKeNilai(n.skor));
    const avg = skor.length ? skor.reduce((a, b) => a + b, 0) / skor.length : 0;
    return {
      urutan: i + 1,
      tanggal: p.updatedAt,
      nilai: avg,
      tahapan: p.tahapan,
      jenis: p.jenisPenilai,
    };
  });
}

/* =========================================================
 * DETEKSI ANOMALI (untuk moderasi)
 * ========================================================= */
async function renderModerasi() {
  const c = document.getElementById("tab-content");
  if (!["guru", "admin"].includes(ME.profile.role)) {
    c.innerHTML = `<div class="glass rounded-2xl p-10 text-center"><span class="material-symbols-outlined text-5xl text-on-surface-variant mb-3">lock</span><p class="text-sm">Hanya guru/admin.</p></div>`;
    return;
  }
  c.innerHTML = `
  <div class="glass rounded-2xl p-5">
    <h3 class="font-headline font-semibold mb-3 flex items-center gap-2">
      <span class="material-symbols-outlined text-error">shield</span> Moderasi Penilaian
    </h3>
    <p class="text-xs text-on-surface-variant mb-4">
      Deteksi otomatis: nilai ekstrem, pola seragam, submit terlalu cepat, variansi ekstrem.
    </p>
    <div class="flex gap-2 mb-4">
      <button data-filter="all" class="mod-filter px-3 py-1.5 rounded-lg text-xs bg-primary-container text-primary font-medium">Semua</button>
      <button data-filter="extreme" class="mod-filter px-3 py-1.5 rounded-lg text-xs bg-surface-container">Ekstrem</button>
      <button data-filter="fast" class="mod-filter px-3 py-1.5 rounded-lg text-xs bg-surface-container">Submit Cepat</button>
      <button data-filter="variance" class="mod-filter px-3 py-1.5 rounded-lg text-xs bg-surface-container">Variansi Tinggi</button>
    </div>
    <div id="anomali-list" class="space-y-2">${skeleton(4)}</div>
  </div>`;

  try {
    const snap = await getDocs(query(collection(db, "penilaian"), orderBy("updatedAt", "desc"), limit(50)));
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const anomali = [];
    list.forEach((p) => {
      const det = deteksiAnomali(p);
      if (det.length) {
        anomali.push({ id: p.id, det, data: p });
      }
    });

    const renderAnomali = (filter = "all") => {
      let filtered = anomali;
      if (filter === "extreme") filtered = anomali.filter((a) => a.det.some((d) => d.jenis.includes("extreme") || d.jenis === "uniform"));
      if (filter === "fast") filtered = anomali.filter((a) => a.det.some((d) => d.jenis === "fast_submit"));
      if (filter === "variance") filtered = anomali.filter((a) => a.det.some((d) => d.jenis === "high_variance"));

      const el = document.getElementById("anomali-list");
      if (!filtered.length) {
        el.innerHTML = `<p class="text-sm text-on-surface-variant text-center py-8">Tidak ada anomali ✓</p>`;
        return;
      }
      el.innerHTML = filtered.map((a) => `
        <div class="p-3 rounded-xl bg-error/10 border border-error/30">
          <p class="text-sm font-medium text-error flex items-center gap-1">
            <span class="material-symbols-outlined text-sm">warning</span> ${a.det.map((d) => esc(d.pesan)).join(" · ")}
          </p>
          <p class="text-xs text-on-surface-variant mt-1">
            Penilai: <b>${esc(a.data.jenisPenilai)}</b> · Target: ${esc((a.data.targetUid || "").slice(0, 8))}... · Tahap: ${esc(a.data.tahapan)}
          </p>
          <p class="text-[10px] text-on-surface-variant mt-1">${a.data.updatedAt ? waktuRelatif(a.data.updatedAt) : "-"}</p>
          <div class="flex gap-2 mt-2">
            <button data-id="${a.id}" class="btn-valid px-3 py-1 rounded-lg bg-green-600 text-white text-xs">Valid</button>
            <button data-id="${a.id}" class="btn-tolak px-3 py-1 rounded-lg bg-error text-white text-xs">Tolak</button>
            <button data-id="${a.id}" class="btn-detail px-3 py-1 rounded-lg bg-surface-container-high text-xs">Detail</button>
          </div>
        </div>
      `).join("");

      el.querySelectorAll(".btn-valid, .btn-tolak").forEach((b) =>
        b.addEventListener("click", async () => {
          const id = b.dataset.id;
          const aksi = b.classList.contains("btn-valid") ? "validasi" : "tolak";
          try {
            await updateDoc(doc(db, "penilaian", id), {
              status: aksi === "validasi" ? "final" : "rejected",
              moderatedAt: serverTimestamp(),
              moderatedBy: ME.uid,
            });
            await logActivity(ME.uid, `moderasi_${aksi}`, `penilaian=${id}`);
            showToast(`Penilaian di-${aksi}.`, "success");
            b.closest("div").remove();
          } catch (e) { showToast("Gagal.", "error"); }
        })
      );

      el.querySelectorAll(".btn-detail").forEach((b) =>
        b.addEventListener("click", () => {
          const item = anomali.find((x) => x.id === b.dataset.id);
          if (!item) return;
          alert(`Detail Penilaian:\n\nTarget: ${item.data.targetUid}\nTahap: ${item.data.tahapan}\nJenis: ${item.data.jenisPenilai}\nStatus: ${item.data.status}\nVersi: ${item.data.versi || 1}\n\nNilai:\n${(item.data.nilai || []).map((n) => `• ${n.kriteria}: ${n.skor}${n.komentar ? ' — "' + n.komentar + '"' : ""}`).join("\n")}\n\nAnomali:\n${item.det.map((d) => "• " + d.pesan).join("\n")}`);
        })
      );
    };

    renderAnomali();

    document.querySelectorAll(".mod-filter").forEach((b) =>
      b.addEventListener("click", () => {
        document.querySelectorAll(".mod-filter").forEach((x) => {
          x.className = "mod-filter px-3 py-1.5 rounded-lg text-xs bg-surface-container";
        });
        b.className = "mod-filter px-3 py-1.5 rounded-lg text-xs bg-primary-container text-primary font-medium";
        renderAnomali(b.dataset.filter);
      })
    );
  } catch (e) {
    console.error(e);
    document.getElementById("anomali-list").innerHTML = `<p class="text-sm text-on-surface-variant text-center py-6">Gagal memuat data.</p>`;
  }
}

/* =========================================================
 * SIMPAN REVISI NILAI
 * ========================================================= */
export async function simpanRevisiNilai(penilaianId, versiLama, versiBaru, alasan, pelakuUid) {
  try {
    await addDoc(collection(db, "revisiNilai"), {
      penilaianId,
      versiLama,
      versiBaru,
      alasan,
      pelakuUid,
      waktu: serverTimestamp(),
    });
    return true;
  } catch (e) {
    console.error("[Revisi] gagal:", e);
    return false;
  }
}
