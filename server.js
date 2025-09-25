// Imports
const axios = require('axios');
const cors = require('cors');
const express = require('express');
const fs = require('fs');
const path = require('path');
const textToSpeech = require('@google-cloud/text-to-speech');

// App setup
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Carregar chave da Microsoft
const loadTranslationKey = () => {
  const secretPath = path.join('/etc/secrets', 'CHAVE_TRADUTOR');
  if (fs.existsSync(secretPath)) {
    console.log('✅ Chave da Microsoft encontrada');
    return fs.readFileSync(secretPath, 'utf8').trim();
  }
  console.error('❌ Chave da Microsoft não encontrada');
  return null;
};

const TRANSLATION_KEY = loadTranslationKey();

// Carregar chave do Google TTS
const loadGoogleTTSKeyPath = () => {
  const secretPath = path.join('/etc/secrets', 'CHAVE_GOOGLE_TTS');
  if (fs.existsSync(secretPath)) {
    console.log('✅ Chave do Google TTS encontrada');
    return secretPath;
  }
  console.error('❌ Chave do Google TTS não encontrada');
  return null;
};

const GOOGLE_TTS_KEY_PATH = loadGoogleTTSKeyPath();
const googleTTSClient = GOOGLE_TTS_KEY_PATH
  ? new textToSpeech.TextToSpeechClient({ keyFilename: GOOGLE_TTS_KEY_PATH })
  : null;

// Verificação de chaves
if (!TRANSLATION_KEY || !googleTTSClient) {
  console.error('FATAL: Chaves não configuradas corretamente');
  process.exit(1);
}

// Função para normalizar códigos de idioma
const normalizeLanguageCode = (lang) => {
  const map = {
    'en': 'en-US',
    'pt': 'pt-BR',
    'es': 'es-ES',
    'fr': 'fr-FR',
    'de': 'de-DE',
    'it': 'it-IT'
  };
  return map[lang] || lang;
};

// Rota de saúde
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    microsoftKey: !!TRANSLATION_KEY,
    googleKey: !!googleTTSClient
  });
});

// ✅ Rota principal: tradução + áudio
app.post('/translate-and-speak', async (req, res) => {
  const { text, sourceLang, targetLang } = req.body;

  if (!text || !targetLang) {
    return res.status(400).json({
      success: false,
      error: 'Campos obrigatórios: text e targetLang'
    });
  }

  try {
    console.log('🎯 Iniciando tradução + áudio:', { sourceLang, targetLang, text: text.substring(0, 50) + '...' });

    // 1. Tradução com Microsoft
    const translateUrl = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=${sourceLang || 'auto'}&to=${targetLang}`;
    const translateResponse = await axios.post(translateUrl, [{ text }], {
      headers: {
        'Ocp-Apim-Subscription-Key': TRANSLATION_KEY,
        'Ocp-Apim-Subscription-Region': 'eastus',
        'Content-Type': 'application/json'
      }
    });

    const translatedText = translateResponse.data[0]?.translations[0]?.text;
    if (!translatedText) throw new Error('Tradução falhou');

    console.log('✅ Texto traduzido:', translatedText.substring(0, 50) + '...');

    // 2. Geração de áudio com Google TTS
    const ttsRequest = {
      input: { text: translatedText },
      voice: {
        languageCode: normalizeLanguageCode(targetLang),
        ssmlGender: 'FEMALE'
      },
      audioConfig: { audioEncoding: 'MP3' }
    };

    const [ttsResponse] = await googleTTSClient.synthesizeSpeech(ttsRequest);
    console.log('✅ Áudio gerado:', ttsResponse.audioContent.length + ' bytes');

    // 3. Retorno para o cliente
    const audioBase64 = ttsResponse.audioContent.toString('base64');
    const audioDataUrl = `data:audio/mpeg;base64,${audioBase64}`;

    res.json({
      success: true,
      originalText: text,
      translatedText: translatedText,
      audioData: audioDataUrl,
      targetLanguage: targetLang,
      sourceLanguage: sourceLang || 'auto'
    });

    console.log('✅ Pacote completo enviado para cliente');

  } catch (error) {
    console.error('❌ Erro no translate-and-speak:', error.message);
    res.status(500).json({
      success: false,
      error: 'Falha no processo completo de tradução e áudio'
    });
  }
});

// Rota de tradução individual
app.post('/translate', async (req, res) => {
  const { text, targetLang, sourceLang } = req.body;
  if (!text || !targetLang) {
    return res.status(400).json({ success: false, error: 'Campos obrigatórios: text e targetLang' });
  }

  try {
    const url = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=${sourceLang || 'auto'}&to=${targetLang}`;
    const response = await axios.post(url, [{ text }], {
      headers: {
        'Ocp-Apim-Subscription-Key': TRANSLATION_KEY,
        'Ocp-Apim-Subscription-Region': 'eastus',
        'Content-Type': 'application/json'
      }
    });

    const translatedText = response.data[0]?.translations[0]?.text;
    if (!translatedText) throw new Error('Resposta inválida da Microsoft');

    res.json({
      success: true,
      originalText: text,
      translatedText,
      targetLanguage: targetLang
    });
  } catch (error) {
    console.error('Erro na tradução:', error.message);
    res.status(500).json({ success: false, error: 'Falha na tradução' });
  }
});

// Rota de áudio individual
app.post('/speak', async (req, res) => {
  const { text, languageCode } = req.body;

  if (!text || !languageCode) {
    return res.status(400).json({
      success: false,
      error: 'Campos obrigatórios: text e languageCode'
    });
  }

  try {
    const request = {
      input: { text },
      voice: {
        languageCode: normalizeLanguageCode(languageCode),
        ssmlGender: 'FEMALE'
      },
      audioConfig: { audioEncoding: 'MP3' }
    };

    const [response] = await googleTTSClient.synthesizeSpeech(request);
    res.set('Content-Type', 'audio/mpeg');
    res.send(response.audioContent);
  } catch (error) {
    console.error('Erro no Google TTS:', error.message);
    res.status(500).json({
      success: false,
      error: 'Falha ao gerar áudio'
    });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🟢 Servidor rodando na porta ${PORT}`);
  console.log(`🎯 Nova rota disponível: POST /translate-and-speak`);
  console.log(`🔹 Rotas mantidas: POST /translate, POST /speak`);
  console.log(`🔹 Health check: GET /health`);
});
