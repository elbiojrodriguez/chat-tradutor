
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

// Rota de saúde
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    microsoftKey: !!TRANSLATION_KEY,
    googleKey: !!googleTTSClient
  });
});

// Rota de tradução
app.post('/translate', async (req, res) => {
  const { text, targetLang } = req.body;
  if (!text || !targetLang) {
    return res.status(400).json({ success: false, error: 'Campos obrigatórios: text e targetLang' });
  }

  try {
    const url = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=${targetLang}`;
    const response = await axios.post(url, [{ text }], {
      headers: {
        'Ocp-Apim-Subscription-Key': TRANSLATION_KEY,
        'Ocp-Apim-Subscription-Region': 'eastus',
        'Content-Type': 'application/json'
      }
    });

    const translatedText = response.data[0]?.translations[0]?.text;
    if (!translatedText) throw new Error('Resposta inválida da Microsoft');

    res.json({ success: true, originalText: text, translatedText, targetLanguage: targetLang });
  } catch (error) {
    console.error('Erro na tradução:', error.message);
    res.status(500).json({ success: false, error: 'Falha na tradução' });
  }
});

// Rota de geração de áudio
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
        languageCode: languageCode,
        ssmlGender: 'FEMALE' // voz padrão feminina
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
});
