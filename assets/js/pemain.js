/**
 * SP-PPT — Modul Pemain (Aktor/Aktris)
 * Naskah Digital, Latihan Dialog 10 Langkah, Rekam Suara, Blocking, Refleksi, Casting
 */

import { auth, db } from "./firebase-init.js";
import {
  doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
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
let TAB = "naskah";
let CASTING_SAYA = null;
let MEDIA_RECORDER = null;
let RECORDED_CHUNKS = [];
let TIMER_REKAM = null;
let REKAM_DETIK = 0;

const LANGKAH_LATIHAN = [
  { no: 1, nama: "Pemahaman Karakter", desk: "Pelajari latar belakang, sifat, dan motivasi karakter Anda." },
  { no: 2, nama: "Memahami Naskah", desk: "Baca seluruh naskah, pahami alur cerita dan konteks." },
  { no: 3, nama: "Penekanan Kata & Frase", desk: "Latih penekanan pada kata-kata penting dalam dialog." },
  { no: 4, nama: "Intonasi Suara", desk: "Variasikan tinggi-rendah, cepat-lambat suara." },
  { no: 5, nama: "Latihan Membaca Bersama", desk: "Baca dialog dengan rekan untuk cek timing." },
  { no: 6, nama: "Gerakan & Ekspresi Wajah", desk: "Tambahkan ekspresi dan gestur yang sesuai." },
  { no: 7, nama: "Latihan Berdialog", desk: "Latih dialog penuh dengan blocking." },
  { no: 8, nama: "Memahami Tujuan Karakter", desk: "Pahami keinginan karakter dalam tiap adegan." },
  { no: 9, nama: "Latihan Imajinasi", desk: "Bayangkan situasi nyata dari adegan." },
  { no: 10, nama: "Pementasan Ulang", desk: "Rekam, tonton, evaluasi, ulangi perbaikan." },
];

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
  if (tab === "naskah") renderNaskah();
  if (tab === "latihan") renderLatihan();
  if (tab === "rekam") renderRekam();
  if (tab === "blocking") renderBlocking();
  if (tab === "refleksi") renderRefleksi();
  if (tab === "casting") renderCasting();
}

/* =========================================================
 * NASKAH DIGITAL
 * ========================================================= */
async function renderNaskah() {
  const c = document.getElementById("tab-content");
  c.innerHTML = `<div class="glass rounded-2xl p-5">${skeleton(4)}</div>`;

  const snap = await getDocs(query(collection(db, "naskah"), where("kelas", "==", ME.profile.kelas), limit(1)));
  const naskah = snap.empty ? null : snap.docs[0].data();

  // Bookmark pribadi
  const bmSnap = await getDocs(query(collection(db, "bookmarkNaskah"), where("siswaUid", "==", ME.uid)));
  const bookmarks = bmSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  c.innerHTML = `
    <div class="glass rounded-2xl p-5">
      <h3 class="font-headline font-semibold mb-3 flex items-center gap-2">
        <span class="material-symbols-outlined text-primary">menu_book</span> Naskah Digital
      </h3>
      ${naskah ? `
        <div class="p-3 rounded-xl bg-surface-container mb-3">
          <p class="text-sm font-medium">${esc(naskah.judul || "Naskah Produksi")}</p>
          <p class="text-xs text-on-surface-variant">${esc(naskah.deskripsi || "")}</p>
          ${naskah.url ? `<a href="${esc(naskah.url)}" target="_blank" class="inline-block mt-2 px-3 py-1.5 rounded bg-primary-container text-primary text-xs">Buka PDF Naskah</a>` : ""}
        </div>
      ` : `
        <div class="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-xs text-yellow-400 mb-3">
          Naskah belum diupload. Hubungi Sutradara/Sekretaris.
        </div>
      `}

      <div class="p-3 rounded-xl bg-surface-container mb-3">
        <p class="text-sm font-medium mb-2">Highlight Dialog Saya</p>
        <p class="text-xs text-on-surface-variant mb-2">Tandai adegan/dialog yang menjadi bagian Anda:</p>
        <textarea id="highlight-text" rows="4" placeholder="Salin dialog Anda di sini untuk di-highlight..." class="w-full px-3 py-2 rounded-lg bg-surface-container-high border border-outline-variant text-sm"></textarea>
        <button id="btn-save-highlight" class="mt-2 px-3 py-1.5 rounded bg-primary text-on-primary text-xs">Simpan Highlight</button>
      </div>

      <div class="p-3 rounded-xl bg-surface-container">
        <p class="text-sm font-medium mb-2">Bookmark Saya</p>
        <div class="space-y-1">
          ${bookmarks.length ? bookmarks.map((b) => `
            <div class="flex items-center justify-between p-2 rounded bg-surface-container-high text-xs">
              <span class="flex-1">Hal. ${b.halaman || "-"} · ${esc(b.catatan || "-")}</span>
              <button class="btn-del-bm text-error" data-id="${b.id}">×</button>
            </div>
          `).join("") : `<p class="text-xs text-on-surface-variant">Belum ada bookmark</p>`}
        </div>
        <button id="btn-add-bm" class="mt-2 px-3 py-1.5 rounded bg-surface-container-high text-xs">+ Tambah Bookmark</button>
      </div>
    </div>`;

  document.getElementById("btn-save-highlight")?.addEventListener("click", async () => {
    const text = document.getElementById("highlight-text").value.trim();
    if (!text) return;
    const existing = await getDocs(query(collection(db, "highlightPemain"), where("siswaUid", "==", ME.uid)));
    if (!existing.empty) {
      await updateDoc(doc(db, "highlightPemain", existing.docs[0].id), { text, updatedAt: serverTimestamp() });
    } else {
      await addDoc(collection(db, "highlightPemain"), { siswaUid: ME.uid, text, createdAt: serverTimestamp() });
    }
    showToast("Highlight tersimpan!", "success");
  });

  document.getElementById("btn-add-bm")?.addEventListener("click", () => {
    document.getElementById("modal-title").textContent = "Tambah Bookmark";
    document.getElementById("modal-body").innerHTML = `
      <div class="space-y-3">
        <input id="f-hal" type="number" placeholder="Halaman" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <input id="f-catatan" placeholder="Catatan" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <button id="f-submit" class="w-full py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium">Simpan</button>
      </div>`;
    openModal("modal-form");
    document.getElementById("f-submit").onclick = async () => {
      await addDoc(collection(db, "bookmarkNaskah"), {
        siswaUid: ME.uid,
        halaman: parseInt(document.getElementById("f-hal").value) || 1,
        catatan: document.getElementById("f-catatan").value.trim(),
        createdAt: serverTimestamp(),
      });
      showToast("Bookmark ditambahkan!", "success");
      closeModal("modal-form");
      renderNaskah();
    };
  });

  c.querySelectorAll(".btn-del-bm").forEach((b) =>
    b.addEventListener("click", async () => {
      await deleteDoc(doc(db, "bookmarkNaskah", b.dataset.id));
      renderNaskah();
    })
  );
}

