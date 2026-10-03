/**
 * SP-PPT — Modul Asisten Sutradara
 * Prompt Book Digital, Catatan Harian, Standby Cue Live
 */

import { auth, db } from "./firebase-init.js";
import {
  doc, getDoc, addDoc, updateDoc, deleteDoc,
  collection, query, where, getDocs, orderBy, serverTimestamp, limit,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { protectPage } from "./router.js";
import {
  showToast, openModal, closeModal, skeleton, formatTanggal, esc,
  warnaPeran, inisial, logActivity, waktuRelatif,
} from "./utils.js";
import { initNotifikasi, bukaPanelNotif, kirimNotifikasi } from "./notifikasi.js";

let ME = null;
let TAB = "prompt";
let PEMAIN = [];
let CUE_AKTIF = null;
let TIMER_INTERVAL = null;
let SISA_DETIK = 0;

/* =========================================================
 * TAB SWITCH
 * ========================================================= */
function switchTab(tab) {
  TAB = tab;
  document.querySelectorAll(".tab-btn").forEach((b) => {
    const aktif = b.dataset.tab === tab;
    b.className = `tab-btn px-4 py-2 rounded-xl text-sm font-medium transition flex items-center gap-1.5 ${
      aktif ? "bg-primary-container text-primary" : "text-on-surface-variant hover:bg-surface-container"
    }`;
  });
  if (TAB !== "standby" && TIMER_INTERVAL) {
    clearInterval(TIMER_INTERVAL);
    TIMER_INTERVAL = null;
  }
  if (tab === "prompt") renderPrompt();
  if (tab === "catatan") renderCatatan();
  if (tab === "standby") renderStandby();
}

/* =========================================================
 * TAB: PROMPT BOOK
 * ========================================================= */
async function renderPrompt() {
  const c = document.getElementById("tab-content");
  c.innerHTML = `<div class="glass rounded-2xl p-5">${skeleton(4)}</div>`;

  // Load blocking & cue
  const [blSnap, cueSnap] = await Promise.all([
    getDocs(query(collection(db, "blocking"), where("kelas", "==", ME.profile.kelas))),
    getDocs(query(collection(db, "cueSheet"), where("kelas", "==", ME.profile.kelas), orderBy("timing", "asc"))),
  ]);

  const blockingList = blSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const cueList = cueSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  c.innerHTML = `
  <div class="glass rounded-2xl p-5 border-l-4 border-tertiary">
    <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
      <h3 class="font-headline font-semibold flex items-center gap-2">
        <span class="material-symbols-outlined text-tertiary">book</span> Prompt Book Digital
      </h3>
      <div class="flex gap-2">
        <button id="btn-add-blocking" class="px-3 py-2 rounded-lg bg-tertiary text-on-tertiary text-xs font-medium flex items-center gap-1">
          <span class="material-symbols-outlined text-sm">add_location</span> Blocking
        </button>
        <button id="btn-add-cue" class="px-3 py-2 rounded-lg bg-primary text-on-primary text-xs font-medium flex items-center gap-1">
          <span class="material-symbols-outlined text-sm">add</span> Cue
        </button>
      </div>
    </div>

    <!-- Blocking -->
    <h4 class="text-sm font-medium text-secondary mb-2 mt-4">Blocking per Adegan</h4>
    <div class="space-y-2">
      ${blockingList.length ? blockingList.map((b) => `
        <div class="p-3 rounded-xl bg-surface-container">
          <div class="flex items-center justify-between mb-2">
            <p class="font-medium text-sm">${esc(b.adegan)}</p>
            <button class="btn-del-blocking text-error hover:opacity-70" data-id="${b.id}">
              <span class="material-symbols-outlined text-sm">delete</span>
            </button>
          </div>
          <div class="grid grid-cols-3 gap-1 max-w-xs">
            ${Array.from({ length: 9 }).map((_, i) => {
              const p = (b.posisi || {})[i];
              return `<div class="aspect-square rounded bg-surface-container-high border border-outline-variant/40 text-[10px] flex items-center justify-center p-1 text-center">
                ${p ? `<span class="text-primary font-medium">${esc(p.nama?.split(" ")[0] || "")}</span>` : ""}
              </div>`;
            }).join("")}
          </div>
        </div>
      `).join("") : `<p class="text-xs text-on-surface-variant text-center py-4">Belum ada blocking</p>`}
    </div>

    <!-- Cue Sheet -->
    <h4 class="text-sm font-medium text-secondary mb-2 mt-4">Cue Sheet</h4>
    <div class="overflow-x-auto">
      <table class="w-full text-xs">
        <thead class="text-on-surface-variant">
          <tr class="border-b border-outline-variant/40">
            <th class="text-left p-2">Kode</th>
            <th class="text-left p-2">Timing</th>
            <th class="text-left p-2">Deskripsi</th>
            <th class="text-center p-2">Aksi</th>
          </tr>
        </thead>
        <tbody>
          ${cueList.length ? cueList.map((cue) => `
            <tr class="border-b border-outline-variant/20">
              <td class="p-2 font-bold text-primary">${esc(cue.kode)}</td>
              <td class="p-2">${esc(cue.timing)}</td>
              <td class="p-2">${esc(cue.deskripsi)}</td>
              <td class="p-2 text-center">
                <button class="btn-del-cue text-error hover:opacity-70" data-id="${cue.id}">
                  <span class="material-symbols-outlined text-sm">delete</span>
                </button>
              </td>
            </tr>
          `).join("") : `<tr><td colspan="4" class="p-4 text-center text-on-surface-variant">Belum ada cue</td></tr>`}
        </tbody>
      </table>
    </div>
  </div>`;

  // Bind
  document.getElementById("btn-add-blocking").addEventListener("click", async () => {
    const pSnap = await getDocs(query(collection(db, "users"), where("kelas", "==", ME.profile.kelas), where("role", "==", "siswa"), where("peran", "==", "Pemain")));
    PEMAIN = pSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    const sel = document.getElementById("bl-pemain");
    sel.innerHTML = `<option value="">Pilih Pemain</option>` + PEMAIN.map((p) => `<option value="${p.uid}" data-nama="${esc(p.nama)}">${esc(p.nama)}</option>`).join("");
    document.querySelectorAll(".bl-cell").forEach((c) => (c.innerHTML = ""));
    openModal("modal-blocking");
  });

  document.getElementById("btn-add-cue").addEventListener("click", () => openModal("modal-cue"));

  document.querySelectorAll(".btn-del-blocking").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Hapus blocking?")) return;
      await deleteDoc(doc(db, "blocking", b.dataset.id));
      renderPrompt();
    })
  );

  document.querySelectorAll(".btn-del-cue").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Hapus cue?")) return;
      await deleteDoc(doc(db, "cueSheet", b.dataset.id));
      renderPrompt();
    })
  );

  // Bl cell click
  let posisiTemp = {};
  let adeganNama = "";
  document.querySelectorAll(".bl-cell").forEach((cell) => {
    cell.addEventListener("click", () => {
      const pemainVal = document.getElementById("bl-pemain").value;
      if (!pemainVal) return showToast("Pilih pemain dulu.", "warning");
      const nama = document.getElementById("bl-pemain").selectedOptions[0].dataset.nama;
      const i = cell.dataset.cell;
      // Toggle
      if (posisiTemp[i]?.uid === pemainVal) {
        delete posisiTemp[i];
        cell.innerHTML = "";
      } else {
        posisiTemp[i] = { uid: pemainVal, nama };
        cell.innerHTML = `<span class="text-primary font-medium text-[9px]">${esc(nama.split(" ")[0])}</span>`;
      }
    });
  });

  document.getElementById("btn-simpan-blocking").onclick = async () => {
    const adegan = document.getElementById("bl-adegan").value.trim();
    if (!adegan) return showToast("Isi nama adegan.", "warning");
    if (!Object.keys(posisiTemp).length) return showToast("Posisikan minimal 1 pemain.", "warning");

    try {
      await addDoc(collection(db, "blocking"), {
        kelas: ME.profile.kelas,
        adegan,
        posisi: posisiTemp,
        asistenUid: ME.uid,
        createdAt: serverTimestamp(),
      });
      await logActivity(ME.uid, "tambah_blocking", adegan);
      showToast("Blocking tersimpan!", "success");
      closeModal("modal-blocking");
      posisiTemp = {};
      renderPrompt();
    } catch (e) { showToast("Gagal simpan.", "error"); }
  };

  // Form cue
  document.getElementById("form-cue").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, "cueSheet"), {
        kelas: ME.profile.kelas,
        kode: document.getElementById("cue-kode").value.trim(),
        timing: document.getElementById("cue-timing").value.trim(),
        deskripsi: document.getElementById("cue-desk").value.trim(),
        asistenUid: ME.uid,
        createdAt: serverTimestamp(),
      });
      await logActivity(ME.uid, "tambah_cue");
      showToast("Cue tersimpan!", "success");
      closeModal("modal-cue");
      e.target.reset();
      renderPrompt();
    } catch (e) { showToast("Gagal simpan cue.", "error"); }
  });
}

