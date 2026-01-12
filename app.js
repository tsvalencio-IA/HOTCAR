// app.js - VERSÃO MULTI-USUÁRIO E ORÁCULO VERDADEIRO (CORRIGIDA)

// 1. IMPORTAÇÕES
import { initializeApp } from "firebase/app";
import {
    getDatabase,
    ref,
    push,
    onValue,
    off,
    remove,
    update,
    set
} from "firebase/database";

import {
    firebaseConfig,
    cloudinaryConfig,
    geminiKeyPart1,
    geminiKeyPart2
} from './config.js';

// 2. INICIALIZAÇÃO
let app, db;

try {
    app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    console.log("Sistema Iniciado.");
} catch (error) {
    console.error("Erro Firebase:", error);
    alert("Erro crítico na conexão.");
}

// 3. CONSTANTES E VARIÁVEIS GLOBAIS
const API_KEY = geminiKeyPart1 + geminiKeyPart2;
const ADMIN_PIN = "1234";
const DEFAULT_IMAGE = "https://upload.wikimedia.org/wikipedia/commons/2/23/Hot_Wheels_logo.svg";

let currentUser = null;
let viewedUser = null;
let currentImageBase64 = null;
let currentCloudinaryUrl = null;
let webcamStream = null;
let cachedData = [];
let isEditing = false;

// Listener ativo (FIX CRÍTICO)
let currentCollectionRef = null;

// 4. ELEMENTOS DOM
const loginScreen = document.getElementById('login-screen');
const appContainer = document.getElementById('app-container');
const userListEl = document.getElementById('user-list');
const btnAdminAdd = document.getElementById('btn-admin-add');
const displayUsername = document.getElementById('display-username');
const viewSelector = document.getElementById('view-selector');
const btnLogout = document.getElementById('btn-logout');

const dashboard = document.getElementById('dashboard');
const totalCarsEl = document.getElementById('total-cars');
const totalWishEl = document.getElementById('total-wish');
const ownerActions = document.getElementById('owner-actions');
const btnScan = document.getElementById('btn-scan');
const btnManual = document.getElementById('btn-manual');
const fileInput = document.getElementById('file-input');
const editFileInput = document.getElementById('edit-file-input');
const searchInput = document.getElementById('search-input');
const modalForm = document.getElementById('modal-form');
const modalWebcam = document.getElementById('modal-webcam');
const closeModalBtn = document.querySelector('.close-modal');
const closeWebcamBtn = document.querySelector('.close-webcam');
const aiLoading = document.getElementById('ai-loading');
const videoEl = document.getElementById('webcam-video');
const canvasEl = document.getElementById('webcam-canvas');
const btnCapture = document.getElementById('btn-capture');
const btnChangePhoto = document.getElementById('btn-change-photo');
const btnSaveCar = document.getElementById('btn-save-car');

// 5. SISTEMA DE USUÁRIOS
onValue(ref(db, 'users_list'), (snapshot) => {
    userListEl.innerHTML = '';
    viewSelector.innerHTML = '<option value="me">Minha Garagem</option>';

    const users = snapshot.val();
    if (!users) {
        userListEl.innerHTML = '<p>Nenhum piloto cadastrado.</p>';
        return;
    }

    Object.keys(users).forEach(user => {
        const div = document.createElement('div');
        div.className = 'user-card';
        div.innerHTML = `
            <div class="user-avatar"><i class="fas fa-user-helmet-safety"></i></div>
            <div class="user-name">${user}</div>
        `;
        div.onclick = () => loginUser(user);
        userListEl.appendChild(div);

        const opt = document.createElement('option');
        opt.value = user;
        opt.innerText = `Garagem de ${user}`;
        viewSelector.appendChild(opt);
    });
});

// ADMIN
btnAdminAdd.addEventListener('click', () => {
    const pin = prompt("Senha do Admin:");
    if (pin !== ADMIN_PIN) return alert("Senha incorreta.");

    const name = prompt("Nome do novo piloto:");
    if (!name) return;

    set(ref(db, `users_list/${name.trim()}`), true)
        .then(() => alert("Piloto criado."))
        .catch(err => alert(err.message));
});

function loginUser(user) {
    currentUser = user;
    viewedUser = user;
    loginScreen.classList.add('hidden');
    appContainer.classList.remove('hidden');
    displayUsername.innerText = user;
    updateInterfaceMode();
    carregarColecao(viewedUser);
}

btnLogout.addEventListener('click', () => {
    if (currentCollectionRef) off(currentCollectionRef);
    currentUser = null;
    viewedUser = null;
    cachedData = [];
    appContainer.classList.add('hidden');
    loginScreen.classList.remove('hidden');
});

viewSelector.addEventListener('change', (e) => {
    viewedUser = e.target.value === 'me' ? currentUser : e.target.value;
    updateInterfaceMode();
    carregarColecao(viewedUser);
});

function updateInterfaceMode() {
    const dono = currentUser === viewedUser;
    ownerActions.style.display = dono ? 'flex' : 'none';
    btnSaveCar.style.display = dono ? 'block' : 'none';
}

