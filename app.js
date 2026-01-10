// app.js - VERSÃO BLINDADA (MODO CIRÚRGICO - TEMPERATURA ZERO)

// 1. IMPORTAÇÕES
import { initializeApp } from "firebase/app";
import { getDatabase, ref, push, onValue, remove, update } from "firebase/database";
import { firebaseConfig, cloudinaryConfig, geminiKeyPart1, geminiKeyPart2 } from './config.js';

// 2. INICIALIZAÇÃO
let app, db, dbRef;
try {
    app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    dbRef = ref(db, 'hotwheels');
    console.log("Sistema HW Garage: Módulo de Precisão Máxima Iniciado.");
} catch (error) {
    console.error("Erro Crítico Firebase:", error);
    alert("Falha na conexão com o banco de dados.");
}

// Variáveis Globais
const API_KEY = geminiKeyPart1 + geminiKeyPart2;
let currentImageBase64 = null;
let currentCloudinaryUrl = null;
let webcamStream = null;
let cachedData = []; 
let isEditing = false;

const DEFAULT_IMAGE = "https://upload.wikimedia.org/wikipedia/commons/2/23/Hot_Wheels_logo.svg";

// 3. ELEMENTOS DO DOM
const dashboard = document.getElementById('dashboard');
const totalCarsEl = document.getElementById('total-cars');
const btnScan = document.getElementById('btn-scan');
const btnManual = document.getElementById('btn-manual');
const fileInput = document.getElementById('file-input');
const editFileInput = document.getElementById('edit-file-input');
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
const btnChangePhoto = document.getElementById('btn-change-photo');

// --- LÓGICA DE ENTRADA ---

// Botão Manual
if(btnManual) btnManual.addEventListener('click', () => {
    isEditing = false;
    limparFormulario("Novo Carro");
    currentCloudinaryUrl = DEFAULT_IMAGE;
    document.getElementById('preview-img').src = DEFAULT_IMAGE;
    document.getElementById('modal-title').innerText = "Cadastro Manual";
    document.getElementById('inp-id').value = "";
    btnChangePhoto.style.display = 'flex';
    modalForm.classList.remove('hidden');
    aiLoading.classList.add('hidden');
});

// Botão Scan (IA)
if(btnScan) btnScan.addEventListener('click', () => {
    isEditing = false;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) fileInput.click();
    else abrirWebcamPC();
});

// Inputs de Arquivo
if(fileInput) fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) processarImagemParaAnalise(e.target.files[0]);
});
if(btnChangePhoto) btnChangePhoto.addEventListener('click', () => editFileInput.click());
if(editFileInput) editFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) processarImagemParaAnalise(e.target.files[0]);
});

// Webcam (Tenta pegar 4K/UHD se disponível para ajudar a IA)
async function abrirWebcamPC() {
    modalWebcam.classList.remove('hidden');
    try {
        webcamStream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: "environment", 
                width: { ideal: 3840 }, 
                height: { ideal: 2160 } 
            } 
        });
        videoEl.srcObject = webcamStream;
    } catch (err) {
        // Fallback se não suportar 4K
        try {
            webcamStream = await navigator.mediaDevices.getUserMedia({ video: true });
            videoEl.srcObject = webcamStream;
        } catch (err2) {
            alert("Erro na Webcam. Usando arquivo.");
            modalWebcam.classList.add('hidden');
            fileInput.click();
        }
    }
}

if(btnCapture) btnCapture.addEventListener('click', () => {
    canvasEl.width = videoEl.videoWidth;
    canvasEl.height = videoEl.videoHeight;
    const ctx = canvasEl.getContext('2d');
    ctx.drawImage(videoEl, 0, 0);
    
    // Captura em qualidade máxima (PNG para não perder detalhes dos textos)
    canvasEl.toBlob((blob) => {
        const file = new File([blob], "scan_high_res.png", { type: "image/png" });
        encerrarWebcam();
        processarImagemParaAnalise(file);
    }, 'image/png');
});

function encerrarWebcam() {
    if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
        webcamStream = null;
    }
    modalWebcam.classList.add('hidden');
}
if(closeWebcamBtn) closeWebcamBtn.addEventListener('click', encerrarWebcam);

// --- PROCESSAMENTO E IA BLINDADA ---

