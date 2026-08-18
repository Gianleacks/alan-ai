// Funzione serverless di Netlify.
// Gira sui server di Netlify, non nel browser: la chiave GROQ_API_KEY
// resta sempre nascosta e non è mai visibile a chi visita il sito.
//
// La imposti una sola volta su Netlify in:
// Site settings -> Environment variables -> GROQ_API_KEY

const GROQ_MODEL = 'openai/gpt-oss-120b';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Metodo non consentito.' }) };
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'GROQ_API_KEY non configurata su Netlify.' })
    };
  }

  let messages;
  try {
    const body = JSON.parse(event.body || '{}');
    messages = body.messages;
    if (!Array.isArray(messages)) throw new Error('messages mancante');
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Corpo della richiesta non valido.' }) };
  }

  try {
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        temperature: 0.7
      })
    });

    const data = await groqResponse.json();

    if (!groqResponse.ok) {
      console.error('Errore Groq:', groqResponse.status, data);
      return {
        statusCode: groqResponse.status,
        body: JSON.stringify({ error: data?.error?.message || 'Errore da Groq.' })
      };
    }

    const reply = data.choices?.[0]?.message?.content?.trim() || '';
    return { statusCode: 200, body: JSON.stringify({ reply }) };

  } catch (err) {
    console.error('Errore di rete verso Groq:', err);
    return { statusCode: 502, body: JSON.stringify({ error: 'Impossibile contattare Groq.' }) };
  }
};
