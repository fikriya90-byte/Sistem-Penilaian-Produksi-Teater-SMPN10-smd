/**
 * SP-PPT — Modul Notifikasi (Lengkap)
 * - Realtime listener ke collection `notifikasi`
 * - Panel slide kanan dengan search & filter
 * - Fitur: mark read, tandai semua dibaca, redirect ke link
 * - Integrasi ke semua modul yang kirim notifikasi
 */

import { db } from "./firebase-init.js";
import {
  collection, query, where, onSnapshot, doc, updateDoc, getDocs,
  writeBatch, limit, serverTimestamp, addDoc, orderBy,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast, esc, waktuRelatif } from "./utils.js";

/* =========================================================
 * JENIS NOTIFIKASI & STYLING
 * ========================================================= */
export const JENIS_NOTIF = {
  Tugas: { icon: "assignment", dot: "bg-blue-500", label: "Tugas" },
  Instruksi: { icon: "campaign", dot: "bg-purple-500", label: "Instruksi" },
  Info: { icon: "info", dot: "bg-green-500", label: "Info" },
  Reminder: { icon: "schedule", dot: "bg-yellow-500", label: "Reminder" },
  Urgent: { icon: "priority_high", dot: "bg-red-500", label: "Urgent" },
  Feedback: { icon: "reviews", dot: "bg-cyan-500", label: "Feedback" },
};

/* =========================================================
 * STATE
 * ========================================================= */
let ME = null;
let UNSUB = null;
let SEMUA_NOTIF = [];
let FILTER_JENIS = "semua";
let SEARCH_KEYWORD = "";

/* =========================================================
 * INIT — dipanggil dari module yang butuh notifikasi
 * ========================================================= */
export function initNotifikasi(uid, profile) {
  try {
    ME = { uid, profile };
    attachListener();
    attachUI();
  } catch (e) {
    console.warn("[Notif] Init gagal:", e);
  }
}

/* =========================================================
 * ATTACH FIRESTORE LISTENER
 * ========================================================= */
function attachListener() {
  if (!ME) return;
  if (UNSUB) { try { UNSUB(); } catch (_) {} }

  const q = query(
    collection(db, "notifikasi"),
    where("penerimaUid", "==", ME.uid),
    orderBy("waktu", "desc"),
    limit(100)
  );

  try {
    UNSUB = onSnapshot(q, (snap) => {
      SEMUA_NOTIF = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      updateBadge();
      if (isPanelOpen()) renderList();
    }, (err) => {
      console.warn("[Notif] Snapshot error, fallback:", err.message);
      loadFallback();
    });
  } catch (e) {
    console.warn("[Notif] onSnapshot gagal:", e);
    loadFallback();
  }
}

async function loadFallback() {
  if (!ME) return;
  try {
    const snap = await getDocs(query(
      collection(db, "notifikasi"),
      where("penerimaUid", "==", ME.uid),
      orderBy("waktu", "desc"),
      limit(100)
    ));
    SEMUA_NOTIF = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    updateBadge();
    if (isPanelOpen()) renderList();
  } catch (e) {
    console.warn("[Notif] Fallback gagal:", e);
  }
}

/* =========================================================
 * UPDATE BADGE (count notif belum dibaca)
 * ========================================================= */
function updateBadge() {
  const badge = document.getElementById("notif-badge");
  if (!badge) return;
  
  const unread = SEMUA_NOTIF.filter((n) => !n.dibaca).length;
  if (unread > 0) {
    badge.textContent = unread > 99 ? "99+" : String(unread);
    badge.classList.remove("hidden");
    badge.classList.add("flex");
  } else {
    badge.classList.add("hidden");
    badge.classList.remove("flex");
  }

  // Update header count
  const hCount = document.getElementById("notif-header-count");
  if (hCount) {
    hCount.textContent = `(${SEMUA_NOTIF.length})`;
  }

  // Update filter chips count
  document.querySelectorAll("[data-notif-count]").forEach((el) => {
    const filter = el.dataset.notifCount;
    let count = 0;
    if (filter === "semua") count = SEMUA_NOTIF.length;
    else if (filter === "belum") count = SEMUA_NOTIF.filter((n) => !n.dibaca).length;
    else count = SEMUA_NOTIF.filter((n) => n.jenis === filter).length;
    el.textContent = count > 0 ? `(${count})` : "";
  });
}

