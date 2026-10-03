/**
 * SP-PPT — Router & Session Management
 * Session disimpan di localStorage (bukan Firebase Auth).
 */

export const PAGE_ACCESS = {
  "dashboard.html": ["siswa", "guru", "admin"],
  "nilai.html": ["siswa", "guru", "admin"],
  "jadwal.html": ["siswa", "guru", "admin"],
  "absensi.html": ["siswa", "guru", "admin"],
  "checklist.html": ["siswa", "guru", "admin"],
  "struktur.html": ["siswa", "guru", "admin"],
  "arsip.html": ["siswa", "guru", "admin"],
  "aduan.html": ["siswa", "guru", "admin"],
  "rapor.html": ["siswa", "guru", "admin"],
  "broadcast.html": ["siswa", "guru", "admin"],
  "sutradara.html": ["siswa", "guru", "admin"],
  "asisten.html": ["siswa", "guru", "admin"],
  "koordinator.html": ["siswa", "guru", "admin"],
  "pemain.html": ["siswa", "guru", "admin"],
  "admin.html": ["guru", "admin"],
  "pengaturan.html": ["siswa", "guru", "admin"],
};

const SESSION_KEY = "sppt_session";
const SESSION_DURATION = 8 * 60 * 60 * 1000;

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (Date.now() > s.expiresAt) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch (e) {
    return null;
  }
}

export function saveSession(uid, profile) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    uid,
    profile,
    loginAt: Date.now(),
    expiresAt: Date.now() + SESSION_DURATION,
  }));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function protectPage() {
  return new Promise((resolve, reject) => {
    const session = getSession();
    if (!session) {
      window.location.replace("index.html");
      reject("Tidak login");
      return;
    }

    const page = window.location.pathname.split("/").pop() || "dashboard.html";
    const allowed = PAGE_ACCESS[page] || ["siswa", "guru", "admin"];
    if (!allowed.includes(session.profile.role)) {
      alert("Akses ditolak untuk halaman ini.");
      window.location.replace("dashboard.html");
      reject("Akses ditolak");
      return;
    }

    resolve({ uid: session.uid, profile: session.profile });
  });
}

export function goto(page) {
  window.location.href = page;
}