/* =========================================================
 * TAB: CATATAN HARIAN
 * ========================================================= */
async function renderCatatan() {
  const c = document.getElementById("tab-content");
  c.innerHTML = `<div class="glass rounded-2xl p-5">${skeleton(4)}</div>`;

  const snap = await getDocs(query(collection(db, "catatanHarian"), where("kelas", "==", ME.profile.kelas), orderBy("tanggal", "desc"), limit(30)));

  c.innerHTML = `
  <div class="glass rounded-2xl p-5">
    <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
      <h3 class="font-headline font-semibold flex items-center gap-2">
        <span class="material-symbols-outlined text-tertiary">edit_note</span> Catatan Harian
      </h3>
      <button id="btn-add-catatan" class="px-3 py-2 rounded-lg bg-tertiary text-on-tertiary text-xs font-medium flex items-center gap-1">
        <span class="material-symbols-outlined text-sm">add</span> Tambah
      </button>
    </div>

    ${snap.docs.length ? snap.docs.map((d) => {
      const n = d.data();
      return `
        <div class="p-3 rounded-xl bg-surface-container mb-2">
          <div class="flex items-center justify-between gap-2 mb-1 flex-wrap">
            <p class="text-sm font-medium">${esc(n.adegan)}</p>
            <span class="text-[10px] px-2 py-0.5 rounded-full ${
              n.status === "Baik" ? "bg-green-600/20 text-green-400" :
              n.status === "Perlu Perbaikan" ? "bg-yellow-500/20 text-yellow-400" : "bg-error/20 text-error"
            }">${esc(n.status)}</span>
          </div>
          <p class="text-xs text-on-surface-variant">${formatTanggal(n.tanggal)}</p>
          <p class="text-sm mt-2 whitespace-pre-wrap">${esc(n.catatan)}</p>
          ${n.rating ? `<p class="text-xs text-secondary mt-2">Rating: ${"★".repeat(n.rating)}${"☆".repeat(5 - n.rating)}</p>` : ""}
        </div>
      `;
    }).join("") : `<p class="text-center text-sm text-on-surface-variant py-8">Belum ada catatan</p>`}
  </div>`;

  document.getElementById("btn-add-catatan").addEventListener("click", () => {
    // Sederhana: pakai prompt
    const tanggal = new Date().toISOString().slice(0, 10);
    const adegan = prompt("Nama adegan:");
    if (!adegan) return;
    const status = prompt("Status (Baik / Perlu Perbaikan / Kritis):", "Baik") || "Baik";
    const catatan = prompt("Catatan:");
    if (!catatan) return;
    const rating = parseInt(prompt("Rating 1-5:", "4") || "4");

    addDoc(collection(db, "catatanHarian"), {
      kelas: ME.profile.kelas,
      tanggal, adegan, status, catatan, rating,
      asistenUid: ME.uid,
      createdAt: serverTimestamp(),
    }).then(() => {
      showToast("Catatan tersimpan!", "success");
      renderCatatan();
    });
  });
}

