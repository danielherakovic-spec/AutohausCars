const CACHE = 'carsautohaus-betriebszentrale-v16-ranking-navigation';
const ASSETS = ['./', './index.html', './premium-ui.css?v=14', './palette-lock.css?v=14', './vehicle-analysis.css?v=16', './vehicle-analysis.mjs?v=16', './supabase/functions/_shared/vehicle-export.mjs?v=15', './supabase/functions/_shared/analysis-contract.mjs?v=15', './app.js?v=16', './voice-assistant.js', './free-dictation.js', './listing-paste-import.js', './operations-suite.js?v=14', './comparison-pro.js?v=14', './config.js', './manifest.webmanifest', './icon.svg'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(key => /^(?:autovalue-pro|carsautohaus)-/.test(key) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  // Cache only declared static assets, never authenticated Supabase/API responses.
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !ASSETS.some(asset => new URL(asset, self.registration.scope).href === url.href)) return;
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone();
    if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html'))));
});