/* =========================================================
 * LATIHAN DIALOG 10 LANGKAH
 * ========================================================= */
async function renderLatihan() {
  const c = document.getElementById("tab-content");
  const snap = await getDocs(query(collection(db, "progressLatihan"), where("siswaUid", "==", ME.uid)));
  const map = {};
  snap.docs.forEach((d) => { map[d.data().langkahNo] = { id: d.id, ...d.data() }; });

  const selesai = Object.values(map).filter((m) => m.selesai).length;

  c.innerHTML = `
    <div class="glass rounded-2xl p-5">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-headline font-semibold flex items-center gap-2">
          <span class="material-symbols-outlined text-primary">record_voice_over</span> Latihan Dialog 10 Langkah
        </h3>
        <span class="text-sm font-bold text-primary">${selesai}/10</span>
      </div>
      <div class="h-2 rounded-full bg-surface-container-high overflow-hidden mb-4">
        <div class="h-full bg-primary transition-all" style="width:${(selesai / 10) * 100}%"></div>
      </div>
      <div class="space-y-2">
        ${LANGKAH_LATIHAN.map((l) => {
          const s = map[l.no]?.selesai;
          return `
            <div class="p-3 rounded-xl ${s ? "bg-green-600/10 border border-green-500/30" : "bg-surface-container"} flex items-start gap-3">
              <button class="chk-langkah w-6 h-6 rounded-full border-2 ${s ? "bg-green-600 border-green-600" : "border-outline-variant"} flex items-center justify-center shrink-0" data-no="${l.no}">
                ${s ? '<span class="material-symbols-outlined text-white text-sm">check</span>' : ""}
              </button>
              <div class="flex-1">
                <p class="text-sm font-medium">${l.no}. ${esc(l.nama)}</p>
                <p class="text-xs text-on-surface-variant mt-0.5">${esc(l.desk)}</p>
              </div>
            </div>`;
        }).join("")}
      </div>
    </div>`;

  c.querySelectorAll(".chk-langkah").forEach((b) =>
    b.addEventListener("click", async () => {
      const no = parseInt(b.dataset.no);
      const existing = map[no];
      if (existing) {
        await updateDoc(doc(db, "progressLatihan", existing.id), { selesai: !existing.selesai, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, "progressLatihan"), {
          siswaUid: ME.uid,
          langkahNo: no,
          selesai: true,
          createdAt: serverTimestamp(),
        });
      }
      renderLatihan();
    })
  );
}

/* =========================================================
 * REKAM SUARA
 * ========================================================= */
