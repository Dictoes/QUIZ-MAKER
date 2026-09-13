const CACHE_NAME = "jnotaly-offline-v16";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css?v=drawer-interaction-1",
  "./script.js?v=ce364-nbcp-4",
  "./data/manifest.json",
  "./manifest.webmanifest"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    const manifestResponse = await fetch("./data/manifest.json");
    const manifest = await manifestResponse.json();
    const dataUrls = (manifest.files || []).map(file => `./data/${file}`);
    const dataResponses = await Promise.all(dataUrls.map(url => fetch(url)));
    const assetUrls = new Set();

    for (const response of dataResponses) {
      if (!response.ok) throw new Error(`Could not cache ${response.url}`);
      collectAssetUrls(await response.clone().json(), assetUrls);
    }

    await Promise.all([
      ...dataResponses.map((response, index) => cache.put(dataUrls[index], response)),
      ...[...assetUrls].map(async url => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Could not cache ${url}`);
        await cache.put(url, response);
      })
    ]);
    await self.skipWaiting();
  })());
});

function collectAssetUrls(value, assetUrls) {
  if (Array.isArray(value)) {
    value.forEach(item => collectAssetUrls(item, assetUrls));
    return;
  }

  if (!value || typeof value !== "object") return;

  Object.values(value).forEach(item => {
    if (typeof item === "string" && item.startsWith("assets/")) {
      assetUrls.add(`./${item}`);
    } else {
      collectAssetUrls(item, assetUrls);
    }
  });
}

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request);

    if (event.request.mode === "navigate") {
      try {
        const response = await fetch(event.request);
        if (response.ok) cache.put("./index.html", response.clone());
        return response;
      } catch (error) {
        return cached || cache.match("./index.html");
      }
    }

    try {
      const response = await fetch(event.request);
      if (response.ok && (requestUrl.pathname.startsWith("/data/") || requestUrl.pathname.startsWith("/assets/") || requestUrl.pathname.endsWith(".css") || requestUrl.pathname.endsWith(".js"))) {
        cache.put(event.request, response.clone());
      }
      return response;
    } catch (error) {
      if (cached) return cached;
      if (event.request.mode === "navigate") {
      return cache.match("./index.html");
      }
      throw error;
    }
  })());
});
