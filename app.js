// app.js
import { firebaseConfig, cloudinaryConfig, geminiKeyPart1, geminiKeyPart2 } from './config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getDatabase, ref, push, onValue, remove, update } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

// --- 1. INICIALIZAÇÃO ---
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const dbRef = ref(db, 'hotwheels');

const API_KEY = geminiKeyPart1 + geminiKeyPart2; // Junta a chave
let currentImageBase64 = null; // Guarda a foto temporária
let currentCloudinaryUrl = null; // Guarda a URL final

// --- 2. ELEMENTOS DO DOM ---
const btnCamera = document.getElementById('btn-camera');
const fileInput = document.getElementById('file-input');
const modal = document.getElementById('modal-form');
const closeModal = document.querySelector('.close-modal');
const dashboard = document.getElementById('dashboard');
const searchInput = document.getElementById('search-input');
const aiLoading = document.getElementById('ai-loading');

// --- 3. EVENTOS ---
// Clique no botão "Identificar" abre o seletor de arquivos (câmera no mobile)
btnCamera.addEventListener('click', () => fileInput.click());

// Quando uma foto é selecionada
fileInput.addEventListener('change', async (e) => {
    if (e.target.files.length > 0) {
        const file = e.target.files[0];
        openModal(file);
    }
});

closeModal.addEventListener('click', () => modal.classList.add('hidden'));

// --- 4. FUNÇÕES PRINCIPAIS ---

// Abre o modal, mostra preview e chama a IA
async function openModal(file) {
    modal.classList.remove('hidden');
    
    // 1. Mostrar Preview Local
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('preview-img').src = e.target.result;
        // Salva base64 limpo (sem o prefixo data:image...) para o Gemini
        currentImageBase64 = e.target.result.split(',')[1]; 
        
        // 2. Chamar IA e Upload simultaneamente
        analisarComGemini(currentImageBase64);
        fazerUploadCloudinary(file);
    }
    reader.readAsDataURL(file);
}

// Upload para Cloudinary (Para termos a URL permanente)
async function fazerUploadCloudinary(file) {
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
        console.log("Imagem salva no Cloudinary:", currentCloudinaryUrl);
    } catch (error) {
        console.error("Erro no upload:", error);
        alert("Erro ao salvar imagem na nuvem. Verifique sua conexão.");
    }
}

