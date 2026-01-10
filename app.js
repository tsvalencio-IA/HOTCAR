// app.js - LÓGICA FINAL E COMPLETA

// 1. IMPORTAÇÕES
import { initializeApp } from "firebase/app";
import { getDatabase, ref, push, onValue, remove, update } from "firebase/database";
import { firebaseConfig, cloudinaryConfig, geminiKeyPart1, geminiKeyPart2 } from './config.js';

// 2. INICIALIZAÇÃO DO FIREBASE
let app, db, dbRef;
try {
    app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    dbRef = ref(db, 'hotwheels');
    console.log("Firebase conectado.");
} catch (error) {
    console.error("ERRO FIREBASE:", error);
    alert("Erro crítico na configuração do Firebase.");
}

// Variáveis Globais
const API_KEY = geminiKeyPart1 + geminiKeyPart2;
let currentImageBase64 = null;
let currentCloudinaryUrl = null;
let webcamStream = null;
let cachedData = []; 
let isEditing = false; // Flag para saber se está editando

const DEFAULT_IMAGE = "https://upload.wikimedia.org/wikipedia/commons/2/23/Hot_Wheels_logo.svg";

// 3. REFERÊNCIAS DO DOM
const dashboard = document.getElementById('dashboard');
const totalCarsEl = document.getElementById('total-cars');
const btnScan = document.getElementById('btn-scan');
const btnManual = document.getElementById('btn-manual');
const fileInput = document.getElementById('file-input');
const editFileInput = document.getElementById('edit-file-input'); // Novo input para edição
const searchInput = document.getElementById('search-input');
const btnSearchAction = document.getElementById('btn-search-action');
const modalForm = document.getElementById('modal-form');
const modalWebcam = document.getElementById('modal-webcam');
const closeModalBtn = document.querySelector('.close-modal');
const closeWebcamBtn = document.querySelector('.close-webcam');
const aiLoading = document.getElementById('ai-loading');
const videoEl = document.getElementById('webcam-video');
const canvasEl = document.getElementById('webcam-canvas');
const btnCapture = document.getElementById('btn-capture');
const btnChangePhoto = document.getElementById('btn-change-photo'); // Botão de trocar foto no form

// --- LÓGICA 1: MODOS DE ENTRADA ---

// MODO MANUAL: Adicionar sem foto obrigatória, mas permite adicionar depois
if(btnManual) btnManual.addEventListener('click', () => {
    isEditing = false;
    limparFormulario("Novo Carro");
    currentCloudinaryUrl = DEFAULT_IMAGE;
    document.getElementById('preview-img').src = DEFAULT_IMAGE;
    document.getElementById('modal-title').innerText = "Adição Manual";
    document.getElementById('inp-id').value = ""; // Limpa ID
    btnChangePhoto.style.display = 'flex'; // Mostra botão de adicionar foto
    modalForm.classList.remove('hidden');
    aiLoading.classList.add('hidden');
});

// MODO SCAN: Câmera ou Arquivo
if(btnScan) btnScan.addEventListener('click', () => {
    isEditing = false;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) fileInput.click();
    else abrirWebcamPC();
});

// Processar arquivo selecionado (Scan ou Manual)
if(fileInput) fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
        processarImagemParaAnalise(e.target.files[0]);
    }
});

// Trocar foto durante edição ou cadastro manual
if(btnChangePhoto) btnChangePhoto.addEventListener('click', () => {
    editFileInput.click();
});

if(editFileInput) editFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
        // Se trocar a foto, chama a IA novamente para re-analisar
        processarImagemParaAnalise(e.target.files[0]);
    }
});


// Funções da Webcam (Desktop)
async function abrirWebcamPC() {
    modalWebcam.classList.remove('hidden');
    try {
        webcamStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        videoEl.srcObject = webcamStream;
    } catch (err) {
        alert("Erro Webcam. Usando arquivo.");
        modalWebcam.classList.add('hidden');
        fileInput.click();
    }
}

if(btnCapture) btnCapture.addEventListener('click', () => {
    canvasEl.width = videoEl.videoWidth;
    canvasEl.height = videoEl.videoHeight;
    const ctx = canvasEl.getContext('2d');
    ctx.drawImage(videoEl, 0, 0);
    canvasEl.toBlob((blob) => {
        const file = new File([blob], "webcam_capture.jpg", { type: "image/jpeg" });
        encerrarWebcam();
        processarImagemParaAnalise(file);
    }, 'image/jpeg', 0.95);
});