/* =========================================================
 * PANEL OPEN/CLOSE
 * ========================================================= */
function isPanelOpen() {
  const p = document.getElementById("notif-panel");
  return p && !p.classList.contains("hidden");
}

export function bukaPanelNotif() {
  const panel = document.getElementById("notif-panel");
  const drawer = document.getElementById("notif-drawer");
  if (!panel || !drawer) return;
  panel.classList.remove("hidden");
  panel.classList.add("flex");
  requestAnimationFrame(() => drawer.classList.remove("translate-x-full"));
  renderList();
}

export function tutupPanelNotif() {
  const panel = document.getElementById("notif-panel");
  const drawer = document.getElementById("notif-drawer");
  if (!panel || !drawer) return;
  drawer.classList.add("translate-x-full");
  setTimeout(() => panel.classList.add("hidden"), 300);
}

/* =========================================================
 * RENDER LIST
 * ========================================================= */
function renderList() {
  const el = document.getElementById("notif-list");
  if (!el) return;

  // Filter
  let list = [...SEMUA_NOTIF];
  if (FILTER_JENIS === "belum") {
    list = list.filter((n) => !n.dibaca);
  } else if (FILTER_JENIS !== "semua") {
    list = list.filter((n) => n.jenis === FILTER_JENIS);
  }

  // Search
  if (SEARCH_KEYWORD) {
    const kw = SEARCH_KEYWORD.toLowerCase();
    list = list.filter((n) =>
      (n.judul || "").toLowerCase().includes(kw) ||
      (n.pesan || "").toLowerCase().includes(kw)
    );
  }

  if (!list.length) {
    el.innerHTML = `
      <div class="text-center py-12 text-on-surface-variant">
        <span class="material-symbols-outlined text-5xl block mb-3 opacity-40">notifications_off</span>
        <p class="text-sm">${SEARCH_KEYWORD ? "Tidak ada hasil pencarian" : "Tidak ada notifikasi"}</p>
      </div>`;
    return;
  }

  el.innerHTML = list.map((n) => {
    const meta = JENIS_NOTIF[n.jenis] || JENIS_NOTIF.Info;
    const unread = !n.dibaca;
    return `
    <div class="notif-item p-3 rounded-xl border transition-all cursor-pointer ${
      unread ? "bg-primary-container/20 border-primary/40" : "bg-surface-container border-outline-variant/30"
    }" data-id="${esc(n.id)}" ${n.link ? `data-link="${esc(n.link)}"` : ""}>
      <div class="flex items-start gap-3">
        <div class="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center shrink-0">
          <span class="material-symbols-outlined text-lg" style="color: var(--icon-color);">${meta.icon}</span>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-start justify-between gap-2">
            <p class="text-sm font-medium ${unread ? "text-on-surface" : "text-on-surface-variant"} leading-tight">${esc(n.judul || "-")}</p>
            ${unread ? `<span class="w-2 h-2 rounded-full ${meta.dot} shrink-0 mt-1.5"></span>` : ""}
          </div>
          <p class="text-xs text-on-surface-variant mt-1 line-clamp-2">${esc(n.pesan || "")}</p>
          <div class="flex items-center gap-2 mt-2 text-[10px] text-on-surface-variant">
            <span class="px-1.5 py-0.5 rounded bg-surface-container text-[10px] font-medium">${esc(meta.label)}</span>
            ${n.dari ? `<span>· ${esc(n.dari)}</span>` : ""}
            <span>· ${waktuRelatif(n.waktu)}</span>
          </div>
        </div>
      </div>
    </div>`;
  }).join("");

  // Bind events
  el.querySelectorAll(".notif-item").forEach((item) => {
    item.addEventListener("click", async () => {
      const id = item.dataset.id;
      const link = item.dataset.link;
      const n = SEMUA_NOTIF.find((x) => x.id === id);
      if (n && !n.dibaca) {
        await markRead([id], true);
      }
      if (link) {
        setTimeout(() => {
          tutupPanelNotif();
          window.location.href = link;
        }, 200);
      }
    });
  });
}

/* =========================================================
 * MARK READ
 * ========================================================= */
