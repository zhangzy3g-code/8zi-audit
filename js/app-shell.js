/**
 * 天机命理 App Shell 基础设施与 PWA 控制器 (app-shell.js)
 */

export class AppShell {
  static init() {
    this.initServiceWorker();
    this.initNetworkListeners();
    this.initPwaInstall();
    this.initKeyboardAdaptive();
    this.initModuleDrawer();
    this.initMobilePrimaryAction();
  }

  /**
   * 注册 Service Worker 并监听更新
   */
  static initServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then((reg) => {
            console.log('[AppShell] ServiceWorker registered with scope:', reg.scope);
            this.bindUpdatePrompt(reg);
            if (reg.waiting && navigator.serviceWorker.controller) this.showUpdateBanner(reg.waiting);

            // 监听更新
            reg.addEventListener('updatefound', () => {
              const newWorker = reg.installing;
              if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    this.showUpdateBanner(newWorker);
                  }
                });
              }
            });
          })
          .catch((err) => {
            console.warn('[AppShell] ServiceWorker registration failed:', err);
          });
      });
    }
  }

  static bindUpdatePrompt(registration) {
    const updateBanner = document.getElementById('pwa-update-banner');
    const updateBtn = document.getElementById('pwa-update-btn');
    const laterBtn = document.getElementById('pwa-update-later');
    if (updateBtn && !updateBtn.dataset.bound) {
      updateBtn.addEventListener('click', () => {
        sessionStorage.removeItem('tianji_pwa_update_later');
        const worker = registration.waiting || this.pendingWorker;
        if (!worker) {
          if (updateBanner) updateBanner.classList.remove('active');
          return;
        }
        updateBtn.disabled = true;
        updateBtn.textContent = '更新中…';
        worker.postMessage({ type: 'SKIP_WAITING' });
      });
      updateBtn.dataset.bound = '1';
    }
    if (laterBtn && !laterBtn.dataset.bound) {
      laterBtn.addEventListener('click', () => {
        sessionStorage.setItem('tianji_pwa_update_later', 'true');
        if (updateBanner) updateBanner.classList.remove('active');
      });
      laterBtn.dataset.bound = '1';
    }
    if (!this.controllerChangeBound) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!this.pendingWorker) return;
        if (this.reloadingForUpdate) return;
        this.reloadingForUpdate = true;
        window.location.reload();
      });
      this.controllerChangeBound = true;
    }
  }

  /**
   * 监听在线/断网状态
   */
  static initNetworkListeners() {
    const updateStatus = () => {
      const isOnline = navigator.onLine;
      const banner = document.getElementById('offline-banner');
      if (banner) {
        if (!isOnline) {
          banner.classList.add('active');
        } else {
          banner.classList.remove('active');
        }
      }
    };

    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    updateStatus();
  }

  /**
   * 捕获 PWA 安装引导事件
   */
  static initPwaInstall() {
    let deferredPrompt = null;
    const installBanner = document.getElementById('pwa-install-banner');
    const installBtn = document.getElementById('pwa-install-btn');
    const closeBtn = document.getElementById('pwa-install-close');

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      const isDismissed = sessionStorage.getItem('tianji_pwa_dismissed') === 'true';
      if (installBanner && !isDismissed) {
        installBanner.classList.add('active');
      }
    });

    if (installBtn) {
      installBtn.addEventListener('click', async () => {
        if (deferredPrompt) {
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          console.log('[AppShell] User install choice:', outcome);
          deferredPrompt = null;
          if (installBanner) installBanner.classList.remove('active');
        }
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        sessionStorage.setItem('tianji_pwa_dismissed', 'true');
        if (installBanner) installBanner.classList.remove('active');
      });
    }
  }

  /**
   * 软键盘弹起时隐藏底部导航
   */
  static initKeyboardAdaptive() {
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => {
        const isKeyboardOpen = window.visualViewport.height < window.innerHeight * 0.75;
        document.body.classList.toggle('keyboard-visible', isKeyboardOpen);
      });
    }
  }

  /**
   * 命盘模块抽屉控制
   */
  static initModuleDrawer() {
    const backdrop = document.getElementById('module-drawer-backdrop');
    const closeBtn = document.getElementById('drawer-close-btn');

    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          this.closeDrawer();
        }
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeDrawer());
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeDrawer();
      }
    });
  }

  static openDrawer() {
    const backdrop = document.getElementById('module-drawer-backdrop');
    if (backdrop) {
      backdrop.style.display = 'block';
      backdrop.setAttribute('aria-hidden', 'false');
      document.body.classList.add('drawer-open');
      document.body.style.overflow = 'hidden';
      const mobileNav = document.getElementById('mobile-bottom-nav');
      if (mobileNav) {
        mobileNav.setAttribute('aria-hidden', 'true');
        mobileNav.setAttribute('inert', '');
      }
      const firstBtn = backdrop.querySelector('button');
      if (firstBtn) firstBtn.focus();
    }
  }

  static closeDrawer() {
    const backdrop = document.getElementById('module-drawer-backdrop');
    if (backdrop) {
      backdrop.style.display = 'none';
      backdrop.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('drawer-open');
      document.body.style.overflow = '';
      const mobileNav = document.getElementById('mobile-bottom-nav');
      if (mobileNav) {
        mobileNav.removeAttribute('aria-hidden');
        mobileNav.removeAttribute('inert');
      }
      const modulesBtn = document.getElementById('nav-item-modules') || document.getElementById('nav-item-chart');
      if (modulesBtn) modulesBtn.focus();
    }
  }

  /**
   * 八字首页主操作在手机首屏之外时，提供一个固定的快捷入口。
   */
  static initMobilePrimaryAction() {
    const action = document.getElementById('mobile-bazi-action');
    const actionBtn = document.getElementById('mobile-bazi-action-btn');
    const genBtn = document.getElementById('gen');
    const baziZone = document.getElementById('bazi-zone');
    if (!action || !actionBtn || !genBtn || !baziZone) return;

    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };

    const update = () => {
      const rect = genBtn.getBoundingClientRect();
      const genInViewport = rect.bottom > 0 && rect.top < window.innerHeight;
      const baziActive = baziZone.classList.contains('is-active') || baziZone.getAttribute('aria-hidden') === 'false';
      const shouldShow = baziActive && isVisible(genBtn) && !genInViewport && !document.body.classList.contains('drawer-open') && !document.body.classList.contains('keyboard-visible');
      action.hidden = !shouldShow;
    };

    actionBtn.addEventListener('click', () => {
      genBtn.click();
      if (isVisible(genBtn)) genBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    window.addEventListener('hashchange', update);
    const observer = new MutationObserver(update);
    observer.observe(baziZone, { attributes: true, attributeFilter: ['class', 'aria-hidden', 'hidden'] });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    update();
  }

  static showUpdateBanner(worker) {
    this.pendingWorker = worker || null;
    const updateBanner = document.getElementById('pwa-update-banner');
    const dismissed = sessionStorage.getItem('tianji_pwa_update_later') === 'true';
    if (updateBanner && !dismissed) {
      updateBanner.classList.add('active');
    }
  }
}

if (typeof window !== 'undefined') {
  window.AppShell = AppShell;
}
