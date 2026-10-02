const CACHE_NAME = 'ramy-space-v29';
const APP_SHELL = [
    './',
    './index.html',
    './ramy-space.html',
    './editable-app.js?v=24',
    './manifest.json',
    './anime-avatar.svg',
    './icon-192.png',
    './icon-512.png',
    './apple-touch-icon.png'
];
const OFFLINE_RUNTIME_ASSETS = ['https://cdn.tailwindcss.com/'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_NAME);
            await cache.addAll(APP_SHELL);
            await Promise.allSettled(OFFLINE_RUNTIME_ASSETS.map(async (url) => {
                const response = await fetch(url, { mode: 'no-cors' });
                if (response.ok || response.type === 'opaque') await cache.put(url, response);
            }));
        })()
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;

            return fetch(event.request).then((response) => {
                if (response.ok || response.type === 'opaque') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return response;
            }).catch(() => {
                if (event.request.mode === 'navigate') {
                    return caches.match('./ramy-space.html');
                }
                return new Response('Cette ressource n’est pas disponible hors ligne.', {
                    status: 503,
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                });
            });
        })
    );
});