/* =========================================================
 * TAB: STANDBY CUE LIVE
 * ========================================================= */
async function renderStandby() {
  const c = document.getElementById("tab-content");

  const snap = await getDocs(query(collection(db, "cueSheet"), where("kelas", "==", ME.profile.kelas), orderBy("timing", "asc")));
  const cueList = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  c.innerHTML = `
  <div class="glass rounded-2xl p-5 border-l-4 border-error">
    <h3 class="font-headline font-semibold mb-4 flex items-center gap-2">
      <span class="material-symbols-outlined text-error">timer</span> Standby Cue — Live Mode
    </h3>
    <p class="text-xs text-on-surface-variant mb-4">Klik cue untuk memulai countdown dan panggil pemain.</p>

    <div id="timer-display" class="text-center py-8 rounded-2xl bg-surface-container mb-4">
      <p id="timer-teks" class="font-headline font-bold text-6xl text-primary">--:--</p>
      <p id="timer-label" class="text-sm text-on-surface-variant mt-2">Pilih cue di bawah</p>
    </div>

    <div class="flex gap-2 mb-4 justify-center">
      <button id="btn-timer-play" class="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium">Mulai</button>
      <button id="btn-timer-pause" class="px-4 py-2 rounded-lg bg-surface-container-high text-sm font-medium">Jeda</button>
      <button id="btn-timer-reset" class="px-4 py-2 rounded-lg bg-surface-container-high text-sm font-medium">Reset</button>
    </div>

    <div class="space-y-2">
      ${cueList.length ? cueList.map((cue) => `
        <div class="p-3 rounded-xl bg-surface-container hover:bg-surface-container-high transition cursor-pointer cue-item"
          data-id="${cue.id}" data-kode="${esc(cue.kode)}" data-timing="${esc(cue.timing)}" data-desk="${esc(cue.deskripsi)}">
          <div class="flex items-center justify-between gap-2">
            <div>
              <p class="text-sm font-bold text-primary">${esc(cue.kode)}</p>
              <p class="text-xs text-on-surface-variant">${esc(cue.timing)}</p>
              <p class="text-xs mt-1">${esc(cue.deskripsi)}</p>
            </div>
            <span class="material-symbols-outlined text-primary">play_circle</span>
          </div>
        </div>
      `).join("") : `<p class="text-sm text-on-surface-variant text-center py-6">Belum ada cue</p>`}
    </div>

    <div id="cue-log" class="mt-4 p-3 rounded-lg bg-surface-container-high text-xs">
      <p class="font-medium text-on-surface-variant mb-2">Log Cue</p>
      <div id="log-list" class="space-y-1 max-h-40 overflow-y-auto"></div>
    </div>
  </div>`;

  // Bind cue item
  document.querySelectorAll(".cue-item").forEach((item) => {
    item.addEventListener("click", () => {
      const timingStr = item.dataset.timing;
      const m = timingStr.match(/(\d+):(\d+)(?::(\d+))?/);
      let detik = 0;
      if (m) {
        detik = m[3] ? parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]) : parseInt(m[1]) * 60 + parseInt(m[2]);
      }
      if (!detik) detik = 60; // default 1 menit

      CUE_AKTIF = { kode: item.dataset.kode, desk: item.dataset.desk };
      SISA_DETIK = detik;
      updateTimerDisplay();
      document.getElementById("timer-label").textContent = `Cue ${CUE_AKTIF.kode}: ${CUE_AKTIF.desk}`;
      showToast(`Cue ${CUE_AKTIF.kode} siap. Klik Mulai.`, "info");
    });
  });

  document.getElementById("btn-timer-play").addEventListener("click", () => {
    if (TIMER_INTERVAL) return;
    if (!CUE_AKTIF) return showToast("Pilih cue dulu.", "warning");
    TIMER_INTERVAL = setInterval(() => {
      SISA_DETIK--;
      updateTimerDisplay();
      if (SISA_DETIK <= 0) {
        clearInterval(TIMER_INTERVAL);
        TIMER_INTERVAL = null;
        // Log
        const logEl = document.getElementById("log-list");
        logEl.innerHTML = `<div class="flex justify-between"><span class="text-green-400">${CUE_AKTIF.kode}</span><span>${new Date().toLocaleTimeString("id-ID")}</span></div>` + logEl.innerHTML;
        showToast(`Cue ${CUE_AKTIF.kode} SELESAI!`, "success");
        document.getElementById("timer-teks").classList.add("animate-pulse");
      }
    }, 1000);
    showToast("Timer berjalan.", "success");
  });

  document.getElementById("btn-timer-pause").addEventListener("click", () => {
    if (TIMER_INTERVAL) {
      clearInterval(TIMER_INTERVAL);
      TIMER_INTERVAL = null;
      showToast("Timer dijeda.", "info");
    }
  });

  document.getElementById("btn-timer-reset").addEventListener("click", () => {
    if (TIMER_INTERVAL) clearInterval(TIMER_INTERVAL);
    TIMER_INTERVAL = null;
    SISA_DETIK = 0;
    CUE_AKTIF = null;
    document.getElementById("timer-teks").textContent = "--:--";
    document.getElementById("timer-label").textContent = "Pilih cue di bawah";
    document.getElementById("timer-teks").classList.remove("animate-pulse");
  });
}

