// app.js - LÓGICA CORRIGIDA E ROBUSTA

// 1. IMPORTAÇÕES
import { initializeApp } from "firebase/app";
import { getDatabase, ref, push, onValue, remove } from "firebase/database";
import { firebaseConfig, cloudinaryConfig, geminiKeyPart1, geminiKeyPart2 } from './config.js';

// 2. INICIALIZAÇÃO DO FIREBASE
let app, db, dbRef;
try {
    app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    dbRef = ref(db, 'hotwheels');
    console.log("Firebase conectado com sucesso.");
} catch (error) {
    console.error("ERRO FIREBASE:", error);
    alert("Erro crítico: Verifique se o arquivo config.js está preenchido corretamente.");
}

// Variáveis Globais
const API_KEY = geminiKeyPart1 + geminiKeyPart2;
let currentImageBase64 = null;
let currentCloudinaryUrl = null; // Se null, usa imagem padrão
let webcamStream = null;
let cachedData = []; // Cache local para busca rápida

// URL de imagem padrão (Logo Hot Wheels) caso não tenha foto
const DEFAULT_IMAGE = "https://upload.wikimedia.org/wikipedia/commons/2/23/Hot_Wheels_logo.svg";

// 3. REFERÊNCIAS DO DOM
const dashboard = document.getElementById('dashboard');
const totalCarsEl = document.getElementById('total-cars');
const btnScan = document.getElementById('btn-scan');
const btnManual = document.getElementById('btn-manual'); // Botão novo
const fileInput = document.getElementById('file-input');
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

// --- LÓGICA 1: MODOS DE ENTRADA (SCAN vs MANUAL) ---

// MODO MANUAL: Adicionar sem foto obrigatória
if(btnManual) btnManual.addEventListener('click', () => {
    limparFormulario("Novo Carro");
    currentCloudinaryUrl = DEFAULT_IMAGE; // Define imagem padrão
    document.getElementById('preview-img').src = DEFAULT_IMAGE;
    document.getElementById('modal-title').innerText = "Adição Manual";
    modalForm.classList.remove('hidden');
    aiLoading.classList.add('hidden');
});

// MODO SCAN: Câmera ou Arquivo
if(btnScan) btnScan.addEventListener('click', () => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
        fileInput.click(); // Celular: Abre câmera nativa
    } else {
        abrirWebcamPC(); // PC: Abre modal webcam
    }
});

// Processar arquivo selecionado (Celular ou Upload)
if(fileInput) fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
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
        alert("Erro na Webcam. Usando seletor de arquivos.");
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
    document.getElementById('modal-title').innerText = "IA Identificando...";
    
    const reader = new FileReader();
    
    // CORREÇÃO DO ERRO SPLIT: Só executamos quando carregar
    reader.onload = (e) => {
        if(e.target.result) {
            document.getElementById('preview-img').src = e.target.result;
            // Pega apenas a parte Base64 da string
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

// Upload para Cloudinary
async function fazerUploadCloudinary(file) {
    currentCloudinaryUrl = null; // Reseta para garantir que espere o novo
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
        } else {
            throw new Error("Cloudinary não retornou URL");
        }
    } catch (error) {
        console.error("Erro Upload:", error);
        alert("Aviso: Falha ao subir imagem. O carro será salvo sem foto.");
        currentCloudinaryUrl = DEFAULT_IMAGE;
    }
}

// IA Gemini
async function analisarComGemini(base64Image) {
    aiLoading.classList.remove('hidden');
    limparFormulario("Analisando...");

    const prompt = `Analise este Hot Wheels. Retorne JSON: {"modelo": "Nome", "ano": "Ano/Série", "cor": "Cor", "curiosidade": "Curiosidade curta"}. Se não souber, retorne "modelo": "Desconhecido".`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: "image/jpeg", data: base64Image } }] }]
            })
        });

        const data = await response.json();
        const textResult = data.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();
        const jsonResult = JSON.parse(textResult);

        document.getElementById('inp-nome').value = jsonResult.modelo || "";
        document.getElementById('inp-ano').value = jsonResult.ano || "";
        document.getElementById('inp-cor').value = jsonResult.cor || "";
        document.getElementById('inp-obs').value = jsonResult.curiosidade || "";

    } catch (error) {
        console.error("Erro IA:", error);
        document.getElementById('inp-nome').value = ""; 
        document.getElementById('inp-obs').value = "Preencha manualmente.";
    } finally {
        aiLoading.classList.add('hidden');
    }
}

// --- LÓGICA 3: SALVAR E BANCO ---

