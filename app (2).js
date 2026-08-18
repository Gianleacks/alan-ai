/*
  ALAN
  ---------------
  - Il cervello (Groq) passa da una funzione serverless di Netlify: la chiave
    resta nascosta lì, non serve incollarla da nessuna parte nel sito.
  - Ascolto continuo con parola d'attivazione "Alan": dopo aver premuto
    "Attiva Alan" una volta (serve un click per il permesso del microfono),
    il sito resta in ascolto in background. Dì "Alan, [comando]" e risponde,
    senza dover più premere nulla.
  - Archivio: mentre parli con Alan, cerco l'argomento su Wikipedia in
    italiano e aggiungo una scheda con immagine e riassunto, con un
    effetto di profondità 3D quando scorri la pagina.
*/

const dial = document.getElementById('dial');
const talkBtn = document.getElementById('talkBtn');
const talkBtnLabel = document.getElementById('talkBtnLabel');
const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');
const hintEl = document.getElementById('hint');
const archiveScene = document.getElementById('archiveScene');

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const WAKE_WORD = 'alan';
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let recognition = null;
let isActive = false;      // Alan è stato acceso (permesso microfono ottenuto)
let isSpeaking = false;    // Alan sta parlando (mettiamo in pausa l'ascolto)
let restartTimer = null;
let cardDepthCycle = 0;

const SYSTEM_PROMPT = `Sei Alan, un assistente vocale personale.
Rispondi sempre in italiano, in modo naturale e conciso: le tue risposte vengono lette ad alta voce,
quindi evita elenchi puntati, markdown o risposte troppo lunghe. Massimo 2-3 frasi, a meno che
l'utente non chieda esplicitamente più dettagli.`;

let conversation = [{ role: 'system', content: SYSTEM_PROMPT }];

function supportsSpeech() {
  return !!SpeechRecognition && 'speechSynthesis' in window;
}

function addLogLine(who, text) {
  const hint = logEl.querySelector('.log__hint');
  if (hint) hint.remove();

  const line = document.createElement('p');
  line.className = `log__line log__line--${who === 'Tu' ? 'user' : 'alan'}`;
  line.innerHTML = `<span class="log__who">${who}</span>${text}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

function setStatus(text, active) {
  statusEl.textContent = text;
  dial.classList.toggle('dial--active', !!active);
}

// ---------- Sintesi vocale: Alan parla ----------

function alanSpeaks(text) {
  return new Promise((resolve) => {
    isSpeaking = true;
    stopRecognition(); // Evita che Alan senta se stesso mentre parla

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'it-IT';
    utterance.rate = 1;

    const finish = () => {
      isSpeaking = false;
      resolve();
      if (isActive) startRecognition(); // Riprende l'ascolto in background
    };

    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  });
}

// ---------- Cervello di Alan: chiamata alla funzione serverless ----------

async function chiediAlAlan(testoUtente) {
  conversation.push({ role: 'user', content: testoUtente });

  try {
    const response = await fetch('/.netlify/functions/ask-alan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: conversation })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Errore dalla funzione serverless:', response.status, data);
      if (response.status === 500) {
        return 'La chiave del mio cervello non è ancora configurata su Netlify.';
      }
      if (response.status === 429) {
        return 'Ho raggiunto il limite di richieste gratuite per ora. Riprova tra qualche minuto.';
      }
      return 'Il mio cervello non ha risposto correttamente. Ho scritto i dettagli nella console del browser.';
    }

    const risposta = data.reply || 'Non sono riuscito a formulare una risposta.';
    conversation.push({ role: 'assistant', content: risposta });
    return risposta;

  } catch (err) {
    console.error('Errore di rete:', err);
    return 'Non riesco a raggiungere il mio cervello: controlla la connessione internet.';
  }
}

// ---------- Riconoscimento vocale continuo con parola d'attivazione ----------

function buildRecognition() {
  const r = new SpeechRecognition();
  r.lang = 'it-IT';
  r.continuous = true;
  r.interimResults = false;
  r.maxAlternatives = 1;

  r.onresult = async (event) => {
    const ultimoRisultato = event.results[event.results.length - 1];
    const frase = ultimoRisultato[0].transcript.trim();
    const fraseMinuscola = frase.toLowerCase();

    if (!fraseMinuscola.includes(WAKE_WORD)) {
      return; // Non ha detto "Alan": ignoriamo, restiamo in ascolto passivo
    }

    // Prendiamo tutto ciò che viene detto dopo la parola "Alan"
    const indice = fraseMinuscola.indexOf(WAKE_WORD);
    const comando = frase.slice(indice + WAKE_WORD.length).replace(/^[,.\s]+/, '').trim();

    if (!comando) {
      setStatus('Sì? Dimmi pure', true);
      return; // Ha detto solo "Alan": aspettiamo la frase successiva col comando
    }

    addLogLine('Tu', comando);
    setStatus('Sto pensando...', true);

    aggiornaArchivio(comando); // In parallelo, non blocca la risposta vocale

    const risposta = await chiediAlAlan(comando);
    addLogLine('Alan', risposta);

    setStatus('Sto parlando...', true);
    await alanSpeaks(risposta);

    setStatus('In ascolto...', true);
  };

  r.onerror = (event) => {
    if (event.error === 'no-speech' || event.error === 'aborted') return;
    console.warn('Errore riconoscimento vocale:', event.error);
  };

  r.onend = () => {
    // Il browser ferma il riconoscimento periodicamente da solo: lo riavviamo
    // per restare sempre in ascolto, a meno che Alan non sia stato spento.
    if (isActive && !isSpeaking) {
      restartTimer = setTimeout(() => startRecognition(), 300);
    }
  };

  return r;
}

function startRecognition() {
  try {
    recognition = buildRecognition();
    recognition.start();
    setStatus('In ascolto...', true);
  } catch (err) {
    // start() può fallire se un'istanza precedente è ancora attiva: ignoriamo
  }
}

function stopRecognition() {
  clearTimeout(restartTimer);
  if (recognition) {
    recognition.onend = null; // Evita che il riavvio automatico scatti qui
    recognition.stop();
  }
}

function attivaAlan() {
  if (!supportsSpeech()) {
    setStatus('Browser non supportato', false);
    addLogLine('Alan', 'Questo browser non supporta il riconoscimento vocale. Prova con Chrome su desktop o Android.');
    return;
  }

  isActive = true;
  talkBtnLabel.textContent = 'Alan è attivo';
  talkBtn.classList.add('talk-btn--active');
  hintEl.textContent = `Di' "Alan" seguito dal comando, in qualsiasi momento.`;

  startRecognition();
}

