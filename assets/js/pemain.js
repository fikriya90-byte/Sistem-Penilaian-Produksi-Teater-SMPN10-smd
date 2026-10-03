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

  const snap = await getDocs(query(collection(db, "blocking"), where("kelas", "==", ME.profile.kelas)));

  // Cari posisi saya
  const blokirSaya = [];
  snap.docs.forEach((d) => {
    const b = d.data();
    Object.entries(b.posisi || {}).forEach(([cell, p]) => {
      if (p.uid === ME.uid) blokirSaya.push({ adegan: b.adegan, cell: parseInt(cell), nama: p.nama });
    });
  });

  // Grouping per adegan
  const perAdegan = {};
  blokirSaya.forEach((b) => {
    if (!perAdegan[b.adegan]) perAdegan[b.adegan] = [];
    perAdegan[b.adegan].push(b.cell);
  });

  c.innerHTML = `
    <div class="glass rounded-2xl p-5">
      <h3 class="font-headline font-semibold mb-4 flex items-center gap-2">
        <span class="material-symbols-outlined text-primary">directions_walk</span> Blocking Saya
      </h3>
      ${Object.keys(perAdegan).length ? Object.entries(perAdegan).map(([adegan, cells]) => `
        <div class="p-3 rounded-xl bg-surface-container mb-3">
          <p class="text-sm font-medium mb-2">${esc(adegan)}</p>
          <div class="grid grid-cols-3 gap-1 max-w-xs">
            ${Array.from({ length: 9 }).map((_, i) => `
              <div class="aspect-square rounded ${cells.includes(i) ? "bg-primary text-on-primary" : "bg-surface-container-high"} border border-outline-variant/40 flex items-center justify-center text-[10px] font-medium">
                ${cells.includes(i) ? "SAYA" : ""}
              </div>
            `).join("")}
          </div>
          <p class="text-[10px] text-on-surface-variant mt-2">Anda berada di area: ${cells.map((c) => c + 1).join(", ")}</p>
        </div>
      `).join("") : `<p class="text-sm text-on-surface-variant text-center py-8">Belum ada blocking yang melibatkan Anda</p>`}
      <p class="text-[10px] text-on-surface-variant mt-2 text-center">Data dari Asisten Sutradara</p>
    </div>`;
}

/* =========================================================
 * REFLEKSI DIRI
 * ========================================================= */
async function renderRefleksi() {
  const c = document.getElementById("tab-content");
  const snap = await getDocs(query(collection(db, "refleksi"), where("siswaUid", "==", ME.uid)));
  const refleksi = snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };

  c.innerHTML = `
    <div class="glass rounded-2xl p-5 border-l-4 border-secondary">
      <h3 class="font-headline font-semibold mb-4 flex items-center gap-2">
        <span class="material-symbols-outlined text-secondary">psychology</span> Refleksi Diri (Tahap Pasca)
      </h3>
      <div class="space-y-3">
        <div>
          <label class="text-xs text-on-surface-variant mb-1 block">Apa yang sudah baik dalam penampilan saya?</label>
          <textarea id="r-baik" rows="3" placeholder="Tuliskan hal positif..." class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm">${esc(refleksi?.baik || "")}</textarea>
        </div>
        <div>
          <label class="text-xs text-on-surface-variant mb-1 block">Apa yang perlu saya perbaiki?</label>
          <textarea id="r-perbaiki" rows="3" placeholder="Tuliskan hal yang perlu diperbaiki..." class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm">${esc(refleksi?.perbaiki || "")}</textarea>
        </div>
        <div>
          <label class="text-xs text-on-surface-variant mb-1 block">Target saya ke depan</label>
          <textarea id="r-target" rows="3" placeholder="Target untuk produksi berikutnya..." class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm">${esc(refleksi?.target || "")}</textarea>
        </div>
        <div>
          <label class="text-xs text-on-surface-variant mb-1 block">Rating kepuasan diri (1-5)</label>
          <input id="r-rating" type="range" min="1" max="5" value="${refleksi?.rating || 3}" class="w-full accent-primary" />
          <p class="text-xs text-center text-on-surface-variant mt-1">Nilai: <span id="r-rating-val">${refleksi?.rating || 3}</span></p>
        </div>
        <button id="btn-simpan-refleksi" class="w-full py-2.5 rounded-lg bg-secondary text-on-secondary text-sm font-medium">
          ${refleksi ? "Update Refleksi" : "Simpan Refleksi"}
        </button>
      </div>
      ${refleksi ? `<p class="text-[10px] text-on-surface-variant text-center mt-3">Terakhir diperbarui: ${waktuRelatif(refleksi.updatedAt || refleksi.createdAt)}</p>` : ""}
    </div>`;

  document.getElementById("r-rating").addEventListener("input", (e) => (document.getElementById("r-rating-val").textContent = e.target.value));

  document.getElementById("btn-simpan-refleksi").addEventListener("click", async () => {
    const data = {
      siswaUid: ME.uid,
      nama: ME.profile.nama,
      kelas: ME.profile.kelas,
      baik: document.getElementById("r-baik").value.trim(),
      perbaiki: document.getElementById("r-perbaiki").value.trim(),
      target: document.getElementById("r-target").value.trim(),
      rating: parseInt(document.getElementById("r-rating").value),
      updatedAt: serverTimestamp(),
    };

    try {
      if (refleksi) {
        await updateDoc(doc(db, "refleksi", refleksi.id), data);
      } else {
        data.createdAt = serverTimestamp();
        await addDoc(collection(db, "refleksi"), data);
      }
      await logActivity(ME.uid, "simpan_refleksi");
      showToast("Refleksi tersimpan!", "success");
      renderRefleksi();
    } catch (e) { showToast("Gagal simpan refleksi.", "error"); }
  });
}

