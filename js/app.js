/*
 * ¡A dibujar! — lógica de la aplicación.
 * Sin dependencias ni backend. ES5 para funcionar también en TV LG webOS antiguas.
 *
 * Rutas (hash):  #/  ·  #/gallery  ·  #/draw/<id>/<paso>  ·  #/done/<id>
 */
(function () {
  'use strict';

  var DRAWINGS = window.DRAWINGS, I18N = window.I18N, Art = window.Art;
  var BY_ID = {};
  DRAWINGS.forEach(function (d) { BY_ID[d.id] = d; });

  var KEY = { ENTER: 13, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ESC: 27, BACKSPACE: 8, BACK_WEBOS: 461 };
  var IS_TV = /Web0S|webOS|NetCast|SmartTV|SMART-TV/i.test(navigator.userAgent) || /[?&]tv=1/.test(location.search);

  var body = document.body;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var state = { lang: 'es', route: { screen: 'home' }, lastRandom: null, galleryFocus: null };

  /* ------------------------------------------------------------------ */
  /* Idioma                                                              */
  /* ------------------------------------------------------------------ */
  function detectLang() {
    var saved = null;
    try { saved = localStorage.getItem('lang'); } catch (e) { /* sin almacenamiento */ }
    if (saved && I18N[saved]) return saved;
    var nav = (navigator.language || 'es').slice(0, 2).toLowerCase();
    return I18N[nav] ? nav : 'es';
  }
  function t(key) { return (I18N[state.lang] && I18N[state.lang][key]) || I18N.es[key] || key; }
  function nameOf(d) { return d.name[state.lang] || d.name.es; }

  function setLang(lang) {
    state.lang = lang;
    document.documentElement.lang = lang;
    try { localStorage.setItem('lang', lang); } catch (e) { /* ignorar */ }
    $$('[data-i18n]').forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    $$('[data-i18n-label]').forEach(function (el) { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-label'))); });
    $$('[data-i18n-title]').forEach(function (el) { el.setAttribute('title', t(el.getAttribute('data-i18n-title'))); });
    $$('.lang-btn').forEach(function (b) {
      var on = b.getAttribute('data-lang') === lang;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $$('.card-name').forEach(function (el) { el.textContent = nameOf(BY_ID[el.getAttribute('data-id')]); });
    if (state.route.screen === 'draw') $('#draw-name').textContent = nameOf(BY_ID[state.route.id]);
    updateTitle();
  }

  function updateTitle() {
    var r = state.route, d = r.id && BY_ID[r.id];
    document.title = d ? nameOf(d) + ' · ' + t('title') : t('title');
  }

  /* ------------------------------------------------------------------ */
  /* Rutas e historial                                                   */
  /* ------------------------------------------------------------------ */
  function parse(hash) {
    var p = (hash || '').replace(/^#\/?/, '').split('/');
    var d = BY_ID[p[1]];
    if (p[0] === 'gallery') return { screen: 'gallery' };
    if (p[0] === 'draw' && d) {
      var step = parseInt(p[2], 10) || 1;
      return { screen: 'draw', id: d.id, step: Math.max(1, Math.min(step, d.steps.length)) };
    }
    if (p[0] === 'done' && d) return { screen: 'done', id: d.id };
    return { screen: 'home' };
  }
  function hashOf(r) {
    if (r.screen === 'gallery') return '#/gallery';
    if (r.screen === 'draw') return '#/draw/' + r.id + '/' + r.step;
    if (r.screen === 'done') return '#/done/' + r.id;
    return '#/';
  }
  function histState() { return history.state || { depth: 0 }; }

  /* replace = sustituye la entrada actual (pasos, terminar) en vez de apilar una nueva */
  function go(route, replace) {
    var cur = histState();
    if (replace) {
      history.replaceState({ depth: cur.depth, from: cur.from }, '', hashOf(route));
    } else {
      history.pushState({ depth: cur.depth + 1, from: state.route.screen }, '', hashOf(route));
    }
    show(route);
  }

  var pendingHome = false;
  window.addEventListener('popstate', function () {
    var r = parse(location.hash);
    if (pendingHome && r.screen !== 'home') { pendingHome = false; go({ screen: 'home' }, true); return; }
    pendingHome = false;
    show(r);
  });

  function back() {
    var r = state.route;
    if (r.screen === 'home') { exitApp(); return; }
    if (histState().depth > 0) history.back();
    else go(r.screen === 'gallery' ? { screen: 'home' } : { screen: 'gallery' }, true);
  }

  function goHome() {
    var depth = histState().depth;
    if (depth > 0) { pendingHome = true; history.go(-depth); } else go({ screen: 'home' }, true);
  }

  function exitApp() {
    if (window.webOS && typeof window.webOS.platformBack === 'function') window.webOS.platformBack();
    else if (IS_TV) window.close();
  }

  function randomDrawing() {
    var current = state.route.id || state.lastRandom;
    var pool = DRAWINGS.filter(function (d) { return d.id !== current; });
    var d = pool[Math.floor(Math.random() * pool.length)];
    state.lastRandom = d.id;
    return d;
  }

  /* ------------------------------------------------------------------ */
  /* Pantallas                                                           */
  /* ------------------------------------------------------------------ */
  var screens = {};
  $$('.screen').forEach(function (s) { screens[s.getAttribute('data-screen')] = s; });

  function show(route) {
    var prev = state.route;
    state.route = route;
    Object.keys(screens).forEach(function (k) { screens[k].classList.toggle('active', k === route.screen); });
    if (route.screen !== 'done') clearConfetti();

    if (route.screen === 'home') renderHome();
    else if (route.screen === 'gallery') renderGallery(prev);
    else if (route.screen === 'draw') renderDraw(route, prev);
    else if (route.screen === 'done') renderDone(route);
    updateTitle();
  }

  /* --- Inicio --- */
  var homeRendered = false;
  function renderHome() {
    if (!homeRendered) {
      $$('.sticker').forEach(function (el) {
        el.innerHTML = Art.render(BY_ID[el.getAttribute('data-art')], 99, 'final');
      });
      homeRendered = true;
    }
    autoFocus($('.btn-choose'));
  }

  /* --- Galería --- */
  var galleryRendered = false;
  function renderGallery(prev) {
    if (!galleryRendered) {
      var html = '';
      DRAWINGS.forEach(function (d) {
        html += '<li><button class="card-btn" data-action="pick" data-id="' + d.id + '">' +
          '<span class="card-art" style="background:' + d.color + '">' + Art.render(d, 99, 'final') + '</span>' +
          '<span class="card-name" data-id="' + d.id + '">' + nameOf(d) + '</span></button></li>';
      });
      $('#cards').innerHTML = html;
      galleryRendered = true;
    }
    var target = (prev && prev.id && $('.card-btn[data-id="' + prev.id + '"]')) || $('.card-btn');
    autoFocus(target);
  }

  /* --- Pasos --- */
  function renderDraw(route, prev) {
    var d = BY_ID[route.id], n = d.steps.length, step = route.step;
    var sameDrawing = prev && prev.screen === 'draw' && prev.id === d.id;

    if (!sameDrawing) {
      $('#goal').innerHTML = Art.render(d, 99, 'final');
      $('#draw-name').textContent = nameOf(d);
      var dots = '';
      for (var i = 0; i < n; i++) dots += '<span class="dot-step"></span>';
      $('#dots').innerHTML = dots;
    }
    $$('.dot-step').forEach(function (el, i) {
      el.classList.toggle('is-done', i < step - 1);
      el.classList.toggle('is-current', i === step - 1);
    });
    $('#step-num').textContent = step;
    $('#step-total').textContent = '/' + n;

    drawStep(d, step);

    var paper = $('#paper');
    paper.classList.remove('pop');
    void paper.offsetWidth;
    paper.classList.add('pop');

    var prevBtn = $('.nav-btn.prev'), nextBtn = $('.nav-btn.next');
    prevBtn.disabled = step === 1;
    var last = step === n;
    nextBtn.classList.toggle('is-finish', last);
    nextBtn.setAttribute('aria-label', t(last ? 'finish' : 'next'));
    if (!sameDrawing || document.activeElement === prevBtn && prevBtn.disabled) autoFocus(nextBtn);
  }

  function drawStep(d, step) {
    var holder = $('#paper-art');
    holder.innerHTML = Art.render(d, step - 1, 'steps');
    Art.animate(holder.firstChild);
  }

  function nextStep() {
    var r = state.route, d = BY_ID[r.id];
    if (r.step < d.steps.length) go({ screen: 'draw', id: r.id, step: r.step + 1 }, true);
    else go({ screen: 'done', id: r.id }, true);
  }
  function prevStep() {
    var r = state.route;
    if (r.step > 1) go({ screen: 'draw', id: r.id, step: r.step - 1 }, true);
  }

  /* --- Terminado --- */
  function renderDone(route) {
    $('#done-art').innerHTML = Art.render(BY_ID[route.id], 99, 'final');
    launchConfetti();
    autoFocus($('.act-random'));
  }

  var CONFETTI_COLORS = ['#ff3d81', '#ffc93c', '#4cc3ff', '#5ad06b', '#ff6b5b', '#b98ae0'];
  function launchConfetti() {
    var box = $('#confetti'), html = '';
    for (var i = 0; i < 40; i++) {
      html += '<span class="confetto" style="left:' + (Math.random() * 100).toFixed(1) + '%;' +
        'background:' + CONFETTI_COLORS[i % CONFETTI_COLORS.length] + ';' +
        'animation-duration:' + (2.2 + Math.random() * 2).toFixed(2) + 's;' +
        'animation-delay:' + (Math.random() * 0.8).toFixed(2) + 's"></span>';
    }
    box.innerHTML = html;
  }
  function clearConfetti() { $('#confetti').innerHTML = ''; }

  /* ------------------------------------------------------------------ */
  /* Acciones (clic / toque / OK del mando)                              */
  /* ------------------------------------------------------------------ */
  var actions = {
    gallery: function () { go({ screen: 'gallery' }); },
    random: function () {
      var d = randomDrawing(), r = state.route;
      go({ screen: 'draw', id: d.id, step: 1 }, r.screen === 'done' || r.screen === 'draw');
    },
    pick: function (el) { go({ screen: 'draw', id: el.getAttribute('data-id'), step: 1 }); },
    back: back,
    home: goHome,
    prev: prevStep,
    next: nextStep,
    again: function () { go({ screen: 'draw', id: state.route.id, step: 1 }, true); },
    another: function () {
      if (histState().from === 'gallery') history.back();
      else go({ screen: 'gallery' }, true);
    }
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-action], [data-lang]') : null;
    if (!el || el.disabled) return;
    if (el.hasAttribute('data-lang')) { setLang(el.getAttribute('data-lang')); return; }
    var fn = actions[el.getAttribute('data-action')];
    if (fn) fn(el);
  });

  /* Tocar el dibujo repite la animación del paso */
  $('#paper').addEventListener('click', function () {
    var r = state.route;
    if (r.screen === 'draw') drawStep(BY_ID[r.id], r.step);
  });

  /* Deslizar a izquierda/derecha para cambiar de paso */
  (function () {
    var x0 = null, y0 = null;
    var stage = $('#screen-draw .stage');
    stage.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { x0 = null; return; }
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    }, { passive: true });
    stage.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0) nextStep(); else prevStep();
      }
    }, { passive: true });
  })();

  /* ------------------------------------------------------------------ */
  /* Mando a distancia / teclado                                         */
  /* ------------------------------------------------------------------ */
  function usingKeys() { return IS_TV || body.classList.contains('using-keys'); }

  /* Solo movemos el foco automáticamente si se navega con mando/teclado */
  function autoFocus(el) {
    if (!el) return;
    if (usingKeys()) {
      setTimeout(function () { try { el.focus({ preventScroll: false }); } catch (e) { el.focus(); } }, 30);
    } else if (document.activeElement && document.activeElement !== body) {
      document.activeElement.blur();
    }
  }

  function focusables() {
    var s = screens[state.route.screen];
    return $$('button', s).filter(function (b) { return !b.disabled && b.offsetParent !== null; });
  }

  function center(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

  /* Elemento que recibe el foco al empezar a usar el mando en cada pantalla */
  function primaryFocus() {
    var s = state.route.screen;
    if (s === 'home') return $('.btn-choose');
    if (s === 'gallery') return $('.card-btn');
    if (s === 'done') return $('.act-random');
    return $('.nav-btn.next');
  }

  /* Navegación espacial: elige el botón más cercano en la dirección pulsada,
     dando prioridad a los que están en la misma fila/columna */
  function moveFocus(dir) {
    var items = focusables(), cur = document.activeElement;
    if (!items.length) return;
    if (items.indexOf(cur) < 0) { (primaryFocus() || items[0]).focus(); return; }
    var horizontal = dir === 'left' || dir === 'right';
    var cr = cur.getBoundingClientRect(), c = center(cr), best = null, bestScore = Infinity;
    items.forEach(function (el) {
      if (el === cur) return;
      var r = el.getBoundingClientRect(), p = center(r);
      var dx = p.x - c.x, dy = p.y - c.y;
      var main = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
      if (main <= 1) return;
      var overlap = horizontal ? (r.top < cr.bottom && r.bottom > cr.top) : (r.left < cr.right && r.right > cr.left);
      var cross = horizontal ? Math.abs(dy) : Math.abs(dx);
      var score = (overlap ? 0 : 100000) + main + cross * 2.5;
      if (score < bestScore) { bestScore = score; best = el; }
    });
    if (best) best.focus();
  }

  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    var nav = k === KEY.LEFT || k === KEY.RIGHT || k === KEY.UP || k === KEY.DOWN || k === KEY.ENTER;
    if (nav && !body.classList.contains('using-keys')) {
      body.classList.add('using-keys');
      if (document.activeElement === body || !document.activeElement) {
        if (state.route.screen === 'draw') {
          $('.nav-btn.next').focus();          // en los pasos la tecla además actúa
          if (k === KEY.ENTER) { e.preventDefault(); nextStep(); return; }
        } else {
          var first = primaryFocus();           // en el resto solo muestra dónde está el foco
          if (first) { first.focus(); e.preventDefault(); return; }
        }
      }
    }

    if (k === KEY.BACK_WEBOS || k === KEY.ESC || k === KEY.BACKSPACE) {
      e.preventDefault();
      back();
      return;
    }

    var screen = state.route.screen;
    if (screen === 'draw') {
      if (k === KEY.LEFT) { e.preventDefault(); prevStep(); return; }
      if (k === KEY.RIGHT) { e.preventDefault(); nextStep(); return; }
      if (k === KEY.UP) { e.preventDefault(); $('#screen-draw [data-action="back"]').focus(); return; }
      if (k === KEY.DOWN) { e.preventDefault(); $('.nav-btn.next').focus(); return; }
      if (k === KEY.ENTER && focusables().indexOf(document.activeElement) < 0) { e.preventDefault(); nextStep(); }
      return;
    }

    if (k === KEY.LEFT) { e.preventDefault(); moveFocus('left'); }
    else if (k === KEY.RIGHT) { e.preventDefault(); moveFocus('right'); }
    else if (k === KEY.UP) { e.preventDefault(); moveFocus('up'); }
    else if (k === KEY.DOWN) { e.preventDefault(); moveFocus('down'); }
  });

  /* Al usar el dedo o el ratón se ocultan los indicadores de foco */
  document.addEventListener('pointerdown', function () { if (!IS_TV) body.classList.remove('using-keys'); });
  document.addEventListener('touchstart', function () { if (!IS_TV) body.classList.remove('using-keys'); }, { passive: true });

  /* Puntero del Magic Remote de LG: el foco sigue al puntero */
  if (IS_TV) {
    body.classList.add('tv', 'using-keys');
    document.addEventListener('mouseover', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null;
      if (b && !b.disabled && b !== document.activeElement) b.focus();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Arranque                                                            */
  /* ------------------------------------------------------------------ */
  setLang(detectLang());
  var initial = parse(location.hash);
  history.replaceState({ depth: 0 }, '', hashOf(initial));
  show(initial);

  /* Funciona sin conexión cuando se sirve por http(s) (PWA) */
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* sin modo offline */ });
    });
  }
})();
