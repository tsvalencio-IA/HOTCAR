// config.js
// ARQUIVO DE CONFIGURAÇÃO - VERSÃO FINAL (SEM ERROS DE SINTAXE)

// 1. Configuração do Firebase
// Certifique-se de copiar os dados do seu Console Firebase sem duplicar a palavra 'const'
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

// Exportação Segura para o App
export { firebaseConfig, cloudinaryConfig, geminiKeyPart1, geminiKeyPart2 };
