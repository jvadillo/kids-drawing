/*
 * Renderizado de los dibujos.
 *  - Modo "steps": solo líneas; los pasos anteriores en color tinta y el paso actual resaltado.
 *  - Modo "final": dibujo completo coloreado (sin líneas de ayuda).
 */
(function (global) {
  'use strict';

  var LAYERS = ['bbbbb', 'bbbb', 'bbb', 'bb', 'b', 'f'];
  var SHAPES = 'path, circle, ellipse, rect, line, polyline, polygon';

  function render(drawing, upto, mode) {
    var out = { bbbbb: '', bbbb: '', bbb: '', bb: '', b: '', f: '' };
    var last = Math.min(upto, drawing.steps.length - 1);
    for (var i = 0; i <= last; i++) {
      var step = drawing.steps[i];
      var obj = typeof step === 'string' ? { f: step } : step;
      var cls = (mode === 'steps' && i === last) ? 'st current' : 'st';
      for (var k = 0; k < LAYERS.length; k++) {
        var key = LAYERS[k];
        if (obj[key]) out[key] += '<g class="' + cls + '">' + obj[key] + '</g>';
      }
    }
    return '<svg class="art art--' + mode + '" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid meet" ' +
      'xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' +
      '<g class="art-root" fill="none" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"' +
      (drawing.transform ? ' transform="' + drawing.transform + '"' : '') + '>' +
      out.bbbbb + out.bbbb + out.bbb + out.bb + out.b + out.f + '</g></svg>';
  }

  /* Animación "se dibuja solo" del paso actual */
  function animate(svg) {
    if (!svg) return;
    if (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var els = svg.querySelectorAll('.current ' + SHAPES.split(', ').join(', .current '));
    if (!els.length) return;
    var stagger = Math.min(0.3, 1.4 / els.length);
    var anims = [];
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var lineless = el.getAttribute('stroke') === 'none' || el.classList.contains('ink') || el.classList.contains('guide');
      var len = 0;
      if (!lineless) {
        try { len = el.getTotalLength(); } catch (e) { len = 0; }
      }
      if (len > 0) {
        el.style.strokeDasharray = len + ' ' + len;
        el.style.strokeDashoffset = len;
        anims.push({ el: el, type: 'line', delay: i * stagger });
      } else {
        el.style.opacity = '0';
        anims.push({ el: el, type: 'fade', delay: i * stagger + 0.3 });
      }
    }
    // forzar reflow antes de lanzar las transiciones
    void svg.getBoundingClientRect();
    global.requestAnimationFrame(function () {
      for (var j = 0; j < anims.length; j++) {
        var a = anims[j], s = a.el.style;
        if (a.type === 'line') {
          s.transition = 'stroke-dashoffset 0.8s ease-in-out ' + a.delay + 's';
          s.strokeDashoffset = '0';
        } else {
          s.transition = 'opacity 0.4s ease ' + a.delay + 's';
          s.opacity = '1';
        }
      }
    });
  }

  global.Art = { render: render, animate: animate };
})(window);
