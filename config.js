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
    cloudName: "djtiaygrs", // Ex: demo
    uploadPreset: "hotwheels" // Crie um 'Unsigned' nas settings do Cloudinary
};

// 3. Configuração da IA Gemini (Chave Dividida)
// Divida sua chave API do Google AI Studio em duas partes aleatórias para "enganar" bots simples
const geminiKeyPart1 = "AIzaSyAfx1aiuP9jWzGDoh"; 
const geminiKeyPart2 = "E6KxZ6_68wZkt27VI"; 

// Exporta para usar no app principal
export { firebaseConfig, cloudinaryConfig, geminiKeyPart1, geminiKeyPart2 };