function processarImagemParaAnalise(file) {
    if (!file) return;
    
    modalForm.classList.remove('hidden');
    document.getElementById('modal-title').innerText = isEditing ? "Validando Foto..." : "Perícia Técnica...";
    btnChangePhoto.style.display = 'none';
    
    const reader = new FileReader();
    reader.onload = (e) => {
        if(e.target.result) {
            document.getElementById('preview-img').src = e.target.result;
            const base64Parts = e.target.result.split(',');
            if(base64Parts.length > 1) {
                currentImageBase64 = base64Parts[1];
                identificarModeloBlindado(currentImageBase64);
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
        else throw new Error("Erro Cloudinary");
    } catch (error) {
        console.error("Erro Imagem:", error);
        currentCloudinaryUrl = DEFAULT_IMAGE;
    } finally {
         btnChangePhoto.style.display = 'flex';
    }
}

async function identificarModeloBlindado(base64Image) {
    aiLoading.classList.remove('hidden');
    
    if (!isEditing) limparFormulario("Consultando Banco de Dados...");

    // PROMPT DE SEGURANÇA MÁXIMA
    const prompt = `
    ATENÇÃO: MODO DE PRECISÃO EXTREMA.
    Você é um software de banco de dados de Hot Wheels.
    
    Analise a imagem procurando por evidências físicas:
    1. Texto estampado no chassi (fundo do carro).
    2. Design exato das rodas (Ex: PR5, MC5, Real Riders).
    3. Logotipos impressos na lataria (Tampos).
    
    REGRAS RÍGIDAS:
    - Se a imagem estiver borrada, escura ou não mostrar o carro claramente, RETORNE "Desconhecido" no modelo.
    - NÃO TENTE ADIVINHAR. Se parecer um "Twin Mill" mas você não tiver certeza da série, coloque apenas "Twin Mill".
    - Ano: Se não conseguir ler o ano no chassi ou identificar a série pelos decalques, deixe em branco ou coloque "Série não identificada".
    
    Retorne JSON estrito:
    {
        "modelo": "Nome Oficial do Casting",
        "ano": "Série Específica (ou 'Ano Base' se genérico)",
        "cor": "Cor exata",
        "curiosidade": "Fato técnico verificável (Chassi metal/plástico, Designer)."
    }
    `;

    try {
        // CONFIGURAÇÃO TÉCNICA PARA REDUZIR ALUCINAÇÃO (Temperature 0)
        const requestBody = {
            contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: "image/png", data: base64Image } }] }],
            generationConfig: {
                temperature: 0.0, // Tira a criatividade. Resposta seca e correta.
                topK: 1, // Considera apenas a opção mais provável.
                topP: 1,
                maxOutputTokens: 256,
            }
        };

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${API_KEY}`, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        
        const data = await response.json();
        
        if(!data.candidates) {
            console.error("Bloqueio de segurança da IA", data);
            throw new Error("IA não conseguiu processar com segurança.");
        }

        const textResult = data.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();
        const jsonResult = JSON.parse(textResult);

        // LÓGICA DE DUPLICIDADE (SUPERMERCADO)
        if (!isEditing) {
            const carroExistente = verificarSeJaPossui(jsonResult.modelo);
            if (carroExistente) {
                // Toca um som de alerta (opcional) ou vibra o celular
                if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
                
                alert(`🛑 PARE! VOCÊ JÁ TEM ESTE CARRO!\n\nModelo: ${carroExistente.nome}\nStatus: ${carroExistente.status === 'colecao' ? 'Na Garagem' : 'Desejado'}\n\nAbrindo ficha para conferência...`);
                
                abrirFichaExistente(carroExistente);
                aiLoading.classList.add('hidden');
                return;
            }
        }

        // Preenchimento
        document.getElementById('inp-nome').value = jsonResult.modelo || "";
        document.getElementById('inp-ano').value = jsonResult.ano || "";
        document.getElementById('inp-cor').value = jsonResult.cor || "";
        document.getElementById('inp-obs').value = jsonResult.curiosidade || "";

        // Se a IA devolver "Desconhecido", forçamos o foco no campo nome para o usuário digitar
        if (jsonResult.modelo === "Desconhecido" || jsonResult.modelo === "") {
            document.getElementById('inp-nome').focus();
            document.getElementById('inp-obs').value = "Identificação automática falhou. Insira os dados do chassi.";
        }

    } catch (error) {
        console.error("Erro IA:", error);
        if (!isEditing) {
            document.getElementById('inp-nome').value = "Não Identificado";
            document.getElementById('inp-obs').value = "A foto não tem detalhes suficientes. Tente fotografar o chassi.";
        }
    } finally {
        aiLoading.classList.add('hidden');
    }
}

// Busca Exata
function verificarSeJaPossui(nomeDetectado) {
    if (!nomeDetectado || nomeDetectado === "Desconhecido" || nomeDetectado === "Não Identificado") return null;
    
    // Busca exata ou parcial muito forte
    return cachedData.find(c => 
        c.status === 'colecao' && 
        c.nome.toLowerCase().trim() === nomeDetectado.toLowerCase().trim()
    );
}

function abrirFichaExistente(carro) {
    isEditing = true;
    document.getElementById('modal-title').innerText = "Item em Estoque";
    document.getElementById('inp-id').value = carro.id;
    document.getElementById('inp-nome').value = carro.nome;
    document.getElementById('inp-ano').value = carro.ano;
    document.getElementById('inp-cor').value = carro.cor;
    document.getElementById('inp-obs').value = carro.obs;
    document.getElementById('inp-status').value = carro.status;
    document.getElementById('preview-img').src = carro.foto;
    currentCloudinaryUrl = carro.foto;
    btnChangePhoto.style.display = 'flex';
    modalForm.classList.remove('hidden');
}

// --- SALVAR E BANCO ---

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
        update(ref(db, `hotwheels/${carId}`), dadosCarro).then(() => finalizarAcao("Ficha atualizada!"));
    } else {
        push(dbRef, dadosCarro).then(() => finalizarAcao("Adicionado ao Catálogo!"));
    }
});

function finalizarAcao(msg) {
    modalForm.classList.add('hidden');
    limparFormulario("");
    isEditing = false;
    alert(msg);
}

// Leitura do Banco
onValue(dbRef, (snapshot) => {
    dashboard.innerHTML = '';
    const data = snapshot.val();
    cachedData = []; 
    let countGaragem = 0;

    if (!data) {
        totalCarsEl.innerText = "0";
        dashboard.innerHTML = '<div class="empty-state"><i class="fas fa-folder-open"></i><p>Catálogo vazio.</p></div>';
        return;
    }

    const lista = Object.entries(data).reverse();
    
    lista.forEach(([id, carro]) => {
        const carroCompleto = { id, ...carro };
        cachedData.push(carroCompleto);
        
        if (carro.status === 'colecao') countGaragem++;
        criarCard(id, carro);
    });
    
    totalCarsEl.innerText = countGaragem;
    aplicarFiltro();
});

function criarCard(id, carro) {
    const card = document.createElement('div');
    card.className = 'car-card';
    card.setAttribute('data-status', carro.status);
    card.setAttribute('data-name', (carro.nome || "").toLowerCase());

    const badgeClass = carro.status === 'colecao' ? 'bg-colecao' : 'bg-desejo';
    const badgeText = carro.status === 'colecao' ? 'Garagem' : 'Desejado';
    
    let actionButton = '';
    if (carro.status === 'desejo') {
        actionButton = `<button class="btn-action btn-acquire" onclick="window.moverParaGaragem('${id}')"><i class="fas fa-check"></i> Comprado!</button>`;
    } else {
         actionButton = `<button class="btn-action btn-edit" onclick="window.editarCarro('${id}')"><i class="fas fa-pen"></i> Editar</button>`;
    }

    card.innerHTML = `
        <span class="badge ${badgeClass}">${badgeText}</span>
        <img src="${carro.foto}" loading="lazy" onerror="this.src='${DEFAULT_IMAGE}'">
        <div class="card-info">
            <div class="card-title">${carro.nome}</div>
            <div class="card-details">
                <p><strong>Série:</strong> ${carro.ano}</p>
                <p class="obs-text">${carro.obs ? carro.obs.substring(0,60) : ''}...</p>
            </div>
            <div class="card-actions">
                ${actionButton}
                <button class="btn-delete-icon" onclick="window.deletarCarro('${id}')"><i class="fas fa-trash-alt"></i></button>
            </div>
        </div>
    `;
    dashboard.appendChild(card);
}

// Filtros
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

// Globais
window.editarCarro = function(id) {
    const carro = cachedData.find(c => c.id === id);
    if (!carro) return;
    abrirFichaExistente(carro);
}

window.moverParaGaragem = function(id) {
    update(ref(db, `hotwheels/${id}`), { status: 'colecao' }).then(() => alert("Movido para Garagem!"));
}

window.deletarCarro = function(id) {
    if (confirm("Deletar registro permanentemente?")) remove(ref(db, `hotwheels/${id}`));
}

if(closeModalBtn) closeModalBtn.addEventListener('click', () => { modalForm.classList.add('hidden'); isEditing = false; });

function limparFormulario(titulo) {
    document.getElementById('inp-nome').value = titulo;
    document.getElementById('inp-ano').value = "";
    document.getElementById('inp-cor').value = "";
    document.getElementById('inp-obs').value = "";
    document.getElementById('inp-status').value = "colecao";
    document.getElementById('inp-id').value = "";
}