function updateTimerDisplay() {
  const m = Math.floor(SISA_DETIK / 60);
  const s = SISA_DETIK % 60;
  document.getElementById("timer-teks").textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  if (SISA_DETIK <= 10) {
    document.getElementById("timer-teks").classList.add("text-error");
  } else {
    document.getElementById("timer-teks").classList.remove("text-error");
  }
}

/* =========================================================
 * INIT
 * ========================================================= */
(async function init() {
  const { uid, profile } = await protectPage();
  ME = { uid, profile };

  const menu = [
    { icon: "dashboard", label: "Dashboard", href: "dashboard.html" },
    { icon: "book", label: "Panel Asisten", href: "asisten.html" },
    { icon: "grade", label: "Nilai", href: "nilai.html" },
    { icon: "calendar_month", label: "Jadwal", href: "jadwal.html" },
    { icon: "fact_check", label: "Absensi", href: "absensi.html" },
    { icon: "checklist", label: "Checklist", href: "checklist.html" },
    { icon: "campaign", label: "Broadcast", href: "broadcast.html" },
    { icon: "groups", label: "Struktur", href: "struktur.html" },
    { icon: "folder", label: "Arsip", href: "arsip.html" },
    { icon: "support_agent", label: "Aduan", href: "aduan.html" },
    { icon: "description", label: "Rapor", href: "rapor.html" },
  ];
  document.getElementById("sidebar-nav").innerHTML = menu.map((m) => `
    <a href="${m.href}" class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition text-sm ${
      m.href === "asisten.html" ? "bg-primary-container text-primary font-medium" : "text-on-surface-variant hover:bg-surface-container"
    }"><span class="material-symbols-outlined text-xl">${m.icon}</span>${m.label}</a>`).join("");

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
  ].map((i) => `<a href="${i.href}" class="flex flex-col items-center justify-center py-2 text-[10px] gap-0.5 ${
    i.href === "asisten.html" ? "text-primary" : "text-on-surface-variant"
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

  document.querySelectorAll(".tab-btn").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));

  switchTab("prompt");
})();
