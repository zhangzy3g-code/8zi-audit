/* Theme and layout have separate ownership; stale inline variables are removed. */
(function () {
  'use strict';
  var CACHE = 'tj_appearance_song_v1';
  var themeVars = {}, layoutVars = {}, applied = new Set();
  var themeId = 'song_study_v1', templateConfig = {};
  function clean(vars, layout) {
    var result = {};
    Object.keys(vars || {}).forEach(function (key) {
      var value = vars[key];
      if (!/^--[a-z0-9-]{1,48}$/i.test(key) || typeof value !== 'string' || value.length > 160) return;
      if (layout && !/^--(?:space-|content-|radius-)/.test(key)) return;
      result[key] = value;
    });
    return result;
  }
  function render() {
    var root = document.documentElement;
    var vars = Object.assign({}, layoutVars, themeVars);
    applied.forEach(function (key) { if (!(key in vars)) root.style.removeProperty(key); });
    Object.keys(vars).forEach(function (key) { root.style.setProperty(key, vars[key]); });
    applied = new Set(Object.keys(vars));
    root.dataset.theme = themeId;
    if (document.body) {
      document.body.dataset.templateDensity = /^(compact|comfortable|spacious)$/.test(templateConfig.density) ? templateConfig.density : 'comfortable';
      document.body.dataset.templateLayout = /^(classic|progressive)$/.test(templateConfig.layout) ? templateConfig.layout : 'progressive';
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = themeVars['--bg'] || '#F7F4ED';
    try { localStorage.setItem(CACHE, JSON.stringify({version:1, theme_id:themeId, theme:themeVars, layout:layoutVars, config:templateConfig})); } catch (_) {}
  }
  function applyTheme(theme) {
    themeVars = clean(theme && theme.variables, false);
    themeId = theme && theme.theme_id || 'song_study_v1';
    render();
  }
  function applyTemplate(template) {
    templateConfig = template && template.config || {};
    layoutVars = clean(templateConfig.css_variables, true);
    render();
  }
  var latestRequest = 0;
  function refresh() {
    var request = ++latestRequest;
    return Promise.all([
      fetch('/api/v3/theme', {cache:'no-store'}).then(function (r) { if (!r.ok) throw new Error('theme'); return r.json(); }),
      fetch('/api/v3/template', {cache:'no-store'}).then(function (r) { if (!r.ok) throw new Error('template'); return r.json(); })
    ]).then(function (data) {
      if (request !== latestRequest) return;
      themeVars = clean(data[0].theme && data[0].theme.variables, false);
      themeId = data[0].theme && data[0].theme.theme_id || 'song_study_v1';
      templateConfig = data[1].template && data[1].template.config || {};
      layoutVars = clean(templateConfig.css_variables, true);
      render();
    }).catch(function () { /* Keep the last complete appearance when offline. */ });
  }
  window.__tjApplyTheme = applyTheme;
  window.__tjApplyTemplate = applyTemplate;
  window.__tjRefreshAppearance = refresh;
  try {
    var cached = JSON.parse(localStorage.getItem(CACHE) || 'null');
    if (cached && cached.version === 1) {
      themeVars = clean(cached.theme, false); layoutVars = clean(cached.layout, true);
      themeId = cached.theme_id || themeId; templateConfig = cached.config || {};
    }
  } catch (_) {}
  render();
  document.addEventListener('DOMContentLoaded', render, {once:true});
  window.addEventListener('storage', function (e) { if (e.key === 'tj-appearance-sync') refresh(); });
  if ('BroadcastChannel' in window) {
    window.__tjAppearanceChannel = new BroadcastChannel('tj-appearance-sync');
    window.__tjAppearanceChannel.addEventListener('message', refresh);
  }
  refresh();
})();