talkBtn.addEventListener('click', () => {
  if (isActive) return; // Un solo click basta per accendere Alan
  attivaAlan();
});

// ---------- Archivio: schede da Wikipedia con parallasse 3D ----------

function creaSchedaArchivio({ titolo, estratto, immagine }) {
  const hint = archiveScene.querySelector('.archive__hint');
  if (hint) hint.remove();

  cardDepthCycle = (cardDepthCycle % 3) + 1;

  const card = document.createElement('article');
  card.className = 'archive__card';
  card.dataset.depth = cardDepthCycle;

  if (immagine) {
    const img = document.createElement('img');
    img.className = 'archive__card-image';
    img.src = immagine;
    img.alt = titolo;
    card.appendChild(img);
  } else {
    const icon = document.createElement('div');
    icon.className = 'archive__card-icon';
    icon.textContent = titolo.charAt(0).toUpperCase();
    card.appendChild(icon);
  }

  const title = document.createElement('h3');
  title.className = 'archive__card-title';
  title.textContent = titolo;
  card.appendChild(title);

  const text = document.createElement('p');
  text.className = 'archive__card-text';
  text.textContent = estratto;
  card.appendChild(text);

  archiveScene.prepend(card);

  // Teniamo solo le ultime 6 schede, per non appesantire la pagina
  while (archiveScene.children.length > 6) {
    archiveScene.removeChild(archiveScene.lastChild);
  }

  aggiornaParallasse();
}

// Estrae un argomento plausibile dal comando, togliendo le frasi introduttive più comuni
function estraiArgomento(comando) {
  return comando
    .replace(/^(parlami di|parlami un po' di|dimmi di|chi è|chi era|cos'è|cosa è|cosa sono|raccontami di)\s+/i, '')
    .replace(/[?.!]+$/, '')
    .trim();
}

async function cercaSuWikipedia(query) {
  try {
    const searchUrl = `https://it.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=1`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();
    const risultato = searchData?.query?.search?.[0];
    if (!risultato) return null;

    const titolo = risultato.title;
    const summaryRes = await fetch(`https://it.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(titolo)}`);
    if (!summaryRes.ok) return null;
    const summary = await summaryRes.json();

    return {
      titolo: summary.title,
      estratto: summary.extract ? summary.extract.slice(0, 140) + (summary.extract.length > 140 ? '…' : '') : '',
      immagine: summary.thumbnail?.source || null
    };
  } catch (err) {
    console.warn('Ricerca Wikipedia non riuscita:', err);
    return null;
  }
}

async function aggiornaArchivio(comando) {
  const argomento = estraiArgomento(comando);
  if (!argomento || argomento.length < 3) return;

  const risultato = await cercaSuWikipedia(argomento);
  if (risultato) creaSchedaArchivio(risultato);
}

// ---------- Parallasse 3D guidata dallo scroll ----------

function aggiornaParallasse() {
  if (prefersReducedMotion) return;

  const cards = archiveScene.querySelectorAll('.archive__card');
  const viewportCenter = window.innerHeight / 2;

  cards.forEach((card) => {
    const depth = Number(card.dataset.depth || 1);
    const rect = card.getBoundingClientRect();
    const cardCenter = rect.top + rect.height / 2;
    const distanzaDalCentro = (cardCenter - viewportCenter) / viewportCenter;

    const rotazione = distanzaDalCentro * -6 * depth;
    const traslazione = distanzaDalCentro * 10 * depth;

    card.style.transform = `translateY(${traslazione}px) rotateX(${rotazione}deg) translateZ(${depth * 6}px)`;
  });
}

let parallaxTicking = false;
window.addEventListener('scroll', () => {
  if (parallaxTicking) return;
  parallaxTicking = true;
  requestAnimationFrame(() => {
    aggiornaParallasse();
    parallaxTicking = false;
  });
}, { passive: true });

window.addEventListener('resize', aggiornaParallasse);

// ---------- Service worker (PWA) ----------

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
