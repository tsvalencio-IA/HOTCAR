// app.js - LÓGICA COMPLETA E INTEGRADA

// 1. IMPORTAÇÕES (Via Import Map para compatibilidade total)
import { initializeApp } from "firebase/app";
import { getDatabase, ref, push, onValue, remove } from "firebase/database";
import { firebaseConfig, cloudinaryConfig, geminiKeyPart1, geminiKeyPart2 } from './config.js';

// 2. INICIALIZAÇÃO DO SISTEMA
let app, db, dbRef;
try {
    app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    dbRef = ref(db, 'hotwheels');
    console.log("Sistema Iniciado: Firebase Conectado");
} catch (error) {
    console.error("Erro Crítico ao iniciar Firebase:", error);
    alert("Erro de configuração. Verifique o console.");
}

// Variáveis Globais de Controle
const API_KEY = geminiKeyPart1 + geminiKeyPart2;
let currentImageBase64 = null;
let currentCloudinaryUrl = null;
let webcamStream = null;
let cachedData = []; // Cache local para busca rápida

// 3. REFERÊNCIAS DO DOM (Elementos da tela)
// Dashboard
const dashboard = document.getElementById('dashboard');
const totalCarsEl = document.getElementById('total-cars');

// Botões e Inputs
const btnScan = document.getElementById('btn-scan');
const fileInput = document.getElementById('file-input');
const searchInput = document.getElementById('search-input');
const btnSearchAction = document.getElementById('btn-search-action');

// Modais
const modalForm = document.getElementById('modal-form');
const modalWebcam = document.getElementById('modal-webcam');
const closeModalBtn = document.querySelector('.close-modal');
const closeWebcamBtn = document.querySelector('.close-webcam');
const aiLoading = document.getElementById('ai-loading');

// Webcam Elementos
const videoEl = document.getElementById('webcam-video');
const canvasEl = document.getElementById('webcam-canvas');
const btnCapture = document.getElementById('btn-capture');

// --- LÓGICA 1: SISTEMA DE CÂMERA INTELIGENTE ---

btnScan.addEventListener('click', () => {
    // Detecção de Dispositivo Móvel
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile) {
        // Mobile: Abre o input de arquivo (aciona câmera nativa)
        console.log("Modo Mobile detectado");
        fileInput.click();
    } else {
        // Desktop: Abre o modal de Webcam
        console.log("Modo Desktop detectado");
        abrirWebcamPC();
    }
});

// Ação quando o usuário tira foto no celular
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
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
        console.error("Erro webcam:", err);
        alert("Não foi possível acessar a webcam. Verifique as permissões ou use 'Escanear' no celular.");
        modalWebcam.classList.add('hidden');
    }
}