function encerrarWebcam() {
    if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
        webcamStream = null;
    }
    modalWebcam.classList.add('hidden');
}

if(closeWebcamBtn) closeWebcamBtn.addEventListener('click', encerrarWebcam);

// --- LÓGICA 2: PROCESSAMENTO E IA ---

function processarImagemParaAnalise(file) {
    if (!file) return;
    modalForm.classList.remove('hidden');
    document.getElementById('modal-title').innerText = isEditing ? "Editando & Analisando..." : "IA Identificando...";
    btnChangePhoto.style.display = 'none'; // Esconde botão de troca enquanto carrega
    
    const reader = new FileReader();
    reader.onload = (e) => {
        if(e.target.result) {
            document.getElementById('preview-img').src = e.target.result;
            const base64Parts = e.target.result.split(',');
            if(base64Parts.length > 1) {
                currentImageBase64 = base64Parts[1];
                analisarComGemini(currentImageBase64);
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
        if (data.secure_url) {
            currentCloudinaryUrl = data.secure_url;
            console.log("Upload OK:", currentCloudinaryUrl);
        } else { throw new Error("Falha Cloudinary"); }
    } catch (error) {
        console.error("Erro Upload:", error);
        alert("Falha ao subir imagem. Usando padrão.");
        currentCloudinaryUrl = DEFAULT_IMAGE;
    } finally {
         btnChangePhoto.style.display = 'flex'; // Mostra botão de troca novamente
    }
}

async function analisarComGemini(base64Image) {
    aiLoading.classList.remove('hidden');
    // Não limpamos o formulário se estiver editando, apenas atualizamos
    if (!isEditing) limparFormulario("Analisando...");

    const prompt = `Analise este Hot Wheels. Retorne JSON: {"modelo": "Nome", "ano": "Ano/Série", "cor": "Cor", "curiosidade": "Curiosidade curta"}. Se não souber, retorne "modelo": "Desconhecido".`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${API_KEY}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: "image/jpeg", data: base64Image } }] }] })
        });
        const data = await response.json();
        const textResult = data.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();
        const jsonResult = JSON.parse(textResult);

        // Preenche os campos com os dados novos da IA
        document.getElementById('inp-nome').value = jsonResult.modelo || document.getElementById('inp-nome').value;
        document.getElementById('inp-ano').value = jsonResult.ano || document.getElementById('inp-ano').value;
        document.getElementById('inp-cor').value = jsonResult.cor || document.getElementById('inp-cor').value;
        document.getElementById('inp-obs').value = jsonResult.curiosidade || document.getElementById('inp-obs').value;

    } catch (error) {
        console.error("Erro IA:", error);
        if (!isEditing) document.getElementById('inp-obs').value = "IA não identificou. Preencha manualmente.";
    } finally {
        aiLoading.classList.add('hidden');
    }
}

// --- LÓGICA 3: SALVAR, EDITAR E BANCO ---

document.getElementById('car-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fotoFinal = currentCloudinaryUrl || DEFAULT_IMAGE;
    const carId = document.getElementById('inp-id').value;

    const dadosCarro = {
        nome: document.getElementById('inp-nome').value,
        ano: document.getElementById('inp-ano').value,
        cor: document.getElementById('inp-cor').value,
        obs: document.getElementById('inp-obs').value,
        status: document.getElementById('inp-status').value,
        foto: fotoFinal,
        timestamp: Date.now()
    };

    if (carId) {
        // EDIÇÃO: Atualiza o registro existente
        update(ref(db, `hotwheels/${carId}`), dadosCarro)
            .then(() => finalizarAcao("Carro atualizado! ✨"));
    } else {
        // NOVO: Cria um novo registro
        push(dbRef, dadosCarro)
            .then(() => finalizarAcao("Carro salvo! 🏁"));
    }
});

function finalizarAcao(msg) {
    modalForm.classList.add('hidden');
    limparFormulario("");
    isEditing = false;
    alert(msg);
}

// Leitura em Tempo Real
onValue(dbRef, (snapshot) => {
    dashboard.innerHTML = '';
    const data = snapshot.val();
    cachedData = [];
    let countGaragem = 0;

    if (!data) {
        totalCarsEl.innerText = "0";
        dashboard.innerHTML = '<div class="empty-state"><i class="fas fa-car-crash"></i><p>Garagem vazia.</p></div>';
        return;
    }

    const lista = Object.entries(data).reverse();
    
    lista.forEach(([id, carro]) => {
        cachedData.push({ id, ...carro });
        if (carro.status === 'colecao') countGaragem++; // Conta só os da garagem
        criarCard(id, carro);
    });
    
    totalCarsEl.innerText = countGaragem; // Atualiza contador
    aplicarFiltro();
});