document.getElementById('car-form').addEventListener('submit', (e) => {
    e.preventDefault();

    // Se não tiver URL ainda (upload lento), espera ou usa padrão
    const fotoFinal = currentCloudinaryUrl || DEFAULT_IMAGE;

    const novoCarro = {
        nome: document.getElementById('inp-nome').value,
        ano: document.getElementById('inp-ano').value,
        cor: document.getElementById('inp-cor').value,
        obs: document.getElementById('inp-obs').value,
        status: document.getElementById('inp-status').value,
        foto: fotoFinal,
        timestamp: Date.now()
    };

    push(dbRef, novoCarro)
        .then(() => {
            modalForm.classList.add('hidden');
            limparFormulario("");
            alert("Carro salvo com sucesso! 🏁");
        })
        .catch(err => {
            alert("Erro ao salvar no banco. Verifique as 'Regras' do Firebase.");
            console.error(err);
        });
});

// Leitura em Tempo Real (Resolve o problema das Abas)
onValue(dbRef, (snapshot) => {
    dashboard.innerHTML = '';
    const data = snapshot.val();
    cachedData = [];

    if (!data) {
        totalCarsEl.innerText = "0";
        dashboard.innerHTML = '<div class="empty-state"><i class="fas fa-car-crash"></i><p>Garagem vazia.</p></div>';
        return;
    }

    const lista = Object.entries(data).reverse();
    totalCarsEl.innerText = lista.length;

    lista.forEach(([id, carro]) => {
        cachedData.push({ id, ...carro }); // Guarda no cache para busca
        criarCard(id, carro);
    });
    
    // Força aplicar o filtro atual após carregar dados
    aplicarFiltro();
});

function criarCard(id, carro) {
    const card = document.createElement('div');
    card.className = 'car-card';
    // Atributos vitais para o filtro funcionar
    card.setAttribute('data-status', carro.status);
    card.setAttribute('data-name', (carro.nome || "").toLowerCase());

    const badgeClass = carro.status === 'colecao' ? 'bg-colecao' : 'bg-desejo';
    const badgeText = carro.status === 'colecao' ? 'Na Garagem' : 'Desejado';

    card.innerHTML = `
        <span class="badge ${badgeClass}">${badgeText}</span>
        <img src="${carro.foto}" loading="lazy" onerror="this.src='${DEFAULT_IMAGE}'">
        <div class="card-info">
            <div class="card-title">${carro.nome}</div>
            <div class="card-details">
                <p>${carro.ano}</p>
                <p style="font-size:0.75rem; color:#888">${carro.obs ? carro.obs.substring(0,40) : ''}...</p>
            </div>
            <button class="btn-delete" onclick="window.deletarCarro('${id}')">
                <i class="fas fa-trash"></i> Remover
            </button>
        </div>
    `;
    dashboard.appendChild(card);
}

// --- LÓGICA 4: BUSCA E FILTROS (Corrigidos) ---

let filtroAbaAtivo = 'todos'; // Estado global da aba

// Clique nas Abas
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        // Visual
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        
        // Lógica
        filtroAbaAtivo = e.target.getAttribute('data-filter');
        aplicarFiltro();
    });
});

// Clique na Lupa e Enter
if(btnSearchAction) btnSearchAction.addEventListener('click', aplicarFiltro);
if(searchInput) searchInput.addEventListener('keyup', aplicarFiltro);

function aplicarFiltro() {
    const termo = searchInput.value.toLowerCase();
    const cards = document.querySelectorAll('.car-card');

    cards.forEach(card => {
        const statusCard = card.getAttribute('data-status');
        const nomeCard = card.getAttribute('data-name');
        
        // Lógica: Precisa passar no filtro da Aba E no filtro de Texto
        const passaAba = (filtroAbaAtivo === 'todos') || (statusCard === filtroAbaAtivo);
        const passaTexto = nomeCard.includes(termo);

        if (passaAba && passaTexto) {
            card.style.display = 'flex';
        } else {
            card.style.display = 'none';
        }
    });
}

// --- UTILITÁRIOS ---
window.deletarCarro = function(id) {
    if (confirm("Remover este carro?")) remove(ref(db, `hotwheels/${id}`));
}

if(closeModalBtn) closeModalBtn.addEventListener('click', () => modalForm.classList.add('hidden'));

function limparFormulario(titulo) {
    document.getElementById('inp-nome').value = titulo;
    document.getElementById('inp-ano').value = "";
    document.getElementById('inp-cor').value = "";
    document.getElementById('inp-obs').value = "";
    document.getElementById('inp-status').value = "colecao";
}
