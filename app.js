// app.js - VERSÃO ORÁCULO DEFINITIVA (COM GOOGLE SEARCH E ANTI-DUPLICIDADE)

// 1. IMPORTAÇÕES
import { initializeApp } from "firebase/app";
import { getDatabase, ref, push, onValue, remove, update } from "firebase/database";
import { firebaseConfig, cloudinaryConfig, geminiKeyPart1, geminiKeyPart2 } from './config.js';

// 2. INICIALIZAÇÃO DO SISTEMA
let app, db, dbRef;
try {
    app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    dbRef = ref(db, 'hotwheels');
    console.log("Sistema HW Garage: Módulo Oráculo Conectado.");
} catch (error) {
    console.error("Erro Crítico Firebase:", error);
    alert("Falha na conexão com o banco de dados. Verifique o console.");
}

// Variáveis Globais
const API_KEY = geminiKeyPart1 + geminiKeyPart2;
let currentImageBase64 = null;
let currentCloudinaryUrl = null;
let webcamStream = null;
let cachedData = []; // Cache local para verificação instantânea
let isEditing = false;

// Imagem padrão caso o upload falhe ou seja manual
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

// --- LÓGICA DE ENTRADA E BOTÕES ---

// Botão Manual (Adicionar sem IA obrigatória)
if (btnManual) {
    btnManual.addEventListener('click', () => {
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
}

// Botão Scan (Aciona câmera ou webcam)
if (btnScan) {
    btnScan.addEventListener('click', () => {
        isEditing = false;
        // Detecção simples de dispositivo móvel
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        if (isMobile) {
            fileInput.click(); // Mobile: Câmera nativa
        } else {
            abrirWebcamPC(); // Desktop: Webcam
        }
    });
}

// Inputs de Arquivo (Principal e Edição)
if (fileInput) {
    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            processarImagemParaAnalise(e.target.files[0]);
        }
    });
}

if (btnChangePhoto) {
    btnChangePhoto.addEventListener('click', () => editFileInput.click());
}

if (editFileInput) {
    editFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            processarImagemParaAnalise(e.target.files[0]);
        }
    });
}

// --- LÓGICA DA WEBCAM (PC) ---
async function abrirWebcamPC() {
    modalWebcam.classList.remove('hidden');
    try {
        // Tenta solicitar resolução 4K para melhor leitura de texto (OCR)
        webcamStream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: "environment", 
                width: { ideal: 3840 }, 
                height: { ideal: 2160 } 
            } 
        });
        videoEl.srcObject = webcamStream;
    } catch (err) {
        // Fallback para resolução padrão se 4K falhar
        try {
            webcamStream = await navigator.mediaDevices.getUserMedia({ video: true });
            videoEl.srcObject = webcamStream;
        } catch (err2) {
            alert("Erro ao acessar Webcam. Por favor, use a opção de selecionar arquivo.");
            modalWebcam.classList.add('hidden');
            fileInput.click();
        }
    }
}

