import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const publicFiles = ['manifest.webmanifest', 'icons/kasel-192.png', 'icons/kasel-512.png']

export function kaselPwa() {
  return {
    name: 'kasel-pwa',
    apply: 'build',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const hash = createHash('sha256').update(readFileSync(new URL('./pwa.js', import.meta.url)))
        const paths = Object.keys(bundle).sort()
        for (const path of paths) {
          const output = bundle[path]
          hash.update(path).update(output.type === 'chunk' ? output.code : output.source)
        }
        for (const path of publicFiles) hash.update(readFileSync(new URL('../public/' + path, import.meta.url)))
        const version = hash.digest('hex').slice(0, 16)
        const files = [...paths, ...publicFiles]
        this.emitFile({type:'asset', fileName:'sw.js', source:`
const cachePrefix = 'kasel-shell-' + self.registration.scope + ':';
const cacheName = cachePrefix + ${JSON.stringify(version)};
const files = ${JSON.stringify(files)}.map(path => new URL(path, self.registration.scope).href);
const index = new URL('index.html', self.registration.scope).href;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache =>
    cache.addAll(files.map(url => new Request(url, {cache: 'reload'})))
  ));
});

self.addEventListener('message', event => {
  if (event.data === 'ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(cachePrefix) && key !== cacheName) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin) return;
  const navigation = event.request.mode === 'navigate' &&
    (url.pathname === scope.pathname || url.pathname === new URL(index).pathname);
  if (!navigation && !files.includes(url.href)) return;
  const key = navigation ? index : url.href;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    return await cache.match(key) || fetch(event.request);
  })());
});
`})
      },
    },
  }
}
