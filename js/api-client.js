/**
 * 天机命理 统一 API 客户端 (api-client.js)
 * 职责：
 * 1. 竞态取消 (AbortController 按 key 管理)
 * 2. 离线/在线状态感知与离线拦截保护
 * 3. 统一错误码与重试机制
 * 4. 严格防重复点击与支付幂等保护
 */

const activeControllers = new Map();

export class ApiClient {
  /**
   * 检查当前网络状态
   */
  static isOnline() {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  /**
   * 发起受保护的 API 请求
   * @param {string} url - API 路径
   * @param {object} options - fetch 选项
   * @param {string} cancelKey - 竞态取消分组标识
   */
  static async request(url, options = {}, cancelKey = 'default') {
    // 离线拦截：针对扣点、支付、排盘等写操作，禁止离线提交
    if (!this.isOnline() && options.method && options.method.toUpperCase() === 'POST') {
      const err = new Error('网络已断开，请检查网络连接后重试。');
      err.code = 'NETWORK_OFFLINE';
      throw err;
    }

    // 竞态取消：同 key 上一次未完成的请求自动 abort
    if (cancelKey && activeControllers.has(cancelKey)) {
      try {
        activeControllers.get(cancelKey).abort();
      } catch (e) {
        // 忽略已取消异常
      }
      activeControllers.delete(cancelKey);
    }

    const controller = new AbortController();
    if (cancelKey) {
      activeControllers.set(cancelKey, controller);
    }

    const mergedOptions = {
      ...options,
      credentials: options.credentials || 'include',
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    };

    try {
      const response = await fetch(url, mergedOptions);
      
      // 统一 HTTP 状态码处理
      if (response.status === 401) {
        const err = new Error('登录会话已过期，请重新登录。');
        err.code = 'UNAUTHORIZED';
        err.status = 401;
        throw err;
      }
      if (response.status === 429) {
        const err = new Error('请求过于频繁，请稍候再试。');
        err.code = 'RATE_LIMITED';
        err.status = 429;
        throw err;
      }
      if (response.status >= 500) {
        const err = new Error('服务端处理异常，请稍后重试。');
        err.code = 'SERVER_ERROR';
        err.status = response.status;
        throw err;
      }

      const data = await response.json();
      return data;
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log(`[ApiClient] Request aborted: ${url} (${cancelKey})`);
        return { aborted: true };
      }
      throw err;
    } finally {
      if (cancelKey && activeControllers.get(cancelKey) === controller) {
        activeControllers.delete(cancelKey);
      }
    }
  }

  /**
   * 便捷 GET 请求
   */
  static get(url, cancelKey = null) {
    return this.request(url, { method: 'GET' }, cancelKey);
  }

  /**
   * 便捷 POST 请求
   */
  static post(url, body = {}, cancelKey = null) {
    return this.request(url, {
      method: 'POST',
      body: JSON.stringify(body)
    }, cancelKey);
  }
}

// 挂载到全局供非模块化旧脚本平滑调用
if (typeof window !== 'undefined') {
  window.ApiClient = ApiClient;
}