/* =========================================================
 * CASTING / PERAN SAYA
 * ========================================================= */
async function renderCasting() {
  const c = document.getElementById("tab-content");
  c.innerHTML = `<div class="glass rounded-2xl p-5">${skeleton(3)}</div>`;

  const snap = await getDocs(query(collection(db, "casting"), where("pemainUid", "==", ME.uid)));

  if (snap.empty) {
    c.innerHTML = `
      <div class="glass rounded-2xl p-10 text-center">
        <span class="material-symbols-outlined text-5xl text-on-surface-variant mb-3">theater_comedy</span>
        <p class="text-sm text-on-surface-variant">Belum ada casting untuk Anda</p>
        <p class="text-xs mt-1">Hubungi Sutradara untuk informasi casting</p>
      </div>`;
    return;
  }

  const cast = { id: snap.docs[0].id, ...snap.docs[0].data() };

  c.innerHTML = `
    <div class="glass rounded-2xl p-5 border-l-4 border-secondary">
      <h3 class="font-headline font-semibold mb-4 flex items-center gap-2">
        <span class="material-symbols-outlined text-secondary">theater_comedy</span> Peran Saya
      </h3>
      <div class="p-4 rounded-xl bg-secondary/10 border border-secondary/30">
        <p class="text-xs text-secondary">TOKOH</p>
        <p class="font-headline font-bold text-2xl mt-1">${esc(cast.tokoh)}</p>
        <p class="text-sm text-on-surface-variant mt-2">${esc(cast.deskripsi || "Tidak ada deskripsi")}</p>
        <div class="mt-3">
          <span class="text-[10px] px-2 py-0.5 rounded-full ${
            cast.status === "Final" ? "bg-green-600/20 text-green-400" :
            cast.status === "Cadangan" ? "bg-yellow-500/20 text-yellow-400" : "bg-blue-500/20 text-blue-400"
          }">${esc(cast.status)}</span>
        </div>
      </div>
      <div class="mt-4 p-3 rounded-xl bg-surface-container text-xs">
        <p class="font-medium mb-1">Tips Persiapkan Peran:</p>
        <ul class="space-y-1 text-on-surface-variant pl-4 list-disc">
          <li>Baca naskah lengkap minimal 3 kali</li>
          <li>Buat profil karakter (umur, sifat, latar belakang)</li>
          <li>Latihan dialog dengan rekan secara rutin</li>
          <li>Diskusikan interpretasi dengan Sutradara</li>
        </ul>
      </div>
    </div>`;
}

/* =========================================================
 * INIT
 * ========================================================= */
(async function init() {
  const { uid, profile } = await protectPage();
  ME = { uid, profile };

  if (profile.peran !== "Pemain") {
    document.getElementById("tab-content").innerHTML = `
      <div class="glass rounded-2xl p-10 text-center">
        <span class="material-symbols-outlined text-5xl text-on-surface-variant mb-3">lock</span>
        <p class="text-sm">Halaman ini khusus untuk Pemain.</p>
        <a href="dashboard.html" class="inline-block mt-3 px-4 py-2 rounded-lg bg-primary text-on-primary text-sm">Kembali</a>
      </div>`;
    return;
  }

  const menu = [
    { icon: "dashboard", label: "Dashboard", href: "dashboard.html" },
    { icon: "theater_comedy", label: "Panel Pemain", href: "pemain.html" },
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
      m.href === "pemain.html" ? "bg-primary-container text-primary font-medium" : "text-on-surface-variant hover:bg-surface-container"
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
  ].map((i) => `<a href="${i.href}" class="flex flex-col items-center justify-center py-2 text-[10px] gap-0.5 text-on-surface-variant"><span class="material-symbols-outlined text-xl">${i.icon}</span>${i.label}</a>`).join("");

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

  switchTab("naskah");
})();
