import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const TRANSLATION_KEY = process.env.TRANSLATION_KEY;
const TRANSLATION_ENDPOINT = 'https://api.cognitive.microsofttranslator.com';
const TRANSLATION_REGION = process.env.TRANSLATION_REGION || 'global';

// 🔄 Rota de verificação para UptimeRobot
app.get('/ping', (req, res) => {
  res.send('pong');
});

// ✅ Rota de verificação de saúde
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Microsoft Translator Proxy',
    keyConfigured: !!TRANSLATION_KEY
  });
});

// 🌍 Rota principal de tradução
app.post('/translate', async (req, res) => {
  const { text, to } = req.body;

  if (!TRANSLATION_KEY) {
    return res.status(500).json({ error: 'Translation key not configured.' });
  }

  try {
    const response = await axios.post(
      `${TRANSLATION_ENDPOINT}/translate?api-version=3.0&to=${to}`,
      [{ Text: text }],
      {
        headers: {
          'Ocp-Apim-Subscription-Key': TRANSLATION_KEY,
          'Ocp-Apim-Subscription-Region': TRANSLATION_REGION,
          'Content-Type': 'application/json'
        }
      }
    );

    const translatedText = response.data[0]?.translations[0]?.text;
    res.json({ translatedText });
  } catch (error) {
    console.error('Translation error:', error.message);
    res.status(500).json({ error: 'Translation failed.' });
  }
});

// 🚀 Inicializa o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
