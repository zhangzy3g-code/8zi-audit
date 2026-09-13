/**
 * 天机命理 Service Worker (sw.js)
 * 严格边界策略：
 * - 仅缓存静态 App Shell、CSS、JS、图标
 * - 绝不拦截或缓存任何 /api/* 与 /admin/* 接口数据
 * - 静态资源采用 Stale-While-Revalidate 策略：优先返回缓存，后台异步更新
 */

// 每次前端壳层、图标或样式有结构性变更都递增版本，避免移动端继续命中旧资源。
const CACHE_NAME = 'tianji-shell-3.1.17';
const APP_ROOT = new URL('./', self.registration.scope);
const APP_API_PREFIX = new URL('api/', APP_ROOT).pathname;
const APP_ADMIN_PREFIX = new URL('admin', APP_ROOT).pathname;
const appUrl = (path = '') => new URL(path, APP_ROOT).toString();
const appRoute = (route = '#daily') => {
  const raw = String(route || '#daily');
  return appUrl(raw.startsWith('/#') ? raw.slice(1) : raw);
};

// 静态预缓存核心清单
const PRECACHE_ASSETS = [
  appUrl(),
  appUrl('index.html'),
  appUrl('manifest.webmanifest?v=3.1.5'),
  appUrl('css/fonts.css?v=ux-4'),
  appUrl('fonts/noto-serif-sc-headings-0.ttf'),
  appUrl('fonts/noto-serif-sc-headings-1.ttf'),
  appUrl('css/modules.css?v=ux-4'),
  appUrl('css/pages.css?v=ux-4'),
  appUrl('js/appearance.js?v=ux-4'),
  appUrl('css/tokens.css?v=ux-4'),
  appUrl('css/app-shell.css?v=ux-4'),
  appUrl('css/components.css?v=ux-4'),
  appUrl('css/mobile.css?v=ux-4'),
  appUrl('js/api-client.js'),
  appUrl('js/router.js'),
  appUrl('js/app-shell.js'),
  appUrl('icons/icon-192.png?v=3.1.5'),
  appUrl('icons/icon-512.png?v=3.1.5'),
  appUrl('icons/apple-touch-icon.png?v=3.1.5'),
  appUrl('icons/favicon-32.png?v=3.1.5'),
  appUrl('icons/favicon-16.png?v=3.1.5'),
  appUrl('favicon.ico?v=3.1.5')
];

// 后台 Web Push：通知正文只使用服务端发送的确定性黄历摘要。
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  const title = data.title || '今日运势已更新';
  const options = {
    body: data.body || '打开天机命理，查看今天的黄历节奏。',
    icon: appUrl('icons/icon-192.png?v=3.1.5'),
    badge: appUrl('icons/icon-192.png?v=3.1.5'),
    tag: data.tag || 'tianji-daily',
    renotify: false,
    data: data.data || { url: appRoute(data.url || '#daily') }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = appRoute((event.notification.data && event.notification.data.url) || '#daily');
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => 'focus' in client);
      if (existing) {
        existing.navigate(target);
        return existing.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});

// 安装阶段：预缓存基础 App Shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Precache partial error, continuing:', err);
      });
    })
  );
});

// 用户确认更新后再接管页面，避免“新版本已自动激活”与“请重新加载”同时出现。
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// 激活阶段：清理旧版本缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key.startsWith('tianji-shell-') && key !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 请求拦截阶段
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. 严格放行：所有 API 接口与 Admin 管理后台直连网络，绝不缓存
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/admin') ||
    url.pathname.startsWith(APP_API_PREFIX) ||
    url.pathname.startsWith(APP_ADMIN_PREFIX)
  ) {
    return; // 直接使用浏览器默认网络请求
  }

  // 2. 非 GET 请求直连网络
  if (event.request.method !== 'GET') {
    return;
  }

  // 3. HTML 页面请求：Network First，断网时回退到缓存的 App Shell
  if (event.request.mode === 'navigate' || url.pathname === APP_ROOT.pathname || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // [H-04 FIX] 回退到当前 App scope 内的 index，再回退到 scope 根。
          return caches.match(appUrl('index.html')).then(res => res || caches.match(appUrl()));
        })
    );
    return;
  }

  // 4. 静态资源（CSS, JS, 图标）：Stale-While-Revalidate
  //    [H-05 FIX] 先返回缓存（即时响应），同时后台发起网络请求更新缓存
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request, { cache: 'no-store' }).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch((err) => {
          console.warn('[SW] Fetch failed for static asset:', event.request.url);
          return cachedResponse || Response.error(); // 网络不可用时回退到缓存
        });
        // 优先返回缓存，缓存未命中则等待网络；同时让 SW 有机会完成后台更新。
        event.waitUntil(fetchPromise);
        return cachedResponse || fetchPromise;
      });
    })
  );
});