function criarCard(id, carro) {
    const card = document.createElement('div');
    card.className = 'car-card';
    card.setAttribute('data-status', carro.status);
    card.setAttribute('data-name', (carro.nome || "").toLowerCase());

    const badgeClass = carro.status === 'colecao' ? 'bg-colecao' : 'bg-desejo';
    const badgeText = carro.status === 'colecao' ? 'Na Garagem' : 'Desejado';
    
    // Botão de ação principal (Mover para garagem ou Editar)
    let actionButton = '';
    if (carro.status === 'desejo') {
        actionButton = `
            <button class="btn-action btn-acquire" onclick="window.moverParaGaragem('${id}')">
                <i class="fas fa-check-circle"></i> Adquirido!
            </button>`;
    } else {
         actionButton = `
            <button class="btn-action btn-edit" onclick="window.editarCarro('${id}')">
                <i class="fas fa-edit"></i> Editar
            </button>`;
    }

    card.innerHTML = `
        <span class="badge ${badgeClass}">${badgeText}</span>
        <img src="${carro.foto}" loading="lazy" onerror="this.src='${DEFAULT_IMAGE}'">
        <div class="card-info">
            <div class="card-title">${carro.nome}</div>
            <div class="card-details">
                <p>${carro.ano}</p>
                <p style="font-size:0.75rem; color:#888">${carro.obs ? carro.obs.substring(0,40) : ''}...</p>
            </div>
            <div class="card-actions">
                ${actionButton}
                <button class="btn-delete-icon" onclick="window.deletarCarro('${id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
    dashboard.appendChild(card);
}

// --- LÓGICA 4: BUSCA E FILTROS ---

let filtroAbaAtivo = 'todos';
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        filtroAbaAtivo = e.target.getAttribute('data-filter');
        aplicarFiltro();
    });
});

if(btnSearchAction) btnSearchAction.addEventListener('click', aplicarFiltro);
if(searchInput) searchInput.addEventListener('keyup', aplicarFiltro);

function aplicarFiltro() {
    const termo = searchInput.value.toLowerCase();
    document.querySelectorAll('.car-card').forEach(card => {
        const statusCard = card.getAttribute('data-status');
        const nomeCard = card.getAttribute('data-name');
        const passaAba = (filtroAbaAtivo === 'todos') || (statusCard === filtroAbaAtivo);
        const passaTexto = nomeCard.includes(termo);
        card.style.display = (passaAba && passaTexto) ? 'flex' : 'none';
    });
}

// --- FUNÇÕES GLOBAIS ---

// Função para Editar
window.editarCarro = function(id) {
    const carro = cachedData.find(c => c.id === id);
    if (!carro) return;

    isEditing = true;
    document.getElementById('modal-title').innerText = "Editar Carro";
    document.getElementById('inp-id').value = id; // Salva o ID
    document.getElementById('inp-nome').value = carro.nome;
    document.getElementById('inp-ano').value = carro.ano;
    document.getElementById('inp-cor').value = carro.cor;
    document.getElementById('inp-obs').value = carro.obs;
    document.getElementById('inp-status').value = carro.status;
    document.getElementById('preview-img').src = carro.foto;
    currentCloudinaryUrl = carro.foto; // Mantém a foto atual se não trocar
    
    btnChangePhoto.style.display = 'flex'; // Mostra opção de trocar foto
    aiLoading.classList.add('hidden');
    modalForm.classList.remove('hidden');
}

// Função para Mover de Desejo -> Garagem
window.moverParaGaragem = function(id) {
    update(ref(db, `hotwheels/${id}`), { status: 'colecao' })
        .then(() => alert("Parabéns! Carro movido para a garagem! 🎉"));
}

window.deletarCarro = function(id) {
    if (confirm("Remover este carro permanentemente?")) remove(ref(db, `hotwheels/${id}`));
}

if(closeModalBtn) closeModalBtn.addEventListener('click', () => {
    modalForm.classList.add('hidden');
    isEditing = false;
});

function limparFormulario(titulo) {
    document.getElementById('inp-nome').value = titulo;
    document.getElementById('inp-ano').value = "";
    document.getElementById('inp-cor').value = "";
    document.getElementById('inp-obs').value = "";
    document.getElementById('inp-status').value = "colecao";
    document.getElementById('inp-id').value = "";
}
