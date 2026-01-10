// config.js
// CONFIGURAÇÕES SECRETAS (PREENCHA COM SEUS DADOS)

// 1. Configuração do Firebase (Pegue no Console do Firebase)
const firebaseConfig = {
    const firebaseConfig = {
  apiKey: "AIzaSyA_0h6IBSVIn16ajdHj-vFwFfdEOd_nMz8",
  authDomain: "hotwheels-a4395.firebaseapp.com",
  databaseURL: "https://hotwheels-a4395-default-rtdb.firebaseio.com",
  projectId: "hotwheels-a4395",
  storageBucket: "hotwheels-a4395.firebasestorage.app",
  messagingSenderId: "27066744672",
  appId: "1:27066744672:web:a89c5cd71e70008f2e2805"
};

// 2. Configuração do Cloudinary (Imagens)
const cloudinaryConfig = {
    cloudName: "SEU_CLOUD_NAME", // Ex: demo
    uploadPreset: "SEU_UPLOAD_PRESET" // Crie um 'Unsigned' nas settings do Cloudinary
};

// 3. Configuração da IA Gemini (Chave Dividida)
// Divida sua chave API do Google AI Studio em duas partes aleatórias para "enganar" bots simples
const geminiKeyPart1 = "AIzaSyD_SUA_PARTE_1_DA_CHAVE"; 
const geminiKeyPart2 = "_RESTANTE_DA_CHAVE_AQUI"; 

// Exporta para usar no app principal
export { firebaseConfig, cloudinaryConfig, geminiKeyPart1, geminiKeyPart2 };