if (btnCapture) {
    btnCapture.addEventListener('click', () => {
        canvasEl.width = videoEl.videoWidth;
        canvasEl.height = videoEl.videoHeight;
        const ctx = canvasEl.getContext('2d');
        ctx.drawImage(videoEl, 0, 0);
        
        // Converte para PNG (Lossless) para evitar artefatos no texto pequeno
        canvasEl.toBlob((blob) => {
            const file = new File([blob], "scan_oraculo.png", { type: "image/png" });
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


// --- PROCESSAMENTO DE IMAGEM E UPLOAD ---

function processarImagemParaAnalise(file) {
    if (!file) return;
    
    modalForm.classList.remove('hidden');
    document.getElementById('modal-title').innerText = isEditing ? "Validando Nova Foto..." : "Consultando Oráculo...";
    btnChangePhoto.style.display = 'none'; // Bloqueia troca durante análise
    
    const reader = new FileReader();
    reader.onload = (e) => {
        if (e.target.result) {
            document.getElementById('preview-img').src = e.target.result;
            
            // Extrai base64 puro
            const base64Parts = e.target.result.split(',');
            if (base64Parts.length > 1) {
                currentImageBase64 = base64Parts[1];
                // Chama a função principal do Oráculo
                identificarComGoogleSearch(currentImageBase64);
            }
        }
        // Inicia upload em paralelo
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
            console.log("Upload Cloudinary Sucesso:", currentCloudinaryUrl);
        } else {
            throw new Error("Resposta inválida do Cloudinary");
        }
    } catch (error) {
        console.error("Erro Upload:", error);
        currentCloudinaryUrl = DEFAULT_IMAGE; // Usa imagem padrão em caso de erro
    } finally {
         btnChangePhoto.style.display = 'flex'; // Libera botão
    }
}


// --- O CORAÇÃO DO SISTEMA: IA COM GOOGLE SEARCH (GROUNDING) ---

async function identificarComGoogleSearch(base64Image) {
    aiLoading.classList.remove('hidden');
    
    if (!isEditing) limparFormulario("Acessando Rede Neural...");

    // PROMPT ORÁCULO: Instruções hierárquicas para evitar alucinação
    const prompt = `
    Aja como um Arquivista Sênior da Mattel (Hot Wheels). Sua missão é identificar o "Casting Name" (Modelo) com precisão cirúrgica, ignorando o marketing da embalagem.

    ⚠️ PROTOCOLO DE VERDADE ABSOLUTA ⚠️
    1. **RAIO-X DO CHASSI:** Se visível, leia o texto gravado no metal/plástico do fundo. Essa é a fonte primária.
    2. **IGNORAR SÉRIES:** Na cartela, o texto GRANDE geralmente é a SÉRIE (Ex: "Slide Street", "HW Turbo", "Track Stars"). ISSO NÃO É O NOME DO CARRO. Ignore.
    3. **BUSCA DE NOME PEQUENO:** O nome do modelo geralmente está menor, perto da bolha ou no verso.
    4. **FORMA:** Se a cartela diz "Slide Street" mas o carro parece uma cobra, é o "Roadster Bite". Se parece um tubarão, é "Sharkruiser". Use a lógica visual.
    
    AÇÃO DE GROUNDING: Use o Google Search para validar o nome encontrado. Pesquise "Hot Wheels [texto lido] casting" para confirmar.

    Retorne JSON ESTRITO:
    {
        "modelo": "Nome Oficial do Casting (Ex: Roadster Bite)",
        "ano": "Série / Coleção (Ex: 2024 Slide Street)",
        "cor": "Descrição visual exata",
        "curiosidade": "Fato técnico validado (Ex: Designer Ryu Asada, Primeira edição 2021)"
    }

    Se o Google Search não retornar confirmação absoluta, responda "Desconhecido" no modelo.
    `;

    try {
        const requestBody = {
            contents: [{ 
                parts: [
                    { text: prompt }, 
                    { inline_data: { mime_type: "image/png", data: base64Image } }
                ] 
            }],
            // FERRAMENTA DE BUSCA ATIVADA
            tools: [
                { google_search: {} } 
            ],
            generationConfig: {
                temperature: 0.0, // Criatividade ZERO para evitar invenções
                topK: 1,
                topP: 1,
                maxOutputTokens: 500,
            }
        };

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${API_KEY}`, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        
        const data = await response.json();
        
        // Tratamento de erros da API
        if (!data.candidates || !data.candidates[0].content) {
            console.error("Resposta API Inválida:", data);
            throw new Error("A IA não conseguiu processar os dados.");
        }

        let textResult = data.candidates[0].content.parts[0].text;
        
        // Limpeza cirúrgica do JSON (remove markdown e textos extras)
        textResult = textResult.replace(/```json/g, '').replace(/```/g, '');
        const jsonStartIndex = textResult.indexOf('{');
        const jsonEndIndex = textResult.lastIndexOf('}');
        
        if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
            textResult = textResult.substring(jsonStartIndex, jsonEndIndex + 1);
        } else {
            throw new Error("Formato JSON não encontrado na resposta.");
        }

        const jsonResult = JSON.parse(textResult);

        // --- LÓGICA DE DUPLICIDADE (SUPERMERCADO) ---
        // Se NÃO estamos editando, verifica se o usuário já tem esse carro
        if (!isEditing) {
            const carroExistente = verificarSeJaPossui(jsonResult.modelo);
            
            if (carroExistente) {
                // Feedback tátil (vibração) no celular
                if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
                
                alert(`⚠️ ALERTA: Você JÁ TEM o modelo "${carroExistente.nome}"!\nStatus: ${carroExistente.status === 'colecao' ? 'Na Garagem' : 'Desejado'}.\n\nAbrindo ficha existente...`);
                
                abrirFichaExistente(carroExistente);
                aiLoading.classList.add('hidden');
                return; // Interrompe o cadastro de novo item
            }
        }

        // Preenchimento dos campos
        document.getElementById('inp-nome').value = jsonResult.modelo || "";
        document.getElementById('inp-ano').value = jsonResult.ano || "";
        document.getElementById('inp-cor').value = jsonResult.cor || "";
        document.getElementById('inp-obs').value = jsonResult.curiosidade || "";

        // Tratamento para "Desconhecido"
        if (!jsonResult.modelo || jsonResult.modelo === "Desconhecido") {
            document.getElementById('inp-nome').placeholder = "Não identificado. Digite o nome...";
            document.getElementById('inp-nome').focus();
        }

    } catch (error) {
        console.error("Erro na Análise Oráculo:", error);
        if (!isEditing) {
            document.getElementById('inp-nome').value = "Não Identificado";
            document.getElementById('inp-obs').value = "O Oráculo não confirmou os dados. Verifique manualmente.";
        }
    } finally {
        aiLoading.classList.add('hidden');
    }
}


// --- FUNÇÕES AUXILIARES E UTILITÁRIOS ---

// Busca exata para evitar duplicidade
function verificarSeJaPossui(nomeDetectado) {
    if (!nomeDetectado || nomeDetectado === "Desconhecido") return null;
    
    // Normaliza para minúsculas e remove espaços extras
    const nomeLimpo = nomeDetectado.toLowerCase().trim();
    
    return cachedData.find(c => 
        c.status === 'colecao' && 
        c.nome.toLowerCase().trim() === nomeLimpo
    );
}

// Abre modal com dados de um carro existente
function abrirFichaExistente(carro) {
    isEditing = true; // Entra em modo edição
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

// --- SALVAR NO FIREBASE ---

document.getElementById('car-form').addEventListener('submit', (e) => {
    e.preventDefault();
    
    // Se a imagem ainda estiver subindo, usa a padrão ou espera
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
        // Atualiza existente
        update(ref(db, `hotwheels/${carId}`), dadosCarro)
            .then(() => finalizarAcao("Ficha atualizada com sucesso!"));
    } else {
        // Cria novo
        push(dbRef, dadosCarro)
            .then(() => finalizarAcao("Adicionado ao Catálogo!"));
    }
});

function finalizarAcao(msg) {
    modalForm.classList.add('hidden');
    limparFormulario("");
    isEditing = false;
    alert(msg);
}


// --- LEITURA DO BANCO E DASHBOARD ---

onValue(dbRef, (snapshot) => {
    dashboard.innerHTML = '';
    const data = snapshot.val();
    cachedData = []; // Limpa cache
    let countGaragem = 0;

    if (!data) {
        totalCarsEl.innerText = "0";
        dashboard.innerHTML = '<div class="empty-state"><i class="fas fa-car-side"></i><p>Garagem vazia. Comece a escanear!</p></div>';
        return;
    }

    const lista = Object.entries(data).reverse(); // Mais recentes primeiro
    
    lista.forEach(([id, carro]) => {
        // Adiciona ao cache com ID
        cachedData.push({ id, ...carro });
        
        if (carro.status === 'colecao') countGaragem++;
        criarCard(id, carro);
    });
    
    totalCarsEl.innerText = countGaragem;
    aplicarFiltro(); // Reaplica filtros se houver busca ativa
});

function criarCard(id, carro) {
    const card = document.createElement('div');
    card.className = 'car-card';
    // Atributos para filtro
    card.setAttribute('data-status', carro.status);
    card.setAttribute('data-name', (carro.nome || "").toLowerCase());

    const badgeClass = carro.status === 'colecao' ? 'bg-colecao' : 'bg-desejo';
    const badgeText = carro.status === 'colecao' ? 'Garagem' : 'Desejado';
    
    // Botão dinâmico (Comprar ou Editar)
    let actionButton = '';
    if (carro.status === 'desejo') {
        actionButton = `
            <button class="btn-action btn-acquire" onclick="window.moverParaGaragem('${id}')">
                <i class="fas fa-check-circle"></i> Adquiri!
            </button>`;
    } else {
         actionButton = `
            <button class="btn-action btn-edit" onclick="window.editarCarro('${id}')">
                <i class="fas fa-pen"></i> Editar
            </button>`;
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
                <button class="btn-delete-icon" onclick="window.deletarCarro('${id}')">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>
    `;
    dashboard.appendChild(card);
}


// --- FILTROS E BUSCA ---

let filtroAbaAtivo = 'todos';

// Evento das Abas
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        filtroAbaAtivo = e.target.getAttribute('data-filter');
        aplicarFiltro();
    });
});

// Eventos da Barra de Busca
if (btnSearchAction) btnSearchAction.addEventListener('click', aplicarFiltro);
if (searchInput) searchInput.addEventListener('keyup', aplicarFiltro);

function aplicarFiltro() {
    const termo = searchInput.value.toLowerCase();
    const cards = document.querySelectorAll('.car-card');

    cards.forEach(card => {
        const statusCard = card.getAttribute('data-status');
        const nomeCard = card.getAttribute('data-name');
        
        // Lógica E: Tem que passar na aba E na busca
        const passaAba = (filtroAbaAtivo === 'todos') || (statusCard === filtroAbaAtivo);
        const passaTexto = nomeCard.includes(termo);

        if (passaAba && passaTexto) {
            card.style.display = 'flex';
        } else {
            card.style.display = 'none';
        }
    });
}


// --- FUNÇÕES GLOBAIS (WINDOW) ---
// Necessárias para os botões gerados dinamicamente no HTML

window.editarCarro = function(id) {
    const carro = cachedData.find(c => c.id === id);
    if (!carro) return;
    abrirFichaExistente(carro);
}

window.moverParaGaragem = function(id) {
    update(ref(db, `hotwheels/${id}`), { status: 'colecao' })
        .then(() => alert("Item movido para Garagem com sucesso!"));
}

window.deletarCarro = function(id) {
    if (confirm("Tem certeza que deseja apagar este registro permanentemente?")) {
        remove(ref(db, `hotwheels/${id}`));
    }
}

if (closeModalBtn) closeModalBtn.addEventListener('click', () => {
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