// ALAN — service worker, passo 1
// Per ora si limita a esistere (necessario per l'installazione come app).
// Nei prossimi passi lo useremo per far funzionare Alan anche offline.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Passo 1: nessuna cache, lasciamo che il browser scarichi normalmente.
});
