/**
 * SP-PPT — Modul Booking Alat
 * Fitur:
 * - CRUD booking dengan approval (Pending/Approved/Rejected)
 * - Deteksi bentrok otomatis
 * - Kategori alat
 * - Notifikasi ke approver & pemohon
 */

import { db } from "./firebase-init.js";
import {
  collection, addDoc, getDocs, query, where, orderBy, serverTimestamp,
  doc, updateDoc, deleteDoc, onSnapshot, limit, getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast, esc, formatTanggal, formatWaktu, waktuRelatif, logActivity, inisial, warnaPeran } from "./utils.js";
import { kirimNotifikasi, kirimNotifikasiBanyak } from "./notifikasi.js";

/* =========================================================
 * KATEGORI ALAT
 * ========================================================= */
export const KATEGORI_ALAT = {
  "Sound System": { icon: "speaker", warna: "text-blue-400", bg: "bg-blue-500/15" },
  Properti: { icon: "chair", warna: "text-orange-400", bg: "bg-orange-500/15" },
  Kostum: { icon: "checkroom", warna: "text-pink-400", bg: "bg-pink-500/15" },
  "Alat Rias": { icon: "brush", warna: "text-purple-400", bg: "bg-purple-500/15" },
  "Alat Panggung": { icon: "construction", warna: "text-yellow-400", bg: "bg-yellow-500/15" },
  Lainnya: { icon: "category", warna: "text-gray-400", bg: "bg-gray-500/15" },
};

/* =========================================================
 * DAFTAR ALAT DEFAULT (guru dapat menambah via UI)
 * ========================================================= */
export const DAFTAR_ALAT = [
  { nama: "Speaker Utama", kategori: "Sound System" },
  { nama: "Speaker Monitor", kategori: "Sound System" },
  { nama: "Mixer Audio", kategori: "Sound System" },
  { nama: "Mic Wireless 1", kategori: "Sound System" },
  { nama: "Mic Wireless 2", kategori: "Sound System" },
  { nama: "Mic Wireless 3", kategori: "Sound System" },
  { nama: "Mic Wireless 4", kategori: "Sound System" },
  { nama: "Kabel XLR 5m", kategori: "Sound System" },
  { nama: "Laptop Multimedia", kategori: "Sound System" },
  { nama: "Proyektor", kategori: "Sound System" },
  { nama: "Backdrop Panggung", kategori: "Alat Panggung" },
  { nama: "Tangga Panggung", kategori: "Alat Panggung" },
  { nama: "Meja Properti", kategori: "Properti" },
  { nama: "Kursi Properti", kategori: "Properti" },
  { nama: "Kostum Pemeran Utama", kategori: "Kostum" },
  { nama: "Kostum Pemeran Pendukung", kategori: "Kostum" },
  { nama: "Kotak Rias", kategori: "Alat Rias" },
  { nama: "Set Kuas Rias", kategori: "Alat Rias" },
];

/* =========================================================
 * HELPER: cek bentrok jadwal
 * ========================================================= */
export function cekBentrok(waktuMulaiBaru, waktuSelesaiBaru, daftarExisting, excludeId = null) {
  const startBaru = new Date(waktuMulaiBaru).getTime();
  const endBaru = new Date(waktuSelesaiBaru).getTime();

  if (isNaN(startBaru) || isNaN(endBaru)) return null;
  if (endBaru <= startBaru) return { error: "Jam selesai harus setelah jam mulai." };

  const bentrok = daftarExisting.filter((b) => {
    if (b.id === excludeId) return false;
    if (b.status === "Rejected") return false;
    const s = new Date(b.waktuMulai).getTime();
    const e = new Date(b.waktuSelesai).getTime();
    // Overlap jika: start < endOther && end > startOther
    return startBaru < e && endBaru > s;
  });

  return bentrok.length ? { bentrok } : null;
}

/* =========================================================
 * HELPER: format range waktu
 * ========================================================= */
export function formatRangeWaktu(mulai, selesai) {
  const d1 = new Date(mulai);
  const d2 = new Date(selesai);
  const sameDay = d1.toDateString() === d2.toDateString();
  if (sameDay) {
    return `${formatTanggal(d1)} · ${formatWaktu(d1)}–${formatWaktu(d2)}`;
  }
  return `${formatTanggal(d1)} ${formatWaktu(d1)} → ${formatTanggal(d2)} ${formatWaktu(d2)}`;
}

/* =========================================================
 * HELPER: status badge
 * ========================================================= */
