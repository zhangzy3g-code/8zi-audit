/**
 * 天机命理 Hash 路由与视图控制器 (router.js)
 */

export class AppRouter {
  constructor(routes = {}, onRouteChange = null) {
    this.routes = routes;
    this.onRouteChange = onRouteChange;
    this.currentRoute = '';

    window.addEventListener('hashchange', () => this.handleHashChange());
  }

  /**
   * 初始化路由
   */
  init(defaultRoute = 'daily') {
    const searchParams = new URLSearchParams(window.location.search || '');
    let targetRoute = '';
    if (searchParams.has('daily')) {
      targetRoute = 'daily';
    } else {
      const initialHash = window.location.hash.replace(/^#\/?/, '').trim();
      // 地址栏 hash 是唯一可见来源；没有 hash 时回到稳定首页，避免旧会话把页面带回上一模块。
      targetRoute = initialHash || defaultRoute;
    }
    this.navigate(targetRoute, false);
  }

  /**
   * 页面跳转导航
   */
  navigate(route, updateHistory = true) {
    const cleanRoute = route.replace(/^#\/?/, '').trim() || 'home';
    this.currentRoute = cleanRoute;
    sessionStorage.setItem('tianji_active_route', cleanRoute);

    if (updateHistory && window.location.hash !== `#${cleanRoute}`) {
      window.location.hash = `#${cleanRoute}`;
    }

    if (typeof this.onRouteChange === 'function') {
      this.onRouteChange(cleanRoute);
    }
  }

  /**
   * 监听 URL Hash 变动
   */
  handleHashChange() {
    const currentHash = window.location.hash.replace(/^#\/?/, '').trim() || 'home';
    // 页内内容锚点不属于模块路由；保留 Hash，供复制链接、刷新与浏览器历史使用。
    if (!Object.prototype.hasOwnProperty.call(this.routes, currentHash) && document.getElementById(currentHash)) {
      return;
    }
    if (currentHash !== this.currentRoute) {
      this.navigate(currentHash, false);
    }
  }
}

if (typeof window !== 'undefined') {
  window.AppRouter = AppRouter;
}
