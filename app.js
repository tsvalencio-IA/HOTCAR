// =======================================================
// app.js — HOT WHEELS ORACLE EDITION (VERDADE ABSOLUTA)
// =======================================================

// ---------- 1. IMPORTAÇÕES ----------
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getDatabase, ref, push, onValue, remove, update } from "firebase/database";
import {
  firebaseConfig,
  cloudinaryConfig,
  geminiKeyPart1,
  geminiKeyPart2,
  ADMIN_UIDS
} from "./config.js";

// ---------- 2. INICIALIZAÇÃO ----------
let app, auth, db;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getDatabase(app);
  console.log("🔥 HW ORACLE iniciado com sucesso.");
} catch (e) {
  alert("Erro crítico Firebase.");
  throw e;
}

const API_KEY = geminiKeyPart1 + geminiKeyPart2;

// ---------- 3. VARIÁVEIS GLOBAIS ----------
let currentUid = null;
let isAdmin = false;
let cachedData = [];
let currentImageBase64 = null;
let currentCloudinaryUrl = null;
let isEditing = false;
let webcamStream = null;

const DEFAULT_IMAGE =
  "https://upload.wikimedia.org/wikipedia/commons/2/23/Hot_Wheels_logo.svg";

// ---------- 4. ELEMENTOS DOM ----------
const loginScreen = document.getElementById("login-screen");
const appContainer = document.getElementById("app-container");
const authStatus = document.getElementById("auth-status");
const dashboard = document.getElementById("dashboard");
const displayUsername = document.getElementById("display-username");
const totalCarsEl = document.getElementById("total-cars");
const totalWishEl = document.getElementById("total-wish");
const btnScan = document.getElementById("btn-scan");
const btnManual = document.getElementById("btn-manual");
const fileInput = document.getElementById("file-input");
const editFileInput = document.getElementById("edit-file-input");
const modalForm = document.getElementById("modal-form");
const modalWebcam = document.getElementById("modal-webcam");
const closeModalBtn = document.querySelector(".close-modal");
const closeWebcamBtn = document.querySelector(".close-webcam");
const aiLoading = document.getElementById("ai-loading");
const btnSaveCar = document.getElementById("btn-save-car");
const searchInput = document.getElementById("search-input");
const videoEl = document.getElementById("webcam-video");
const canvasEl = document.getElementById("webcam-canvas");
const btnCapture = document.getElementById("btn-capture");
const btnChangePhoto = document.getElementById("btn-change-photo");

// ---------- 5. AUTENTICAÇÃO ----------
onAuthStateChanged(auth, user => {
  if (user) {
    currentUid = user.uid;
    displayUsername.innerText = user.uid.substring(0, 6) + "...";

    if (ADMIN_UIDS.includes(user.uid)) {
      isAdmin = true;
      document.body.classList.add("admin-mode");
    }

    loginScreen.classList.add("hidden");
    appContainer.classList.remove("hidden");
    carregarColecao();
  } else {
    signInAnonymously(auth).catch(e => {
      authStatus.innerText = "Erro login";
    });
  }
});

// ---------- 6. CARREGAMENTO DA COLEÇÃO ----------
function carregarColecao() {
  const dbRef = ref(db, `hotwheels/${currentUid}/cars`);

  onValue(dbRef, snapshot => {
    dashboard.innerHTML = "";
    cachedData = [];
    let g = 0, d = 0;

    const data = snapshot.val();
    if (!data) {
      totalCarsEl.innerText = "0";
      totalWishEl.innerText = "0";
      dashboard.innerHTML =
        "<div class='empty-state'>Garagem vazia</div>";
      return;
    }

    Object.entries(data)
      .reverse()
      .forEach(([id, car]) => {
        if (!car.castingId)
          car.castingId = generateCastingId(car.nome);
        cachedData.push({ id, ...car });
        if (car.status === "colecao") g++;
        if (car.status === "desejo") d++;
        criarCard(id, car);
      });

    totalCarsEl.innerText = g;
    totalWishEl.innerText = d;
    aplicarFiltro();
  });
}

// ---------- 7. UTIL ----------
function generateCastingId(name) {
  if (!name) return "unknown_casting";
  return name.toLowerCase().replace(/[^a-z0-9]/g, "_");
}

// ---------- 8. BOTÕES ----------
btnManual.addEventListener("click", () => {
  isEditing = false;
  limparFormulario();
  modalForm.classList.remove("hidden");
});

btnScan.addEventListener("click", () => {
  fileInput.click();
});

fileInput.addEventListener("change", e => {
  if (e.target.files[0])
    processarImagemParaAnalise(e.target.files[0]);
});

editFileInput.addEventListener("change", e => {
  if (e.target.files[0])
    processarImagemParaAnalise(e.target.files[0]);
});

