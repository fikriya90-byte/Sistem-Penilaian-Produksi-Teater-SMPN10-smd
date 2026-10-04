/**
 * SP-PPT — Modul Agregasi Nilai
 * Semua rumus perhitungan nilai terpusat di sini.
 */

import {
  doc, getDoc, collection, query, where, getDocs, serverTimestamp, addDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-init.js";

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

export function hitungNilaiPerTahapan(daftarPenilaian, kriteriaList, bobotPenilai = BOBOT_PENILAI_DEFAULT) {
  const grup = { guru: [], ketua: [], rekan: [] };
  daftarPenilaian.forEach((p) => {
    const j = p.jenisPenilai || "rekan";
    if (grup[j]) grup[j].push(p);
  });

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

export function hitungNilaiAkhir(daftarPenilaian, kriteriaList, bobotPenilai = BOBOT_PENILAI_DEFAULT, bobotTahapan = BOBOT_TAHAPAN_DEFAULT) {
  const tahapan = ["persiapan", "pelaksanaan", "pertunjukan", "pasca"];
  const hasilPerTahap = {};

  tahapan.forEach((t) => {
    const arr = daftarPenilaian.filter((p) => p.tahapan === t);
    hasilPerTahap[t] = hitungNilaiPerTahapan(arr, kriteriaList, bobotPenilai);
  });

  const totalBobotTahapan = Object.values(bobotTahapan).reduce((s, v) => s + v, 0);
  const bobotTahapNorm = {};
  Object.keys(bobotTahapan).forEach((k) => {
    bobotTahapNorm[k] = totalBobotTahapan ? (bobotTahapan[k] / totalBobotTahapan) * 100 : 0;
  });

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

export function generateRekomendasi(nilaiAkhirObj, kriteriaList) {
  const rekomendasi = [];
  const perTahap = nilaiAkhirObj.perTahapan;

  const tahapArr = Object.entries(perTahap).map(([k, v]) => ({ tahap: k, nilai: v.nilai }));
  tahapArr.sort((a, b) => a.nilai - b.nilai);
  const tahapTerendah = tahapArr[0];

  if (tahapTerendah && tahapTerendah.nilai > 0 && tahapTerendah.nilai < 75) {
    rekomendasi.push({
      ikon: "warning",
      warna: "orange",
      judul: `Fokus pada tahap ${labelTahap(tahapTerendah.tahap)}`,
      pesan: `Nilai Anda pada tahap ${labelTahap(tahapTerendah.tahap)} masih ${tahapTerendah.nilai.toFixed(1)}. Tingkatkan konsistensi di tahap ini.`,
    });
  }

  Object.entries(perTahap).forEach(([tahap, h]) => {
    if (h.nilai >= 70 || h.nilai === 0) return;
    rekomendasi.push({
      ikon: "priority_high",
      warna: "red",
      judul: `Tingkatkan performa ${labelTahap(tahap)}`,
      pesan: `Nilai tahap ${labelTahap(tahap)} sebesar ${h.nilai.toFixed(1)} berada di bawah standar (70).`,
    });
  });

  if (nilaiAkhirObj.nilaiAkhir >= 85) {
    rekomendasi.push({
      ikon: "emoji_events",
      warna: "green",
      judul: "Pertahankan performa!",
      pesan: `Nilai Anda ${nilaiAkhirObj.nilaiAkhir.toFixed(1)} (${nilaiAkhirObj.predikat.huruf}). Terus jaga konsistensi.`,
    });
  }

  if (!rekomendasi.length) {
    rekomendasi.push({
      ikon: "info",
      warna: "blue",
      judul: "Belum ada data cukup",
      pesan: "Nilai Anda akan muncul setelah penilai mengisi rubrik.",
    });
  }

  return rekomendasi;
}

function labelTahap(t) {
  return { persiapan: "Persiapan", pelaksanaan: "Pelaksanaan", pertunjukan: "Pertunjukan", pasca: "Pasca" }[t] || t;
}

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

export function hitungTrenNilai(daftarPenilaian) {
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
 * DETEKSI ANOMALI
 * ========================================================= */
export function deteksiAnomali(penilaian) {
  const hasil = [];

  if (!penilaian || !Array.isArray(penilaian.nilai)) return hasil;

  const skorList = penilaian.nilai.map((n) => Number(n.skor) || 0);
  if (!skorList.length) return hasil;

  const semua4 = skorList.every((s) => s === 4);
  const semua1 = skorList.every((s) => s === 1);
  const semuaSama = skorList.every((s) => s === skorList[0]);

  if (semua4) {
    hasil.push({ jenis: "extreme_high", pesan: "Semua skor bernilai 4 (nilai ekstrem tinggi).", severity: "high" });
  }
  if (semua1) {
    hasil.push({ jenis: "extreme_low", pesan: "Semua skor bernilai 1 (nilai ekstrem rendah).", severity: "high" });
  }
  if (semuaSama) {
    hasil.push({ jenis: "uniform", pesan: "Semua skor identik (pola seragam).", severity: "medium" });
  }

  const rata = skorList.reduce((a, b) => a + b, 0) / skorList.length;
  const varian = skorList.reduce((a, b) => a + (b - rata) ** 2, 0) / skorList.length;
  const stdDev = Math.sqrt(varian);

  if (stdDev > 1.5) {
    hasil.push({ jenis: "high_variance", pesan: `Variansi skor terlalu tinggi (${stdDev.toFixed(2)}).`, severity: "medium" });
  }

  const createdAt = penilaian.createdAt?.toDate ? penilaian.createdAt.toDate() : new Date(penilaian.createdAt || Date.now());
  const updatedAt = penilaian.updatedAt?.toDate ? penilaian.updatedAt.toDate() : new Date(penilaian.updatedAt || Date.now());
  const elapsed = (updatedAt.getTime() - createdAt.getTime()) / 1000;

  if (elapsed < 10) {
    hasil.push({ jenis: "fast_submit", pesan: `Submit terlalu cepat (${elapsed.toFixed(1)} detik dari created).`, severity: "high" });
  }

  return hasil;
}

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