export function badgeStatusBooking(status) {
  const map = {
    Pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
    Approved: "bg-green-500/20 text-green-400 border-green-500/40",
    Rejected: "bg-red-500/20 text-red-400 border-red-500/40",
    Selesai: "bg-blue-500/20 text-blue-400 border-blue-500/40",
  };
  const icons = { Pending: "pending", Approved: "check_circle", Rejected: "cancel", Selesai: "done_all" };
  const cls = map[status] || "bg-surface-container-high text-on-surface-variant border-outline-variant";
  return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${cls}">
    <span class="material-symbols-outlined text-[10px]">${icons[status] || "info"}</span>${status}
  </span>`;
}

/* =========================================================
 * AMBIL BOOKING (realtime)
 * ========================================================= */
export function subscribeBooking(callback) {
  const q = query(collection(db, "bookingAlat"), orderBy("waktuMulai", "desc"), limit(200));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, (err) => {
    console.warn("[Booking] snapshot error:", err);
    // Fallback
    getDocs(q).then((snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  });
}

/* =========================================================
 * APPROVAL: Siapa yang boleh approve?
 * ========================================================= */
export function bolehApprove(profile) {
  if (!profile) return false;
  const r = profile.role, p = profile.peran;
  return r === "guru" || r === "admin" ||
    ["Pimpinan Produksi", "Sekretaris"].includes(p);
}

/* =========================================================
 * APPROVE / REJECT BOOKING
 * ========================================================= */
export async function approveBooking(id, catatan = "", approverUid, approverNama) {
  try {
    const ref = doc(db, "bookingAlat", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return false;
    const b = snap.data();

    await updateDoc(ref, {
      status: "Approved",
      approvedBy: approverUid,
      approvedByName: approverNama,
      approvedAt: serverTimestamp(),
      catatanApproval: catatan,
    });

    // Notifikasi ke pemohon
    await kirimNotifikasi({
      penerimaUid: b.pemohonUid,
      jenis: "Info",
      judul: "✅ Booking Disetujui",
      pesan: `Booking "${b.alat}" Anda telah disetujui oleh ${approverNama}.${catatan ? ` Catatan: ${catatan}` : ""}`,
      dari: approverNama,
      link: "jadwal.html",
    });

    return true;
  } catch (e) {
    console.error("[Approve] gagal:", e);
    return false;
  }
}

export async function rejectBooking(id, alasan = "", approverUid, approverNama) {
  try {
    const ref = doc(db, "bookingAlat", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return false;
    const b = snap.data();

    await updateDoc(ref, {
      status: "Rejected",
      rejectedBy: approverUid,
      rejectedByName: approverNama,
      rejectedAt: serverTimestamp(),
      alasanReject: alasan,
    });

    await kirimNotifikasi({
      penerimaUid: b.pemohonUid,
      jenis: "Reminder",
      judul: "❌ Booking Ditolak",
      pesan: `Booking "${b.alat}" Anda ditolak oleh ${approverNama}.${alasan ? ` Alasan: ${alasan}` : ""}`,
      dari: approverNama,
      link: "jadwal.html",
    });

    return true;
  } catch (e) {
    console.error("[Reject] gagal:", e);
    return false;
  }
}

export async function batalkanBooking(id, uid, nama) {
  try {
    const ref = doc(db, "bookingAlat", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return false;
    const b = snap.data();
    if (b.pemohonUid !== uid) return false;

    await updateDoc(ref, {
      status: "Rejected",
      rejectedBy: uid,
      rejectedByName: nama,
      rejectedAt: serverTimestamp(),
      alasanReject: "Dibatalkan oleh pemohon",
    });
    return true;
  } catch (e) {
    console.error("[Cancel] gagal:", e);
    return false;
  }
}

/* =========================================================
 * SIMPAN BOOKING BARU (dengan validasi bentrok)
 * ========================================================= */
export async function buatBooking({ alat, kategori, waktuMulai, waktuSelesai, keperluan, pemohonUid, pemohonNama, pemohonPeran }) {
  // Validasi
  if (!alat || !waktuMulai || !waktuSelesai) {
    throw new Error("Data booking tidak lengkap.");
  }
  const start = new Date(waktuMulai).getTime();
  const end = new Date(waktuSelesai).getTime();
  if (isNaN(start) || isNaN(end)) throw new Error("Format waktu tidak valid.");
  if (end <= start) throw new Error("Jam selesai harus setelah jam mulai.");
  if (end - start > 7 * 24 * 60 * 60 * 1000) throw new Error("Durasi maksimal 7 hari.");

  // Cek bentrok untuk alat yang sama
  const existingSnap = await getDocs(query(
    collection(db, "bookingAlat"),
    where("alat", "==", alat)
  ));
  const existing = existingSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const bentrok = cekBentrok(waktuMulai, waktuSelesai, existing);

  if (bentrok?.error) throw new Error(bentrok.error);
  if (bentrok?.bentrok?.length) {
    const b = bentrok.bentrok[0];
    throw new Error(`⚠️ BENTROK dengan booking ${b.pemohonNama || "lain"} (${formatRangeWaktu(b.waktuMulai, b.waktuSelesai)}). Pilih waktu lain.`);
  }

  // Simpan
  const ref = await addDoc(collection(db, "bookingAlat"), {
    alat,
    kategori: kategori || "Lainnya",
    waktuMulai,
    waktuSelesai,
    keperluan: keperluan || "",
    pemohonUid,
    pemohonNama,
    pemohonPeran,
    status: "Pending",
    createdAt: serverTimestamp(),
  });

  // Notifikasi ke approver (guru, pimpinan, sekretaris)
  const approverSnap = await getDocs(query(
    collection(db, "users"),
    where("peran", "in", ["Guru Pembina", "Pimpinan Produksi", "Sekretaris"])
  ));
  const approverUids = approverSnap.docs.map((d) => d.id);

  if (approverUids.length) {
    await kirimNotifikasiBanyak({
      penerimaUids: approverUids,
      jenis: "Instruksi",
      judul: `📋 Booking Baru: ${alat}`,
      pesan: `${pemohonNama} (${pemohonPeran}) mengajukan booking ${alat} untuk ${formatRangeWaktu(waktuMulai, waktuSelesai)}. Menunggu persetujuan.`,
      dari: pemohonNama,
      link: "jadwal.html",
      extra: { bookingId: ref.id },
    });
  }

  return ref.id;
}
