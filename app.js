// app.js - VERSÃO COM AUTH ANÔNIMO, SEGMENTAÇÃO DE DADOS E VALIDAÇÃO RÍGIDA

// 1. IMPORTAÇÕES
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getDatabase, ref, push, onValue, remove, update } from "firebase/database";
import { firebaseConfig, cloudinaryConfig, geminiKeyPart1, geminiKeyPart2, ADMIN_UIDS } from './config.js';

// 2. INICIALIZAÇÃO DO SISTEMA
let app, auth, db;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getDatabase(app);
    console.log("Sistema HW Garage: Módulo Seguro Iniciado.");
} catch (error) {
    console.error("Erro Crítico Firebase:", error);
    alert("Falha na conexão com o banco de dados. Verifique o console.");
}

// Variáveis Globais
const API_KEY = geminiKeyPart1 + geminiKeyPart2;
let currentImageBase64 = null;
let currentCloudinaryUrl = null;
let webcamStream = null;
let cachedData = []; // Cache local da coleção do usuário atual
let isEditing = false;
let currentUid = null;
let isAdmin = false;

// Imagem padrão
const DEFAULT_IMAGE = "https://upload.wikimedia.org/wikipedia/commons/2/23/Hot_Wheels_logo.svg";

// 3. ELEMENTOS DO DOM
const loginScreen = document.getElementById('login-screen');
const authStatus = document.getElementById('auth-status');
const appContainer = document.getElementById('app-container');
const displayUsername = document.getElementById('display-username');
const dashboard = document.getElementById('dashboard');
const totalCarsEl = document.getElementById('total-cars');
const totalWishEl = document.getElementById('total-wish'); // Elemento pode não existir no HTML original, mas mantido para lógica se existir
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

// --- 4. AUTENTICAÇÃO E INICIALIZAÇÃO ---

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUid = user.uid;
        displayUsername.innerText = currentUid.substring(0, 6) + "...";
        
        // Verifica Admin Mode
        if (ADMIN_UIDS.includes(currentUid)) {
            isAdmin = true;
            document.body.classList.add('admin-mode');
            console.log("Modo Admin Ativo");
        }

        // Carrega dados e libera UI
        loginScreen.classList.add('hidden');
        appContainer.classList.remove('hidden');
        carregarColecao();
    } else {
        signInAnonymously(auth).catch((error) => {
            authStatus.innerText = "Erro no Login: " + error.message;
        });
    }
});

function carregarColecao() {
    if (!currentUid) return;
    
    // SEGMENTAÇÃO DE DADOS: /hotwheels/{userId}/cars
    const dbRef = ref(db, `hotwheels/${currentUid}/cars`);

    onValue(dbRef, (snapshot) => {
        dashboard.innerHTML = '';
        const data = snapshot.val();
        cachedData = [];
        let countGaragem = 0;
        let countDesejo = 0;

        if (!data) {
            totalCarsEl.innerText = "0";
            if(document.getElementById('total-wish')) document.getElementById('total-wish').innerText = "0";
            dashboard.innerHTML = '<div class="empty-state"><i class="fas fa-folder-open"></i><p>Garagem vazia. Comece a escanear!</p></div>';
            return;
        }

        const lista = Object.entries(data).reverse();
        
        lista.forEach(([id, carro]) => {
            // Migração de dados antigos se necessário (adiciona castingId se não existir)
            if (!carro.castingId) carro.castingId = generateCastingId(carro.nome);
            
            cachedData.push({ id, ...carro });
            if (carro.status === 'colecao') countGaragem++;
            if (carro.status === 'desejo') countDesejo++;
            criarCard(id, carro);
        });
        
        totalCarsEl.innerText = countGaragem;
        if(document.getElementById('total-wish')) document.getElementById('total-wish').innerText = countDesejo;
        aplicarFiltro();
    });
}

// --- 5. LÓGICA DE NEGÓCIO ---

function generateCastingId(name) {
    if (!name) return "unknown_casting";
    return name.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
}

// Botão Manual
if (btnManual) {
    btnManual.addEventListener('click', () => {
        isEditing = false;
        limparFormulario("Novo Carro");
        currentCloudinaryUrl = DEFAULT_IMAGE;
        document.getElementById('preview-img').src = DEFAULT_IMAGE;
        document.getElementById('modal-title').innerText = "Cadastro Manual";
        document.getElementById('inp-id').value = "";
        
        // Configuração Manual
        document.getElementById('inp-origin').value = "manual";
        document.getElementById('inp-confidence').value = "high";
        
        btnChangePhoto.style.display = 'flex';
        modalForm.classList.remove('hidden');
        aiLoading.classList.add('hidden');
    });
}