// ---------- 9. CLOUDINARY ----------
async function uploadCloudinary(file) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", cloudinaryConfig.uploadPreset);

  try {
    const r = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`,
      { method: "POST", body: fd }
    );
    const j = await r.json();
    return j.secure_url || DEFAULT_IMAGE;
  } catch {
    return DEFAULT_IMAGE;
  }
}

// ---------- 10. ORÁCULO GEMINI ----------
const GEMINI_PROMPT = `
Você é um ORÁCULO técnico de Hot Wheels.

REGRAS:
- Nunca invente.
- Nunca chute.
- Liste possibilidades com probabilidade.
- Seja honesto sobre limitações.

Retorne JSON:

{
  "possibilidades":[
    {"nome":"","castingId":"","ano":"","probabilidade":0.0}
  ],
  "caracteristicas_visiveis":[],
  "limitacoes":"",
  "confidence_final":0.0
}
`;

async function consultarOraculo(base64) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: GEMINI_PROMPT },
              { inline_data: { mime_type: "image/png", data: base64 } }
            ]
          }
        ],
        generationConfig: { temperature: 0 }
      })
    }
  );

  const data = await response.json();
  const txt =
    data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  return JSON.parse(txt.replace(/```json|```/g, ""));
}

// ---------- 11. PIPELINE DE IMAGEM ----------
async function processarImagemParaAnalise(file) {
  modalForm.classList.remove("hidden");
  aiLoading.classList.remove("hidden");

  const reader = new FileReader();
  reader.onload = async e => {
    const base64 = e.target.result.split(",")[1];
    currentImageBase64 = base64;

    currentCloudinaryUrl = await uploadCloudinary(file);
    document.getElementById("preview-img").src = currentCloudinaryUrl;

    try {
      const oracle = await consultarOraculo(base64);
      aplicarResultadoOraculo(oracle);
    } catch {
      alert("Erro IA");
    } finally {
      aiLoading.classList.add("hidden");
    }
  };
  reader.readAsDataURL(file);
}

// ---------- 12. APLICAÇÃO DO ORÁCULO ----------
function aplicarResultadoOraculo(o) {
  const melhor = o.possibilidades.sort(
    (a, b) => b.probabilidade - a.probabilidade
  )[0];

  document.getElementById("inp-nome").value =
    melhor?.nome || "";
  document.getElementById("inp-ano").value =
    melhor?.ano || "";
  document.getElementById("inp-casting-id").value =
    melhor?.castingId || "";
  document.getElementById("inp-casting-id-display").value =
    melhor?.castingId || "";
  document.getElementById("inp-origin").value = "oraculo";
  document.getElementById("inp-confidence").value =
    o.confidence_final;
}

// ---------- 13. SALVAR ----------
btnSaveCar.addEventListener("click", e => {
  e.preventDefault();

  const nome = document.getElementById("inp-nome").value.trim();
  if (!nome) return alert("Nome obrigatório");

  const data = {
    nome,
    castingId:
      document.getElementById("inp-casting-id").value ||
      generateCastingId(nome),
    ano: document.getElementById("inp-ano").value,
    cor: document.getElementById("inp-cor").value,
    obs: document.getElementById("inp-obs").value,
    status: document.getElementById("inp-status").value,
    origin: document.getElementById("inp-origin").value,
    confidenceLevel:
      document.getElementById("inp-confidence").value,
    foto: currentCloudinaryUrl || DEFAULT_IMAGE,
    timestamp: Date.now()
  };

  push(ref(db, `hotwheels/${currentUid}/cars`), data)
    .then(() => {
      modalForm.classList.add("hidden");
      limparFormulario();
    });
});

// ---------- 14. UI ----------
function limparFormulario() {
  [
    "inp-nome",
    "inp-ano",
    "inp-cor",
    "inp-obs",
    "inp-id",
    "inp-casting-id",
    "inp-casting-id-display"
  ].forEach(id => (document.getElementById(id).value = ""));
}

function aplicarFiltro() {
  const termo = searchInput.value.toLowerCase();
  document.querySelectorAll(".car-card").forEach(c => {
    c.style.display = c.dataset.name.includes(termo)
      ? "flex"
      : "none";
  });
}

searchInput.addEventListener("keyup", aplicarFiltro);

// ---------- 15. RENDER ----------
function criarCard(id, car) {
  const d = document.createElement("div");
  d.className = "car-card";
  d.dataset.name = (car.nome + car.castingId).toLowerCase();
  d.innerHTML = `
    <img src="${car.foto}">
    <div class="card-info">
      <div class="card-title">${car.nome}</div>
      <small>${car.ano}</small>
    </div>`;
  dashboard.appendChild(d);
}