// 6. COLEÇÃO (FIX DE LISTENER)
function carregarColecao(user) {
    if (currentCollectionRef) off(currentCollectionRef);

    const path = `hotwheels/data/${user}`;
    currentCollectionRef = ref(db, path);

    onValue(currentCollectionRef, (snapshot) => {
        dashboard.innerHTML = '';
        cachedData = [];

        const data = snapshot.val();
        let garagem = 0;
        let desejo = 0;

        if (!data) {
            totalCarsEl.innerText = "0";
            totalWishEl.innerText = "0";
            dashboard.innerHTML = '<div class="empty-state">Garagem vazia</div>';
            return;
        }

        Object.entries(data).reverse().forEach(([id, carro]) => {
            cachedData.push({ id, ...carro });
            if (carro.status === 'colecao') garagem++;
            if (carro.status === 'desejo') desejo++;
            criarCard(id, carro);
        });

        totalCarsEl.innerText = garagem;
        totalWishEl.innerText = desejo;
        aplicarFiltro();
    });
}

// 7. CARD
function criarCard(id, carro) {
    const card = document.createElement('div');
    card.className = 'car-card';
    card.dataset.status = carro.status;
    card.dataset.name = (carro.nome || '').toLowerCase();

    const isOwner = currentUser === viewedUser;

    card.innerHTML = `
        <span class="badge ${carro.status}">${carro.status}</span>
        <img src="${carro.foto}" onerror="this.src='${DEFAULT_IMAGE}'">
        <div class="card-info">
            <strong>${carro.nome}</strong>
            <small>${carro.ano}</small>
            <div class="card-actions">
                ${isOwner ? `
                    ${carro.status === 'desejo'
                        ? `<button onclick="moverParaGaragem('${id}')">Adquiri</button>`
                        : `<button onclick="editarCarro('${id}')">Editar</button>`
                    }
                    <button onclick="deletarCarro('${id}')">Excluir</button>
                ` : `<em>Apenas visualização</em>`}
            </div>
        </div>
    `;
    dashboard.appendChild(card);
}

// 8. IA — ORÁCULO COM BLINDAGEM
async function identificarComGoogleSearch(base64Image) {
    aiLoading.classList.remove('hidden');

    const prompt = `
Você é um Arquivista Oficial da Mattel.
Identifique o CASTING NAME real do Hot Wheels.
IGNORE séries da cartela.
CONFIRME usando Google Search.
Retorne APENAS JSON válido.
{
 "modelo":"",
 "ano":"",
 "cor":"",
 "curiosidade":""
}
`;

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: prompt },
                            { inline_data: { mime_type: "image/png", data: base64Image } }
                        ]
                    }],
                    tools: [{ google_search: {} }],
                    generationConfig: { temperature: 0 }
                })
            }
        );

        const data = await response.json();
        if (!data?.candidates?.[0]) throw new Error("Resposta inválida");

        let raw = data.candidates[0].content.parts[0].text;
        raw = raw.replace(/```json|```/g, '');

        const start = raw.indexOf('{');
        const end = raw.lastIndexOf('}');
        if (start === -1 || end === -1) throw new Error("JSON ausente");

        const parsed = JSON.parse(raw.substring(start, end + 1));

        document.getElementById('inp-nome').value = typeof parsed.modelo === 'string' ? parsed.modelo : '';
        document.getElementById('inp-ano').value = typeof parsed.ano === 'string' ? parsed.ano : '';
        document.getElementById('inp-cor').value = typeof parsed.cor === 'string' ? parsed.cor : '';
        document.getElementById('inp-obs').value = typeof parsed.curiosidade === 'string' ? parsed.curiosidade : '';

    } catch (err) {
        console.error("Erro IA:", err);
        document.getElementById('inp-nome').placeholder = "Não identificado";
    } finally {
        aiLoading.classList.add('hidden');
    }
}

// 9. CRUD
btnSaveCar.addEventListener('click', (e) => {
    e.preventDefault();
    if (currentUser !== viewedUser) return;

    const dados = {
        nome: document.getElementById('inp-nome').value,
        ano: document.getElementById('inp-ano').value,
        cor: document.getElementById('inp-cor').value,
        obs: document.getElementById('inp-obs').value,
        status: document.getElementById('inp-status').value,
        foto: currentCloudinaryUrl || DEFAULT_IMAGE,
        timestamp: Date.now()
    };

    const id = document.getElementById('inp-id').value;
    const path = `hotwheels/data/${currentUser}`;

    id
        ? update(ref(db, `${path}/${id}`), dados)
        : push(ref(db, path), dados);

    modalForm.classList.add('hidden');
});

// 10. AÇÕES GLOBAIS
window.editarCarro = (id) => {
    const carro = cachedData.find(c => c.id === id);
    if (!carro) return;

    isEditing = true;
    document.getElementById('inp-id').value = carro.id;
    document.getElementById('inp-nome').value = carro.nome;
    document.getElementById('inp-ano').value = carro.ano;
    document.getElementById('inp-cor').value = carro.cor;
    document.getElementById('inp-obs').value = carro.obs;
    document.getElementById('inp-status').value = carro.status;
    document.getElementById('preview-img').src = carro.foto;
    currentCloudinaryUrl = carro.foto;
    modalForm.classList.remove('hidden');
};

window.moverParaGaragem = (id) => {
    update(ref(db, `hotwheels/data/${currentUser}/${id}`), { status: 'colecao' });
};

window.deletarCarro = (id) => {
    if (confirm("Excluir?")) remove(ref(db, `hotwheels/data/${currentUser}/${id}`));
};

// 11. FILTRO
function aplicarFiltro() {
    const termo = searchInput.value.toLowerCase();
    document.querySelectorAll('.car-card').forEach(card => {
        card.style.display = card.dataset.name.includes(termo) ? 'flex' : 'none';
    });
}
searchInput.addEventListener('keyup', aplicarFiltro);