async function markRead(ids, silent = false) {
  if (!ids.length) return;
  try {
    const batch = writeBatch(db);
    ids.forEach((id) => {
      batch.update(doc(db, "notifikasi", id), {
        dibaca: true,
        dibacaPada: serverTimestamp(),
      });
    });
    await batch.commit();
    if (!silent) showToast(`${ids.length} notifikasi ditandai dibaca`, "success");
  } catch (e) {
    if (!silent) showToast("Gagal tandai dibaca", "error");
  }
}

export async function markSemuaDibaca() {
  const unreadIds = SEMUA_NOTIF.filter((n) => !n.dibaca).map((n) => n.id);
  if (!unreadIds.length) return showToast("Semua sudah dibaca", "info");
  await markRead(unreadIds);
}

export async function getJumlahBelumDibaca() {
  return SEMUA_NOTIF.filter((n) => !n.dibaca).length;
}

/* =========================================================
 * ATTACH UI EVENTS
 * ========================================================= */
function attachUI() {
  // Bell button
  const bell = document.getElementById("btn-notif");
  if (bell && !bell.dataset.bound) {
    bell.dataset.bound = "1";
    bell.addEventListener("click", bukaPanelNotif);
  }

  // Close button
  const btnClose = document.getElementById("btn-notif-close");
  if (btnClose && !btnClose.dataset.bound) {
    btnClose.dataset.bound = "1";
    btnClose.addEventListener("click", tutupPanelNotif);
  }

  // Mark all
  const btnAll = document.getElementById("btn-mark-all");
  if (btnAll && !btnAll.dataset.bound) {
    btnAll.dataset.bound = "1";
    btnAll.addEventListener("click", markSemuaDibaca);
  }

  // Backdrop
  const backdrop = document.getElementById("notif-backdrop");
  if (backdrop && !backdrop.dataset.bound) {
    backdrop.dataset.bound = "1";
    backdrop.addEventListener("click", tutupPanelNotif);
  }

  // Search
  const search = document.getElementById("notif-search");
  if (search && !search.dataset.bound) {
    search.dataset.bound = "1";
    search.addEventListener("input", (e) => {
      SEARCH_KEYWORD = e.target.value.trim();
      renderList();
    });
  }

  // Filter chips
  document.querySelectorAll("[data-notif-filter]").forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = "1";
    b.addEventListener("click", () => {
      FILTER_JENIS = b.dataset.notifFilter;
      document.querySelectorAll("[data-notif-filter]").forEach((x) => {
        const aktif = x.dataset.notifFilter === FILTER_JENIS;
        x.className = `notif-filter-chip px-3 py-1.5 rounded-full text-xs font-medium transition whitespace-nowrap ${
          aktif ? "bg-primary-container text-primary border border-primary/40" : "bg-surface-container text-on-surface-variant border border-outline-variant/40"
        }`;
      });
      renderList();
    });
  });
}

/* =========================================================
 * EXPORT: KIRIM NOTIFIKASI
 * ========================================================= */
export async function kirimNotifikasi({
  penerimaUid, jenis = "Info", judul, pesan, dari = "", link = "", extra = {},
}) {
  try {
    await addDoc(collection(db, "notifikasi"), {
      penerimaUid,
      jenis,
      judul,
      pesan,
      dari,
      link,
      dibaca: false,
      waktu: serverTimestamp(),
      ...extra,
    });
    return true;
  } catch (e) {
    console.error("[Notif] gagal kirim:", e);
    return false;
  }
}

export async function kirimNotifikasiBanyak({
  penerimaUids, jenis = "Info", judul, pesan, dari = "", link = "", extra = {},
}) {
  if (!penerimaUids?.length) return 0;
  let sukses = 0;
  for (const uid of penerimaUids) {
    const ok = await kirimNotifikasi({
      penerimaUid: uid,
      jenis,
      judul,
      pesan,
      dari,
      link,
      extra,
    });
    if (ok) sukses++;
  }
  return sukses;
}

export async function subscribeNotifikasi(uid, callback) {
  const q = query(
    collection(db, "notifikasi"),
    where("penerimaUid", "==", uid),
    orderBy("waktu", "desc"),
    limit(50)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, (err) => {
    console.warn("[Notif] subscribe error:", err);
  });
}

export function destroyNotifikasi() {
  if (UNSUB) {
    try { UNSUB(); } catch (_) {}
  }
  UNSUB = null;
}
