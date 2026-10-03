/**
 * SP-PPT — Modul Broadcast Pesan
 * Fitur: kirim broadcast per peran dengan hak akses sesuai Bagian 12.
 * - Target menyesuaikan pengirim
 * - Format: teks, link, gambar (URL)
 * - Opsi kirim via WhatsApp (wa.me)
 * - Jadwalkan broadcast
 * - Template pesan
 * - Riwayat broadcast
 */

import { auth, db, PERAN_LIST, PERAN_DIVISI } from "./firebase-init.js";
import {
  addDoc, collection, query, where, getDocs, orderBy, serverTimestamp,
  doc, updateDoc, deleteDoc, limit,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { protectPage } from "./router.js";
import {
  showToast, openModal, closeModal, skeleton, formatTanggal, formatWaktu,
  waktuRelatif, esc, warnaPeran, inisial, logActivity,
} from "./utils.js";

let ME = null;
let TAB = "kirim";
let DRAFT = { target: "", format: "teks", pesan: "", judul: "", linkUrl: "", imageUrl: "", viaWA: false, terjadwal: null };
let PENERIMA_PREVIEW = [];

const DIVISI_LIST = [
  "Pengurus Inti", "Artistik", "Perlengkapan", "Publikasi & Dokumentasi",
  "Tata Panggung", "Tata Rias", "Tata Busana", "Tata Musik & Suara", "Pemeran",
];

const KELAS_LIST = ["IX-A", "IX-B", "IX-C", "IX-D", "IX-E", "IX-F"];

/* =========================================================
 * ATURAN HAK BROADCAST PER PERAN (Bagian 12)
 * ========================================================= */
function getAturanBroadcast() {
  const p = ME.profile.peran;
  const r = ME.profile.role;

  if (r === "guru" || r === "admin") {
    return {
      boleh: true,
      nama: r === "admin" ? "Admin" : "Guru Pembina",
      targets: [
        { value: "semua_kelas", label: "Semua Kelas" },
        { value: "kelas", label: "Kelas tertentu" },
        { value: "peran", label: "Peran tertentu" },
        { value: "divisi", label: "Divisi tertentu" },
        { value: "custom", label: "Custom (pilih manual)" },
      ],
      bolehJadwalkan: true,
      bolehWA: true,
    };
  }

  if (p === "Pimpinan Produksi") {
    return {
      boleh: true,
      nama: "Pimpinan Produksi",
      targets: [
        { value: "semua", label: "Semua Siswa" },
        { value: "koordinator", label: "Semua Koordinator" },
        { value: "pemain", label: "Semua Pemain" },
        { value: "divisi", label: "Divisi tertentu" },
        { value: "peran", label: "Peran tertentu" },
        { value: "custom", label: "Custom (pilih manual)" },
      ],
      bolehJadwalkan: true,
      bolehWA: true,
    };
  }

  if (p === "Sekretaris") {
    return {
      boleh: true,
      nama: "Sekretaris",
      targets: [
        { value: "semua", label: "Semua Siswa" },
        { value: "divisi", label: "Divisi tertentu" },
        { value: "peran", label: "Peran tertentu" },
        { value: "custom", label: "Custom (pilih manual)" },
      ],
      bolehJadwalkan: true,
      bolehWA: true,
    };
  }

  if (p === "Sutradara" || p === "Asisten Sutradara") {
    return {
      boleh: true,
      nama: p,
      targets: [
        { value: "pemain", label: "Pemain (default latihan)" },
        { value: "tata_musik", label: "Tata Musik & Suara" },
        { value: "pemain_musik", label: "Pemain + Tata Musik (default)" },
      ],
      bolehJadwalkan: false,
      bolehWA: true,
      locked: true,
    };
  }

  if (p === "Bendahara") {
    return {
      boleh: true,
      nama: "Bendahara",
      targets: [
        { value: "semua", label: "Semua Siswa (info keuangan)" },
        { value: "koordinator", label: "Semua Koordinator (info RAB)" },
        { value: "custom", label: "Custom (pilih manual)" },
      ],
      bolehJadwalkan: false,
      bolehWA: true,
    };
  }

  if (p.startsWith("Koordinator")) {
    return {
      boleh: true,
      nama: p,
      targets: [
        { value: "divisi_saya", label: `Anggota Divisi ${ME.profile.divisi} (terkunci)` },
      ],
      bolehJadwalkan: false,
      bolehWA: true,
      locked: true,
    };
  }

  return { boleh: false };
}

/* =========================================================
 * TABS
 * ========================================================= */
function switchTab(tab) {
  TAB = tab;
  document.querySelectorAll(".tab-btn").forEach((b) => {
    const aktif = b.dataset.tab === tab;
    b.className = `tab-btn px-4 py-2 rounded-xl text-sm font-medium transition ${
      aktif ? "bg-primary-container text-primary" : "text-on-surface-variant hover:bg-surface-container"
    }`;
  });
  if (tab === "kirim") renderKirim();
  if (tab === "riwayat") renderRiwayat();
  if (tab === "template") renderTemplate();
}

/* =========================================================
 * TAB: KIRIM
 * ========================================================= */
function renderKirim() {
  const c = document.getElementById("tab-content");
  const aturan = getAturanBroadcast();

  if (!aturan.boleh) {
    c.innerHTML = `
    <div class="glass rounded-2xl p-10 text-center">
      <span class="material-symbols-outlined text-5xl text-on-surface-variant mb-3">lock</span>
      <p class="text-sm text-on-surface-variant">Anda tidak memiliki hak untuk mengirim broadcast.</p>
      <p class="text-xs text-on-surface-variant mt-2">Hanya Pimpinan, Sekretaris, Sutradara, Asisten, Bendahara, Koordinator, Guru, dan Admin yang dapat broadcast.</p>
    </div>`;
    return;
  }

  c.innerHTML = `
  <div class="glass rounded-2xl p-5 border-l-4 border-secondary">
    <div class="flex items-center gap-2 mb-4">
      <span class="material-symbols-outlined text-secondary">campaign</span>
      <div>
        <h3 class="font-headline font-semibold">Broadcast sebagai ${esc(aturan.nama)}</h3>
        <p class="text-xs text-on-surface-variant">${aturan.locked ? "🔒 Target terkunci sesuai peran Anda" : "Pilih target penerima yang sesuai"}</p>
      </div>
    </div>

    <!-- Judul -->
    <div class="mb-3">
      <label class="text-xs text-on-surface-variant mb-1 block">Judul Broadcast *</label>
      <input id="bc-judul" placeholder="Contoh: Rapat Koordinasi Besok" value="${esc(DRAFT.judul)}"
        class="w-full px-3 py-2.5 rounded-lg bg-surface-container border border-outline-variant text-sm" />
    </div>

    <!-- Target -->
    <div class="mb-3">
      <label class="text-xs text-on-surface-variant mb-1 block">Target Penerima *</label>
      <select id="bc-target" class="w-full px-3 py-2.5 rounded-lg bg-surface-container border border-outline-variant text-sm">
        <option value="">— Pilih target —</option>
        ${aturan.targets.map((t) => `<option value="${t.value}" ${DRAFT.target === t.value ? "selected" : ""}>${t.label}</option>`).join("")}
      </select>
    </div>

    <!-- Sub-target (kondisional) -->
    <div id="bc-subtarget" class="mb-3 hidden">
      <label class="text-xs text-on-surface-variant mb-1 block">Pilih spesifik</label>
      <select id="bc-subtarget-sel" class="w-full px-3 py-2.5 rounded-lg bg-surface-container border border-outline-variant text-sm"></select>
    </div>

    <!-- Custom penerima (jika custom) -->
    <div id="bc-custom" class="mb-3 hidden">
      <label class="text-xs text-on-surface-variant mb-1 block">Pilih siswa (multi)</label>
      <div id="bc-custom-list" class="max-h-60 overflow-y-auto p-2 rounded-lg bg-surface-container border border-outline-variant space-y-1"></div>
      <p id="bc-custom-count" class="text-xs text-on-surface-variant mt-1">0 siswa dipilih</p>
    </div>

    <!-- Format -->
    <div class="mb-3">
      <label class="text-xs text-on-surface-variant mb-1 block">Format Pesan</label>
      <div class="flex flex-wrap gap-2">
        ${[
          { v: "teks", i: "text_fields", l: "Teks" },
          { v: "link", i: "link", l: "Teks + Link" },
          { v: "gambar", i: "image", l: "Teks + Gambar" },
          { v: "kombinasi", i: "auto_awesome", l: "Teks + Link + Gambar" },
        ]
          .map(
            (f) => `
          <button data-format="${f.v}" class="fmt-btn px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 border ${
            DRAFT.format === f.v
              ? "bg-primary-container text-primary border-primary/40"
              : "bg-surface-container text-on-surface-variant border-outline-variant hover:bg-surface-container-high"
          }">
            <span class="material-symbols-outlined text-sm">${f.i}</span>${f.l}
          </button>`
          )
          .join("")}
      </div>
    </div>

    <!-- Pesan -->
    <div class="mb-3">
      <label class="text-xs text-on-surface-variant mb-1 block">Isi Pesan *</label>
      <textarea id="bc-pesan" rows="5" placeholder="Tulis pesan broadcast..."
        class="w-full px-3 py-2.5 rounded-lg bg-surface-container border border-outline-variant text-sm">${esc(DRAFT.pesan)}</textarea>
      <p class="text-[10px] text-on-surface-variant mt-1">
        <span id="bc-count">0</span> karakter
      </p>
    </div>

    <!-- Link URL -->
    <div id="bc-link-wrap" class="${DRAFT.format === "link" || DRAFT.format === "kombinasi" ? "" : "hidden"} mb-3">
      <label class="text-xs text-on-surface-variant mb-1 block">URL Link</label>
      <input id="bc-link" type="url" placeholder="https://..." value="${esc(DRAFT.linkUrl)}"
        class="w-full px-3 py-2.5 rounded-lg bg-surface-container border border-outline-variant text-sm" />
    </div>

    <!-- Gambar URL -->
    <div id="bc-img-wrap" class="${DRAFT.format === "gambar" || DRAFT.format === "kombinasi" ? "" : "hidden"} mb-3">
      <label class="text-xs text-on-surface-variant mb-1 block">URL Gambar</label>
      <input id="bc-img" type="url" placeholder="https://..." value="${esc(DRAFT.imageUrl)}"
        class="w-full px-3 py-2.5 rounded-lg bg-surface-container border border-outline-variant text-sm" />
      <div id="bc-img-preview" class="mt-2"></div>
    </div>

    <!-- Opsi WA -->
    <div class="mb-3 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
      <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" id="bc-via-wa" ${DRAFT.viaWA ? "checked" : ""} class="rounded accent-green-500" />
        <span class="text-green-400 font-medium">Kirim juga via WhatsApp</span>
      </label>
      <p class="text-[10px] text-on-surface-variant mt-1 pl-6">
        Setelah tersimpan di sistem, tombol WA akan muncul untuk meneruskan ke penerima.
      </p>
    </div>

    <!-- Template cepat -->
    <div class="mb-3">
      <label class="text-xs text-on-surface-variant mb-1 block">Template Cepat</label>
      <div id="bc-templates-quick" class="flex flex-wrap gap-1.5"></div>
    </div>

    <!-- Actions -->
    <div class="flex flex-wrap gap-2 pt-2 border-t border-outline-variant/40">
      <button id="btn-preview" class="flex-1 min-w-[160px] py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium flex items-center justify-center gap-1.5">
        <span class="material-symbols-outlined text-sm">preview</span> Pratinjau & Kirim
      </button>
      ${aturan.bolehJadwalkan ? `
      <button id="btn-jadwalkan" class="flex-1 min-w-[160px] py-2.5 rounded-lg bg-secondary text-on-secondary text-sm font-medium flex items-center justify-center gap-1.5">
        <span class="material-symbols-outlined text-sm">schedule</span> Jadwalkan
      </button>` : ""}
      <button id="btn-simpan-template" class="py-2.5 px-4 rounded-lg bg-surface-container-high text-sm font-medium flex items-center justify-center gap-1.5">
        <span class="material-symbols-outlined text-sm">bookmark_add</span> Simpan Template
      </button>
    </div>
  </div>

  <!-- Info aturan -->
  <div class="glass rounded-2xl p-4 mt-4">
    <h4 class="text-xs font-medium text-on-surface-variant mb-2 flex items-center gap-1">
      <span class="material-symbols-outlined text-sm">info</span> Aturan Broadcast Anda
    </h4>
    <ul class="text-[11px] text-on-surface-variant space-y-1 pl-4 list-disc">
      ${aturan.targets.map((t) => `<li>${t.label}</li>`).join("")}
      ${aturan.bolehJadwalkan ? "<li>✅ Dapat dijadwalkan</li>" : "<li>❌ Tidak dapat dijadwalkan</li>"}
    </ul>
  </div>
  `;

  bindKirimEvents(aturan);
  renderTemplateQuick();
  updateCharCount();
}

