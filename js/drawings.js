/*
 * Dibujos paso a paso.
 *
 * Cada dibujo tiene una lista de pasos. Cada paso es un fragmento SVG (viewBox 0 0 400 400)
 * o un objeto con capas { bbb: '...', bb: '...', b: '...', f: '...' }:
 *   bbb = lo más al fondo, bb = muy al fondo, b = detrás, f = delante (por defecto, si el paso es un string).
 * Las capas permiten que una forma quede "detrás" de otra (p. ej. las patas detrás del cuerpo).
 *
 * Convenciones dentro del SVG:
 *   fill="#xxx"     color de la versión coloreada final (en los pasos se pinta de blanco papel)
 *   class="ink"     se rellena con el color del trazo (ojos, narices...)
 *   class="guide"   línea de ayuda discontinua; desaparece en el dibujo final
 *   stroke="none"   forma solo de relleno
 *
 * Para añadir un dibujo nuevo basta con añadir un objeto a la lista DRAWINGS.
 */
(function (global) {
  'use strict';

  /* ---------- utilidades geométricas ---------- */
  function r1(n) { return Math.round(n * 10) / 10; }
  function pt(p) { return r1(p[0]) + ' ' + r1(p[1]); }
  function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
  function mirror(s) { return '<g transform="matrix(-1 0 0 1 400 0)">' + s + '</g>'; }
  function path(d, extra) { return '<path d="' + d + '"' + (extra ? ' ' + extra : '') + '/>'; }
  function circle(cx, cy, r, extra) {
    return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '"' + (extra ? ' ' + extra : '') + '/>';
  }
  function ellipse(cx, cy, rx, ry, extra) {
    return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '"' + (extra ? ' ' + extra : '') + '/>';
  }
  function fill(c) { return 'fill="' + c + '"'; }

  /* Curva Catmull-Rom muestreada que pasa por todos los puntos */
  function catmull(pts, n) {
    var out = [];
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || pts[i + 1];
      for (var j = 0; j < n; j++) {
        var t = j / n, t2 = t * t, t3 = t2 * t, q = [];
        for (var k = 0; k < 2; k++) {
          q.push(0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t +
            (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
            (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3));
        }
        out.push(q);
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  /* Tubo que se estrecha siguiendo una línea (tentáculos, colas, serpientes).
     Abierto en el inicio (se suele esconder detrás de otra forma) y con punta redondeada. */
  function tube(pts, w0, w1) {
    var c = catmull(pts, 12), N = c.length, L = [], R = [], i;
    for (i = 0; i < N; i++) {
      var a = c[Math.max(0, i - 1)], b = c[Math.min(N - 1, i + 1)];
      var tx = b[0] - a[0], ty = b[1] - a[1], len = Math.sqrt(tx * tx + ty * ty) || 1;
      var nx = -ty / len, ny = tx / len, w = (w0 + (w1 - w0) * i / (N - 1)) / 2;
      L.push([c[i][0] + nx * w, c[i][1] + ny * w]);
      R.push([c[i][0] - nx * w, c[i][1] - ny * w]);
    }
    var e = c[N - 1], f = c[N - 2], dx = e[0] - f[0], dy = e[1] - f[1], dl = Math.sqrt(dx * dx + dy * dy) || 1;
    var ctrl = [e[0] + dx / dl * w1 * 0.95, e[1] + dy / dl * w1 * 0.95];
    var d = 'M' + pt(L[0]);
    for (i = 1; i < N; i++) d += ' L' + pt(L[i]);
    d += ' Q' + pt(ctrl) + ' ' + pt(R[N - 1]);
    for (i = N - 2; i >= 0; i--) d += ' L' + pt(R[i]);
    return { d: d, c: c, L: L, R: R };
  }

  /* Hoja con forma de lanza entre p0 y p1; sag la curva hacia un lado (hojas caídas) */
  function leaf(p0, p1, w, sag) {
    var mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2, dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    var l = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / l, ny = dx / l;
    sag = sag || 0;
    var c1 = [mx + nx * (w + sag), my + ny * (w + sag)], c2 = [mx - nx * (w - sag), my - ny * (w - sag)];
    return 'M' + pt(p0) + ' Q' + pt(c1) + ' ' + pt(p1) + ' Q' + pt(c2) + ' ' + pt(p0) + 'Z';
  }

  /* Semicírculo (arco superior) y franja entre dos semicírculos (arcoíris) */
  function arcLine(cx, cy, R) { return 'M' + (cx - R) + ' ' + cy + ' A' + R + ' ' + R + ' 0 0 1 ' + (cx + R) + ' ' + cy; }
  function band(cx, cy, R1, R2) {
    return arcLine(cx, cy, R1) + ' L' + (cx + R2) + ' ' + cy + ' A' + R2 + ' ' + R2 + ' 0 0 0 ' + (cx - R2) + ' ' + cy + 'Z';
  }

  /* Espiral (concha del caracol) */
  function spiral(cx, cy, r0, r1, turns, a0) {
    var n = Math.round(turns * 28), d = '';
    for (var i = 0; i <= n; i++) {
      var t = i / n, a = a0 + t * turns * 2 * Math.PI, r = r0 + (r1 - r0) * t;
      d += (i ? ' L' : 'M') + pt([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return d;
  }

  function rect(x, y, w, h, rx, extra) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"' +
      (rx ? ' rx="' + rx + '"' : '') + (extra ? ' ' + extra : '') + '/>';
  }

  /* Olas: línea ondulada horizontal de x0 a x1 */
  function waves(x0, x1, y, w, h) {
    var d = 'M' + x0 + ' ' + y + ' Q' + (x0 + w / 2) + ' ' + (y - h) + ' ' + (x0 + w) + ' ' + y;
    for (var x = x0 + 2 * w; x <= x1; x += w) d += ' T' + x + ' ' + y;
    return d;
  }

  /* Mancha irregular redondeada */
  function blob(cx, cy, r, k) {
    var f = [1, 0.8, 1.08, 0.88, 1.04, 0.84], n = 6, P = [], i;
    k = k || 0;
    for (i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2 + k * 0.7;
      var rr = r * f[(i + k) % n];
      P.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    var d = 'M' + pt(lerp(P[0], P[1], 0.5));
    for (i = 1; i <= n; i++) d += ' Q' + pt(P[i % n]) + ' ' + pt(lerp(P[i % n], P[(i + 1) % n], 0.5));
    return d + 'Z';
  }

  /* Estrella con puntas redondeadas */
  function roundStar(cx, cy, R1, R2, n, s, rot) {
    var V = [], i;
    for (i = 0; i < n * 2; i++) {
      var a = rot + i * Math.PI / n, rr = i % 2 ? R2 : R1;
      V.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    var M = V.length, d = '';
    for (i = 0; i <= M; i++) {
      var p = V[i % M], prev = V[(i - 1 + M) % M], next = V[(i + 1) % M];
      var a1 = lerp(p, prev, s), b1 = lerp(p, next, s);
      d += i === 0 ? 'M' + pt(b1) : ' L' + pt(a1) + ' Q' + pt(p) + ' ' + pt(b1);
    }
    return d + 'Z';
  }

  function polar(cx, cy, r, deg) {
    var a = deg * Math.PI / 180;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  }

  function join(list, fn) { var s = ''; for (var i = 0; i < list.length; i++) s += fn(list[i], i); return s; }

  var INK = 'class="ink"';
  var WHITE = fill('#ffffff');
  var CHEEK = fill('#ff9fbf');

  /* ======================================================================= */
  /*                               DIBUJOS                                   */
  /* ======================================================================= */

  /* ---------- Jirafa ---------- */
  var GY = fill('#f8c537'), GS = fill('#c8782b');
  var giraffe = {
    id: 'giraffe', color: '#ffe08a',
    name: { es: 'Jirafa', eu: 'Jirafa', en: 'Giraffe' },
    steps: [
      ellipse(170, 220, 80, 45, GY),
      ellipse(292, 78, 32, 22, GY) + ellipse(320, 90, 18, 15, fill('#f6dfa8')),
      { b: path('M204 200 L268 92 L302 98 L250 215Z', GY + ' stroke="none"') + path('M204 200 L268 92 M250 215 L302 98') },
      { b: path('M284 70 L276 36 M300 70 L306 34') + circle(276, 33, 6, INK) + circle(306, 31, 6, INK) +
        path('M268 76 Q240 58 246 78 Q252 90 270 86', GY) },
      { b: path('M198 240 L198 350 L214 350 L214 240', GY) + path('M230 240 L230 350 L246 350 L246 230', GY) +
        '<rect class="ink" x="198" y="342" width="16" height="8"/><rect class="ink" x="230" y="342" width="16" height="8"/>' },
      { b: path('M110 240 L110 350 L126 350 L126 240', GY) + path('M138 240 L138 350 L154 350 L154 240', GY) +
        '<rect class="ink" x="110" y="342" width="16" height="8"/><rect class="ink" x="138" y="342" width="16" height="8"/>' +
        path('M96 212 Q70 238 74 270') + path('M74 264 L64 290 L76 284 L84 292Z', INK) },
      circle(296, 72, 5, INK) + circle(328, 86, 3, INK) + path('M314 99 Q324 105 334 97'),
      join([[140, 205, 13, 0], [185, 200, 12, 1], [222, 220, 10, 2], [118, 232, 10, 3], [165, 240, 12, 4],
        [205, 247, 9, 5], [102, 212, 7, 1], [236, 176, 9, 2], [253, 148, 9, 3], [269, 122, 7, 4]],
        function (s) { return path(blob(s[0], s[1], s[2], s[3]), GS); })
    ]
  };

  /* ---------- Pez ---------- */
  var FO = fill('#ff9f43'), FD = fill('#ff7a1f');
  var fish = {
    id: 'fish', color: '#ffd2a6',
    name: { es: 'Pez', eu: 'Arraina', en: 'Fish' },
    steps: [
      ellipse(190, 200, 120, 75, FO),
      circle(120, 182, 15, WHITE) + circle(116, 183, 7, INK),
      { b: path('M290 182 L362 136 Q344 200 362 264 L290 218', FD) },
      path('M76 214 Q88 227 104 216') + path('M165 140 Q145 200 165 260'),
      { b: path('M170 140 Q205 78 260 145', FD) + path('M190 262 Q214 312 250 258', FD) },
      join([[205, 168], [240, 168], [205, 200], [240, 200], [275, 200], [205, 232], [240, 232]],
        function (p) { return path('M' + p[0] + ' ' + (p[1] - 13) + ' q13 13 0 26'); }) +
      circle(52, 150, 7, fill('#d4f1ff')) + circle(36, 118, 5, fill('#d4f1ff')) + circle(58, 86, 10, fill('#d4f1ff'))
    ]
  };

  /* ---------- Pulpo ---------- */
  var OP = fill('#b98ae0');
  var tentacles = [
    tube([[140, 175], [100, 205], [70, 240], [46, 236], [44, 214]], 24, 8),
    tube([[155, 195], [125, 245], [110, 285], [80, 305], [60, 294]], 24, 8),
    tube([[172, 205], [160, 260], [150, 310], [128, 340], [108, 336]], 24, 8),
    tube([[190, 210], [190, 270], [185, 320], [178, 352], [194, 366]], 24, 8)
  ];
  var octoLeft = join(tentacles, function (t) { return path(t.d, OP); });
  var suckers = join(tentacles, function (t) {
    return join([22, 30, 38], function (k) { return circle(r1(t.c[k][0]), r1(t.c[k][1]), 4, fill('#efd9ff')); });
  });
  var octopus = {
    id: 'octopus', color: '#e3cff5',
    name: { es: 'Pulpo', eu: 'Olagarroa', en: 'Octopus' },
    steps: [
      ellipse(200, 130, 85, 95, OP),
      circle(170, 140, 9, INK) + circle(230, 140, 9, INK) + path('M178 172 Q200 192 222 172'),
      { b: octoLeft },
      { b: mirror(octoLeft) },
      suckers + mirror(suckers),
      join([[160, 82, 10, 0], [228, 66, 7, 2], [252, 108, 11, 4], [146, 118, 6, 1]],
        function (s) { return path(blob(s[0], s[1], s[2], s[3]), fill('#9b63cc')); }) +
      ellipse(152, 162, 11, 7, CHEEK) + ellipse(248, 162, 11, 7, CHEEK)
    ]
  };

  /* ---------- Cangrejo ---------- */
  var CR = fill('#ff6b5b');
  var crabLegs = path('M120 245 L64 256 L48 292') + path('M128 268 L76 292 L68 328') + path('M146 288 L104 320 L102 352');
  var crabArm = path(tube([[130, 205], [88, 190], [72, 166], [72, 140]], 18, 14).d, CR) +
    path('M68 142 C36 138 30 92 56 78 C58 92 66 100 76 102 C80 88 88 80 98 82 C104 110 94 138 68 142Z', CR);
  var crab = {
    id: 'crab', color: '#ffc7bf',
    name: { es: 'Cangrejo', eu: 'Karramarroa', en: 'Crab' },
    steps: [
      ellipse(200, 230, 100, 75, CR),
      { b: path('M178 170 L168 108 M222 170 L232 108') + circle(165, 95, 15, WHITE) + circle(235, 95, 15, WHITE),
        f: circle(167, 97, 6, INK) + circle(233, 97, 6, INK) },
      { b: crabLegs + mirror(crabLegs) },
      { b: crabArm + mirror(crabArm) },
      path('M172 240 Q200 266 228 240') + ellipse(160, 236, 11, 7, CHEEK) + ellipse(240, 236, 11, 7, CHEEK),
      join([[150, 200], [250, 198], [205, 186], [158, 272], [242, 274], [122, 226], [278, 226]],
        function (p) { return circle(p[0], p[1], 5, fill('#e0473a')); })
    ]
  };

  /* ---------- Estrella de mar ---------- */
  var SF = fill('#ffa94d');
  var starDots = '';
  for (var sa = 0; sa < 5; sa++) {
    var ang = -90 + sa * 72, d1 = polar(200, 215, 100, ang), d2 = polar(200, 215, 132, ang);
    starDots += circle(r1(d1[0]), r1(d1[1]), 6, fill('#ffe0b2')) + circle(r1(d2[0]), r1(d2[1]), 5, fill('#ffe0b2'));
  }
  var starGuides = '';
  for (sa = 0; sa < 5; sa++) {
    var g = polar(200, 215, 140, -90 + sa * 72);
    starGuides += path('M200 215 L' + pt(g), 'class="guide"');
  }
  var starfish = {
    id: 'starfish', color: '#ffd8b0',
    name: { es: 'Estrella de mar', eu: 'Itsas izarra', en: 'Starfish' },
    steps: [
      starGuides,
      { b: path(roundStar(200, 215, 165, 72, 5, 0.3, -Math.PI / 2), SF) },
      ellipse(182, 200, 6, 9, INK) + ellipse(218, 200, 6, 9, INK),
      path('M180 226 Q200 246 220 226') + ellipse(163, 230, 10, 6, CHEEK) + ellipse(237, 230, 10, 6, CHEEK),
      starDots
    ]
  };

  /* ---------- Tiburón ---------- */
  var SH = fill('#8fabc6'), SH2 = fill('#7393b3');
  var shark = {
    id: 'shark', color: '#cfe0f0',
    name: { es: 'Tiburón', eu: 'Marrazoa', en: 'Shark' },
    steps: [
      path('M60 210 Q200 120 330 205 Q200 270 60 210Z', SH),
      { b: path('M178 180 Q205 125 222 98 Q222 140 242 180', SH2) },
      path('M150 230 Q140 268 118 288 Q166 270 188 232', SH2),
      { b: path('M310 196 Q345 175 368 138 Q362 185 342 206 Q360 222 374 258 Q345 238 310 214', SH2) },
      circle(108, 196, 6, INK) + path('M148 192 q-7 14 0 28 M162 190 q-7 15 0 30 M176 190 q-7 15 0 30'),
      path('M70 214 Q98 232 130 222') + path('M86 223 l5 7 l5 -6 l5 7 l5 -6 l5 7 l5 -6')
    ]
  };

  /* ---------- Pingüino ---------- */
  var PN = fill('#3f4d6b'), PO = fill('#ffa630');
  var pengWing = path('M112 175 Q62 245 96 305 Q114 262 116 228', PN);
  var penguin = {
    id: 'penguin', color: '#d3dcef',
    name: { es: 'Pingüino', eu: 'Pinguinoa', en: 'Penguin' },
    steps: [
      ellipse(200, 215, 95, 135, PN),
      ellipse(200, 230, 70, 110, WHITE),
      pengWing + mirror(pengWing),
      circle(178, 152, 8, INK) + circle(222, 152, 8, INK) + path('M186 170 L214 170 L200 190Z', PO) +
      ellipse(165, 182, 9, 6, CHEEK) + ellipse(235, 182, 9, 6, CHEEK),
      { b: ellipse(165, 350, 28, 13, PO) + ellipse(235, 350, 28, 13, PO) }
    ]
  };

  /* ---------- Cerdito ---------- */
  var PG = fill('#f9b0cd'), PG2 = fill('#f48fb1');
  var pig = {
    id: 'pig', color: '#ffd6e6',
    name: { es: 'Cerdito', eu: 'Txerritxoa', en: 'Piglet' },
    steps: [
      circle(100, 168, 56, PG),
      { b: ellipse(215, 210, 118, 80, PG) },
      { b: path('M72 130 L64 92 L98 120', PG) + path('M110 120 L128 86 L138 130', PG),
        f: ellipse(48, 182, 17, 23, PG2) + ellipse(44, 174, 3, 5, INK) + ellipse(44, 190, 3, 5, INK) },
      { b: path('M140 260 L140 330 L166 330 L166 260', PG) + path('M182 260 L182 334 L208 334 L208 260', PG) +
        path('M240 260 L240 334 L266 334 L266 260', PG) + path('M282 250 L282 328 L306 328 L306 250', PG) },
      circle(104, 152, 6, INK) + path('M66 212 Q80 222 98 213') + ellipse(122, 186, 10, 6, CHEEK) +
      path('M330 196 q24 -10 22 10 q-2 15 -15 6 q-8 -9 9 -19')
    ]
  };

  /* ---------- Cohete ---------- */
  var RR = fill('#ff5d5d'), RW = fill('#eef3f8');
  var rocketFin = path('M152 230 Q102 258 104 325 L152 292', RR);
  var rocket = {
    id: 'rocket', color: '#ffd0d0',
    name: { es: 'Cohete', eu: 'Suziria', en: 'Rocket' },
    steps: [
      path('M200 40 Q250 78 252 122 L148 122 Q150 78 200 40Z', RR),
      { b: path('M150 110 L150 292 L250 292 L250 110', RW) },
      circle(200, 178, 30, fill('#7fd0ff')) + path('M184 166 Q190 156 202 156') + path('M150 252 L250 252'),
      { b: rocketFin + mirror(rocketFin) },
      { bb: path('M168 285 Q172 330 200 368 Q228 330 232 285', fill('#ffb142')) },
      path('M188 292 Q192 318 200 335 Q208 318 212 292', fill('#ffe066')) +
      path('M70 80 v24 M58 92 h24 M330 60 v20 M320 70 h20 M335 250 v18 M326 259 h18 M64 230 v16 M56 238 h16')
    ]
  };

  /* ---------- Leopardo ---------- */
  var LY = fill('#f7c46c');
  var leopardSpots = join([[130, 190], [162, 176], [198, 184], [232, 182], [256, 204], [148, 214], [188, 222],
    [224, 214], [116, 222], [164, 244], [204, 246], [104, 198], [240, 236], [108, 290], [140, 300], [234, 292],
    [268, 302], [66, 196], [44, 222], [292, 132], [318, 134]], function (p, i) {
    return path(blob(p[0], p[1], i > 18 ? 4 : 6, i % 6), INK);
  });
  var leopard = {
    id: 'leopard', color: '#fde3b0',
    name: { es: 'Leopardo', eu: 'Lehoinabarra', en: 'Leopard' },
    steps: [
      ellipse(185, 210, 105, 52, LY),
      { f: circle(305, 168, 45, LY), b: circle(280, 128, 13, LY) + circle(332, 128, 13, LY) },
      { b: path('M226 230 L226 336 Q238 346 250 336 L250 230', LY) + path('M258 230 L262 336 Q274 346 286 336 L280 220', LY) },
      { b: path('M95 230 L92 336 Q104 346 116 336 L118 230', LY) + path('M126 230 L128 336 Q140 346 152 336 L150 230', LY) +
        path(tube([[90, 200], [48, 192], [26, 238], [44, 276], [64, 266]], 16, 10).d, LY) },
      circle(292, 160, 5, INK) + circle(320, 160, 5, INK) + path('M298 176 L314 176 L306 185Z', INK) +
      path('M306 185 Q300 195 290 191 M306 185 Q312 195 322 191'),
      leopardSpots + path('M60 348 l6 -14 l4 14 l6 -12 M330 350 l6 -14 l4 14 l6 -12')
    ]
  };

  /* ---------- Serpiente ---------- */
  var SG = fill('#86cf6e');
  var snakeBody = tube([[95, 150], [74, 200], [88, 262], [128, 300], [176, 290], [204, 252], [236, 226],
    [270, 246], [292, 286], [326, 302], [368, 286]], 38, 8);
  var snakeSpots = join([16, 30, 44, 58, 72, 86, 100], function (k, i) {
    var c = snakeBody.c[k];
    return circle(r1(c[0]), r1(c[1]), Math.max(4, 10 - i), fill('#4f9c3f'));
  });
  var snake = {
    id: 'snake', color: '#cdeec0',
    name: { es: 'Serpiente', eu: 'Sugea', en: 'Snake' },
    steps: [
      path(snakeBody.d, SG),
      ellipse(110, 126, 42, 28, SG),
      circle(118, 116, 6, INK) + path('M148 132 L170 134 M170 134 l10 -7 M170 134 l10 7', 'stroke="#e53935"') +
      path('M120 140 Q135 146 148 138'),
      snakeSpots,
      path('M40 345 l6 -16 l4 16 l6 -13 l4 13 M300 352 l6 -16 l4 16 l6 -13') +
      path('M340 330 L340 300') + circle(340, 292, 8, fill('#ffd54f')) +
      join([0, 72, 144, 216, 288], function (a) { var p = polar(340, 292, 15, a); return circle(r1(p[0]), r1(p[1]), 7, fill('#ff8a80')); })
    ]
  };

  /* ---------- Rinoceronte ---------- */
  var RH = fill('#aeb9c7'), HORN = fill('#efe3c8');
  var rhino = {
    id: 'rhino', color: '#dde3ea',
    name: { es: 'Rinoceronte', eu: 'Errinozerontea', en: 'Rhino' },
    steps: [
      ellipse(180, 212, 115, 72, RH),
      { f: ellipse(300, 192, 56, 40, RH), b: path('M272 166 Q262 128 292 146', RH) },
      { b: path('M330 176 Q352 140 342 104 Q368 140 360 186', HORN) + path('M306 160 Q314 140 310 126 Q326 144 326 162', HORN),
        f: circle(306, 184, 5, INK) + circle(348, 196, 3, INK) + path('M324 214 Q338 218 352 209') },
      { b: path('M90 240 L90 340 L125 340 L125 240', RH) + path('M140 250 L140 340 L172 340 L172 250', RH) +
        path('M205 250 L205 340 L238 340 L238 250', RH) + path('M250 240 L252 340 L284 340 L282 230', RH) },
      { b: path('M70 196 Q48 208 52 236') + path('M52 230 L44 250 L56 246 L60 256Z', INK),
        f: path('M150 142 Q138 212 154 281') + path('M228 146 Q240 212 226 279') },
      path('M60 345 l6 -15 l4 15 l6 -12 M180 350 l6 -15 l4 15 l6 -12 M320 346 l6 -15 l4 15 l6 -12')
    ]
  };

  /* ---------- Tortuga marina ---------- */
  var TS = fill('#7cc576'), TS2 = fill('#5ea95a'), TK = fill('#c7e3a6');
  var shellD = 'M200 110 C260 110 285 170 280 220 C275 285 230 320 200 320 C170 320 125 285 120 220 C115 170 140 110 200 110Z';
  var innerD = 'M200 139.4 C243.2 139.4 261.2 182.6 257.6 218.6 C254 265.4 221.6 290.6 200 290.6 ' +
    'C178.4 290.6 146 265.4 142.4 218.6 C138.8 182.6 156.8 139.4 200 139.4Z';
  var turtleFront = path('M262 165 Q320 118 352 122 Q338 172 276 206', TK);
  var turtleBack = path('M246 282 Q284 296 292 332 Q264 330 236 304', TK);
  function hexAt(y) { return path('M185 ' + (y - 20) + ' L215 ' + (y - 20) + ' L228 ' + y + ' L215 ' + (y + 20) + ' L185 ' + (y + 20) + ' L172 ' + y + 'Z'); }
  var turtle = {
    id: 'turtle', color: '#d4efcc',
    name: { es: 'Tortuga marina', eu: 'Itsas dortoka', en: 'Sea turtle' },
    steps: [
      path(shellD, TS),
      { b: path('M176 120 Q174 58 200 54 Q226 58 224 120', TK) },
      { b: turtleFront },
      { b: mirror(turtleFront) },
      { b: turtleBack + mirror(turtleBack) + path('M190 312 L200 342 L210 312', TK) },
      path(innerD, TS2),
      hexAt(175) + hexAt(215) + hexAt(255) +
      path('M172 175 L153.6 165.5 M228 175 L246.4 165.5 M172 215 L142.4 218.6 M228 215 L257.6 218.6 ' +
        'M172 255 L164.4 272.2 M228 255 L235.6 272.2 M200 155 L200 139.4 M200 275 L200 290.6'),
      path('M246.4 165.5 L264.4 146.3 M257.6 218.6 L280 220 M235.6 272.2 L249.4 294.4 M164.4 272.2 L150.6 294.4 ' +
        'M142.4 218.6 L120 220 M153.6 165.5 L135.6 146.3') + circle(190, 82, 5, INK) + circle(210, 82, 5, INK) +
      path('M192 100 Q200 106 208 100')
    ]
  };

  /* ---------- Osito ---------- */
  var BR = fill('#c8925c'), BT = fill('#efd0a8');
  var bearEar = circle(142, 78, 24, BR) + circle(140, 76, 11, BT);
  var bearLeg = ellipse(140, 322, 40, 26, BR + ' transform="rotate(-20 140 322)"') +
    ellipse(124, 330, 15, 17, BT + ' transform="rotate(-20 124 330)"');
  var bearArm = ellipse(140, 246, 19, 42, BR + ' transform="rotate(35 140 246)"');
  var bear = {
    id: 'bear', color: '#f3dcc2',
    name: { es: 'Osito', eu: 'Hartzatxoa', en: 'Teddy bear' },
    steps: [
      circle(200, 130, 70, BR) + ellipse(200, 152, 32, 23, BT),
      ellipse(200, 141, 10, 7, INK) + path('M200 148 V158 M186 156 Q193 166 200 158 Q207 166 214 156') +
      circle(174, 112, 7, INK) + circle(226, 112, 7, INK),
      { b: bearEar + mirror(bearEar) },
      { b: ellipse(200, 268, 64, 76, BR), f: ellipse(200, 282, 38, 44, BT) },
      bearLeg + mirror(bearLeg),
      bearArm + mirror(bearArm)
    ]
  };

  /* ---------- Murciélago ---------- */
  var BP = fill('#6f5d92'), BW = fill('#8f7bb5');
  var batEar = path('M182 150 L170 106 L196 138', BP);
  var batBones = path('M228 205 L290 152 L370 120 M290 152 L350 202 M290 152 L306 226');
  var batWing = path('M226 200 L290 152 L370 120 Q336 160 350 202 Q318 200 306 226 Q282 212 252 238 Q240 226 226 228Z', BW);
  var bat = {
    id: 'bat', color: '#ddd3ee',
    name: { es: 'Murciélago', eu: 'Saguzarra', en: 'Bat' },
    steps: [
      { f: circle(200, 168, 32, BP), b: batEar + mirror(batEar) },
      { b: ellipse(200, 222, 30, 42, BP) + path('M188 260 l-4 16 M212 260 l4 16'),
        f: circle(188, 162, 5, INK) + circle(212, 162, 5, INK) + path('M188 180 Q200 190 212 180') +
          path('M193 183 l3 7 l3 -6 M204 184 l3 6 l3 -7', WHITE) },
      { b: batBones + mirror(batBones) },
      { bb: batWing + mirror(batWing) }
    ]
  };

  /* ---------- Abeja ---------- */
  var BY = fill('#ffd23f'), BK = fill('#3a3640'), WG = fill('#e4f5ff');
  var beeAntenna = path('M184 140 Q178 100 160 92 Q148 90 152 102');
  var beeWingTop = ellipse(108, 176, 50, 32, WG + ' transform="rotate(-25 108 176)"');
  var beeWingBottom = ellipse(118, 238, 38, 25, WG + ' transform="rotate(20 118 238)"');
  var bee = {
    id: 'bee', color: '#fff0a8', transform: 'rotate(12 200 225)',
    name: { es: 'Abeja', eu: 'Erlea', en: 'Bee' },
    steps: [
      ellipse(200, 230, 68, 98, BY),
      { b: beeAntenna + mirror(beeAntenna) },
      { b: beeWingTop + mirror(beeWingTop) },
      { b: beeWingBottom + mirror(beeWingBottom) },
      { f: path('M137.9 190 Q200 202 262.1 190 L266.8 212 Q200 224 133.2 212Z', BK) +
          path('M132.1 236 Q200 248 267.9 236 L265.2 258 Q200 270 134.8 258Z', BK) +
          path('M142.4 282 Q200 294 257.6 282 L246.1 302 Q200 314 153.9 302Z', BK),
        b: path('M188 322 L200 346 L212 322', BK) },
      circle(180, 158, 7, INK) + circle(220, 158, 7, INK) + path('M184 176 Q200 190 216 176') +
      ellipse(166, 174, 8, 5, CHEEK) + ellipse(234, 174, 8, 5, CHEEK)
    ]
  };

  /* ---------- Mariquita ---------- */
  var LR = fill('#ff4d4d'), LK = fill('#34303a');
  var ladyLegs = path('M120 190 L80 180 L70 158') + path('M120 225 L70 230 L60 252') + path('M135 280 L88 300 L85 326');
  var ladyAntenna = path('M180 112 Q170 84 148 78') + circle(146, 78, 6, INK);
  var ladybird = {
    id: 'ladybird', color: '#ffc9c9',
    name: { es: 'Mariquita', eu: 'Marigorringoa', en: 'Ladybird' },
    steps: [
      ellipse(200, 215, 95, 115, LR),
      path('M112.6 170 Q200 130 287.4 170 A95 115 0 0 0 112.6 170Z', LK + ' stroke="none"') + path('M112.6 170 Q200 130 287.4 170'),
      path('M200 150 L200 330'),
      { b: ladyAntenna + mirror(ladyAntenna),
        f: join([[150, 208, 16], [250, 208, 16], [140, 262, 14], [260, 262, 14], [174, 300, 12], [226, 300, 12]],
          function (s) { return circle(s[0], s[1], s[2], LK); }) },
      { b: ladyLegs + mirror(ladyLegs) },
      circle(178, 126, 10, WHITE) + circle(222, 126, 10, WHITE) + circle(180, 128, 4, INK) + circle(220, 128, 4, INK)
    ]
  };

  /* ---------- Gato ---------- */
  var CO = fill('#ffb36b'), CP = fill('#ff9fbf');
  var catEar = path('M100 172 L112 72 L176 132', CO) + path('M120 150 L124 100 L156 132', CP);
  var catEye = ellipse(160, 196, 18, 22, WHITE) + ellipse(162, 198, 7, 14, INK);
  var catWhiskers = path('M150 238 L82 224 M150 248 L78 252 M150 258 L86 280');
  var cat = {
    id: 'cat', color: '#ffdcbc',
    name: { es: 'Gato', eu: 'Katua', en: 'Cat' },
    steps: [
      ellipse(200, 218, 122, 95, CO),
      { b: catEar + mirror(catEar) },
      path('M188 230 L212 230 L200 244Z', CP) + path('M200 244 V254 M178 252 Q189 266 200 254 Q211 266 222 252'),
      catEye + mirror(catEye),
      catWhiskers + mirror(catWhiskers) + path('M200 128 L200 152 M180 132 L184 150 M220 132 L216 150')
    ]
  };

  /* ---------- Perro ---------- */
  var DG = fill('#d9a066'), DG2 = fill('#a8703f');
  var dog = {
    id: 'dog', color: '#f3dcc2',
    name: { es: 'Perro', eu: 'Txakurra', en: 'Dog' },
    steps: [
      circle(110, 150, 50, DG),
      ellipse(70, 172, 30, 22, fill('#f1d2a8')) + ellipse(43, 164, 9, 7, INK) + path('M58 186 Q70 196 84 187'),
      path('M120 106 Q156 98 156 140 Q154 178 134 180 Q122 150 120 106Z', DG2) + circle(102, 138, 6, INK),
      { b: ellipse(225, 215, 95, 55, DG) },
      { b: path('M150 240 L150 320 Q163 330 176 320 L176 240', DG) + path('M190 250 L190 322 Q203 332 216 322 L216 250', DG) +
        path('M255 250 L255 322 Q268 332 281 322 L281 250', DG) + path('M290 240 L292 320 Q305 330 318 320 L314 228', DG) },
      { bb: path(tube([[312, 200], [338, 176], [350, 142]], 16, 9).d, DG),
        f: path(blob(238, 206, 22, 2), DG2) + path('M266 232 Q275 225 284 232') }
    ]
  };

  /* ---------- Mono ---------- */
  var MK = fill('#a0673a'), MS = fill('#f0c9a0');
  var monkeyEar = circle(122, 140, 26, MK) + circle(118, 140, 13, MS);
  var monkeyArm = path(tube([[150, 252], [118, 276], [112, 316]], 24, 20).d, MK);
  var monkey = {
    id: 'monkey', color: '#ecd3b8',
    name: { es: 'Mono', eu: 'Tximinoa', en: 'Monkey' },
    steps: [
      circle(200, 140, 75, MK),
      { b: monkeyEar + mirror(monkeyEar) },
      path('M200 105 C175 80 132 95 138 140 C140 160 150 170 152 178 C140 200 160 225 200 225 ' +
        'C240 225 260 200 248 178 C250 170 260 160 262 140 C268 95 225 80 200 105Z', MS),
      circle(175, 138, 8, INK) + circle(225, 138, 8, INK) + circle(193, 172, 3, INK) + circle(207, 172, 3, INK) +
      path('M176 192 Q200 212 224 192'),
      { b: ellipse(200, 288, 62, 72, MK), f: ellipse(200, 298, 38, 45, MS) },
      monkeyArm + mirror(monkeyArm) + ellipse(160, 355, 26, 14, MS) + ellipse(240, 355, 26, 14, MS),
      { bb: path(tube([[250, 320], [300, 334], [332, 300], [322, 262], [296, 268]], 14, 10).d, MK),
        f: path('M192 66 Q196 50 206 58 Q210 48 218 56') }
    ]
  };

  /* ---------- Araña ---------- */
  var SPD = fill('#9b86c9'), SPL = fill('#c3b5e6');
  var spiderLegs = path('M165 200 L110 158 L80 108 M160 220 L95 205 L58 168 M160 245 L95 266 L62 302 M170 268 L118 312 L98 356', 'stroke-width="8"');
  var spider = {
    id: 'spider', color: '#e0d8f2',
    name: { es: 'Araña', eu: 'Armiarma', en: 'Spider' },
    steps: [
      circle(200, 235, 70, SPD),
      circle(200, 145, 42, SPD),
      { b: spiderLegs },
      { b: mirror(spiderLegs) },
      circle(184, 138, 12, WHITE) + circle(216, 138, 12, WHITE) + circle(186, 140, 5, INK) + circle(214, 140, 5, INK) +
      path('M186 162 Q200 172 214 162'),
      { bb: path('M200 105 L200 18'), f: circle(178, 222, 10, SPL) + circle(222, 222, 10, SPL) + circle(200, 260, 13, SPL) }
    ]
  };

  /* ---------- Delfín ---------- */
  var DL = fill('#7fb3d9');
  var dolphin = {
    id: 'dolphin', color: '#cfe6f7',
    name: { es: 'Delfín', eu: 'Izurdea', en: 'Dolphin' },
    steps: [
      path('M40 200 Q55 185 85 182 C120 150 200 125 275 150 C322 168 345 205 352 238 ' +
        'C330 220 300 214 270 222 C210 240 140 238 100 218 Q70 212 40 200Z', DL),
      { b: path('M334 222 Q356 196 386 190 Q374 220 354 240 Q376 252 384 284 Q354 272 338 246', DL) },
      { b: path('M194 146 Q222 98 252 90 Q238 122 248 154', DL) },
      path('M166 226 Q158 262 132 278 Q178 270 202 230', DL),
      circle(100, 184, 6, INK) + path('M44 201 Q70 209 98 206'),
      path(waves(20, 380, 336, 60, 16)) + path(waves(50, 350, 362, 60, 12)) +
      ellipse(64, 300, 5, 8, fill('#cdeeff')) + ellipse(84, 282, 4, 6, fill('#cdeeff')) + ellipse(352, 306, 5, 8, fill('#cdeeff'))
    ]
  };

  /* ---------- Castillo ---------- */
  var STN = fill('#d5c8b8'), RF = fill('#ff6b5b');
  var tower = path('M60 140 L60 350 L130 350 L130 140Z', STN);
  var towerRoof = path('M50 142 L95 58 L140 142Z', RF) + path('M95 58 L95 30') + path('M95 30 L122 38 L95 46Z', fill('#ffd23f'));
  var towerWin = path('M85 205 L85 186 Q95 171 105 186 L105 205Z', INK) + path('M85 275 L85 256 Q95 241 105 256 L105 275Z', INK);
  var bricks = path('M70 310 h20 M100 326 h18 M72 236 h18 M108 160 h14');
  var castle = {
    id: 'castle', color: '#e6dccf',
    name: { es: 'Castillo', eu: 'Gaztelua', en: 'Castle' },
    steps: [
      tower + mirror(tower),
      { b: path('M125 350 L125 190 L145 190 L145 172 L165 172 L165 190 L190 190 L190 172 L210 172 L210 190 ' +
        'L235 190 L235 172 L255 172 L255 190 L275 190 L275 350', STN) },
      towerRoof + mirror(towerRoof),
      path('M168 350 L168 290 Q200 252 232 290 L232 350', fill('#8d5a3b')) + path('M200 268 L200 350'),
      towerWin + mirror(towerWin) + circle(200, 222, 14, fill('#7fd0ff')),
      bricks + mirror(bricks) + path('M150 214 h18 M236 246 h18') +
      path('M24 352 h352 M34 352 l5 -14 l4 14 l6 -12 M352 352 l5 -14 l4 14 l6 -12')
    ]
  };

  /* ---------- Coche ---------- */
  var CAR = fill('#ff5d5d'), TIRE = fill('#3a3640'), HUB = fill('#d0d6de'), GLASS = fill('#bfe6ff');
  var car = {
    id: 'car', color: '#ffd0d0',
    name: { es: 'Coche', eu: 'Autoa', en: 'Car' },
    steps: [
      path('M45 275 L45 228 Q45 205 70 202 L335 202 Q358 205 358 228 L358 275Z', CAR),
      { b: path('M110 205 L148 150 Q154 142 166 142 L262 142 Q274 142 282 152 L322 205', CAR) },
      circle(115, 278, 38, TIRE) + circle(115, 278, 15, HUB) + circle(290, 278, 38, TIRE) + circle(290, 278, 15, HUB),
      path('M210 156 L262 156 Q270 156 275 163 L302 198 L210 198Z', GLASS) +
      path('M196 156 L196 198 L135 198 L160 163 Q165 156 173 156Z', GLASS),
      path('M203 205 L203 262 M216 222 h16') + ellipse(350, 226, 7, 10, fill('#ffe066')) +
      path('M45 222 L56 222 L56 242 L45 242', fill('#ffa94d')),
      path('M20 318 L380 318') + circle(26, 250, 10, fill('#eeeeee')) + circle(14, 228, 7, fill('#eeeeee'))
    ]
  };

  /* ---------- Moto ---------- */
  var motoWheels = circle(100, 285, 52, TIRE) + circle(100, 285, 20, HUB) + circle(300, 285, 52, TIRE) + circle(300, 285, 20, HUB);
  var motorbike = {
    id: 'motorbike', color: '#d6e4f5',
    name: { es: 'Moto', eu: 'Motoa', en: 'Motorbike' },
    steps: [
      motoWheels,
      path('M56 236 Q58 210 88 208 L148 208 Q168 178 200 178 L250 178 Q268 178 278 194 L304 236 Q306 250 290 252 ' +
        'L162 256 Q142 256 134 244 L70 244 Q56 244 56 236Z', fill('#4c8ff0')),
      path('M96 208 Q96 190 114 190 L170 190 Q160 208 150 208Z', fill('#3a3640')),
      { b: path('M272 196 L300 285') + path('M272 196 L258 146 M238 142 L262 147', 'stroke-width="9"'),
        f: ellipse(306, 210, 11, 15, fill('#ffe066')) },
      { b: rect(168, 246, 74, 30, 8, fill('#8a94a6')), f: path('M118 266 L226 266 Q240 266 240 278 L118 280Z', HUB) },
      path('M10 200 h40 M4 232 h40 M30 342 h340')
    ]
  };

  /* ---------- Arcoíris ---------- */
  var RBC = ['#ff5d5d', '#ffa94d', '#ffe066', '#6fd36f', '#5bb8ff'];
  function rbStep(i, extraArc) {
    var R = [160, 138, 116, 94, 72, 50];
    return { b: path(band(200, 300, R[i], R[i + 1]), fill(RBC[i]) + ' stroke="none"'),
      f: path(arcLine(200, 300, R[i])) + (extraArc ? path(arcLine(200, 300, R[i + 1])) : '') };
  }
  var cloud = path('M36 324 Q20 298 50 290 Q54 260 90 266 Q110 244 136 268 Q166 266 162 296 Q180 324 148 328 L56 328 Q38 328 36 324Z', WHITE);
  var rainbow = {
    id: 'rainbow', color: '#d8eefc',
    name: { es: 'Arcoíris', eu: 'Ortzadarra', en: 'Rainbow' },
    steps: [
      rbStep(0), rbStep(1), rbStep(2), rbStep(3), rbStep(4, true),
      cloud + mirror(cloud),
      circle(338, 70, 24, fill('#ffd23f')) +
      path('M338 34 v-12 M338 106 v12 M302 70 h-12 M374 70 h12 M313 45 l-9 -9 M363 45 l9 -9 M313 95 l-9 9 M363 95 l9 9')
    ]
  };

  /* ---------- Fantasma ---------- */
  var ghostArm = path('M114 215 Q72 228 74 262 Q96 252 114 250', WHITE);
  var ghost = {
    id: 'ghost', color: '#dfe3fb',
    name: { es: 'Fantasma', eu: 'Mamua', en: 'Ghost' },
    steps: [
      path('M110 330 L110 180 A90 90 0 0 1 290 180 L290 330', WHITE),
      path('M290 330 Q276 362 256 336 Q236 310 220 340 Q200 366 180 340 Q164 310 144 336 Q124 362 110 330', WHITE),
      { b: ghostArm + mirror(ghostArm) },
      ellipse(170, 175, 13, 19, INK) + ellipse(230, 175, 13, 19, INK),
      ellipse(200, 230, 15, 20, INK) + ellipse(148, 210, 11, 7, CHEEK) + ellipse(252, 210, 11, 7, CHEEK),
      path('M328 46 A38 38 0 1 0 368 104 A30 30 0 1 1 328 46Z', fill('#ffe066')) +
      path('M58 70 v22 M47 81 h22 M40 190 v16 M32 198 h16 M352 200 v18 M343 209 h18')
    ]
  };

  /* ---------- Robot ---------- */
  var RB1 = fill('#b8c4d6'), RB2 = fill('#9fb0c8');
  var robotEar = rect(100, 105, 16, 42, 4, RB2);
  var robotArm = path('M108 212 L74 216 Q62 217 62 230 L62 292 L86 292 L86 240 L108 238', RB2);
  var robotHand = circle(74, 304, 14, RB1);
  var robotLeg = path('M138 312 L138 360 L174 360 L174 312', RB2) + rect(124, 356, 58, 18, 9, fill('#5a6478'));
  var robot = {
    id: 'robot', color: '#dbe3ee',
    name: { es: 'Robot', eu: 'Robota', en: 'Robot' },
    steps: [
      rect(115, 70, 170, 110, 18, RB1),
      { b: path('M200 72 L200 42') + robotEar + mirror(robotEar), f: circle(200, 34, 9, fill('#ff5d5d')) },
      circle(165, 115, 16, WHITE) + circle(235, 115, 16, WHITE) + circle(167, 117, 7, INK) + circle(233, 117, 7, INK) +
      rect(160, 145, 80, 20, 4, WHITE) + path('M180 145 V165 M200 145 V165 M220 145 V165'),
      { b: rect(180, 172, 40, 28, 0, RB2), f: rect(105, 195, 190, 125, 16, RB2) },
      rect(145, 218, 110, 64, 10, fill('#e8eef5')) + circle(172, 250, 10, fill('#ff5d5d')) +
      circle(200, 250, 10, fill('#ffd23f')) + circle(228, 250, 10, fill('#6fd36f')),
      { b: robotArm + mirror(robotArm), f: robotHand + mirror(robotHand) },
      { bb: robotLeg + mirror(robotLeg) }
    ]
  };

  /* ---------- Árbol de Navidad ---------- */
  var XG = fill('#4caf50');
  var xmastree = {
    id: 'xmastree', color: '#d4efcc',
    name: { es: 'Árbol de Navidad', eu: 'Gabonetako zuhaitza', en: 'Christmas tree' },
    steps: [
      path('M140 140 L200 62 L260 140 Q200 156 140 140Z', XG),
      { b: path('M110 222 L200 112 L290 222 Q200 240 110 222Z', XG) },
      { bb: path('M80 302 L200 178 L320 302 Q200 324 80 302Z', XG) },
      { bbb: path('M180 300 L180 350 L220 350 L220 300', fill('#8d5a3b')) },
      path(roundStar(200, 58, 30, 13, 5, 0.25, -Math.PI / 2), fill('#ffd23f')),
      path('M152 134 Q200 150 248 132 M126 212 Q200 236 276 210 M98 292 Q200 320 302 290') +
      join([[182, 106, '#ffd23f'], [170, 178, '#ff5d5d'], [236, 186, '#5bb8ff'], [150, 262, '#ffd23f'],
        [206, 270, '#ff5d5d'], [262, 258, '#5bb8ff'], [222, 118, '#ff5d5d']],
        function (b) { return circle(b[0], b[1], 9, fill(b[2])); }),
      rect(92, 318, 54, 42, 4, fill('#ff5d5d')) + path('M119 318 V360 M92 336 H146 M119 318 q-12 -14 -18 -2 M119 318 q12 -14 18 -2') +
      rect(258, 326, 48, 34, 4, fill('#5bb8ff')) + path('M282 326 V360 M258 342 H306')
    ]
  };

  /* ---------- Duende ---------- */
  var GRD = fill('#e53935'), SKIN = fill('#ffd7b5'), GBL = fill('#3f7fd6');
  var gnomeArm = path('M146 286 Q110 300 104 332 L130 338 Q136 314 152 306', GBL);
  var gnomeHand = circle(116, 342, 14, SKIN);
  var gnome = {
    id: 'gnome', color: '#d8e6f8',
    name: { es: 'Duende', eu: 'Iratxoa', en: 'Gnome' },
    steps: [
      path('M112 178 Q162 104 206 30 Q240 104 288 178Z', GRD),
      { b: ellipse(200, 192, 62, 40, SKIN) },
      path('M136 196 Q130 282 200 322 Q270 282 264 196 Q234 226 200 216 Q166 226 136 196Z', fill('#f4f4f4')),
      circle(200, 202, 20, fill('#ffab91')) + circle(172, 188, 5, INK) + circle(228, 188, 5, INK),
      { b: path('M144 280 L118 360 L282 360 L256 280', GBL) },
      { b: gnomeArm + mirror(gnomeArm), f: gnomeHand + mirror(gnomeHand),
        bb: ellipse(160, 364, 30, 13, fill('#7a4a2a')) + ellipse(240, 364, 30, 13, fill('#7a4a2a')) },
      path('M127 330 L273 330 L278 346 L122 346Z', fill('#3a3640')) + rect(189, 327, 22, 22, 3, fill('#ffd23f')) +
      path(roundStar(212, 112, 14, 6, 5, 0.3, -Math.PI / 2), fill('#ffd23f'))
    ]
  };

  /* ---------- Isla con palmera ---------- */
  var PALM = fill('#5cbf5c');
  var palmTrunk = tube([[178, 296], [186, 232], [206, 172], [236, 126]], 30, 18);
  var palmRings = join([6, 12, 18, 24, 30], function (k) { return path('M' + pt(palmTrunk.L[k]) + ' L' + pt(palmTrunk.R[k])); });
  var palmTop = [236, 124];
  var island = {
    id: 'island', color: '#cdeefc',
    name: { es: 'Isla con palmera', eu: 'Palmondodun uhartea', en: 'Palm island' },
    steps: [
      path('M50 322 Q120 262 200 264 Q290 264 350 322Z', fill('#f5d491')),
      { b: path(palmTrunk.d, fill('#b07a45')) + palmRings },
      path(leaf(palmTop, [128, 156], 22, -14), PALM) + path(leaf(palmTop, [150, 80], 20, -10), PALM) +
      path(leaf(palmTop, [250, 46], 18, 0), PALM) + path(leaf(palmTop, [324, 90], 20, 10), PALM) +
      path(leaf(palmTop, [336, 170], 22, 14), PALM),
      circle(224, 138, 11, fill('#8d5a3b')) + circle(248, 140, 11, fill('#8d5a3b')) + circle(236, 157, 11, fill('#8d5a3b')),
      { bb: rect(8, 318, 384, 60, 0, fill('#7fd0ff') + ' stroke="none"'),
        f: path(waves(20, 380, 342, 50, 12)) + path(waves(45, 355, 364, 50, 10)) },
      circle(68, 68, 26, fill('#ffd23f')) + path('M86 210 q8 -8 16 0 q8 -8 16 0 M50 150 q7 -7 14 0 q7 -7 14 0')
    ]
  };

  /* ---------- Casa ---------- */
  var houseWin = rect(120, 222, 42, 42, 4, fill('#bfe6ff')) + path('M141 222 V264 M120 243 H162');
  var houseFlower = function (x) { return path('M' + x + ' 350 V330') + circle(x, 318, 12, fill('#ff7aa8')); };
  var house = {
    id: 'house', color: '#ffe3c2',
    name: { es: 'Casa', eu: 'Etxea', en: 'House' },
    steps: [
      rect(100, 190, 200, 160, 0, fill('#ffd28a')),
      path('M78 198 L200 86 L322 198Z', fill('#ff6b5b')),
      path('M175 350 L175 284 Q175 268 191 268 L209 268 Q225 268 225 284 L225 350', fill('#a0673a')) + circle(214, 312, 4, INK),
      houseWin + mirror(houseWin),
      { b: path('M250 150 L250 104 L280 104 L280 178', fill('#c9774a')),
        f: circle(270, 84, 10, fill('#eeeeee')) + circle(284, 60, 13, fill('#eeeeee')) + circle(304, 34, 16, fill('#eeeeee')) },
      path('M30 350 L370 350 M175 350 L160 384 M225 350 L240 384') + houseFlower(55) + houseFlower(80) + houseFlower(330)
    ]
  };

  /* ---------- Flor ---------- */
  var FPK = fill('#ff7aa8'), FGR = fill('#5cbf5c');
  var petals = '';
  for (var pa = 0; pa < 6; pa++) {
    var pang = -90 + pa * 60, pp = polar(200, 150, 62, pang), px = r1(pp[0]), py = r1(pp[1]);
    petals += ellipse(px, py, 28, 40, FPK + ' transform="rotate(' + (pang + 90) + ' ' + px + ' ' + py + ')"');
  }
  var flower = {
    id: 'flower', color: '#ffd6e6',
    name: { es: 'Flor', eu: 'Lorea', en: 'Flower' },
    steps: [
      circle(200, 150, 36, fill('#ffcf3c')),
      { b: petals },
      { bbb: path(tube([[200, 200], [192, 280], [200, 368]], 14, 12).d, FGR) },
      { bb: path(leaf([197, 302], [118, 264], 24, -8), FGR) + path(leaf([199, 262], [280, 232], 22, 8), FGR) },
      circle(188, 144, 5, INK) + circle(212, 144, 5, INK) + path('M186 160 Q200 172 214 160'),
      path('M150 350 L160 388 L240 388 L250 350Z', fill('#d9824a')) + rect(140, 334, 120, 18, 6, fill('#e8955a'))
    ]
  };

  /* ---------- Mariposa ---------- */
  var bfAnt = path('M194 104 Q182 70 166 62') + circle(164, 60, 6, INK);
  var bfUp = path('M192 178 C150 88 70 66 58 118 C50 168 118 200 192 206Z', fill('#ff8fb8'));
  var bfLow = path('M192 214 C132 208 88 246 108 290 C128 322 180 292 194 242Z', fill('#ffb36b'));
  var bfDots = circle(108, 128, 18, fill('#ffe066')) + circle(150, 170, 10, fill('#ffe066')) + circle(140, 262, 12, fill('#fff3c4'));
  var butterfly = {
    id: 'butterfly', color: '#fde0ec',
    name: { es: 'Mariposa', eu: 'Tximeleta', en: 'Butterfly' },
    steps: [
      ellipse(200, 210, 14, 80, fill('#9b86c9')) + circle(200, 118, 20, fill('#9b86c9')),
      { b: bfAnt + mirror(bfAnt) },
      { b: bfUp + mirror(bfUp) },
      { b: bfLow + mirror(bfLow) },
      bfDots + mirror(bfDots),
      circle(193, 114, 3.5, INK) + circle(207, 114, 3.5, INK) + path('M193 124 Q200 130 207 124')
    ]
  };

  /* ---------- Búho ---------- */
  var OWL = fill('#a0734a');
  var owlTuft = path('M122 152 L116 82 L162 118', OWL);
  var owlEye = circle(160, 170, 36, WHITE) + circle(165, 175, 14, INK);
  var owlWing = path('M106 190 Q72 262 126 322 Q142 256 106 190Z', fill('#7d5636'));
  var owlFeet = path('M170 334 l-6 14 M180 334 v14 M190 334 l6 14');
  var owl = {
    id: 'owl', color: '#eedcc4',
    name: { es: 'Búho', eu: 'Hontza', en: 'Owl' },
    steps: [
      ellipse(200, 220, 100, 125, OWL),
      { b: owlTuft + mirror(owlTuft) },
      owlEye + mirror(owlEye),
      path('M188 204 L212 204 L200 228Z', fill('#ffa630')),
      ellipse(200, 284, 58, 56, fill('#f0d3a8')) +
      path('M175 262 q8 8 16 0 M209 262 q8 8 16 0 M192 286 q8 8 16 0 M175 308 q8 8 16 0 M209 308 q8 8 16 0'),
      owlWing + mirror(owlWing),
      rect(30, 340, 340, 18, 9, fill('#8d5a3b')) + owlFeet + mirror(owlFeet)
    ]
  };

  /* ---------- Caracol ---------- */
  var snail = {
    id: 'snail', color: '#e2f2d2',
    name: { es: 'Caracol', eu: 'Barraskiloa', en: 'Snail' },
    steps: [
      circle(220, 195, 88, fill('#ffb36b')),
      path(spiral(220, 195, 6, 88, 2.25, Math.PI / 3)),
      { b: path('M342 300 Q332 280 300 282 L140 282 Q128 262 130 226 Q130 186 100 183 Q64 181 62 222 L62 282 ' +
        'Q62 304 92 304 L322 304 Q346 304 342 300Z', fill('#c7e3a6')) },
      { b: path('M82 188 L70 140 M104 186 L112 140') + circle(70, 134, 8, INK) + circle(112, 134, 8, INK) },
      path('M76 234 Q90 246 104 235') + ellipse(116, 222, 9, 6, CHEEK),
      path('M20 316 L380 316 M40 316 l5 -14 l4 14 l6 -12 M344 316 l5 -14 l4 14 l6 -12')
    ]
  };

  /* ---------- Barco de vela ---------- */
  var sailboat = {
    id: 'sailboat', color: '#d4ecfb',
    name: { es: 'Barco de vela', eu: 'Belaontzia', en: 'Sailboat' },
    steps: [
      path('M68 262 L332 262 L292 322 L108 322Z', fill('#c0703f')),
      { b: path('M200 266 L200 40') },
      path('M207 70 L207 248 L312 248Z', WHITE),
      path('M193 92 L193 248 L96 248Z', fill('#ff6b5b')) + path('M200 40 L226 48 L200 56Z', fill('#ffd23f')),
      { bb: rect(8, 318, 384, 60, 0, fill('#7fd0ff') + ' stroke="none"'),
        f: path(waves(20, 380, 332, 50, 14)) + path(waves(45, 355, 358, 50, 10)) },
      circle(140, 290, 9, WHITE) + circle(200, 292, 9, WHITE) + circle(260, 290, 9, WHITE) +
      circle(346, 70, 24, fill('#ffd23f')) + path('M50 96 q10 -10 20 0 q10 -10 20 0')
    ]
  };

  /* ---------- Dinosaurio ---------- */
  var DN = fill('#8fd18a');
  var dinosaur = {
    id: 'dinosaur', color: '#d4efcc',
    name: { es: 'Dinosaurio', eu: 'Dinosauroa', en: 'Dinosaur' },
    steps: [
      ellipse(182, 240, 105, 62, DN),
      { b: path(tube([[248, 214], [282, 160], [300, 112], [310, 96]], 46, 34).d, DN), f: ellipse(320, 88, 36, 25, DN) },
      { b: path(tube([[92, 236], [52, 250], [28, 280], [18, 312]], 42, 8).d, DN) },
      { b: path('M95 268 L95 346 Q112 356 130 346 L130 285', DN) + path('M142 290 L142 348 Q160 358 177 348 L177 296', DN) +
        path('M200 294 L200 348 Q218 358 235 348 L235 286', DN) + path('M245 282 L245 346 Q262 356 280 346 L280 254', DN) },
      circle(326, 80, 5, INK) + circle(350, 84, 2.5, INK) + path('M332 98 Q342 102 352 95'),
      join([[150, 212, 14, 0], [196, 200, 11, 2], [230, 226, 12, 4], [124, 246, 10, 1], [178, 252, 13, 3]],
        function (s) { return path(blob(s[0], s[1], s[2], s[3]), fill('#6bb565')); })
    ]
  };

  /* ---------- Conejo ---------- */
  var BUN = fill('#e9e4ef'), BUP = fill('#ffb3c7');
  var bunnyEar = ellipse(172, 62, 18, 56, BUN + ' transform="rotate(-10 172 62)"') +
    ellipse(172, 66, 8, 38, BUP + ' transform="rotate(-10 172 66)"');
  var bunnyWhisk = path('M168 168 L132 160 M168 176 L132 182');
  var bunny = {
    id: 'bunny', color: '#ece6f5',
    name: { es: 'Conejo', eu: 'Untxia', en: 'Bunny' },
    steps: [
      circle(200, 150, 60, BUN),
      { b: bunnyEar + mirror(bunnyEar) },
      circle(180, 140, 7, INK) + circle(220, 140, 7, INK) + path('M192 160 L208 160 L200 170Z', BUP) +
      path('M200 170 V178 M188 180 Q194 186 200 178 Q206 186 212 180') + bunnyWhisk + mirror(bunnyWhisk),
      { b: ellipse(200, 278, 70, 80, BUN), f: ellipse(200, 292, 42, 50, WHITE) },
      ellipse(160, 352, 32, 15, BUN) + ellipse(240, 352, 32, 15, BUN) + ellipse(166, 240, 14, 18, BUN) + ellipse(234, 240, 14, 18, BUN),
      path('M300 262 L352 262 L326 352Z', fill('#ffa94d')) + path('M312 284 h12 M340 304 h-12') +
      path('M314 262 L304 228 M326 262 L326 224 M338 262 L348 228', 'stroke="#43a047"')
    ]
  };

  /* ---------- Helado ---------- */
  var waffle = path('M170 190 L215 317.5 M200 190 L230 275 M230 190 L245 232.5');
  var icecream = {
    id: 'icecream', color: '#ffe1ea',
    name: { es: 'Helado', eu: 'Izozkia', en: 'Ice cream' },
    steps: [
      path('M140 190 L200 360 L260 190Z', fill('#e6b36a')),
      waffle + mirror(waffle),
      path('M140 196 C120 160 150 110 200 110 C250 110 280 160 260 196 C250 214 238 200 228 214 C218 228 206 206 196 218 ' +
        'C184 232 174 204 162 214 C152 222 146 210 140 196Z', fill('#ffb6c8')),
      { b: circle(200, 96, 50, fill('#8b5a3c')) },
      path('M174 76 l8 -4', 'stroke="#4cc3ff"') + path('M212 68 l6 6', 'stroke="#ffd23f"') + path('M232 96 l-8 4', 'stroke="#6fd36f"') +
      path('M166 104 l6 6', 'stroke="#ffffff"') + path('M200 84 l8 2', 'stroke="#ff5d5d"') +
      circle(180, 160, 5, INK) + circle(220, 160, 5, INK) + path('M186 176 Q200 188 214 176'),
      { f: circle(200, 42, 16, fill('#ff3b3b')), b: path('M202 30 Q208 12 224 6') }
    ]
  };

  /* Orden de la galería: animales, naturaleza y objetos/fantasía */
  global.DRAWINGS = [
    giraffe, dog, cat, bunny, pig, monkey, bear, leopard, rhino, dinosaur, penguin, owl,
    fish, dolphin, octopus, crab, starfish, shark, turtle, snake, snail,
    bee, ladybird, butterfly, spider, bat,
    flower, island, rainbow, xmastree,
    house, castle, car, motorbike, sailboat, rocket, robot, ghost, gnome, icecream
  ];
})(window);
