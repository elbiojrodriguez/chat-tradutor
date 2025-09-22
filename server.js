```javascript
// Imports
const axios = require('axios');
const cors = require('cors');
const express = require('express');
const fs = require('fs');
const path = require('path');

// App setup
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: '*' // Update this to your frontend URL in production
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Secret loader
const loadTranslationKey = () => {
  if (process.env.CHAVE_TRADUTOR) {
    console.log('Using key from environment variable');
    return process.env.CHAVE_TRADUTOR;
  }

  try {
    const secretPath = path.join('/etc/secrets', 'CHAVE_TRADUTOR');
    if (fs.existsSync(secretPath)) {
      console.log('Using key from secret file');
      return fs.readFileSync(secretPath, 'utf8').trim();
    }
  } catch (error) {
    console.error('Error reading secret file:', error);
  }

  if (process.env.NODE_ENV === 'development') {
    const devKey = 'your-dev-key-here';
    console.warn('Using development key!');
    return devKey;
  }

  return null;
};

const TRANSLATION_KEY = loadTranslationKey();

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

// Key validation
if (!TRANSLATION_KEY) {
  console.error('FATAL: No translation key configured');
  console.error('Please set CHAVE_TRADUTOR as either:');
  console.error('1. Environment Variable in Render');
  console.error('2. Secret File in Render');
  process.exit(1);
}

// Routes
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Microsoft Translator Proxy',
    keyConfigured: !!TRANSLATION_KEY
  });
});

app.post('/translate', async (req, res) => {
  const { text, targetLang } = req.body;

  if (!text || !targetLang) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: text and targetLang'
    });
  }

  try {
    const response = await axios.post(
      `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=${targetLang}`,
      [{ text }],
      {
        headers: {
          'Ocp-Apim-Subscription-Key': TRANSLATION_KEY,
          'Ocp-Apim-Subscription-Region': 'eastus',
          'Content-Type': 'application/json'
        },
        timeout: 5000
      }
    );

    if (!response.data || !response.data[0].translations[0].text) {
      throw new Error('Invalid response from translation service');
    }

    res.json({
      success: true,
      originalText: text,
      translatedText: response.data[0].translations[0].text,
      targetLanguage: targetLang
    });
  } catch (error) {
    console.error('Translation error:', {
      message: error.message,
      response: error.response?.data,
      stack: error.stack
    });

    const statusCode = error.response?.status || 500;
    res.status(statusCode).json({
      success: false,
      error: 'Translation failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// NOVA ROTA: Tradução em Lote Paralela
app.post('/translate/batch', async (req, res) => {
  const { texts, targetLang } = req.body;

  // Validação dos dados de entrada
  if (!texts || !Array.isArray(texts) || !targetLang) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: texts (array) and targetLang'
    });
  }

  if (texts.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Texts array cannot be empty'
    });
  }

  // Limite para evitar sobrecarga da API
  const MAX_BATCH_SIZE = 25;
  if (texts.length > MAX_BATCH_SIZE) {
    return res.status(400).json({
      success: false,
      error: `Too many texts. Maximum allowed: ${MAX_BATCH_SIZE}`,
      maxBatchSize: MAX_BATCH_SIZE
    });
  }

  try {
    // Criar array de promises para execução paralela
    const translationPromises = texts.map((text, index) => 
      axios.post(
        `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=${targetLang}`,
        [{ text }],
        {
          headers: {
            'Ocp-Apim-Subscription-Key': TRANSLATION_KEY,
            'Ocp-Apim-Subscription-Region': 'eastus',
            'Content-Type': 'application/json'
          },
          timeout: 10000 // Timeout maior para lote
        }
      )
      .then(response => ({
        success: true,
        originalText: text,
        translatedText: response.data[0].translations[0].text,
        index: index
      }))
      .catch(error => ({
        success: false,
        originalText: text,
        error: error.response?.data?.error?.message || error.message,
        index: index,
        statusCode: error.response?.status
      }))
    );

    // Executar todas as traduções em paralelo
    const results = await Promise.all(translationPromises);

    // Estatísticas
    const successfulTranslations = results.filter(r => r.success);
    const failedTranslations = results.filter(r => !r.success);

    res.json({
      success: true,
      results: results,
      summary: {
        total: results.length,
        successful: successfulTranslations.length,
        failed: failedTranslations.length,
        successRate: (successfulTranslations.length / results.length * 100).toFixed(2) + '%'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Batch translation error:', {
      message: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      error: 'Batch translation processing failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Server start
app.listen(PORT, () => {
  console.log(`Translation service running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Key loaded: ${TRANSLATION_KEY ? 'Yes' : 'No'}`);
  console.log(`✅ Batch translation endpoint available at /translate/batch`);
});

// Error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});
```