/* =========================================================
 * BIND EVENTS DI TAB KIRIM
 * ========================================================= */
function bindKirimEvents(aturan) {
  // Format buttons
  document.querySelectorAll(".fmt-btn").forEach((b) =>
    b.addEventListener("click", () => {
      DRAFT.format = b.dataset.format;
      document.querySelectorAll(".fmt-btn").forEach((x) => {
        x.className = `fmt-btn px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 border ${
          x.dataset.format === DRAFT.format
            ? "bg-primary-container text-primary border-primary/40"
            : "bg-surface-container text-on-surface-variant border-outline-variant hover:bg-surface-container-high"
        }`;
      });
      const linkWrap = document.getElementById("bc-link-wrap");
      const imgWrap = document.getElementById("bc-img-wrap");
      linkWrap.classList.toggle("hidden", !["link", "kombinasi"].includes(DRAFT.format));
      imgWrap.classList.toggle("hidden", !["gambar", "kombinasi"].includes(DRAFT.format));
    })
  );

  // Target select
  document.getElementById("bc-target").addEventListener("change", (e) => {
    DRAFT.target = e.target.value;
    const subWrap = document.getElementById("bc-subtarget");
    const customWrap = document.getElementById("bc-custom");
    const subSel = document.getElementById("bc-subtarget-sel");

    subWrap.classList.add("hidden");
    customWrap.classList.add("hidden");

    if (DRAFT.target === "divisi") {
      subSel.innerHTML = DIVISI_LIST.map((d) => `<option value="${d}">${d}</option>`).join("");
      subWrap.classList.remove("hidden");
    } else if (DRAFT.target === "peran") {
      subSel.innerHTML = PERAN_LIST.filter((p) => !["Guru Pembina", "Admin"].includes(p))
        .map((p) => `<option value="${p}">${p}</option>`).join("");
      subWrap.classList.remove("hidden");
    } else if (DRAFT.target === "kelas") {
      subSel.innerHTML = KELAS_LIST.map((k) => `<option value="${k}">${k}</option>`).join("");
      subWrap.classList.remove("hidden");
    } else if (DRAFT.target === "custom") {
      loadCustomList();
      customWrap.classList.remove("hidden");
    }
  });

  // Char count
  document.getElementById("bc-pesan").addEventListener("input", updateCharCount);

  // Preview image
  document.getElementById("bc-img")?.addEventListener("input", (e) => {
    const wrap = document.getElementById("bc-img-preview");
    if (e.target.value) {
      wrap.innerHTML = `<img src="${esc(e.target.value)}" class="max-h-40 rounded-lg border border-outline-variant/40" onerror="this.style.display='none'" />`;
    } else wrap.innerHTML = "";
  });

  // Via WA
  document.getElementById("bc-via-wa").addEventListener("change", (e) => (DRAFT.viaWA = e.target.checked));

  // Preview
  document.getElementById("btn-preview").addEventListener("click", bukaPreview);

  // Jadwalkan
  if (aturan.bolehJadwalkan) {
    document.getElementById("btn-jadwalkan").addEventListener("click", () => {
      if (!validasiForm()) return;
      openModal("modal-jadwal");
    });
  }

  // Simpan template
  document.getElementById("btn-simpan-template").addEventListener("click", () => {
    if (!DRAFT.pesan) { showToast("Isi pesan dulu.", "warning"); return; }
    openModal("modal-template");
  });
}

