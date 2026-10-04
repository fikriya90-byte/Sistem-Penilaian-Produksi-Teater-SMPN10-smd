import {
  KRITERIA_PER_PERAN,
  KRITERIA_REKAN,
  BOBOT_PENILAI_DEFAULT,
  BOBOT_TAHAPAN_DEFAULT,
  skorKeNilai,
  nilaiKePredikat,
  normalisasiBobot,
  normalisasiBobotKriteria,
  hitungNilaiPenilaian,
  hitungNilaiPerTahapan,
  hitungNilaiAkhir,
  generateRekomendasi,
  perbandinganKelas,
  hitungTrenNilai,
  deteksiAnomali,
  simpanRevisiNilai,
} from "./agregasi.js";

// HAPUS DEFINISI LOKAL INI
// function skorKeNilai(s) {
//   return { 4: 100, 3: 80, 2: 60, 1: 40 }[s] || 0;
// }