// Botão Scan
if (btnScan) {
    btnScan.addEventListener('click', () => {
        isEditing = false;
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (isMobile) fileInput.click();
        else abrirWebcamPC();
    });
}

// Inputs de Arquivo
if (fileInput) {
    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) processarImagemParaAnalise(e.target.files[0]);
    });
}
if (btnChangePhoto) btnChangePhoto.addEventListener('click', () => editFileInput.click());
if (editFileInput) {
    editFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) processarImagemParaAnalise(e.target.files[0]);
    });
}

// Webcam
async function abrirWebcamPC() {
    modalWebcam.classList.remove('hidden');
    try {
        webcamStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment", width: { ideal: 1920 } } 
        });
        videoEl.srcObject = webcamStream;
    } catch (err) {
        try {
            webcamStream = await navigator.mediaDevices.getUserMedia({ video: true });
            videoEl.srcObject = webcamStream;
        } catch (err2) {
            alert("Erro na Webcam.");
            modalWebcam.classList.add('hidden');
        }
    }
}

if (btnCapture) {
    btnCapture.addEventListener('click', () => {
        canvasEl.width = videoEl.videoWidth;
        canvasEl.height = videoEl.videoHeight;
        const ctx = canvasEl.getContext('2d');
        ctx.drawImage(videoEl, 0, 0);
        canvasEl.toBlob((blob) => {
            const file = new File([blob], "scan.png", { type: "image/png" });
            encerrarWebcam();
            processarImagemParaAnalise(file);
        }, 'image/png');
    });
}

function encerrarWebcam() {
    if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
        webcamStream = null;
    }
    modalWebcam.classList.add('hidden');
}
if (closeWebcamBtn) closeWebcamBtn.addEventListener('click', encerrarWebcam);

// --- 6. PROCESSAMENTO IA ---

function processarImagemParaAnalise(file) {
    modalForm.classList.remove('hidden');
    document.getElementById('modal-title').innerText = "Consultando Oráculo...";
    btnChangePhoto.style.display = 'none';
    
    const reader = new FileReader();
    reader.onload = (e) => {
        if (e.target.result) {
            document.getElementById('preview-img').src = e.target.result;
            const base64Parts = e.target.result.split(',');
            if (base64Parts.length > 1) {
                currentImageBase64 = base64Parts[1];
                identificarComGoogleSearch(currentImageBase64);
            }
        }
        fazerUploadCloudinary(file);
    };
    reader.readAsDataURL(file);
}

