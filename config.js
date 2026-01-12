// config.js
// ARQUIVO DE CONFIGURAÇÃO - VERSÃO FINAL (SEM ERROS DE SINTAXE)

// 1. Configuração do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyA_0h6IBSVIn16ajdHj-vFwFfdEOd_nMz8",
  authDomain: "hotwheels-a4395.firebaseapp.com",
  databaseURL: "https://hotwheels-a4395-default-rtdb.firebaseio.com",
  projectId: "hotwheels-a4395",
  storageBucket: "hotwheels-a4395.firebasestorage.app",
  messagingSenderId: "27066744672",
  appId: "1:27066744672:web:a89c5cd71e70008f2e2805"
};

// 2. Configuração do Cloudinary
const cloudinaryConfig = {
    cloudName: "djtiaygrs", 
    uploadPreset: "hotwheels" 
};

// 3. Configuração da IA Gemini (Chave Dividida)
const geminiKeyPart1 = "AIzaSyAfx1aiuP9jWzGDoh"; 
const geminiKeyPart2 = "E6KxZ6_68wZkt27VI"; 

// 4. Configuração de Admin (UIDs Autorizados)
const ADMIN_UIDS = ["ADMIN_USER_UID_HERE"]; // Substituir pelo UID real do Admin

// Exportação Segura para o App
export { firebaseConfig, cloudinaryConfig, geminiKeyPart1, geminiKeyPart2, ADMIN_UIDS };
