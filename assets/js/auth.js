/**
 * SP-PPT — Autentikasi Manual (Tanpa Firebase Auth)
 * Login dengan query langsung ke Firestore:
 * - Guru: koleksi `teachers`
 * - Siswa: koleksi `classes` → array `students`
 */

import { db } from "./firebase-init.js";
import {
  collection, getDocs, query, where, doc, updateDoc,
  arrayUnion, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast, openModal, closeModal, logActivity } from "./utils.js";
import { saveSession } from "./router.js";

let activeRole = "siswa";

const tabs = document.querySelectorAll(".role-tab");
const labelIdentitas = document.getElementById("label-identitas");
const inputIdentitas = document.getElementById("input-identitas");
const fieldKelas = document.getElementById("field-kelas");
const fieldPasskey = document.getElementById("field-passkey");
const wrapRegister = document.getElementById("wrap-register");
const btnLoginText = document.getElementById("btn-login-text");

function setRole(role) {
  activeRole = role;
  tabs.forEach((t) => {
    const active = t.dataset.role === role;
    t.classList.toggle("active", active);
    t.classList.toggle("bg-white", active);
    t.classList.toggle("shadow-sm", active);
    t.classList.toggle("text-indigo-700", active);
    t.classList.toggle("text-gray-600", !active);
  });

  if (role === "siswa") {
    labelIdentitas.textContent = "Email / No. WhatsApp";
    inputIdentitas.placeholder = "nama@email.com atau 08xxxxxxxxxx";
    fieldKelas.classList.remove("hidden");
    fieldPasskey.classList.add("hidden");
    wrapRegister.classList.remove("hidden");
    btnLoginText.textContent = "Masuk sebagai Siswa";
  } else if (role === "guru") {
    labelIdentitas.textContent = "Email Guru";
    inputIdentitas.placeholder = "guru@sekolah.id";
    fieldKelas.classList.add("hidden");
    fieldPasskey.classList.add("hidden");
    wrapRegister.classList.add("hidden");
    btnLoginText.textContent = "Masuk sebagai Guru";
  } else {
    labelIdentitas.textContent = "Email Admin";
    inputIdentitas.placeholder = "admin@sekolah.id";
    fieldKelas.classList.add("hidden");
    fieldPasskey.classList.remove("hidden");
    wrapRegister.classList.add("hidden");
    btnLoginText.textContent = "Masuk sebagai Admin";
  }
}

tabs.forEach((t) => t.addEventListener("click", () => setRole(t.dataset.role)));
setRole("siswa");

/* Toggle Password */
document.getElementById("toggle-password")?.addEventListener("click", () => {
  const inp = document.getElementById("input-password");
  inp.type = inp.type === "password" ? "text" : "password";
});

/* Modal */
document.getElementById("btn-lupa")?.addEventListener("click", () => openModal("modal-lupa"));
document.getElementById("btn-register")?.addEventListener("click", () => openModal("modal-register"));

/* Normalisasi WA */
function normalisasiWA(wa) {
  if (!wa) return "";
  let d = String(wa).replace(/\D/g, "");
  if (d.startsWith("0")) d = "62" + d.slice(1);
  return d;
}

/* =========================================================
 * CARI USER DI STRUKTUR LAMA
 * ========================================================= */
async function cariUser(identitas) {
  const input = identitas.trim().toLowerCase();
  const waNorm = normalisasiWA(input);

  // 1. Cek di teachers
  const tSnap = await getDocs(collection(db, "teachers"));
  for (const d of tSnap.docs) {
    const t = d.data();
    const tEmail = (t.email || "").toLowerCase();
    const tWA = normalisasiWA(t.phone || "");
    if (tEmail === input || (waNorm && tWA === waNorm)) {
      return { type: "guru", uid: `teacher_${tEmail}`, data: t };
    }
  }

  // 2. Cek di classes.students
  const cSnap = await getDocs(collection(db, "classes"));
  for (const d of cSnap.docs) {
    const k = d.data();
    const students = k.students || [];
    for (const s of students) {
      const sEmail = (s.email || "").toLowerCase();
      const sWA = normalisasiWA(s.phone || "");
      if (sEmail === input || (waNorm && sWA === waNorm)) {
        return { type: "siswa", uid: `student_${sEmail}`, data: s, kelasData: k, kelasDocId: d.id };
      }
    }
  }

  return null;
}

/* =========================================================
 * LOGIN
 * ========================================================= */