async function fazerUploadCloudinary(file) {
    currentCloudinaryUrl = null; 
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', cloudinaryConfig.uploadPreset);

    try {
        const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`, {
            method: 'POST', body: formData
        });
        const data = await response.json();
        if (data.secure_url) currentCloudinaryUrl = data.secure_url;
    } catch (error) {
        currentCloudinaryUrl = DEFAULT_IMAGE;
    } finally {
         btnChangePhoto.style.display = 'flex';
    }
}

async function identificarComGoogleSearch(base64Image) {
    aiLoading.classList.remove('hidden');
    if (!isEditing) limparFormulario("Analisando...");

    const prompt = `
    Aja como um Arquivista Sênior da Mattel. Identifique o Casting Name (Modelo) com precisão.
    
    1. LEIA O TEXTO no chassi ou lateral.
    2. IGNORE nomes de séries na cartela (ex: "Slide Street", "Turbo").
    3. ANALISE a forma do carro.
    4. CONFIRME com Google Search.
    
    Retorne JSON:
    {
        "modelo": "Nome Oficial do Casting",
        "castingId": "ID técnico normalizado (ex: twin_mill_iii)",
        "ano": "Série / Coleção",
        "cor": "Descrição da cor",
        "curiosidade": "Fato técnico validado",
        "confidenceLevel": "high, medium ou low"
    }
    `;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${API_KEY}`, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: "image/png", data: base64Image } }] }],
                tools: [{ google_search: {} }],
                generationConfig: { temperature: 0.0 }
            })
        });
        
        const data = await response.json();
        if(!data.candidates) throw new Error("Erro IA");

        let textResult = data.candidates[0].content.parts[0].text.replace(/```json|```/g, '');
        const jsonStartIndex = textResult.indexOf('{');
        const jsonEndIndex = textResult.lastIndexOf('}');
        if (jsonStartIndex !== -1) textResult = textResult.substring(jsonStartIndex, jsonEndIndex + 1);
        
        const jsonResult = JSON.parse(textResult);

        // Preencher Campos e Metadados
        document.getElementById('inp-nome').value = jsonResult.modelo || "";
        document.getElementById('inp-ano').value = jsonResult.ano || "";
        document.getElementById('inp-cor').value = jsonResult.cor || "";
        document.getElementById('inp-obs').value = jsonResult.curiosidade || "";
        
        // Campos Ocultos
        document.getElementById('inp-origin').value = "IA";
        document.getElementById('inp-confidence').value = jsonResult.confidenceLevel || "medium";
        document.getElementById('inp-casting-id').value = jsonResult.castingId || generateCastingId(jsonResult.modelo);
        document.getElementById('inp-casting-id-display').value = document.getElementById('inp-casting-id').value;

    } catch (error) {
        console.error("Erro Oráculo:", error);
        if(!isEditing) {
            document.getElementById('inp-nome').placeholder = "Não identificado. Digite...";
            document.getElementById('inp-origin').value = "manual"; // Fallback
            document.getElementById('inp-confidence').value = "low";
        }
    } finally {
        aiLoading.classList.add('hidden');
    }
}

// --- 7. VALIDAÇÃO E SALVAMENTO ---

btnSaveCar.addEventListener('click', (e) => {
    e.preventDefault();
    if (!currentUid) return alert("Erro de autenticação.");

    const nome = document.getElementById('inp-nome').value.trim();
    const ano = document.getElementById('inp-ano').value.trim();
    const cor = document.getElementById('inp-cor').value.trim();
    const carId = document.getElementById('inp-id').value;
    
    // Validação de Campos Obrigatórios
    if (!nome) return alert("O nome do modelo é obrigatório.");

    // Geração de castingId se vazio (caso manual)
    let castingId = document.getElementById('inp-casting-id').value;
    if (!castingId) castingId = generateCastingId(nome);

    // Validação de Duplicidade (Bloqueio Rígido)
    if (!isEditing) {
        const isDuplicate = cachedData.some(c => 
            c.status === 'colecao' && // Apenas na garagem
            c.castingId === castingId &&
            c.ano === ano &&
            c.cor === cor
        );

        if (isDuplicate) {
            return alert(`BLOQUEIO DE DUPLICIDADE:\nVocê já possui o ${nome} (${ano}, ${cor}) na garagem.`);
        }
    }

    const fotoFinal = currentCloudinaryUrl || DEFAULT_IMAGE;
    
    const dadosCarro = {
        nome: nome,
        castingId: castingId,
        ano: ano,
        cor: cor,
        obs: document.getElementById('inp-obs').value,
        status: document.getElementById('inp-status').value,
        origin: document.getElementById('inp-origin').value || 'manual',
        confidenceLevel: document.getElementById('inp-confidence').value || 'high',
        foto: fotoFinal,
        timestamp: Date.now()
    };

    const dbPath = `hotwheels/${currentUid}/cars`;
    
    if (carId) {
        update(ref(db, `${dbPath}/${carId}`), dadosCarro).then(() => finalizarAcao("Atualizado!"));
    } else {
        push(ref(db, dbPath), dadosCarro).then(() => finalizarAcao("Salvo!"));
    }
});

function finalizarAcao(msg) {
    modalForm.classList.add('hidden');
    limparFormulario("");
    isEditing = false;
    alert(msg);
}

// Funções Globais
window.editarCarro = function(id) {
    const carro = cachedData.find(c => c.id === id);
    if (carro) abrirFichaExistente(carro);
}

window.moverParaGaragem = function(id) {
    if (!currentUid) return;
    update(ref(db, `hotwheels/${currentUid}/cars/${id}`), { status: 'colecao' })
        .then(() => alert("Adicionado à Garagem!"));
}

window.deletarCarro = function(id) {
    if (!currentUid) return;
    if (confirm("Apagar?")) remove(ref(db, `hotwheels/${currentUid}/cars/${id}`));
}