btnCapture.addEventListener('click', () => {
    // Desenha o frame atual do vídeo no canvas
    canvasEl.width = videoEl.videoWidth;
    canvasEl.height = videoEl.videoHeight;
    const ctx = canvasEl.getContext('2d');
    ctx.drawImage(videoEl, 0, 0);

    // Converte para Blob (arquivo)
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


// --- LÓGICA 2: PROCESSAMENTO, IA E UPLOAD ---

function processarImagemParaAnalise(file) {
    // 1. Abre o modal de formulário
    modalForm.classList.remove('hidden');
    
    // 2. Cria preview local
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('preview-img').src = e.target.result;
        currentImageBase64 = e.target.result.split(',')[1]; // Remove cabeçalho data:image
        
        // 3. Dispara processos paralelos: IA e Upload
        analisarComGemini(currentImageBase64);
        fazerUploadCloudinary(file);
    };
    reader.readAsDataURL(file);
}

// Upload para Cloudinary
async function fazerUploadCloudinary(file) {
    currentCloudinaryUrl = null; // Reseta URL anterior
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', cloudinaryConfig.uploadPreset);

    try {
        const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`, {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        currentCloudinaryUrl = data.secure_url;
        console.log("Upload Cloudinary concluído:", currentCloudinaryUrl);
    } catch (error) {
        console.error("Erro Upload:", error);
        alert("Erro ao salvar a imagem na nuvem. Verifique sua internet.");
    }
}

// Análise Gemini (IA)
async function analisarComGemini(base64Image) {
    aiLoading.classList.remove('hidden');
    limparFormulario("Consultando Especialista...");

    const prompt = `
    Você é um especialista em Hot Wheels. Analise a imagem fornecida.
    Retorne APENAS um JSON válido (sem markdown, sem crases) com a seguinte estrutura exata:
    {
        "modelo": "Nome do modelo (Ex: Twin Mill)",
        "ano": "Ano ou Série (Ex: 2024 Mainline)",
        "cor": "Cor predominante",
        "curiosidade": "Uma curiosidade curta e divertida sobre este carro (máx 20 palavras)."
    }
    Se a imagem não for clara ou não for um carro, retorne "modelo": "Desconhecido".
    Seja honesto, não invente informações.
    `;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        { inline_data: { mime_type: "image/jpeg", data: base64Image } }
                    ]
                }]
            })
        });

        const data = await response.json();
        
        // Tratamento da resposta da IA
        if (!data.candidates || !data.candidates[0].content) throw new Error("Sem resposta da IA");
        
        let textResult = data.candidates[0].content.parts[0].text;
        // Limpeza de Markdown (caso a IA envie ```json ... ```)
        textResult = textResult.replace(/```json/g, '').replace(/```/g, '').trim();
        
        const jsonResult = JSON.parse(textResult);

        // Preenche os campos
        document.getElementById('inp-nome').value = jsonResult.modelo || "";
        document.getElementById('inp-ano').value = jsonResult.ano || "";
        document.getElementById('inp-cor').value = jsonResult.cor || "";
        document.getElementById('inp-obs').value = jsonResult.curiosidade || "";

        // Verificação de Duplicidade (Requisito do Usuário)
        checarDuplicidade(jsonResult.modelo);

    } catch (error) {
        console.error("Erro IA:", error);
        document.getElementById('inp-nome').value = "";
        document.getElementById('inp-obs').value = "A IA não conseguiu identificar. Preencha manualmente.";
    } finally {
        aiLoading.classList.add('hidden');
    }
}

function checarDuplicidade(nomeModelo) {
    if (!nomeModelo || nomeModelo === "Desconhecido") return;

    // Procura no Cache local se o nome já existe
    const duplicado = cachedData.find(carro => 
        carro.nome.toLowerCase().includes(nomeModelo.toLowerCase()) && carro.status === 'colecao'
    );

    if (duplicado) {
        alert(`⚠️ ATENÇÃO: Você já tem um "${nomeModelo}" na garagem! O sistema sugeriu salvar como 'Desejo' ou 'Troca'.`);
        document.getElementById('inp-status').value = 'desejo';
    } else {
        document.getElementById('inp-status').value = 'colecao';
    }
}

// --- LÓGICA 3: SALVAR E BANCO DE DADOS ---

document.getElementById('car-form').addEventListener('submit', (e) => {
    e.preventDefault();

    if (!currentCloudinaryUrl) {
        alert("Por favor, aguarde o upload da imagem terminar (alguns segundos).");
        return;
    }

    const novoCarro = {
        nome: document.getElementById('inp-nome').value,
        ano: document.getElementById('inp-ano').value,
        cor: document.getElementById('inp-cor').value,
        obs: document.getElementById('inp-obs').value,
        status: document.getElementById('inp-status').value,
        foto: currentCloudinaryUrl,
        timestamp: Date.now()
    };

    push(dbRef, novoCarro)
        .then(() => {
            modalForm.classList.add('hidden');
            limparFormulario("");
            alert("Carro salvo com sucesso! 🏎️");
        })
        .catch(err => alert("Erro ao salvar no banco: " + err.message));
});

// Listener em Tempo Real (Lê o banco sempre que algo muda)
onValue(dbRef, (snapshot) => {
    dashboard.innerHTML = '';
    const data = snapshot.val();
    cachedData = []; // Limpa cache

    if (!data) {
        totalCarsEl.innerText = "0";
        dashboard.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-warehouse"></i>
                <p>Sua garagem está vazia.</p>
                <p>Clique em "Escanear Carro" para começar!</p>
            </div>`;
        return;
    }

    // Transforma objeto em array e inverte (mais novos primeiro)
    const lista = Object.entries(data).reverse();
    totalCarsEl.innerText = lista.length;

    lista.forEach(([id, carro]) => {
        // Adiciona ao cache para busca
        cachedData.push({ id, ...carro });

        // Cria o Card
        criarCardHTML(id, carro);
    });
    
    // Reaplica filtro atual se necessário
    aplicarFiltroAtual();
});

