/**
 * SP-PPT — Modul Checklist & Tugas (dengan Kanban)
 */

import { auth, db } from "./firebase-init.js";
import {
  addDoc, collection, query, where, getDocs, orderBy, serverTimestamp, doc, updateDoc, getDoc, deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { protectPage } from "./router.js";
import { showToast, openModal, closeModal, skeleton, formatTanggal, waktuRelatif, countdown, esc, warnaPeran, inisial, logActivity } from "./utils.js";

let ME = null;
let TUGAS = [];
let TAB = "list";

/* =========================================================
 * HAK BUAT TUGAS
 * ========================================================= */
function bolehBuat() {
  const p = ME.profile.peran, r = ME.profile.role;
  return r === "guru" || r === "admin" ||
    ["Pimpinan Produksi", "Sekretaris", "Sutradara", "Asisten Sutradara"].includes(p) ||
    p.startsWith("Koordinator");
}

/* =========================================================
 * AMBIL TUGAS
 * ========================================================= */
async function ambilTugas() {
  // Tugas yang relevan untuk saya (semua/divisi/peran/custom)
  const snap = await getDocs(query(collection(db, "tugas"), orderBy("deadline", "asc")));
  TUGAS = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((t) => {
    if (!t.target || t.target === "semua") return true;
    if (t.target === "divisi" && t.divisi === ME.profile.divisi) return true;
    if (t.target === "peran" && t.peran === ME.profile.peran) return true;
    if (t.target === "custom" && (t.penerimaUids || []).includes(ME.uid)) return true;
    return ME.profile.role === "guru" || ME.profile.role === "admin";
  });
}

/* =========================================================
 * RENDER LIST
 * ========================================================= */
function renderList() {
  const c = document.getElementById("tab-content");
  if (!TUGAS.length) {
    c.innerHTML = `<div class="glass rounded-2xl p-10 text-center">
      <span class="material-symbols-outlined text-5xl text-on-surface-variant mb-3">task_alt</span>
      <p class="text-sm text-on-surface-variant mb-4">Belum ada tugas</p>
    </div>`;
    return;
  }

  c.innerHTML = `
  <div class="glass rounded-2xl p-5">
    <div class="space-y-2">
      ${TUGAS.map((t) => {
        const status = t.statusPerSiswa?.[ME.uid] || "Belum Dikerjakan";
        const badge = status === "Selesai" ? "bg-green-600 text-white" :
          status === "Sedang Dikerjakan" ? "bg-blue-600 text-white" :
          status === "Terlewat" ? "bg-error text-white" : "bg-surface-container-high";
        const cb = status === "Selesai" ? "checked" : "";
        return `
        <div class="p-3 rounded-xl bg-surface-container flex items-center gap-3">
          <input type="checkbox" data-id="${t.id}" ${cb} class="chk-selesai w-4 h-4 rounded accent-primary" />
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <p class="text-sm font-medium truncate ${cb ? "line-through opacity-60" : ""}">${esc(t.judul)}</p>
              <span class="text-[10px] px-2 py-0.5 rounded-full ${badge}">${status}</span>
              ${t.prioritas === "Kritis" ? `<span class="text-[10px] px-2 py-0.5 rounded-full bg-error/20 text-error">Kritis</span>` : ""}
            </div>
            <p class="text-xs text-on-surface-variant mt-1">${esc(t.deskripsi || "")}</p>
            <p class="text-[10px] text-on-surface-variant mt-1">⏰ ${t.deadline ? countdown(t.deadline) + " lagi" : "-"}</p>
          </div>
        </div>`;
      }).join("")}
    </div>
  </div>`;

  c.querySelectorAll(".chk-selesai").forEach((cb) =>
    cb.addEventListener("change", async () => {
      const id = cb.dataset.id;
      const status = cb.checked ? "Selesai" : "Belum Dikerjakan";
      try {
        await updateDoc(doc(db, "tugas", id), { [`statusPerSiswa.${ME.uid}`]: status, updatedAt: serverTimestamp() });
        showToast(cb.checked ? "Tugas selesai ✓" : "Tugas dibuka kembali", "success");
        await refresh();
      } catch (e) { showToast("Gagal update.", "error"); }
    })
  );

  updateProgress();
}

/* =========================================================
 * RENDER KANBAN
 * ========================================================= */
function renderKanban() {
  const c = document.getElementById("tab-content");
  const kolom = ["Belum Dikerjakan", "Sedang Dikerjakan", "Selesai", "Terlewat"];
  c.innerHTML = `
  <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
    ${kolom.map((k) => {
      const items = TUGAS.filter((t) => (t.statusPerSiswa?.[ME.uid] || "Belum Dikerjakan") === k);
      return `
      <div class="glass rounded-2xl p-3">
        <h4 class="font-medium text-sm mb-3 flex items-center justify-between">${k}<span class="text-xs text-on-surface-variant">${items.length}</span></h4>
        <div class="space-y-2">
          ${items.map((t) => `
            <div class="p-3 rounded-lg bg-surface-container text-xs">
              <p class="font-medium">${esc(t.judul)}</p>
              <p class="text-on-surface-variant mt-1">${t.deadline ? countdown(t.deadline) : "-"}</p>
            </div>`).join("")}
        </div>
      </div>`;
    }).join("")}
  </div>`;
}

/* =========================================================
 * PROGRESS
 * ========================================================= */
function updateProgress() {
  if (!TUGAS.length) return;
  const done = TUGAS.filter((t) => t.statusPerSiswa?.[ME.uid] === "Selesai").length;
  const pct = Math.round((done / TUGAS.length) * 100);
  document.getElementById("progres-pct").textContent = pct + "%";
  document.getElementById("progres-bar").style.width = pct + "%";
}

/* =========================================================
 * REFRESH
 * ========================================================= */
async function refresh() {
  await ambilTugas();
  TAB === "list" ? renderList() : renderKanban();
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
    <a href="${m.href}" class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition text-sm ${m.href === "checklist.html" ? "bg-primary-container text-primary font-medium" : "text-on-surface-variant hover:bg-surface-container"}">
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
  ].map((i) => `<a href="${i.href}" class="flex flex-col items-center justify-center py-2 text-[10px] gap-0.5 ${i.href === "checklist.html" ? "text-primary" : "text-on-surface-variant"}"><span class="material-symbols-outlined text-xl">${i.icon}</span>${i.label}</a>`).join("");

  const html = document.documentElement;
  const saved = localStorage.getItem("theme");
  if (saved === "light") html.classList.remove("dark");
  const btnT = document.getElementById("btn-theme"), iconT = document.getElementById("theme-icon");
  const setIcon = () => (iconT.textContent = html.classList.contains("dark") ? "light_mode" : "dark_mode");
  setIcon();
  btnT.addEventListener("click", () => { html.classList.toggle("dark"); localStorage.setItem("theme", html.classList.contains("dark") ? "dark" : "light"); setIcon(); });
  document.getElementById("btn-logout").addEventListener("click", async () => { if (confirm("Keluar?")) { await logActivity(ME.uid, "logout"); await signOut(auth); window.location.replace("index.html"); } });
  document.getElementById("btn-menu").addEventListener("click", () => { const sb = document.getElementById("sidebar"); sb.classList.toggle("hidden"); sb.classList.toggle("flex"); });

  // Tab switch
  document.querySelectorAll(".tab-btn").forEach((b) =>
    b.addEventListener("click", () => {
      TAB = b.dataset.tab;
      document.querySelectorAll(".tab-btn").forEach((x) => {
        x.className = "tab-btn px-4 py-2 rounded-xl text-sm font-medium";
      });
      b.className = "tab-btn px-4 py-2 rounded-xl text-sm font-medium bg-primary-container text-primary";
      TAB === "list" ? renderList() : renderKanban();
    })
  );

  // Init
  await refresh();

  // Tombol buat tugas (jika berhak)
  if (bolehBuat()) {
    const btn = document.createElement("button");
    btn.className = "fixed bottom-24 lg:bottom-6 right-4 lg:right-6 z-40 px-4 py-3 rounded-full bg-primary text-on-primary font-medium text-sm shadow-xl hover:scale-105 transition flex items-center gap-2";
    btn.innerHTML = `<span class="material-symbols-outlined">add</span> Tugas Baru`;
    btn.addEventListener("click", () => openModal("modal-tugas"));
    document.body.appendChild(btn);
  }

  // Form submit
  document.getElementById("form-tugas").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const target = document.getElementById("t-target").value;
      await addDoc(collection(db, "tugas"), {
        judul: document.getElementById("t-judul").value.trim(),
        deskripsi: document.getElementById("t-desk").value.trim(),
        deadline: document.getElementById("t-deadline").value,
        prioritas: document.getElementById("t-prioritas").value,
        target,
        divisi: target === "divisi" ? ME.profile.divisi : "",
        peran: target === "peran" ? ME.profile.peran : "",
        pembuatUid: ME.uid,
        pembuatNama: ME.profile.nama,
        statusPerSiswa: {},
        createdAt: serverTimestamp(),
      });
      await logActivity(ME.uid, "buat_tugas");
      showToast("Tugas dibuat!", "success");
      closeModal("modal-tugas");
      e.target.reset();
      await refresh();
    } catch (err) { showToast("Gagal buat tugas.", "error"); }
  });
})();