async function renderRekam() {
  const c = document.getElementById("tab-content");
  const snap = await getDocs(query(collection(db, "rekamanSuara"), where("siswaUid", "==", ME.uid), orderBy("createdAt", "desc"), limit(20)));
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  c.innerHTML = `
    <div class="glass rounded-2xl p-5">
      <h3 class="font-headline font-semibold mb-4 flex items-center gap-2">
        <span class="material-symbols-outlined text-primary">mic</span> Rekam Suara Latihan
      </h3>

      <div class="text-center py-8 rounded-2xl bg-surface-container mb-4">
        <p id="rekam-timer" class="font-headline font-bold text-5xl text-primary">00:00</p>
        <p id="rekam-status" class="text-sm text-on-surface-variant mt-2">Siap merekam</p>
      </div>

      <div class="flex gap-2 justify-center mb-4">
        <button id="btn-rekam-start" class="px-4 py-2.5 rounded-lg bg-error text-white text-sm font-medium flex items-center gap-1.5">
          <span class="material-symbols-outlined text-sm">fiber_manual_record</span> Mulai Rekam
        </button>
        <button id="btn-rekam-stop" class="px-4 py-2.5 rounded-lg bg-surface-container-high text-sm font-medium hidden">
          <span class="material-symbols-outlined text-sm inline">stop</span> Stop
        </button>
      </div>

      <div class="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-xs text-yellow-400 mb-4">
        Catatan: Rekaman audio disimpan sebagai URL. Setelah direkam, unggah ke Google Drive dan tempel URL-nya.
      </div>

      <button id="btn-add-url" class="w-full py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium">+ Tambah Rekaman via URL</button>

      <div class="mt-4 space-y-2">
        <p class="text-sm font-medium">Riwayat Rekaman</p>
        ${list.length ? list.map((r) => `
          <div class="p-3 rounded-xl bg-surface-container">
            <div class="flex justify-between">
              <div>
                <p class="text-sm font-medium">${esc(r.judul)}</p>
                <p class="text-xs text-on-surface-variant">${waktuRelatif(r.createdAt)} · ${r.durasi || "-"}</p>
              </div>
              <button class="btn-del-rek text-error text-xs" data-id="${r.id}">Hapus</button>
            </div>
            ${r.url ? `<audio controls class="w-full mt-2" style="height:32px"><source src="${esc(r.url)}" /></audio>` : ""}
          </div>
        `).join("") : `<p class="text-sm text-on-surface-variant text-center py-4">Belum ada rekaman</p>`}
      </div>
    </div>`;

  document.getElementById("btn-rekam-start").addEventListener("click", async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      MEDIA_RECORDER = new MediaRecorder(stream);
      RECORDED_CHUNKS = [];
      MEDIA_RECORDER.ondataavailable = (e) => RECORDED_CHUNKS.push(e.data);
      MEDIA_RECORDER.start();

      REKAM_DETIK = 0;
      document.getElementById("rekam-status").textContent = "Merekam...";
      document.getElementById("btn-rekam-start").classList.add("hidden");
      document.getElementById("btn-rekam-stop").classList.remove("hidden");

      TIMER_REKAM = setInterval(() => {
        REKAM_DETIK++;
        const m = Math.floor(REKAM_DETIK / 60);
        const s = REKAM_DETIK % 60;
        document.getElementById("rekam-timer").textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      }, 1000);
    } catch (e) {
      showToast("Tidak dapat mengakses mikrofon.", "error");
    }
  });

  document.getElementById("btn-rekam-stop").addEventListener("click", () => {
    if (MEDIA_RECORDER) {
      MEDIA_RECORDER.stop();
      MEDIA_RECORDER.stream.getTracks().forEach((t) => t.stop());
      clearInterval(TIMER_REKAM);
      document.getElementById("rekam-status").textContent = "Rekaman selesai (" + REKAM_DETIK + "s)";
      document.getElementById("btn-rekam-start").classList.remove("hidden");
      document.getElementById("btn-rekam-stop").classList.add("hidden");
      showToast("Rekaman selesai. Upload ke Drive lalu tambah URL.", "info");
      REKAM_DETIK = 0;
    }
  });

  document.getElementById("btn-add-url").addEventListener("click", () => {
    document.getElementById("modal-title").textContent = "Tambah Rekaman";
    document.getElementById("modal-body").innerHTML = `
      <div class="space-y-3">
        <input id="f-judul" placeholder="Judul (mis: Latihan adegan 1)" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <input id="f-url" type="url" placeholder="URL audio (Google Drive)" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <input id="f-durasi" placeholder="Durasi (mm:ss)" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
        <button id="f-submit" class="w-full py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium">Simpan</button>
      </div>`;
    openModal("modal-form");
    document.getElementById("f-submit").onclick = async () => {
      await addDoc(collection(db, "rekamanSuara"), {
        siswaUid: ME.uid,
        judul: document.getElementById("f-judul").value.trim(),
        url: document.getElementById("f-url").value.trim(),
        durasi: document.getElementById("f-durasi").value.trim(),
        createdAt: serverTimestamp(),
      });
      showToast("Rekaman tersimpan!", "success");
      closeModal("modal-form");
      renderRekam();
    };
  });

  c.querySelectorAll(".btn-del-rek").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Hapus rekaman?")) return;
      await deleteDoc(doc(db, "rekamanSuara", b.dataset.id));
      renderRekam();
    })
  );
}

/* =========================================================
 * BLOCKING SAYA
 * ========================================================= */
async function renderBlocking() {
  const c = document.getElementById("tab-content");
  c.innerHTML = `<div class="glass rounded-2xl p-5">${skeleton(3)}</div>`;

  const snap = await getDocs(query(collection(db, "blocking"), where
