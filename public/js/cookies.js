// Gestão de consentimento de cookies (RGPD)
// Pixels só carregam após consentimento explícito.

(function () {
  var CHAVE = 'tg_cookies_v1';
  var consentimento = localStorage.getItem(CHAVE); // 'aceito' | 'essencial' | null

  // Carrega pixels dinamicamente
  function carregarPixels() {
    var p = window.PIXELS;
    if (!p) return;

    if (p.meta) {
      !function (f, b, e, v, n, t, s) {
        if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments) };
        if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
        t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s)
      }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      fbq('init', p.meta);
      fbq('track', 'PageView');
    }

    if (p.tiktok) {
      !function (w, d, t) {
        w.TiktokAnalyticsObject = t; var ttq = w[t] = w[t] || [];
        ttq.methods = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie"];
        ttq.setAndDefer = function (t, e) { t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))) } };
        for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
        ttq.instance = function (t) { for (var e = ttq._i[t] || [], n = 0; n < ttq.methods.length; n++) ttq.setAndDefer(e, ttq.methods[n]); return e };
        ttq.load = function (e) {
          var i = "https://analytics.tiktok.com/i18n/pixel/events.js";
          ttq._i = ttq._i || {}; ttq._i[e] = []; ttq._i[e]._u = i; ttq._t = ttq._t || {}; ttq._t[e] = +new Date;
          ttq._l = ttq._l || {}; ttq.load.loadOnce = function () {
            var s = d.getElementsByTagName("script")[0], n = d.createElement("script");
            n.async = !0; n.src = i; s.parentNode.insertBefore(n, s)
          }; ttq.load.loadOnce()
        };
        ttq.load(p.tiktok); ttq.page();
      }(window, document, 'ttq');
    }
  }

  // Se já deu consentimento de marketing, carrega pixels imediatamente
  if (consentimento === 'aceito') {
    carregarPixels();
    return; // banner não aparece
  }

  // Se escolheu só essenciais, também não mostra banner
  if (consentimento === 'essencial') return;

  // Sem consentimento — mostra banner
  function mostrarBanner() {
    var banner = document.getElementById('cookie-banner');
    if (!banner) return;
    banner.hidden = false;

    document.getElementById('btn-cookies-aceitar').addEventListener('click', function () {
      localStorage.setItem(CHAVE, 'aceito');
      banner.hidden = true;
      carregarPixels();
    });

    document.getElementById('btn-cookies-essencial').addEventListener('click', function () {
      localStorage.setItem(CHAVE, 'essencial');
      banner.hidden = true;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mostrarBanner);
  } else {
    mostrarBanner();
  }
})();