function updateCharCount() {
  const t = document.getElementById("bc-pesan");
  if (t) {
    document.getElementById("bc-count").textContent = t.value.length;
    DRAFT.pesan = t.value;
  }
}

/* =========================================================
 * LOAD CUSTOM LIST (multi-select siswa)
 * ========================================================= */
async function loadCustomList() {
  const el = document.getElementById("bc-custom-list");
  el.innerHTML = skeleton(4);
  try {
    const snap = await getDocs(query(collection(db, "users"), where("role", "==", "siswa")));
    const list = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    if (!list.length) { el.innerHTML = `<p class="text-xs text-center text-on-surface-variant py-3">Tidak ada siswa</p>`; return; }

    el.innerHTML = list
      .sort((a, b) => (a.nama || "").localeCompare(b.nama || ""))
      .map(
        (s) => `
      <label class="flex items-center gap-2 p-2 rounded hover:bg-surface-container-high cursor-pointer">
        <input type="checkbox" class="custom-chk rounded accent-primary" value="${s.uid}" data-nama="${esc(s.nama)}" />
        <div class="flex-1 min-w-0">
          <p class="text-xs font-medium truncate">${esc(s.nama)}</p>
          <p class="text-[10px] text-on-surface-variant">${esc(s.peran)} · ${esc(s.kelas)}</p>
        </div>
      </label>`
      )
      .join("");

    el.querySelectorAll(".custom-chk").forEach((c) =>
      c.addEventListener("change", () => {
        const n = el.querySelectorAll(".custom-chk:checked").length;
        document.getElementById("bc-custom-count").textContent = `${n} siswa dipilih`;
      })
    );
  } catch (e) {
    el.innerHTML = `<p class="text-xs text-center py-3">Gagal memuat</p>`;
  }
}