function abrirFichaExistente(carro) {
    isEditing = true;
    document.getElementById('modal-title').innerText = "Detalhes";
    document.getElementById('inp-id').value = carro.id;
    document.getElementById('inp-nome').value = carro.nome;
    document.getElementById('inp-casting-id').value = carro.castingId || generateCastingId(carro.nome);
    document.getElementById('inp-casting-id-display').value = document.getElementById('inp-casting-id').value;
    document.getElementById('inp-ano').value = carro.ano;
    document.getElementById('inp-cor').value = carro.cor;
    document.getElementById('inp-obs').value = carro.obs;
    document.getElementById('inp-status').value = carro.status;
    document.getElementById('inp-origin').value = carro.origin || 'manual';
    document.getElementById('inp-confidence').value = carro.confidenceLevel || 'high';
    
    document.getElementById('preview-img').src = carro.foto;
    currentCloudinaryUrl = carro.foto;
    btnChangePhoto.style.display = 'flex';
    modalForm.classList.remove('hidden');
}

if (closeModalBtn) closeModalBtn.addEventListener('click', () => {
    modalForm.classList.add('hidden');
    isEditing = false;
});

function limparFormulario(titulo) {
    document.getElementById('inp-nome').value = titulo;
    document.getElementById('inp-casting-id').value = "";
    document.getElementById('inp-casting-id-display').value = "";
    document.getElementById('inp-ano').value = "";
    document.getElementById('inp-cor').value = "";
    document.getElementById('inp-obs').value = "";
    document.getElementById('inp-status').value = "colecao";
    document.getElementById('inp-id').value = "";
    document.getElementById('inp-origin').value = "manual";
    document.getElementById('inp-confidence').value = "high";
}

// Filtro
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        aplicarFiltro();
    });
});
searchInput.addEventListener('keyup', aplicarFiltro);

function aplicarFiltro() {
    const tipo = document.querySelector('.tab.active').getAttribute('data-filter');
    const termo = searchInput.value.toLowerCase();
    document.querySelectorAll('.car-card').forEach(card => {
        const status = card.getAttribute('data-status');
        const nome = card.getAttribute('data-name');
        const show = (tipo === 'todos' || status === tipo) && nome.includes(termo);
        card.style.display = show ? 'flex' : 'none';
    });
}

// Renderização do Card
function criarCard(id, carro) {
    const card = document.createElement('div');
    card.className = 'car-card';
    card.setAttribute('data-status', carro.status);
    card.setAttribute('data-name', (carro.nome || "").toLowerCase() + " " + (carro.castingId || ""));

    const badgeClass = carro.status === 'colecao' ? 'bg-colecao' : 'bg-desejo';
    const badgeText = carro.status === 'colecao' ? 'Garagem' : 'Desejado';
    
    // Indicador de Confiança/Origem (Visual Admin)
    let metaInfo = "";
    if (isAdmin) {
        metaInfo = `<div style="font-size:0.7rem; color:#aaa; margin-top:5px;">Origin: ${carro.origin} | Conf: ${carro.confidenceLevel}</div>`;
    }

    let actionButtons = '';
    if (carro.status === 'desejo') {
        actionButtons = `<button class="btn-action btn-acquire" onclick="window.moverParaGaragem('${id}')"><i class="fas fa-check"></i> Adquiri!</button>`;
    } else {
        actionButtons = `<button class="btn-action btn-edit" onclick="window.editarCarro('${id}')"><i class="fas fa-pen"></i> Editar</button>`;
    }
    actionButtons += `<button class="btn-delete-icon" onclick="window.deletarCarro('${id}')"><i class="fas fa-trash-alt"></i></button>`;

    card.innerHTML = `
        <span class="badge ${badgeClass}">${badgeText}</span>
        <img src="${carro.foto}" loading="lazy" onerror="this.src='${DEFAULT_IMAGE}'">
        <div class="card-info">
            <div class="card-title">${carro.nome}</div>
            <div class="card-details">
                <p><strong>Série:</strong> ${carro.ano}</p>
                <p class="obs-text">${carro.obs ? carro.obs.substring(0,60) : ''}...</p>
                ${metaInfo}
            </div>
            <div class="card-actions">
                ${actionButtons}
            </div>
        </div>
    `;
    dashboard.appendChild(card);
}
