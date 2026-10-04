/**
 * SP-PPT — Modul Notifikasi (Tanpa Firebase Auth)
 * - Realtime via onSnapshot, tanpa composite index
 * - kirimNotifikasi + kirimNotifikasiBanyak untuk dipakai modul lain
 * - Panel slide dari kanan + filter + search + mark read
 */

import { db } from "./firebase-init.js";
import {
  collection, query, where, onSnapshot, doc, updateDoc,
  getDocs, writeBatch, limit, serverTimestamp, addDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { waktuRelatif, showToast, esc } from "./utils.js";

/* =========================================================
 * JENIS NOTIFIKASI
 * ========================================================= */
export const JENIS_NOTIF = {
  Tugas:     { icon: "assignment",     color: "text-blue-400",   bg: "bg-blue-500/15",   border: "border-blue-500/40",   dot: "bg-blue-500" },
  Instruksi: { icon: "campaign",       color: "text-purple-400", bg: "bg-purple-500/15", border: "border-purple-500/40", dot: "bg-purple-500" },
  Info:      { icon: "info",           color: "text-green-400",  bg: "bg-green-500/15",  border: "border-green-500/40",  dot: "bg-green-500" },
  Urgent:    { icon: "priority_high",  color: "text-red-400",    bg: "bg-red-500/15",    border: "border-red-500/40",    dot: "bg-red-500" },
  Reminder:  { icon: "schedule",       color: "text-orange-400", bg: "bg-orange-500/15", border: "border-orange-500/40", dot: "bg-orange-500" },
  Feedback:  { icon: "reviews",        color: "text-pink-400",   bg: "bg-pink-500/15",   border: "border-pink-500/40",   dot: "bg-pink-500" },
  Sistem:    { icon: "settings",       color: "text-gray-400",   bg: "bg-gray-500/15",   border: "border-gray-500/40",   dot: "bg-gray-500" },
};

function getJenisMeta(j) { return JENIS_NOTIF[j] || JENIS_NOTIF.Sistem; }

/* =========================================================
 * STATE
 * ========================================================= */
let ME = null;
let UNSUB = null;
let SEMUA_NOTIF = [];
let FILTER_JENIS = "semua";
let SEARCH_KEYWORD = "";

/* =========================================================
 * INIT
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

function attachListener() {
  if (!ME) return;
  if (UNSUB) { try { UNSUB(); } catch (_) {} }

  // Query tanpa orderBy (hindari composite index)
  const q = query(
    collection(db, "notifikasi"),
    where("penerimaUid", "==", ME.uid),
    limit(100)
  );

  try {
    UNSUB = onSnapshot(q, (snap) => {
      SEMUA_NOTIF = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const ta = a.waktu?.toDate?.()?.getTime() || a.waktu?.seconds * 1000 || 0;
          const tb = b.waktu?.toDate?.()?.getTime() || b.waktu?.seconds * 1000 || 0;
          return tb - ta;
        });
      updateBadge();
      if (isPanelOpen()) renderList();
    }, (err) => {
      console.warn("[Notif] Snapshot error, fallback ke getDocs:", err.message);
      loadFallback();
    });
  } catch (e) {
    console.warn("[Notif] onSnapshot throw, fallback:", e);
    loadFallback();
  }
}

async function loadFallback() {
  if (!ME) return;
  try {
    const snap = await getDocs(query(
      collection(db, "notifikasi"),
      where("penerimaUid", "==", ME.uid),
      limit(100)
    ));
    SEMUA_NOTIF = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const ta = a.waktu?.toDate?.()?.getTime() || a.waktu?.seconds * 1000 || 0;
        const tb = b.waktu?.toDate?.()?.getTime() || b.waktu?.seconds * 1000 || 0;
        return tb - ta;
      });
    updateBadge();
    if (isPanelOpen()) renderList();
  } catch (e) {
    console.warn("[Notif] Fallback gagal:", e.message);
  }
}

/* =========================================================
 * BADGE
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

  let list = [...SEMUA_NOTIF];
  if (FILTER_JENIS === "belum") list = list.filter((n) => !n.dibaca);
  else if (FILTER_JENIS !== "semua") list = list.filter((n) => n.jenis === FILTER_JENIS);

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
        <p class="text-sm">${SEARCH_KEYWORD ? "Tidak ada hasil pencarian" : FILTER_JENIS === "belum" ? "Semua sudah dibaca" : "Belum ada notifikasi"}</p>
      </div>`;
    return;
  }

  el.innerHTML = list.map((n) => {
    const meta = getJenisMeta(n.jenis);
    const unread = !n.dibaca;
    return `
    <div class="notif-item p-3 rounded-xl border transition-all cursor-pointer ${unread ? `${meta.bg} ${meta.border} border-l-4` : "bg-surface-container border-outline-variant/30"}" data-id="${n.id}">
      <div class="flex items-start gap-3">
        <div class="w-9 h-9 rounded-lg ${meta.bg} flex items-center justify-center shrink-0">
          <span class="material-symbols-outlined text-lg ${meta.color}">${meta.icon}</span>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-start justify-between gap-2">
            <p class="text-sm font-medium ${unread ? "text-on-surface" : "text-on-surface-variant"} leading-tight">${esc(n.judul || "-")}</p>
            ${unread ? `<span class="w-2 h-2 rounded-full ${meta.dot} shrink-0 mt-1.5"></span>` : ""}
          </div>
          <p class="text-xs text-on-surface-variant mt-1 line-clamp-2">${esc(n.pesan || "")}</p>
          <div class="flex items-center gap-2 mt-2 text-[10px] text-on-surface-variant">
            <span class="px-1.5 py-0.5 rounded ${meta.bg} ${meta.color} font-medium">${esc(n.jenis || "Info")}</span>
            ${n.dari ? `<span>· ${esc(n.dari)}</span>` : ""}
            <span>· ${waktuRelatif(n.waktu)}</span>
          </div>
        </div>
      </div>
    </div>`;
  }).join("");

  // Bind click untuk mark read
  el.querySelectorAll(".notif-item").forEach((item) => {
    item.addEventListener("click", async () => {
      const id = item.dataset.id;
      const n = SEMUA_NOTIF.find((x) => x.id === id);
      if (n && !n.dibaca) await markRead([id], true);
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
    ids.forEach((id) => batch.update(doc(db, "notifikasi", id), { dibaca: true, dibacaPada: serverTimestamp() }));
    await batch.commit();
    if (!silent) showToast(`${ids.length} ditandai dibaca`, "success");
  } catch (e) {
    if (!silent) showToast("Gagal tandai dibaca", "error");
  }
}

async function markAllRead() {
  const unreadIds = SEMUA_NOTIF.filter((n) => !n.dibaca).map((n) => n.id);
  if (!unreadIds.length) return showToast("Semua sudah dibaca", "info");
  await markRead(unreadIds);
}

/* =========================================================
 * ATTACH UI
 * ========================================================= */
function attachUI() {
  const bell = document.getElementById("btn-notif");
  if (bell && !bell.dataset.bound) {
    bell.dataset.bound = "1";
    bell.addEventListener("click", bukaPanelNotif);
  }
  const btnClose = document.getElementById("btn-notif-close");
  if (btnClose && !btnClose.dataset.bound) {
    btnClose.dataset.bound = "1";
    btnClose.addEventListener("click", tutupPanelNotif);
  }
  const btnAll = document.getElementById("btn-mark-all");
  if (btnAll && !btnAll.dataset.bound) {
    btnAll.dataset.bound = "1";
    btnAll.addEventListener("click", markAllRead);
  }
  const backdrop = document.getElementById("notif-backdrop");
  if (backdrop && !backdrop.dataset.bound) {
    backdrop.dataset.bound = "1";
    backdrop.addEventListener("click", tutupPanelNotif);
  }
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
    const ok = await kirimNotifikasi({ penerimaUid: uid, jenis, judul, pesan, dari, link, extra });
    if (ok) sukses++;
  }
  return sukses;
}

export function destroyNotifikasi() {
  if (UNSUB) { try { UNSUB(); } catch (_) {} }
  UNSUB = null;
}