/* =========================================================
 * VALIDASI FORM
 * ========================================================= */
function validasiForm() {
  const judul = document.getElementById("bc-judul").value.trim();
  const target = document.getElementById("bc-target").value;
  const pesan = document.getElementById("bc-pesan").value.trim();

  if (!judul) { showToast("Judul wajib diisi.", "warning"); return false; }
  if (!target) { showToast("Pilih target penerima.", "warning"); return false; }
  if (!pesan) { showToast("Isi pesan tidak boleh kosong.", "warning"); return false; }

  if (["link", "kombinasi"].includes(DRAFT.format) && !document.getElementById("bc-link")?.value.trim()) {
    showToast("URL Link wajib diisi untuk format ini.", "warning"); return false;
  }
  if (["gambar", "kombinasi"].includes(DRAFT.format) && !document.getElementById("bc-img")?.value.trim()) {
    showToast("URL Gambar wajib diisi untuk format ini.", "warning"); return false;
  }
  if (DRAFT.target === "custom") {
    const checked = document.querySelectorAll(".custom-chk:checked").length;
    if (!checked) { showToast("Pilih minimal 1 siswa.", "warning"); return false; }
  }
  return true;
}

/* =========================================================
 * HITUNG PENERIMA
 * ========================================================= */
async function hitungPenerima() {
  const target = DRAFT.target;
  const sub = document.getElementById("bc-subtarget-sel")?.value;

  let q;
  if (target === "semua" || target === "semua_kelas") {
    q = query(collection(db, "users"), where("role", "==", "siswa"));
  } else if (target === "koordinator") {
    q = query(collection(db, "users"), where("role", "==", "siswa"), where("peran", "in",
      PERAN_LIST.filter((p) => p.startsWith("Koordinator"))));
  } else if (target === "pemain") {
    q = query(collection(db, "users"), where("role", "==", "siswa"), where("peran", "==", "Pemain"));
  } else if (target === "tata_musik") {
    q = query(collection(db, "users"), where("role", "==", "siswa"), where("divisi", "==", "Tata Musik & Suara"));
  } else if (target === "pemain_musik") {
    q = query(collection(db, "users"), where("role", "==", "siswa"), where("peran", "in",
      ["Pemain", "Koordinator Tata Musik & Suara", "Anggota Tata Musik & Suara"]));
  } else if (target === "divisi") {
    q = query(collection(db, "users"), where("role", "==", "siswa"), where("divisi", "==", sub));
  } else if (target === "divisi_saya") {
    q = query(collection(db, "users"), where("role", "==", "siswa"), where("divisi", "==", ME.profile.divisi));
  } else if (target === "peran") {
    q = query(collection(db, "users"), where("role", "==", "siswa"), where("peran", "==", sub));
  } else if (target === "kelas") {
    q = query(collection(db, "users"), where("role", "==", "siswa"), where("kelas", "==", sub));
  } else if (target === "custom") {
    const uids = Array.from(document.querySelectorAll(".custom-chk:checked")).map((c) => c.value);
    if (!uids.length) return [];
    // Firestore in limit 10, chunk jika perlu
    const chunks = [];
    for (let i = 0; i < uids.length; i += 10) chunks.push(uids.slice(i, i + 10));
    const all = [];
    for (const c of chunks) {
      const snap = await getDocs(query(collection(db, "users"), where("__name__", "in", c)));
      snap.forEach((d) => all.push({ uid: d.id, ...d.data() }));
    }
    return all;
  } else {
    return [];
  }

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

/* =========================================================
 * PREVIEW & KIRIM
 * ========================================================= */
async function bukaPreview() {
  if (!validasiForm()) return;

  DRAFT.judul = document.getElementById("bc-judul").value.trim();
  DRAFT.pesan = document.getElementById("bc-pesan").value.trim();
  DRAFT.linkUrl = document.getElementById("bc-link")?.value.trim() || "";
  DRAFT.imageUrl = document.getElementById("bc-img")?.value.trim() || "";

  const targetLabel = document.getElementById("bc-target").selectedOptions[0].textContent;
  const sub = document.getElementById("bc-subtarget-sel")?.value;
  const targetFull = sub ? `${targetLabel} → ${sub}` : targetLabel;

  showToast("Menghitung penerima...", "info");
  PENERIMA_PREVIEW = await hitungPenerima();

  const preview = document.getElementById("preview-content");
  preview.innerHTML = `
    <div class="p-3 rounded-lg bg-surface-container">
      <p class="text-xs text-on-surface-variant">Judul</p>
      <p class="font-medium">${esc(DRAFT.judul)}</p>
    </div>
    <div class="p-3 rounded-lg bg-surface-container">
      <p class="text-xs text-on-surface-variant">Target</p>
      <p class="font-medium">${esc(targetFull)}</p>
      <p class="text-xs text-primary mt-1">📨 ${PENERIMA_PREVIEW.length} penerima</p>
    </div>
    <div class="p-3 rounded-lg bg-surface-container">
      <p class="text-xs text-on-surface-variant mb-1">Format: ${DRAFT.format}</p>
      ${DRAFT.imageUrl ? `<img src="${esc(DRAFT.imageUrl)}" class="max-h-40 rounded-lg mb-2" onerror="this.style.display='none'" />` : ""}
      <p class="whitespace-pre-wrap">${esc(DRAFT.pesan)}</p>
      ${DRAFT.linkUrl ? `<a href="${esc(DRAFT.linkUrl)}" target="_blank" class="text-primary underline text-xs block mt-2">🔗 ${esc(DRAFT.linkUrl)}</a>` : ""}
    </div>
    ${DRAFT.viaWA ? `<div class="p-2 rounded-lg bg-green-500/10 border border-green-500/30 text-xs text-green-400">✓ Akan disertai tombol kirim WhatsApp</div>` : ""}
  `;

  openModal("modal-preview");
}

/* =========================================================
 * SIMPAN BROADCAST KE FIRESTORE
 * ========================================================= */
async function simpanBroadcast(status = "sent", jadwal = null) {
  DRAFT.judul = document.getElementById("bc-judul").value.trim();
  DRAFT.pesan = document.getElementById("bc-pesan").value.trim();
  DRAFT.linkUrl = document.getElementById("bc-link")?.value.trim() || "";
  DRAFT.imageUrl = document.getElementById("bc-img")?.value.trim() || "";

  const target = document.getElementById("bc-target").value;
  const sub = document.getElementById("bc-subtarget-sel")?.value || "";
  const customUids = target === "custom"
    ? Array.from(document.querySelectorAll(".custom-chk:checked")).map((c) => c.value)
    : [];

  const penerimaUids = PENERIMA_PREVIEW.map((p) => p.uid);

  try {
    const ref = await addDoc(collection(db, "broadcast"), {
      pengirimUid: ME.uid,
      pengirimNama: ME.profile.nama,
      pengirimPeran: ME.profile.peran,
      target,
      targetSub: sub,
      customUids,
      judul: DRAFT.judul,
      format: DRAFT.format,
      pesan: DRAFT.pesan,
      linkUrl: DRAFT.linkUrl,
      imageUrl: DRAFT.imageUrl,
      viaWA: DRAFT.viaWA,
      penerimaUids,
      jumlahPenerima: penerimaUids.length,
      status, // "sent" | "scheduled"
      terjadwal: jadwal, // {tanggal, jam} atau null
      waktu: serverTimestamp(),
    });

    // Buat notifikasi untuk setiap penerima
    for (const p of PENERIMA_PREVIEW) {
      await addDoc(collection(db, "notifikasi"), {
        penerimaUid: p.uid,
        jenis: "Info",
        judul: `📢 ${DRAFT.judul}`,
        pesan: DRAFT.pesan.slice(0, 100) + (DRAFT.pesan.length > 100 ? "..." : ""),
        dari: ME.profile.nama,
        broadcastId: ref.id,
        dibaca: false,
        waktu: serverTimestamp(),
      });
    }

    await logActivity(ME.uid, status === "scheduled" ? "jadwalkan_broadcast" : "kirim_broadcast", ref.id);

    return ref.id;
  } catch (e) {
    console.error(e);
    throw e;
  }
}

/* =========================================================
 * GENERATE PESAN WA
 * ========================================================= */
function generateWAText() {
  let txt = `*📢 ${DRAFT.judul}*\n\n${DRAFT.pesan}`;
  if (DRAFT.linkUrl) txt += `\n\n🔗 ${DRAFT.linkUrl}`;
  txt += `\n\n— ${ME.profile.nama} (${ME.profile.peran})`;
  return txt;
}

/* =========================================================
 * TAB: RIWAYAT
 * ========================================================= */
async function renderRiwayat() {
  const c = document.getElementById("tab-content");
  c.innerHTML = `<div class="glass rounded-2xl p-5">${skeleton(5)}</div>`;

  try {
    const q = ["guru", "admin"].includes(ME.profile.role)
      ? query(collection(db, "broadcast"), orderBy("waktu", "desc"), limit(50))
      : query(collection(db, "broadcast"), where("pengirimUid", "==", ME.uid), orderBy("waktu", "desc"), limit(50));

    const snap = await getDocs(q);
    if (snap.empty) {
      c.innerHTML = `
      <div class="glass rounded-2xl p-10 text-center">
        <span class="material-symbols-outlined text-5xl text-on-surface-variant mb-3">campaign</span>
        <p class="text-sm text-on-surface-variant">Belum ada riwayat broadcast</p>
      </div>`;
      return;
    }

    c.innerHTML = `
    <div class="glass rounded-2xl p-5">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-headline font-semibold">Riwayat Broadcast</h3>
        <span class="text-xs text-on-surface-variant">${snap.size} total</span>
      </div>
      <div class="space-y-3">
        ${snap.docs.map((d) => {
          const b = d.data();
          const badgeStatus = b.status === "scheduled"
            ? `<span class="text-[10px] px-2 py-0.5 rounded-full bg-secondary/20 text-secondary">Terjadwal</span>`
            : `<span class="text-[10px] px-2 py-0.5 rounded-full bg-green-600/20 text-green-400">Terkirim</span>`;
          return `
          <div class="p-4 rounded-xl bg-surface-container border-l-4 border-secondary">
            <div class="flex items-start justify-between gap-2 flex-wrap">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap mb-1">
                  <h4 class="font-medium text-sm">${esc(b.judul)}</h4>
                  ${badgeStatus}
                  <span class="text-[10px] text-on-surface-variant">${esc(b.format)}</span>
                </div>
                <p class="text-xs text-on-surface-variant line-clamp-2">${esc(b.pesan)}</p>
                <div class="flex flex-wrap gap-2 mt-2 text-[10px] text-on-surface-variant">
                  <span>👤 ${esc(b.pengirimNama)} (${esc(b.pengirimPeran)})</span>
                  <span>🎯 ${esc(b.target)}${b.targetSub ? " → " + esc(b.targetSub) : ""}</span>
                  <span>📨 ${b.jumlahPenerima || 0} penerima</span>
                  <span>⏰ ${waktuRelatif(b.waktu)}</span>
                  ${b.terjadwal ? `<span>🗓️ Jadwal: ${esc(b.terjadwal.tanggal)} ${esc(b.terjadwal.jam)}</span>` : ""}
                </div>
                ${b.imageUrl ? `<img src="${esc(b.imageUrl)}" class="max-h-32 rounded mt-2" onerror="this.style.display='none'" />` : ""}
              </div>
              ${b.imageUrl || b.linkUrl || true ? `<button class="btn-wa-riwayat px-2 py-1 rounded-lg bg-green-600 text-white text-[10px]" data-id="${d.id}">WA</button>` : ""}
            </div>
          </div>`;
        }).join("")}
      </div>
    </div>`;

    // Bind WA buttons
    c.querySelectorAll(".btn-wa-riwayat").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const bId = btn.dataset.id;
        const bSnap = await getDocs(query(collection(db, "broadcast"), where("__name__", "==", bId)));
        if (bSnap.empty) return;
        const b = bSnap.docs[0].data();
        let txt = `*📢 ${b.judul}*\n\n${b.pesan}`;
        if (b.linkUrl) txt += `\n\n🔗 ${b.linkUrl}`;
        txt += `\n\n— ${b.pengirimNama}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, "_blank");
      })
    );
  } catch (e) {
    console.error(e);
    c.innerHTML = `<div class="glass rounded-2xl p-10 text-center"><p class="text-sm text-on-surface-variant">Gagal memuat riwayat.</p></div>`;
  }
}

/* =========================================================
 * TAB: TEMPLATE
 * ========================================================= */
const TEMPLATE_DEFAULT = [
  { nama: "Rapat Koordinasi", isi: "Diberitahukan kepada seluruh koordinator divisi bahwa akan diadakan rapat koordinasi pada:\n\n📅 Tanggal: [tanggal]\n⏰ Waktu: [jam]\n📍 Lokasi: [lokasi]\n\nAgenda: [agenda]\n\nMohon hadir tepat waktu. Terima kasih." },
  { nama: "Latihan Rutin", isi: "Reminder latihan rutin teater:\n\n📅 Tanggal: [tanggal]\n⏰ Waktu: [jam]\n📍 Lokasi: [lokasi]\n\nMembawa: naskah, alat tulis, dan air minum.\n\nMohon hadir tepat waktu. Terima kasih." },
  { nama: "Gladi Resik", isi: "⚠️ GLADI RESIK\n\nHari ini, [tanggal] pukul [jam] di [lokasi].\n\nSeluruh pemain dan tim wajib hadir 30 menit sebelum acara dimulai.\n\nMembawa kostum & properti masing-masing.\n\nTerima kasih." },
  { nama: "Hari-H Pementasan", isi: "🎭 HARI PEMENTASAN 🎭\n\nSegera persiapkan:\n• Kostum & rias\n• Properti yang dibutuhkan\n• Cek sound dan pencahayaan\n\nKumpul di backstage pukul [jam].\n\nBreak a leg! 🎬" },
  { nama: "Deadline Tugas", isi: "⏰ PENGINGAT DEADLINE\n\nTugas: [nama tugas]\nDeadline: [tanggal] [jam]\n\nMohon segera diselesaikan. Jika ada kendala, hubungi koordinator.\n\nTerima kasih." },
  { nama: "Terima Kasih", isi: "Terima kasih atas kerja sama dan dedikasi seluruh tim dalam produksi teater kali ini. Kalian luar biasa! 🎭✨\n\nSampai jumpa di produksi berikutnya." },
];

async function renderTemplate() {
  const c = document.getElementById("tab-content");
  c.innerHTML = `<div class="glass rounded-2xl p-5">${skeleton(5)}</div>`;

  let templates = [...TEMPLATE_DEFAULT];
  try {
    const snap = await getDocs(query(collection(db, "templates"), where("pembuatUid", "==", ME.uid)));
    templates = [...TEMPLATE_DEFAULT, ...snap.docs.map((d) => ({ id: d.id, ...d.data(), custom: true }))];
  } catch (e) {}

  c.innerHTML = `
  <div class="glass rounded-2xl p-5">
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-headline font-semibold">Template Pesan</h3>
      <button id="btn-tambah-template" class="px-3 py-2 rounded-lg bg-primary text-on-primary text-xs font-medium">+ Buat Baru</button>
    </div>
    <div class="space-y-3">
      ${templates.map((t, i) => `
        <div class="p-4 rounded-xl bg-surface-container border border-outline-variant/40">
          <div class="flex items-start justify-between gap-2 mb-2">
            <h4 class="font-medium text-sm flex items-center gap-2">
              ${t.custom ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-primary-container text-primary">Saya</span>' : ''}
              ${esc(t.nama)}
            </h4>
            <div class="flex gap-1">
              <button class="btn-pakai-template px-2 py-1 rounded text-[10px] bg-primary-container text-primary" data-i="${i}">Pakai</button>
              ${t.custom ? `<button class="btn-hapus-template px-2 py-1 rounded text-[10px] bg-error/20 text-error" data-id="${t.id}">Hapus</button>` : ""}
            </div>
          </div>
          <p class="text-xs text-on-surface-variant whitespace-pre-wrap line-clamp-4">${esc(t.isi)}</p>
        </div>
      `).join("")}
    </div>
  </div>`;

  c.querySelectorAll(".btn-pakai-template").forEach((b) =>
    b.addEventListener("click", () => {
      const t = templates[parseInt(b.dataset.i)];
      DRAFT.pesan = t.isi;
      showToast(`Template "${t.nama}" siap digunakan.`, "success");
      switchTab("kirim");
    })
  );

  c.querySelectorAll(".btn-hapus-template").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Hapus template ini?")) return;
      try {
        await deleteDoc(doc(db, "templates", b.dataset.id));
        showToast("Template dihapus.", "success");
        renderTemplate();
      } catch (e) { showToast("Gagal hapus.", "error"); }
    })
  );

  document.getElementById("btn-tambah-template").addEventListener("click", () => openModal("modal-template"));
}

function renderTemplateQuick() {
  const el = document.getElementById("bc-templates-quick");
  if (!el) return;
  el.innerHTML = TEMPLATE_DEFAULT.slice(0, 4).map((t, i) => `
    <button class="quick-tpl px-2.5 py-1.5 rounded-lg bg-surface-container-high text-[11px] hover:bg-surface-container-highest" data-i="${i}">${esc(t.nama)}</button>
  `).join("");

  el.querySelectorAll(".quick-tpl").forEach((b) =>
    b.addEventListener("click", () => {
      const t = TEMPLATE_DEFAULT[parseInt(b.dataset.i)];
      document.getElementById("bc-pesan").value = t.isi;
      updateCharCount();
      showToast(`Template "${t.nama}" dimuat.`, "success");
    })
  );
}

/* =========================================================
 * INIT
 * ========================================================= */
(async function init() {
  const { uid, profile } = await protectPage();
  ME = { uid, profile };

  // Sidebar
  const menu = [
    { icon: "dashboard", label: "Dashboard", href: "dashboard.html" },
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
      m.href === "broadcast.html" ? "bg-primary-container text-primary font-medium" : "text-on-surface-variant hover:bg-surface-container"
    }">
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
    { icon: "campaign", label: "Broadcast", href: "broadcast.html" },
    { icon: "groups", label: "Kerabat", href: "struktur.html" },
  ].map((i) => `<a href="${i.href}" class="flex flex-col items-center justify-center py-2 text-[10px] gap-0.5 ${
    i.href === "broadcast.html" ? "text-primary" : "text-on-surface-variant"
  }"><span class="material-symbols-outlined text-xl">${i.icon}</span>${i.label}</a>`).join("");

  // Theme
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

  // Logout
  document.getElementById("btn-logout").addEventListener("click", async () => {
    if (confirm("Keluar dari aplikasi?")) {
      await logActivity(ME.uid, "logout");
      await signOut(auth);
      window.location.replace("index.html");
    }
  });

  // Mobile menu
  document.getElementById("btn-menu").addEventListener("click", () => {
    const sb = document.getElementById("sidebar");
    sb.classList.toggle("hidden");
    sb.classList.toggle("flex");
  });

  // Tabs
  document.querySelectorAll(".tab-btn").forEach((b) =>
    b.addEventListener("click", () => switchTab(b.dataset.tab))
  );

  // Konfirmasi kirim
  document.getElementById("btn-konfirmasi-kirim").addEventListener("click", async () => {
    const btn = document.getElementById("btn-konfirmasi-kirim");
    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-outlined animate-spin text-sm">progress_activity</span> Mengirim...`;
    try {
      await simpanBroadcast("sent");
      closeModal("modal-preview");
      showToast(`Broadcast terkirim ke ${PENERIMA_PREVIEW.length} penerima!`, "success");
      // Tawarkan WA
      if (DRAFT.viaWA) {
        setTimeout(() => {
          if (confirm("Buka WhatsApp untuk meneruskan broadcast?")) {
            window.open(`https://wa.me/?text=${encodeURIComponent(generateWAText())}`, "_blank");
          }
        }, 500);
      }
      // Reset
      DRAFT = { target: "", format: "teks", pesan: "", judul: "", linkUrl: "", imageUrl: "", viaWA: false, terjadwal: null };
      PENERIMA_PREVIEW = [];
      switchTab("kirim");
    } catch (e) {
      showToast("Gagal mengirim broadcast.", "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<span class="material-symbols-outlined text-sm">send</span> Kirim Sekarang`;
    }
  });

  // Konfirmasi jadwal
  document.getElementById("btn-konfirmasi-jadwal").addEventListener("click", async () => {
    const tanggal = document.getElementById("jd-tanggal").value;
    const jam = document.getElementById("jd-jam").value;
    if (!tanggal || !jam) { showToast("Isi tanggal & jam.", "warning"); return; }

    try {
      PENERIMA_PREVIEW = await hitungPenerima();
      await simpanBroadcast("scheduled", { tanggal, jam });
      closeModal("modal-jadwal");
      closeModal("modal-preview");
      showToast(`Broadcast dijadwalkan untuk ${tanggal} ${jam}`, "success");
      DRAFT = { target: "", format: "teks", pesan: "", judul: "", linkUrl: "", imageUrl: "", viaWA: false, terjadwal: null };
      PENERIMA_PREVIEW = [];
      switchTab("riwayat");
    } catch (e) { showToast("Gagal menjadwalkan.", "error"); }
  });

  // Simpan template
  document.getElementById("btn-simpan-template").addEventListener("click", async () => {
    const nama = document.getElementById("tp-nama").value.trim();
    const isi = document.getElementById("tp-isi").value.trim();
    if (!nama || !isi) { showToast("Isi nama & isi template.", "warning"); return; }
    try {
      await addDoc(collection(db, "templates"), { nama, isi, pembuatUid: ME.uid, createdAt: serverTimestamp() });
      showToast("Template tersimpan!", "success");
      closeModal("modal-template");
      document.getElementById("tp-nama").value = "";
      document.getElementById("tp-isi").value = "";
      if (TAB === "template") renderTemplate();
    } catch (e) { showToast("Gagal simpan template.", "error"); }
  });

  // Isi default form template dari draft saat ini
  document.getElementById("modal-template").addEventListener("click", (e) => {
    if (e.target.id === "modal-template" || e.target.dataset.closeModal !== undefined) {
      const isiField = document.getElementById("tp-isi");
      if (isiField && !isiField.value && DRAFT.pesan) isiField.value = DRAFT.pesan;
    }
  });

  switchTab("kirim");
})();