function criarCardHTML(id, carro) {
    const card = document.createElement('div');
    card.className = 'car-card';
    card.setAttribute('data-status', carro.status); // Para filtragem
    card.setAttribute('data-name', carro.nome.toLowerCase()); // Para busca

    const badgeClass = carro.status === 'colecao' ? 'bg-colecao' : 'bg-desejo';
    const badgeText = carro.status === 'colecao' ? 'Na Garagem' : 'Desejado';

    card.innerHTML = `
        <span class="badge ${badgeClass}">${badgeText}</span>
        <img src="${carro.foto}" alt="${carro.nome}" loading="lazy">
        <div class="card-info">
            <div class="card-title">${carro.nome}</div>
            <div class="card-details">
                <p><i class="fas fa-calendar-alt"></i> ${carro.ano}</p>
                <p style="margin-top:5px; font-style:italic; font-size:0.75rem">"${carro.obs ? carro.obs.substring(0, 45) : ''}..."</p>
            </div>
            <button class="btn-delete" onclick="window.deletarCarro('${id}')">
                <i class="fas fa-trash-alt"></i> Remover
            </button>
        </div>
    `;
    dashboard.appendChild(card);
}

// --- LÓGICA 4: BUSCA E FILTROS ---

// Variável para saber qual aba está ativa
let filtroAtivo = 'todos';

// Eventos de clique nas abas
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        // Atualiza visual das abas
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        
        // Atualiza lógica
        filtroAtivo = e.target.getAttribute('data-filter');
        aplicarFiltroAtual();
    });
});

// Eventos de Busca (Botão e Enter)
btnSearchAction.addEventListener('click', aplicarFiltroAtual);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') aplicarFiltroAtual();
});

function aplicarFiltroAtual() {
    const termoBusca = searchInput.value.toLowerCase();
    const cards = document.querySelectorAll('.car-card');

    cards.forEach(card => {
        const statusCard = card.getAttribute('data-status');
        const nomeCard = card.getAttribute('data-name');
        
        // Regra 1: O card corresponde à aba atual?
        const correspondeAba = (filtroAtivo === 'todos') || (statusCard === filtroAtivo);
        
        // Regra 2: O card corresponde à busca digitada?
        const correspondeBusca = nomeCard.includes(termoBusca);

        // Só mostra se passar nas duas regras
        if (correspondeAba && correspondeBusca) {
            card.style.display = 'flex';
        } else {
            card.style.display = 'none';
        }
    });
}

// --- FUNÇÕES GLOBAIS E UTILITÁRIOS ---

window.deletarCarro = function(id) {
    if (confirm("Tem certeza que deseja vender (excluir) este carro da coleção?")) {
        remove(ref(db, `hotwheels/${id}`))
            .catch(err => alert("Erro ao excluir: " + err.message));
    }
}

if(closeModalBtn) closeModalBtn.addEventListener('click', () => modalForm.classList.add('hidden'));

function limparFormulario(placeholderMsg) {
    document.getElementById('inp-nome').value = placeholderMsg;
    document.getElementById('inp-ano').value = "";
    document.getElementById('inp-cor').value = "";
    document.getElementById('inp-obs').value = "";
}
