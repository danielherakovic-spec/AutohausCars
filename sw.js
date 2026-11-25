const CACHE = 'carsautohaus-v21-all-parts';
const ASSETS = ["./","./index.html","./premium-ui.css?v=21","./color-base.css?v=21","./refinement.css?v=21","./app.js?v=21","./inventory-core.js?v=21","./showrooms.js?v=21","./voice-assistant.js","./free-dictation.js","./listing-paste-import.js","./comparison-pro.js?v=21","./pinboard.js?v=21","./pinboard-sync.js?v=21","./pinboard-calculator.js?v=21","./pinboard.css?v=21","./config.js","./manifest.webmanifest","./icon.svg","./workspace-data.js?v=21","./calendar-core.js?v=21","./calendar.js?v=21","./calendar.css?v=21","./garage.js?v=21","./garage-core.js","./garage-model.js","./garage-parts.js","./garage.css?v=21","./workspace-navigation.css?v=21","./vendor/three.module.js","./vendor/three.core.js","./vendor/OrbitControls.js"];
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