document.getElementById("login-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("btn-login");
  btn.disabled = true;
  btn.innerHTML = `<span class="material-symbols-outlined text-lg animate-spin">progress_activity</span> Memproses...`;

  try {
    const identitas = inputIdentitas.value.trim();
    const password = document.getElementById("input-password").value;
    const passkey = document.getElementById("input-passkey")?.value;

    if (!identitas || !password) throw new Error("Isi email & password.");

    const found = await cariUser(identitas);
    if (!found) throw new Error("Akun tidak ditemukan. Periksa email/WA Anda.");

    const storedPass = found.data.password || "";
    if (storedPass !== password) throw new Error("Password salah.");

    if (activeRole === "siswa" && found.type !== "siswa") throw new Error("Ini akun guru, bukan siswa.");
    if (activeRole === "guru" && found.type !== "guru") throw new Error("Ini akun siswa, bukan guru.");

    if (activeRole === "admin") {
      const PASSKEY = "SPPT-ADMIN-2025";
      if (passkey !== PASSKEY) throw new Error("Passkey admin salah.");
      if (found.type !== "guru") throw new Error("Admin harus akun guru.");
    }

    let profile;
    if (found.type === "guru") {
      profile = {
        role: activeRole === "admin" ? "admin" : "guru",
        peran: "Guru Pembina",
        nama: found.data.name || "Guru",
        email: found.data.email || "",
        whatsapp: found.data.phone || "",
        kelas: "",
        divisi: "Guru",
      };
    } else {
      const k = found.kelasData;
      profile = {
        role: "siswa",
        peran: found.data.peran || "Pemain",
        nama: found.data.name || "Siswa",
        email: found.data.email || "",
        whatsapp: found.data.phone || "",
        kelas: k.name || "",
        kelasId: found.kelasDocId || "",
        divisi: found.data.divisi || "Pemeran",
      };
    }

    saveSession(found.uid, profile);
    await logActivity(found.uid, "login", `role=${activeRole}`);

    showToast("Login berhasil! Mengalihkan...", "success");
    setTimeout(() => (window.location.href = "dashboard.html"), 800);
  } catch (err) {
    console.error(err);
    showToast(err.message || "Login gagal.", "error", 5000);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span class="material-symbols-outlined text-lg">login</span><span id="btn-login-text">Masuk</span>`;
  }
});

/* =========================================================
 * REGISTRASI SISWA — Tambah ke classes.students
 * ========================================================= */
document.getElementById("form-register")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const kode = document.getElementById("reg-kode").value.trim();
  const nama = document.getElementById("reg-nama").value.trim();
  const nis = document.getElementById("reg-nis").value.trim();
  const email = document.getElementById("reg-email").value.trim().toLowerCase();
  const wa = normalisasiWA(document.getElementById("reg-wa").value.trim());
  const pass = document.getElementById("reg-pass").value;
  const pass2 = document.getElementById("reg-pass2").value;

  if (pass !== pass2) return showToast("Password tidak cocok.", "error");
  if (pass.length < 6) return showToast("Password minimal 6 karakter.", "error");
  if (!nama || !email) return showToast("Nama & email wajib diisi.", "error");

  try {
    const q = query(collection(db, "classes"), where("code", "==", kode));
    const snap = await getDocs(q);
    if (snap.empty) throw new Error("Kode kelas tidak ditemukan.");

    const kelasDoc = snap.docs[0];
    const kelasData = kelasDoc.data();

    const cekUser = await cariUser(email);
    if (cekUser) throw new Error("Email sudah terdaftar.");

    const newStudent = {
      id: `id_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      name: nama,
      email,
      password: pass,
      phone: wa,
      nis,
      registeredAt: Date.now(),
    };

    await updateDoc(doc(db, "classes", kelasDoc.id), {
      students: arrayUnion(newStudent),
    });

    const uid = `student_${email}`;
    const profile = {
      role: "siswa",
      peran: "Pemain",
      nama,
      email,
      whatsapp: wa,
      kelas: kelasData.name || "",
      kelasId: kelasDoc.id,
      divisi: "Pemeran",
    };
    saveSession(uid, profile);
    await logActivity(uid, "register");

    showToast("Registrasi berhasil! Mengalihkan...", "success");
    setTimeout(() => (window.location.href = "dashboard.html"), 1000);
  } catch (err) {
    console.error(err);
    showToast(err.message || "Registrasi gagal.", "error", 5000);
  }
});

/* Clear session jika ada ?logout=1 */
if (location.search.includes("logout=1")) {
  localStorage.removeItem("sppt_session");
  history.replaceState({}, "", location.pathname);
}

/* Idle timeout 30 menit */
const IDLE_LIMIT = 30 * 60 * 1000;
let idleTimer;
function resetIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    localStorage.removeItem("sppt_session");
    showToast("Sesi berakhir karena tidak ada aktivitas.", "warning");
    setTimeout(() => (window.location.href = "index.html?logout=1"), 1000);
  }, IDLE_LIMIT);
}
["click", "keydown", "mousemove", "touchstart", "scroll"].forEach((ev) =>
  document.addEventListener(ev, resetIdle, { passive: true })
);
resetIdle();
