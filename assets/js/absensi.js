/**
 * SP-PPT — Modul Absensi
 * ATURAN KETAT: Hanya pembuat berhak sesuai tabel Bagian 9.
 */

import { auth, db, PERAN_DIVISI } from "./firebase-init.js";
import {
  addDoc, collection, query, where, getDocs, orderBy, serverTimestamp, doc, updateDoc, getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { protectPage } from "./router.js";
import { showToast, openModal, closeModal, skeleton, formatTanggal, esc, warnaPeran, inisial, logActivity } from "./utils.js";

let ME = null;
let SESI_AKTIF = null;

/* =========================================================
 * ATURAN PEMBUAT ABSENSI
 * ========================================================= */
function cekHakBuat() {
  const p = ME.profile.peran, r = ME.profile.role;
  if (r === "guru" || r === "admin") return { boleh: true, tipe: "bebas", label: "Guru/Admin — peserta bebas" };
  if (["Pimpinan Produksi", "Sekretaris"].includes(p)) return { boleh: true, tipe: "bebas", label: `${p} — peserta bebas (semua/divisi/peran)` };
  if (["Sutradara", "Asisten Sutradara"].includes(p)) return { boleh: true, tipe: "terkunci-pemain-musik", label: `${p} — peserta TERKUNCI: Pemain + Tata Musik & Suara` };
  if (p.startsWith("Koordinator")) return { boleh: true, tipe: "terkunci-divisi", label: `Koordinator — peserta TERKUNCI: anggota divisi ${ME.profile.divisi}` };
  return { boleh: false };
}

/* =========================================================
 * AMBIL SISWA SESUAI CAKUPAN
 * ========================================================= */
async function ambilPeserta(tipe, cakupan, target) {
  let q;
  if (tipe === "terkunci-pemain-musik") {
    q = query(collection(db, "users"), where("role", "==", "siswa"),
      where("peran", "in", ["Pemain", "Koordinator Tata Musik & Suara", "Anggota Tata Musik & Suara"]));
  } else if (tipe === "terkunci-divisi") {
    q = query(collection(db, "users"), where("role", "==", "siswa"), where("divisi", "==", ME.profile.divisi));
  } else {
    // bebas
    if (cakupan === "divisi" && target) {
      q = query(collection(db, "users"), where("role", "==", "siswa"), where("divisi", "==", target));
    } else if (cakupan === "peran" && target) {
      q = query(collection(db, "users"), where("role", "==", "siswa"), where("peran", "==", target));
    } else {
      q = query(collection(db, "users"), where("role", "==", "siswa"));
    }
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

/* =========================================================
 * RENDER DAFTAR SESI
 * ========================================================= */
async function renderSesiList() {
  const el = document.getElementById("sesi-list");
  el.innerHTML = `<p class="text-sm text-center py-4">${skeleton(3)}</p>`;
  try {
    const snap = await getDocs(query(collection(db, "sesiAbsensi"), orderBy("tanggal", "desc")));
    if (snap.empty) {
      el.innerHTML = `<div class="text-center py-10 text-on-surface-variant">
        <span class="material-symbols-outlined text-5xl block mb-2">event_busy</span>
        <p class="text-sm">Belum ada sesi absensi</p>
      </div>`;
      return;
    }
    el.innerHTML = snap.docs.map((d) => {
      const s = d.data();
      return `
      <div class="p-4 rounded-xl bg-surface-container">
        <div class="flex items-start justify-between gap-3 mb-2">
          <div class="flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <h4 class="font-medium text-sm">${esc(s.judul)}</h4>
              <span class="text-[10px] px-2 py-0.5 rounded-full bg-primary-container text-primary">${esc(s.jenis)}</span>
            </div>
            <p class="text-xs text-on-surface-variant mt-1">📅 ${formatTanggal(s.tanggal)} · ${esc(s.jam)} · 📍 ${esc(s.lokasi)}</p>
            <p class="text-xs text-on-surface-variant">Dibuat oleh: ${esc(s.pembuatNama || s.pembuatUid?.slice(0,8))}</p>
          </div>
          <div class="flex flex-col gap-1">
            <button class="btn-isi px-3 py-1.5 rounded-lg bg-primary text-on-primary text-[11px] font-medium" data-id="${d.id}">Isi Absensi</button>
            <button class="btn-qr px-3 py-1.5 rounded-lg bg-surface-container-high text-[11px]" data-id="${d.id}">QR Code</button>
          </div>
        </div>
      </div>`;
    }).join("");

    el.querySelectorAll(".btn-isi").forEach((b) =>
      b.addEventListener("click", () => bukaIsiAbsensi(b.dataset.id))
    );
    el.querySelectorAll(".btn-qr").forEach((b) =>
      b.addEventListener("click", () => {
        const url = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(location.origin + "?sesi=" + b.dataset.id)}`;
        window.open(url, "_blank");
      })
    );
  } catch (e) {
    el.innerHTML = `<p class="text-sm text-center py-6 text-on-surface-variant">Gagal memuat.</p>`;
  }
}

/* =========================================================
 * BUKA ISI ABSENSI
 * ========================================================= */
async function bukaIsiAbsensi(sesiId) {
  SESI_AKTIF = sesiId;
  const sesiSnap = await getDoc(doc(db, "sesiAbsensi", sesiId));
  if (!sesiSnap.exists()) return;
  const sesi = sesiSnap.data();
  document.getElementById("isi-judul").textContent = sesi.judul;

  // Ambil peserta
  const peserta = await ambilPeserta(sesi.tipe || "bebas", sesi.cakupan, sesi.target);
  const list = document.getElementById("isi-list");

  // Ambil kehadiran yang sudah ada
  const khSnap = await getDocs(query(collection(db, "kehadiran"), where("sesiId", "==", sesiId)));
  const sudahAda = {};
  khSnap.docs.forEach((d) => { const k = d.data(); sudahAda[k.siswaUid] = k.status; });

  list.innerHTML = peserta.map((s) => `
    <div class="p-3 rounded-lg bg-surface-container flex items-center gap-3" data-uid="${s.uid}">
      <div class="w-8 h-8 rounded-full bg-primary-container text-primary flex items-center justify-center text-xs font-semibold">${inisial(s.nama)}</div>
      <div class="flex-1"><p class="text-sm">${esc(s.nama)}</p><p class="text-[10px] text-on-surface-variant">${esc(s.peran)}</p></div>
      <select class="status-siswa px-2 py-1 rounded-lg bg-surface-container-high border border-outline-variant text-xs">
        <option value="Hadir" ${sudahAda[s.uid] === "Hadir" ? "selected" : ""}>Hadir</option>
        <option value="Izin" ${sudahAda[s.uid] === "Izin" ? "selected" : ""}>Izin</option>
        <option value="Sakit" ${sudahAda[s.uid] === "Sakit" ? "selected" : ""}>Sakit</option>
        <option value="Alpa" ${sudahAda[s.uid] === "Alpa" ? "selected" : ""}>Alpa</option>
      </select>
    </div>`).join("");

  openModal("modal-isi");
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
    <a href="${m.href}" class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition text-sm ${m.href === "absensi.html" ? "bg-primary-container text-primary font-medium" : "text-on-surface-variant hover:bg-surface-container"}">
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
  ].map((i) => `<a href="${i.href}" class="flex flex-col items-center justify-center py-2 text-[10px] gap-0.5 ${i.href === "absensi.html" ? "text-primary" : "text-on-surface-variant"}"><span class="material-symbols-outlined text-xl">${i.icon}</span>${i.label}</a>`).join("");

  const html = document.documentElement;
  const saved = localStorage.getItem("theme");
  if (saved === "light") html.classList.remove("dark");
  const btnT = document.getElementById("btn-theme"), iconT = document.getElementById("theme-icon");
  const setIcon = () => (iconT.textContent = html.classList.contains("dark") ? "light_mode" : "dark_mode");
  setIcon();
  btnT.addEventListener("click", () => { html.classList.toggle("dark"); localStorage.setItem("theme", html.classList.contains("dark") ? "dark" : "light"); setIcon(); });
  document.getElementById("btn-logout").addEventListener("click", async () => { if (confirm("Keluar?")) { await logActivity(ME.uid, "logout"); await signOut(auth); window.location.replace("index.html"); } });
  document.getElementById("btn-menu").addEventListener("click", () => { const sb = document.getElementById("sidebar"); sb.classList.toggle("hidden"); sb.classList.toggle("flex"); });

  // Cek hak buat
  const hak = cekHakBuat();
  if (hak.boleh) {
    document.getElementById("btn-buat-sesi").classList.remove("hidden");
    document.getElementById("btn-buat-sesi").addEventListener("click", () => {
      const wrapCakupan = document.getElementById("cakupan-wrap");
      const locked = document.getElementById("cakupan-locked");
      if (hak.tipe === "bebas") { wrapCakupan.classList.remove("hidden"); locked.classList.add("hidden"); }
      else { wrapCakupan.classList.add("hidden"); locked.classList.remove("hidden"); locked.textContent = "🔒 " + hak.label; }
      openModal("modal-sesi");
    });
  }

  // Form sesi
  document.getElementById("s-cakupan").addEventListener("change", (e) => {
    const t = document.getElementById("s-target");
    if (e.target.value === "divisi" || e.target.value === "peran") t.classList.remove("hidden");
    else t.classList.add("hidden");
  });

  document.getElementById("form-sesi").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const tipe = hak.tipe;
      await addDoc(collection(db, "sesiAbsensi"), {
        judul: document.getElementById("s-judul").value.trim(),
        jenis: document.getElementById("s-jenis").value,
        tanggal: document.getElementById("s-tanggal").value,
        jam: document.getElementById("s-jam").value,
        lokasi: document.getElementById("s-lokasi").value.trim(),
        cakupan: tipe === "bebas" ? document.getElementById("s-cakupan").value : tipe,
        target: tipe === "bebas" ? document.getElementById("s-target").value.trim() : "",
        tipe,
        pembuatUid: ME.uid,
        pembuatNama: ME.profile.nama,
        pembuatPeran: ME.profile.peran,
        createdAt: serverTimestamp(),
      });
      await logActivity(ME.uid, "buat_sesi_absensi", tipe);
      showToast("Sesi absensi dibuat!", "success");
      closeModal("modal-sesi");
      e.target.reset();
      await renderSesiList();
    } catch (err) { showToast("Gagal membuat sesi.", "error"); }
  });

  // Simpan absensi
  document.getElementById("btn-semua-hadir").addEventListener("click", () => {
    document.querySelectorAll(".status-siswa").forEach((s) => (s.value = "Hadir"));
  });

  document.getElementById("btn-simpan-absen").addEventListener("click", async () => {
    const rows = document.querySelectorAll("#isi-list [data-uid]");
    try {
      for (const r of rows) {
        const uid = r.dataset.uid;
        const status = r.querySelector(".status-siswa").value;
        // Cek jika sudah ada
        const cek = await getDocs(query(collection(db, "kehadiran"), where("sesiId", "==", SESI_AKTIF), where("siswaUid", "==", uid)));
        if (!cek.empty) {
          await updateDoc(doc(db, "kehadiran", cek.docs[0].id), { status, waktu: serverTimestamp() });
        } else {
          await addDoc(collection(db, "kehadiran"), { sesiId: SESI_AKTIF, siswaUid: uid, status, metode: "manual", waktu: serverTimestamp() });
        }
      }
      showToast("Absensi tersimpan!", "success");
      closeModal("modal-isi");
    } catch (e) { showToast("Gagal simpan absensi.", "error"); }
  });

  await renderSesiList();
})();
