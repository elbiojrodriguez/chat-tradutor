const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

// Configuração do CORS para permitir acesso do seu frontend
app.use(cors());
app.use(express.json());

// Rota para tradução (POST)
app.post('/traduzir', async (req, res) => {
  const { texto, idiomaAlvo } = req.body;

  // SUA CHAVE DA MICROSOFT (substitua pela sua)
  const CHAVE_TRADUTOR = process.env.CHAVE_TRADUTOR || 'SUA_CHAVE_AQUI';

  try {
    const resposta = await axios.post(
      'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=' + idiomaAlvo,
      [{ text: texto }],
      {
        headers: {
          'Ocp-Apim-Subscription-Key': CHAVE_TRADUTOR,
          'Content-Type': 'application/json',
        },
      }
    );
    res.json({ tradução: resposta.data[0].translations[0].text });
  } catch (erro) {
    res.status(500).json({ erro: 'Falha na tradução' });
  }
});

// Rota de teste
app.get('/', (req, res) => {
  res.send('Servidor do Tradutor Funcionando!');
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
