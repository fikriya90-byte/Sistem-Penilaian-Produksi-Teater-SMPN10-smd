/**
 * SP-PPT — Utility Helpers
 * Fungsi umum: toast, modal, skeleton, format tanggal, dsb.
 */

import { db } from "./firebase-init.js";
import {
  collection,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* =========================================================
 * TOAST NOTIFICATION
 * ========================================================= */
export function showToast(message, type = "info", duration = 3000) {
  const container = document.getElementById("toast-container") || (() => {
    const el = document.createElement("div");
    el.id = "toast-container";
    el.className = "fixed top-4 right-4 z-[100] space-y-2";
    document.body.appendChild(el);
    return el;
  })();

  const colors = {
    success: "bg-green-600 text-white",
    error: "bg-red-600 text-white",
    warning: "bg-yellow-500 text-black",
    info: "bg-blue-600 text-white",
  };
  const icons = {
    success: "check_circle",
    error: "error",
    warning: "warning",
    info: "info",
  };

  const toast = document.createElement("div");
  toast.className = `${colors[type]} px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 min-w-[240px] max-w-sm animate-slide-in`;
  toast.innerHTML = `
    <span class="material-symbols-outlined text-lg">${icons[type]}</span>
    <span class="text-sm font-medium flex-1">${message}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(20px)";
    toast.style.transition = "all 0.3s";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* =========================================================
 * MODAL HELPERS
 * ========================================================= */
export function openModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.remove("hidden");
  m.classList.add("flex");
  document.body.style.overflow = "hidden";
}

export function closeModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.add("hidden");
  m.classList.remove("flex");
  document.body.style.overflow = "";
}

// Auto-bind: elemen dengan [data-close-modal] menutup modal terdekat
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-close-modal]");
  if (btn) {
    const modal = btn.closest(".fixed.inset-0");
    if (modal) closeModal(modal.id);
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelectorAll(".fixed.inset-0:not(.hidden)").forEach((m) => closeModal(m.id));
  }
});

/* =========================================================
 * SKELETON LOADING
 * ========================================================= */
export function skeleton(lines = 3) {
  return Array.from({ length: lines })
    .map(
      () => `<div class="h-4 bg-surface-container-high rounded animate-pulse mb-2" style="width:${60 + Math.random() * 40}%"></div>`
    )
    .join("");
}

/* =========================================================
 * FORMAT TANGGAL & WAKTU
 * ========================================================= */
const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function formatTanggal(date) {
  if (!date) return "-";
  const d = date.toDate ? date.toDate() : new Date(date);
  return `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatTanggalSingkat(date) {
  if (!date) return "-";
  const d = date.toDate ? date.toDate() : new Date(date);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

export function formatWaktu(date) {
  if (!date) return "-";
  const d = date.toDate ? date.toDate() : new Date(date);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function waktuRelatif(date) {
  if (!date) return "-";
  const d = date.toDate ? date.toDate() : new Date(date);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "baru saja";
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} hari lalu`;
  return formatTanggal(d);
}

/* =========================================================
 * COUNTDOWN TIMER
 * ========================================================= */
export function countdown(targetDate) {
  const target = targetDate.toDate ? targetDate.toDate() : new Date(targetDate);
  const diff = target.getTime() - Date.now();
  if (diff <= 0) return "Terlewat";
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (d > 0) return `${d}h ${h}j`;
  if (h > 0) return `${h}j ${m}m`;
  return `${m}m`;
}

/* =========================================================
 * NILAI & PREDIKAT
 * ========================================================= */
export function predikat(nilai) {
  if (nilai >= 90) return { huruf: "A", label: "Mahir, teladan", warna: "text-yellow-400", bg: "bg-yellow-500/20" };
  if (nilai >= 80) return { huruf: "B", label: "Kompeten, andal", warna: "text-blue-400", bg: "bg-blue-500/20" };
  if (nilai >= 70) return { huruf: "C", label: "Memenuhi standar", warna: "text-green-400", bg: "bg-green-500/20" };
  if (nilai >= 60) return { huruf: "D", label: "Perlu perbaikan", warna: "text-orange-400", bg: "bg-orange-500/20" };
  return { huruf: "E", label: "Tidak memenuhi", warna: "text-red-400", bg: "bg-red-500/20" };
}

/* =========================================================
 * LENCANA WARNA PERAN
 * ========================================================= */
export function warnaPeran(peran) {
  if (["Pimpinan Produksi", "Sutradara"].includes(peran))
    return "bg-secondary/20 text-secondary border-secondary/40";
  if (peran.startsWith("Koordinator"))
    return "bg-tertiary/20 text-tertiary border-tertiary/40";
  return "bg-surface-container-highest text-on-surface-variant border-outline-variant";
}

/* =========================================================
 * INISIAL NAMA
 * ========================================================= */
export function inisial(nama = "") {
  return nama
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/* =========================================================
 * LOG AKTIVITAS ke Firestore
 * ========================================================= */
export async function logActivity(uid, aksi, target = "") {
  try {
    await addDoc(collection(db, "logs"), {
      uid: uid || "anonim",
      aksi,
      target,
      waktu: serverTimestamp(),
      perangkat: navigator.userAgent,
    });
  } catch (e) {
    console.warn("[Log] gagal:", e);
  }
}

/* =========================================================
 * DEBOUNCE
 * ========================================================= */
export function debounce(fn, delay = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

/* =========================================================
 * ESCAPE HTML (anti-XSS)
 * ========================================================= */
export function esc(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
/* =========================================================
 * LOGOUT HELPER (tanpa Firebase Auth)
 * ========================================================= */
export function doLogout() {
  localStorage.removeItem("sppt_session");
  window.location.replace("index.html?logout=1");
}

export async function signOut() {
  doLogout();
}
