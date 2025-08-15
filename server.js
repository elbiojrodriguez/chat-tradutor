const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

// Configurações básicas
app.use(cors());
app.use(express.json());

// Variável de ambiente (configure no Render)
const CHAVE_TRADUTOR = process.env.CHAVE_TRADUTOR; 

if (!CHAVE_TRADUTOR) {
  console.error('ERRO: Chave do tradutor não configurada!');
  console.error('Adicione a variável CHAVE_TRADUTOR no Render.');
  process.exit(1); // Encerra o servidor se a chave não existir
}

// Rota de tradução
app.post('/traduzir', async (req, res) => {
  const { texto, idiomaAlvo } = req.body;

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
    res.json({ 
      sucesso: true,
      textoOriginal: texto,
      textoTraduzido: resposta.data[0].translations[0].text 
    });
    
  } catch (erro) {
    console.error('Erro na tradução:', erro.response?.data || erro.message);
    res.status(500).json({ 
      sucesso: false,
      erro: 'Falha na tradução',
      detalhes: erro.response?.data || null 
    });
  }
});

// Rota de teste
app.get('/', (req, res) => {
  res.json({ 
    status: 'Servidor operacional',
    instrucao: 'Use POST /traduzir com { texto: "texto", idiomaAlvo: "en" }'
  });
});

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
