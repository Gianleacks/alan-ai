// Funzione serverless di Cloudflare Pages (equivalente a quella che avevamo su Netlify).
// La chiave GROQ_API_KEY resta nascosta nelle variabili d'ambiente di Cloudflare,
// non è mai visibile a chi visita il sito.
//
// La imposti su: Cloudflare dashboard -> il tuo progetto -> Settings ->
// Environment variables -> Add variable -> GROQ_API_KEY

const GROQ_MODEL = 'openai/gpt-oss-120b';

export async function onRequestPost(context) {
  const { request, env } = context;

  const apiKey = env.GROQ_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'GROQ_API_KEY non configurata su Cloudflare.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let messages;
  try {
    const body = await request.json();
    messages = body.messages;
    if (!Array.isArray(messages)) throw new Error('messages mancante');
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Corpo della richiesta non valido.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
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
      return new Response(
        JSON.stringify({ error: data?.error?.message || 'Errore da Groq.' }),
        { status: groqResponse.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const reply = data.choices?.[0]?.message?.content?.trim() || '';
    return new Response(
      JSON.stringify({ reply }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Impossibile contattare Groq.' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
