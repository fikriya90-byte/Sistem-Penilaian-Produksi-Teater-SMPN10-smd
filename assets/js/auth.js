/**
 * SP-PPT — Autentikasi & Sesi
 * Login multi-role (siswa/guru/admin), registrasi, logout, auto-logout 30 menit.
 */

import {
  auth,
  db,
  PERAN_DIVISI,
} from "./firebase-init.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  addDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast, openModal, closeModal, logActivity } from "./utils.js";

/* =========================================================
 * STATE
 * ========================================================= */
let activeRole = "siswa";
let currentUser = null;
let userProfile = null;

/* =========================================================
 * UI: TAB SWITCH
 * ========================================================= */
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
    labelIdentitas.textContent = "Email / No. WhatsApp / NIS";
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

/* =========================================================
 * TOGGLE PASSWORD
 * ========================================================= */
document.getElementById("toggle-password")?.addEventListener("click", () => {
  const inp = document.getElementById("input-password");
  inp.type = inp.type === "password" ? "text" : "password";
});

/* =========================================================
 * LUPAS PASSWORD & MODAL
 * ========================================================= */
document.getElementById("btn-lupa")?.addEventListener("click", () => openModal("modal-lupa"));
document.getElementById("btn-register")?.addEventListener("click", () => openModal("modal-register"));

/* =========================================================
 * NORMALISASI IDENTITAS (email/wa/nis)
 * ========================================================= */
function normalisasiWA(wa) {
  if (!wa) return "";
  let d = String(wa).replace(/\D/g, "");
  if (d.startsWith("0")) d = "62" + d.slice(1);
  return d;
}

async function cariUserByIdentitas(identitas) {
  const idLower = identitas.trim().toLowerCase();
  const isEmail = idLower.includes("@");
  const usersRef = collection(db, "users");

  // Coba email
  if (isEmail) {
    const snap = await getDocs(query(usersRef, where("email", "==", idLower)));
    if (!snap.empty) return snap.docs[0].data();
  }

  // Coba WA
  const wa = normalisasiWA(idLower);
  if (wa) {
    const snap = await getDocs(query(usersRef, where("whatsapp", "==", wa)));
    if (!snap.empty) return snap.docs[0].data();
  }

  // Coba NIS
  const snap3 = await getDocs(query(usersRef, where("nis", "==", identitas.trim())));
  if (!snap3.empty) return snap3.docs[0].data();

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
    let email = inputIdentitas.value.trim().toLowerCase();
    const password = document.getElementById("input-password").value;
    const kelas = document.getElementById("input-kelas").value;
    const passkey = document.getElementById("input-passkey")?.value;

    // Jika bukan email → cari user dulu
    if (!email.includes("@")) {
      const user = await cariUserByIdentitas(email);
      if (!user || !user.email) throw new Error("Akun tidak ditemukan. Periksa kembali.");
      email = user.email;
    }

    const cred = await signInWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;

    // Ambil profil user
    const userSnap = await getDoc(doc(db, "users", uid));
    if (!userSnap.exists()) throw new Error("Data profil tidak ditemukan. Hubungi guru.");
    const profile = userSnap.data();

    // Validasi role sesuai tab
    if (activeRole === "siswa" && profile.role !== "siswa")
      throw new Error("Akun ini bukan akun siswa.");
    if (activeRole === "guru" && profile.role !== "guru")
      throw new Error("Akun ini bukan akun guru.");
    if (activeRole === "admin" && profile.role !== "admin")
      throw new Error("Akun ini bukan akun admin.");

    // Admin butuh passkey
    if (activeRole === "admin") {
      const PASSKEY = "SPPT-ADMIN-2025";
      if (passkey !== PASSKEY) throw new Error("Passkey admin salah.");
    }

    // Update lastLogin
    await updateDoc(doc(db, "users", uid), { lastLogin: serverTimestamp() });
    await logActivity(uid, "login", `role=${activeRole}`);

    showToast("Login berhasil! Mengalihkan...", "success");
    setTimeout(() => (window.location.href = "dashboard.html"), 800);
  } catch (err) {
    console.error(err);
    let msg = err.message || "Login gagal.";
    if (err.code === "auth/invalid-credential") msg = "Email atau password salah.";
    if (err.code === "auth/user-not-found") msg = "Akun tidak ditemukan.";
    if (err.code === "auth/too-many-requests") msg = "Terlalu banyak percobaan. Coba lagi nanti.";
    showToast(msg, "error", 5000);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span class="material-symbols-outlined text-lg">login</span><span id="btn-login-text">Masuk</span>`;
  }
});

/* =========================================================
 * REGISTRASI SISWA
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
  const peran = document.getElementById("reg-peran").value;

  if (pass !== pass2) return showToast("Password tidak cocok.", "error");
  if (pass.length < 8) return showToast("Password minimal 8 karakter.", "error");

  try {
    // Validasi kode kelas
    const kSnap = await getDocs(query(collection(db, "classes"), where("kodeKelas", "==", kode)));
    if (kSnap.empty) throw new Error("Kode kelas tidak ditemukan.");
    const kelasDoc = kSnap.docs[0];
    const kelasData = kelasDoc.data();

    // Cek email unik
    const emailSnap = await getDocs(query(collection(db, "users"), where("email", "==", email)));
    if (!emailSnap.empty) throw new Error("Email sudah terdaftar.");

    // Cek WA unik
    const waSnap = await getDocs(query(collection(db, "users"), where("whatsapp", "==", wa)));
    if (!waSnap.empty) throw new Error("No. WhatsApp sudah terdaftar.");

    // Buat auth user
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    const uid = cred.user.uid;

    // Simpan profil
    await setDoc(doc(db, "users", uid), {
      role: "siswa",
      peran,
      divisi: PERAN_DIVISI[peran] || "Pemeran",
      nama,
      nis,
      kelas: kelasData.nama,
      kelasId: kelasDoc.id,
      email,
      whatsapp: wa,
      fotoUrl: "",
      createdAt: serverTimestamp(),
      lastLogin: serverTimestamp(),
    });

    await logActivity(uid, "register", `peran=${peran}`);

    showToast("Registrasi berhasil! Mengalihkan...", "success");
    setTimeout(() => (window.location.href = "dashboard.html"), 1000);
  } catch (err) {
    console.error(err);
    let msg = err.message;
    if (err.code === "auth/email-already-in-use") msg = "Email sudah digunakan.";
    showToast(msg, "error", 5000);
  }
});

/* =========================================================
 * SESSION & AUTO-LOGOUT 30 MENIT
 * ========================================================= */
const IDLE_LIMIT = 30 * 60 * 1000; // 30 menit
let idleTimer;

function resetIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    await signOut(auth);
    showToast("Sesi berakhir karena tidak ada aktivitas.", "warning");
    setTimeout(() => (window.location.href = "index.html"), 1000);
  }, IDLE_LIMIT);
}

["click", "keydown", "mousemove", "touchstart", "scroll"].forEach((ev) =>
  document.addEventListener(ev, resetIdle, { passive: true })
);

/* =========================================================
 * AUTH STATE OBSERVER
 * ========================================================= */
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) userProfile = snap.data();
    resetIdle();

    // Jika sudah login dan berada di halaman login → redirect
    if (window.location.pathname.endsWith("index.html") || window.location.pathname === "/") {
      window.location.href = "dashboard.html";
    }
  } else {
    currentUser = null;
    userProfile = null;
  }
});

export { currentUser, userProfile };