// Inteligência Artificial (Gemini 2.0 Flash)
async function analisarComGemini(base64Image) {
    aiLoading.classList.remove('hidden');
    
    // Limpar campos antes de preencher
    document.getElementById('inp-nome').value = "Analisando...";
    document.getElementById('inp-ano').value = "...";
    document.getElementById('inp-obs').value = "...";

    const prompt = `
    Você é um especialista mundial em Hot Wheels. Analise esta imagem com extrema atenção.
    Retorne APENAS um objeto JSON (sem markdown, sem aspas extras) com estes campos:
    {
        "modelo": "Nome do modelo (Ex: Twin Mill)",
        "ano": "Ano aproximado ou série (Ex: 2023 Mainline)",
        "cor": "Cor principal e detalhes",
        "curiosidade": "Um fato curto e interessante sobre esse carro. Se não souber, diga a verdade.",
        "confianca": "alta" ou "baixa"
    }
    Se você não conseguir identificar o carro com clareza, coloque "Desconhecido" no modelo e peça para o usuário preencher manualmente na curiosidade. NÃO INVENTE DADOS. Seja honesto.
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
        
        // Extração segura do JSON
        let textResult = data.candidates[0].content.parts[0].text;
        textResult = textResult.replace(/```json/g, '').replace(/```/g, '').trim();
        const jsonResult = JSON.parse(textResult);

        // Preenche o formulário
        document.getElementById('inp-nome').value = jsonResult.modelo;
        document.getElementById('inp-ano').value = jsonResult.ano;
        document.getElementById('inp-cor').value = jsonResult.cor;
        document.getElementById('inp-obs').value = jsonResult.curiosidade;

        // Lógica de "Já tenho esse?"
        verificarDuplicidade(jsonResult.modelo);

    } catch (error) {
        console.error("Erro na IA:", error);
        document.getElementById('inp-obs').value = "A IA não conseguiu ler. Preencha manualmente, por favor.";
        document.getElementById('inp-nome').value = "";
    } finally {
        aiLoading.classList.add('hidden');
    }
}

// Verifica se o carro já existe no banco (busca simples localmente após load ou query)
function verificarDuplicidade(nomeModelo) {
    if (nomeModelo === "Desconhecido") return;
    
    // Varre o DOM ou faz query no firebase (aqui faremos uma verificação visual para simplificar)
    // Num sistema maior, faríamos uma query no DB.
    onValue(dbRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const existe = Object.values(data).some(carro => 
                carro.nome.toLowerCase().includes(nomeModelo.toLowerCase()) && carro.status === 'colecao'
            );
            if (existe) {
                alert(`⚠️ Atenção! Parece que você JÁ TEM o ${nomeModelo} na coleção! Deseja adicionar mesmo assim?`);
                document.getElementById('inp-status').value = 'desejo'; // Sugere mudar para troca/desejo
            } else {
                // Se não tem, sugere adicionar à coleção
                 document.getElementById('inp-status').value = 'colecao';
            }
        }
    }, { onlyOnce: true });
}

// --- 5. SALVAR NO BANCO ---
document.getElementById('car-form').addEventListener('submit', (e) => {
    e.preventDefault();
    
    if (!currentCloudinaryUrl) {
        alert("Aguarde o upload da imagem terminar...");
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
            modal.classList.add('hidden');
            document.getElementById('car-form').reset();
            currentCloudinaryUrl = null;
            alert("Carro salvo com sucesso! 🏎️");
        })
        .catch((error) => alert("Erro ao salvar: " + error.message));
});

// --- 6. RENDERIZAR DASHBOARD (TEMPO REAL) ---
let todosCarros = []; // Cache local para busca

onValue(dbRef, (snapshot) => {
    dashboard.innerHTML = ''; // Limpa tela
    const data = snapshot.val();
    
    if (!data) {
        dashboard.innerHTML = '<p style="text-align:center; width:100%">Garagem vazia! Comece a fotografar.</p>';
        return;
    }

    todosCarros = [];
    let count = 0;

    Object.keys(data).forEach(key => {
        const carro = data[key];
        carro.id = key; // Salva o ID do firebase
        todosCarros.push(carro);
        
        // Cria o Card HTML
        const card = document.createElement('div');
        card.className = 'car-card';
        card.setAttribute('data-status', carro.status);
        
        const badgeClass = carro.status === 'colecao' ? 'bg-stock' : 'bg-wish';
        const badgeText = carro.status === 'colecao' ? 'Na Garagem' : 'Desejado';

        card.innerHTML = `
            <span class="badge ${badgeClass}">${badgeText}</span>
            <img src="${carro.foto}" alt="${carro.nome}" loading="lazy">
            <div class="card-info">
                <div class="card-title">${carro.nome}</div>
                <div class="card-details">
                    <p><i class="fas fa-calendar"></i> ${carro.ano}</p>
                    <p><i class="fas fa-info-circle"></i> ${carro.obs.substring(0, 50)}...</p>
                </div>
                <button class="btn-delete" onclick="deletarCarro('${key}')">
                    <i class="fas fa-trash"></i> Remover
                </button>
            </div>
        `;
        dashboard.prepend(card); // Adiciona no começo (mais recentes primeiro)
        count++;
    });
    
    document.getElementById('total-cars').innerText = count;
});

// --- 7. FUNÇÕES GLOBAIS (Busca e Delete) ---

// Função de deletar precisa estar no window pois o HTML é gerado dinamicamente
window.deletarCarro = function(id) {
    if(confirm("Tem certeza que quer remover este carro?")) {
        remove(ref(db, `hotwheels/${id}`));
    }
}

// Lógica de busca
searchInput.addEventListener('input', (e) => {
    const termo = e.target.value.toLowerCase();
    const cards = document.querySelectorAll('.car-card');
    
    cards.forEach(card => {
        const nome = card.querySelector('.card-title').innerText.toLowerCase();
        if (nome.includes(termo)) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
});

// Listener do evento customizado para as abas
window.addEventListener('filtrarGrid', (e) => {
    const tipo = e.detail; // 'todos', 'colecao' ou 'desejo'
    const cards = document.querySelectorAll('.car-card');
    
    cards.forEach(card => {
        if (tipo === 'todos') {
            card.style.display = 'block';
        } else {
            if (card.getAttribute('data-status') === tipo) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        }
    });
});
