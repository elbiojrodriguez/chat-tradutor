const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Security and configuration middleware
app.use(cors({
  origin: '*' // Update this to your frontend URL in production
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Enhanced secret loader with error handling
const loadTranslationKey = () => {
  // Try Environment Variable first
  if (process.env.CHAVE_TRADUTOR) {
    console.log('Using key from environment variable');
    return process.env.CHAVE_TRADUTOR;
  }

  // Try Render Secret File
  try {
    const secretPath = path.join('/etc/secrets', 'CHAVE_TRADUTOR');
    if (fs.existsSync(secretPath)) {
      console.log('Using key from secret file');
      return fs.readFileSync(secretPath, 'utf8').trim();
    }
  } catch (error) {
    console.error('Error reading secret file:', error);
  }

  // Final fallback (not recommended for production)
  if (process.env.NODE_ENV === 'development') {
    const devKey = 'your-dev-key-here'; // Only for local testing
    console.warn('Using development key!');
    return devKey;
  }

  return null;
};

const TRANSLATION_KEY = loadTranslationKey();

// Validate key presence
if (!TRANSLATION_KEY) {
  console.error('FATAL: No translation key configured');
  console.error('Please set CHAVE_TRADUTOR as either:');
  console.error('1. Environment Variable in Render');
  console.error('2. Secret File in Render');
  process.exit(1);
}

// Translation endpoint
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
          'Content-Type': 'application/json',
        },
        timeout: 5000 // 5 second timeout
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
      details: process.env.NODE_ENV === 'development' 
        ? error.message 
        : undefined
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Microsoft Translator Proxy',
    keyConfigured: !!TRANSLATION_KEY
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Translation service running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Key loaded: ${TRANSLATION_KEY ? 'Yes' : 'No'}`);
});

// Error handling for uncaught exceptions
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});
