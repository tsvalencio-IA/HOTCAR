// app.js
// Importações modernas (Usando o Import Map do HTML)
import { initializeApp } from "firebase/app";
import { getDatabase, ref, push, onValue, remove } from "firebase/database";
import { firebaseConfig, cloudinaryConfig, geminiKeyPart1, geminiKeyPart2 } from './config.js';

// --- 1. INICIALIZAÇÃO ---
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const dbRef = ref(db, 'hotwheels');

const API_KEY = geminiKeyPart1 + geminiKeyPart2; 
let currentImageBase64 = null; 
let currentCloudinaryUrl = null; 

// --- 2. ELEMENTOS DO DOM ---
const btnCamera = document.getElementById('btn-camera');
const fileInput = document.getElementById('file-input');
const modal = document.getElementById('modal-form');
const closeModal = document.querySelector('.close-modal');
const dashboard = document.getElementById('dashboard');
const searchInput = document.getElementById('search-input');
const aiLoading = document.getElementById('ai-loading');

// --- 3. EVENTOS ---
if(btnCamera) btnCamera.addEventListener('click', () => fileInput.click());

if(fileInput) fileInput.addEventListener('change', async (e) => {
    if (e.target.files.length > 0) {
        const file = e.target.files[0];
        openModal(file);
    }
});

if(closeModal) closeModal.addEventListener('click', () => modal.classList.add('hidden'));

// --- 4. FUNÇÕES ---

async function openModal(file) {
    modal.classList.remove('hidden');
    
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('preview-img').src = e.target.result;
        currentImageBase64 = e.target.result.split(',')[1]; 
        
        analisarComGemini(currentImageBase64);
        fazerUploadCloudinary(file);
    }
    reader.readAsDataURL(file);
}

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
        alert("Erro no Cloudinary. Verifique as configurações.");
    }
}

async function analisarComGemini(base64Image) {
    aiLoading.classList.remove('hidden');
    
    document.getElementById('inp-nome').value = "Consultando Especialista...";
    document.getElementById('inp-ano').value = "...";
    document.getElementById('inp-obs').value = "...";

    const prompt = `
    Aja como um colecionador fanático por Hot Wheels. Analise a imagem.
    Retorne APENAS JSON:
    {
        "modelo": "Nome do modelo (Seja preciso)",
        "ano": "Série ou Ano",
        "cor": "Cor principal",
        "curiosidade": "Fato interessante e curto (max 20 palavras)",
        "confianca": "alta"
    }
    Se não souber, retorne "modelo": "Desconhecido".
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
        let textResult = data.candidates[0].content.parts[0].text;
        textResult = textResult.replace(/```json/g, '').replace(/```/g, '').trim();
        const jsonResult = JSON.parse(textResult);

        document.getElementById('inp-nome').value = jsonResult.modelo;
        document.getElementById('inp-ano').value = jsonResult.ano;
        document.getElementById('inp-cor').value = jsonResult.cor;
        document.getElementById('inp-obs').value = jsonResult.curiosidade;

        verificarDuplicidade(jsonResult.modelo);

    } catch (error) {
        console.error("Erro na IA:", error);
        document.getElementById('inp-obs').value = "Não consegui identificar com certeza.";
        document.getElementById('inp-nome').value = "";
    } finally {
        aiLoading.classList.add('hidden');
    }
}

function verificarDuplicidade(nomeModelo) {
    if (nomeModelo === "Desconhecido") return;
    
    onValue(dbRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const existe = Object.values(data).some(carro => 
                carro.nome && carro.nome.toLowerCase().includes(nomeModelo.toLowerCase()) && carro.status === 'colecao'
            );
            if (existe) {
                alert(`⚠️ Você JÁ TEM o ${nomeModelo} na garagem!`);
                document.getElementById('inp-status').value = 'desejo';
            } else {
                 document.getElementById('inp-status').value = 'colecao';
            }
        }
    }, { onlyOnce: true });
}

// SALVAR
document.getElementById('car-form').addEventListener('submit', (e) => {
    e.preventDefault();
    
    if (!currentCloudinaryUrl) {
        alert("Aguarde a foto terminar de subir (alguns segundos)...");
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

    push(dbRef, novoCarro).then(() => {
        modal.classList.add('hidden');
        document.getElementById('car-form').reset();
        currentCloudinaryUrl = null;
        alert("Carro Estacionado! 🏎️");
    });
});

// RENDERIZAR
onValue(dbRef, (snapshot) => {
    dashboard.innerHTML = '';
    const data = snapshot.val();
    
    if (!data) {
        dashboard.innerHTML = '<div class="loading-state"><p>Garagem vazia. Tire a primeira foto!</p></div>';
        document.getElementById('total-cars').innerText = 0;
        return;
    }

    let count = 0;
    const listaCarros = Object.entries(data).reverse();

    listaCarros.forEach(([key, carro]) => {
        const card = document.createElement('div');
        card.className = 'car-card';
        card.setAttribute('data-status', carro.status);
        
        const badgeClass = carro.status === 'colecao' ? 'bg-stock' : 'bg-wish';
        const badgeText = carro.status === 'colecao' ? 'Garagem' : 'Desejo';

        card.innerHTML = `
            <span class="badge ${badgeClass}">${badgeText}</span>
            <img src="${carro.foto}" alt="${carro.nome}" loading="lazy">
            <div class="card-info">
                <div class="card-title">${carro.nome}</div>
                <div class="card-details">
                    <p><i class="fas fa-calendar"></i> ${carro.ano}</p>
                    <p><i>"${carro.obs ? carro.obs.substring(0, 50) : ''}..."</i></p>
                </div>
                <button class="btn-delete" onclick="deletarCarro('${key}')">
                    <i class="fas fa-trash"></i> Remover
                </button>
            </div>
        `;
        dashboard.appendChild(card);
        count++;
    });
    
    document.getElementById('total-cars').innerText = count;
});

window.deletarCarro = function(id) {
    if(confirm("Vender este carro (remover)?")) remove(ref(db, `hotwheels/${id}`));
}

// FILTROS VISUAIS
if(searchInput) searchInput.addEventListener('input', (e) => {
    const termo = e.target.value.toLowerCase();
    document.querySelectorAll('.car-card').forEach(card => {
        const nome = card.querySelector('.card-title').innerText.toLowerCase();
        card.style.display = nome.includes(termo) ? 'block' : 'none';
    });
});

window.addEventListener('filtrarGrid', (e) => {
    const tipo = e.detail;
    document.querySelectorAll('.car-card').forEach(card => {
        if (tipo === 'todos') card.style.display = 'block';
        else card.style.display = card.getAttribute('data-status') === tipo ? 'block' : 'none';
    });
});
