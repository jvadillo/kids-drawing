/*
 * Dibujos paso a paso.
 *
 * Cada dibujo tiene una lista de pasos. Cada paso es un fragmento SVG (viewBox 0 0 400 400)
 * o un objeto con capas { bbbbb, bbbb, bbb, bb, b, f }: cuantas más b, más al fondo;
 *   f = delante (por defecto, si el paso es un string).
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
    name: { es: 'Cerdito', eu: 'Txerria', en: 'Piglet' },
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
    name: { es: 'Cohete', eu: 'Kohetea', en: 'Rocket' },
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
    name: { es: 'Tortuga', eu: 'Dortoka', en: 'Turtle' },
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
    name: { es: 'Osito', eu: 'Hartza', en: 'Teddy bear' },
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
    name: { es: 'Árbol de Navidad', eu: 'Zuhaitza', en: 'Christmas tree' },
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
    name: { es: 'Isla', eu: 'Uhartea', en: 'Island' },
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

  /* ======================================================================= */
  /*      DIBUJOS NUEVOS: fiestas, fantasía, transportes y personajes        */
  /*  Pensados para no tener que borrar: lo de delante se dibuja primero y   */
  /*  lo que va detrás se añade en capas de fondo (b, bb, bbb, bbbb, bbbbb).  */
  /* ======================================================================= */

  /* Círculo con borde de bultitos (melenas, nubes, lana) */
  function scallop(cx, cy, r, n, bump, rot) {
    var d = '', i;
    rot = rot || 0;
    for (i = 0; i <= n; i++) {
      var a = rot + i * 2 * Math.PI / n, p = [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
      if (i === 0) { d = 'M' + pt(p); continue; }
      var m = rot + (i - 0.5) * 2 * Math.PI / n, c = [cx + Math.cos(m) * (r + bump * 2), cy + Math.sin(m) * (r + bump * 2)];
      d += ' Q' + pt(c) + ' ' + pt(p);
    }
    return d + 'Z';
  }

  /* Franja horizontal de una elipse entre y1 e y2 (cinturones, fajas, rayas) */
  function ellipseBand(cx, cy, rx, ry, y1, y2) {
    function hw(y) { var t = (y - cy) / ry; return rx * Math.sqrt(Math.max(0, 1 - t * t)); }
    var a = hw(y1), b = hw(y2);
    return 'M' + pt([cx - a, y1]) + ' A' + rx + ' ' + ry + ' 0 0 0 ' + pt([cx - b, y2]) +
      ' L' + pt([cx + b, y2]) + ' A' + rx + ' ' + ry + ' 0 0 0 ' + pt([cx + a, y1]) + 'Z';
  }

  /* Copo de nieve pequeño */
  function flake(x, y, r) {
    var d = '';
    for (var i = 0; i < 3; i++) {
      var p = polar(x, y, r, 90 + i * 60), q = polar(x, y, r, 270 + i * 60);
      d += 'M' + pt(p) + ' L' + pt(q) + ' ';
    }
    return path(d);
  }
  function star5(x, y, r, c) { return path(roundStar(x, y, r, r * 0.45, 5, 0.3, -Math.PI / 2), fill(c || '#ffd23f')); }

  /* ---------- Unicornio ---------- */
  var UW = fill('#fbf7ff'), UM = fill('#c9a0ff'), UHOOF = fill('#b48ad9');
  var unicornLeg = function (x) {
    return path('M' + x + ' 250 L' + x + ' 350 L' + (x + 24) + ' 350 L' + (x + 24) + ' 250', UW) + rect(x, 336, 24, 14, 3, UHOOF);
  };
  var unicorn = {
    id: 'unicorn', color: '#f3e3ff',
    name: { es: 'Unicornio', eu: 'Unikornioa', en: 'Unicorn' },
    steps: [
      { b: circle(130, 135, 50, UW), f: ellipse(90, 170, 36, 27, fill('#ffe3f0')) },
      { bb: path('M112 98 L116 24 L146 92', fill('#ffd23f')) + path('M114 82 L137 74 M115 60 L128 55') +
        path('M150 98 L168 54 L174 120', UW) },
      { bbb: path('M165 125 L205 198 Q238 192 230 168 Q252 148 226 136 Q242 108 210 106 Q214 78 182 84 Q168 68 148 92Z', UM) },
      { bbbb: path('M118 180 L170 112 L218 200 L165 225Z', UW + ' stroke="none"') + path('M118 180 L165 225 M170 112 L218 200') +
        ellipse(245, 240, 100, 58, UW) },
      { bbbbb: unicornLeg(170) + unicornLeg(205) + unicornLeg(272) + unicornLeg(306) +
        path(tube([[332, 222], [368, 212], [386, 246], [374, 294]], 34, 12).d, UM) },
      circle(144, 124, 7, INK) + path('M138 115 L133 108 M145 114 L145 106 M152 116 L157 110') +
      ellipse(152, 152, 10, 6, CHEEK) + ellipse(72, 162, 4, 6, INK) + path('M76 182 Q92 192 108 182') +
      path('M192 104 Q206 120 200 138 M214 138 Q226 156 216 176 M362 236 Q372 256 364 280'),
      star5(330, 80, 20) + star5(60, 60, 14, '#ff9fbf') + star5(370, 140, 10, '#7fd0ff')
    ]
  };

  /* ---------- Muñeco de nieve ---------- */
  var SNOW = fill('#ffffff'), DARK = fill('#3a3640'), SCARF = fill('#e53935');
  var snowArm = path('M120 236 L58 188 M82 207 L60 212 M82 207 L78 186');
  var snowman = {
    id: 'snowman', color: '#d8ecfb',
    name: { es: 'Muñeco de nieve', eu: 'Elur-panpina', en: 'Snowman' },
    steps: [
      rect(160, 20, 80, 56, 6, DARK) + rect(160, 54, 80, 12, 0, SCARF) + rect(136, 72, 128, 14, 7, DARK),
      { f: path('M146 164 Q200 184 254 164 L258 186 Q200 210 142 186Z', SCARF),
        b: path('M218 192 L226 262 L254 256 L246 190', SCARF) + path('M232 262 L230 274 M241 260 L242 272 M250 258 L253 269') },
      { b: circle(200, 124, 52, SNOW) },
      { bb: circle(200, 266, 92, SNOW) },
      circle(182, 112, 6, INK) + circle(218, 112, 6, INK) + path('M200 124 L246 134 L200 140Z', fill('#ff9f43')) +
      join([[172, 144], [185, 152], [200, 155], [215, 152], [228, 144]], function (p) { return circle(p[0], p[1], 3.5, INK); }),
      { f: circle(200, 230, 8, INK) + circle(200, 266, 8, INK) + circle(200, 302, 8, INK), bbb: snowArm + mirror(snowArm) },
      { bbbb: path('M20 352 L380 352') },
      flake(60, 70, 14) + flake(330, 60, 12) + flake(350, 250, 10) + flake(40, 300, 10) + flake(300, 130, 8) + flake(90, 150, 8)
    ]
  };

  /* ---------- Papá Noel ---------- */
  var SR = fill('#e53935');
  var santaArm = path('M170 250 Q120 250 96 292 L118 306 Q136 280 166 278', SR) + circle(104, 306, 15, DARK);
  var santa = {
    id: 'santa', color: '#ffd6d6',
    name: { es: 'Papá Noel', eu: 'Bizarzuri', en: 'Santa Claus' },
    steps: [
      { f: rect(128, 116, 144, 30, 15, SNOW) + circle(290, 104, 16, SNOW),
        b: path('M144 120 Q166 40 256 66 Q278 76 284 100 L262 120', SR) },
      path('M144 146 Q136 214 160 242 Q178 268 200 268 Q222 268 240 242 Q264 214 256 146 Q250 196 200 196 Q150 196 144 146Z', SNOW) +
      path('M200 188 Q178 174 162 190 Q176 206 200 196 Q224 206 238 190 Q222 174 200 188Z', SNOW) +
      circle(200, 178, 11, fill('#ffab91')),
      { b: circle(200, 172, 48, SKIN) },
      circle(182, 158, 5, INK) + circle(218, 158, 5, INK) + ellipse(166, 170, 8, 5, CHEEK) + ellipse(234, 170, 8, 5, CHEEK),
      { bb: path('M162 232 Q112 280 110 336 L290 336 Q288 280 238 232', SR) },
      { bbb: santaArm + mirror(santaArm) },
      { bbbb: ellipse(165, 348, 32, 15, DARK) + ellipse(235, 348, 32, 15, DARK) },
      { bb: rect(106, 326, 188, 18, 9, SNOW) + path('M130 284 L270 284 L276 304 L124 304Z', DARK) +
        rect(186, 280, 28, 28, 4, fill('#ffd23f')) + rect(196, 290, 8, 8, 0, DARK) }
    ]
  };

  /* ---------- Olentzero ---------- */
  var BEARD = fill('#5d4037'), OBLUE = fill('#33507e');
  var oleArm = path('M130 258 Q90 262 74 300 L98 312 Q110 290 134 286', OBLUE) + circle(84, 314, 14, SKIN);
  var olentzero = {
    id: 'olentzero', color: '#dfe7f3',
    name: { es: 'Olentzero', eu: 'Olentzero', en: 'Olentzero' },
    steps: [
      path('M204 80 L208 64') + ellipse(200, 100, 86, 24, DARK + ' transform="rotate(-5 200 100)"'),
      path('M142 128 Q134 200 168 232 Q184 246 200 246 Q216 246 232 232 Q266 200 258 128 Q252 184 200 186 Q148 184 142 128Z', BEARD) +
      path('M200 180 Q178 166 164 182 Q178 196 200 188 Q222 196 236 182 Q222 166 200 180Z', BEARD) +
      ellipse(200, 168, 12, 10, fill('#ff9e80')),
      { b: circle(200, 158, 50, SKIN) },
      circle(180, 142, 5, INK) + circle(220, 142, 5, INK) + path('M168 128 Q180 122 190 128 M210 128 Q220 122 232 128') +
      ellipse(162, 162, 10, 7, fill('#ff8a80')) + ellipse(238, 162, 10, 7, fill('#ff8a80')),
      { bb: ellipse(200, 300, 100, 72, OBLUE) },
      { bb: path(ellipseBand(200, 300, 100, 72, 300, 326), SCARF) },
      { bbb: oleArm + mirror(oleArm), bbbbb: path(blob(308, 230, 58, 2), fill('#c8a06a')) + path('M282 182 Q300 170 322 180') },
      { bbbb: ellipse(165, 368, 30, 13, fill('#8d5a3b')) + ellipse(235, 368, 30, 13, fill('#8d5a3b')),
        f: star5(70, 70, 18) + star5(340, 70, 12) + star5(50, 200, 10) }
    ]
  };

  /* ---------- Mari Domingi ---------- */
  var MDRED = fill('#e53935'), HAIR = fill('#6d4c41');
  var mdBraid = tube([[150, 182], [140, 232], [134, 278]], 26, 18);
  var mdBraidS = path(mdBraid.d, HAIR) + join([8, 14, 20], function (k) {
    return path('M' + pt(mdBraid.L[k]) + ' Q' + pt(lerp(mdBraid.c[k + 2], mdBraid.c[k], 0)) + ' ' + pt(mdBraid.R[k]));
  }) + path('M134 282 L118 296 L120 276Z M134 282 L150 296 L148 276Z', MDRED);
  var mdArm = path('M164 212 Q118 236 104 284 L124 292 Q136 256 166 240', SNOW) + circle(112, 296, 12, SKIN);
  var maridomingi = {
    id: 'maridomingi', color: '#ffe0e0',
    name: { es: 'Mari Domingi', eu: 'Mari Domingi', en: 'Mari Domingi' },
    steps: [
      path('M136 150 Q132 72 200 70 Q268 72 264 150 Q258 116 200 112 Q142 116 136 150Z', MDRED),
      { b: circle(200, 160, 52, SKIN) },
      { bb: mdBraidS + mirror(mdBraidS) },
      circle(182, 156, 6, INK) + circle(218, 156, 6, INK) +
      path('M186 182 Q200 194 214 182') + ellipse(168, 174, 9, 6, CHEEK) + ellipse(232, 174, 9, 6, CHEEK),
      { bbb: path('M164 200 L156 260 L244 260 L236 200', SNOW) + path('M156 254 L112 352 L288 352 L244 254Z', MDRED) },
      { bbb: path('M174 262 L164 336 Q200 344 236 336 L226 262Z', DARK) },
      { bbbb: mdArm + mirror(mdArm), f: path('M292 296 Q326 246 360 296') + path('M282 300 L294 340 L354 340 L366 300Z', fill('#c8a06a')) +
        path('M286 314 H362 M290 327 H358'), b: circle(309, 296, 12, MDRED) + circle(336, 294, 12, fill('#7cc576')) },
      { bbbb: rect(170, 340, 18, 28, 0, SNOW) + rect(212, 340, 18, 28, 0, SNOW),
        f: ellipse(176, 370, 16, 8, INK) + ellipse(224, 370, 16, 8, INK) +
        join([[170, 90], [200, 84], [230, 90], [152, 118], [248, 118], [185, 102], [215, 102]], function (p) { return circle(p[0], p[1], 4, SNOW); }) }
    ]
  };

  /* ---------- Reno ---------- */
  var RD = fill('#a0673a'), RDL = fill('#e8c49a'), ANT = fill('#d9b38c');
  var reinEar = path(leaf([150, 150], [82, 118], 20, 0), RD) + path(leaf([138, 144], [96, 125], 8, 0), fill('#ffb3c7'));
  var reinAntler = path(tube([[172, 112], [150, 72], [130, 40], [118, 16]], 18, 10).d, ANT) +
    path(tube([[148, 70], [114, 60], [96, 42]], 12, 8).d, ANT) + path(tube([[134, 46], [152, 26], [154, 8]], 10, 7).d, ANT);
  var reindeer = {
    id: 'reindeer', color: '#f0e0cc',
    name: { es: 'Reno', eu: 'Elur-oreina', en: 'Reindeer' },
    steps: [
      ellipse(200, 250, 54, 38, RDL) + circle(200, 234, 16, SCARF),
      { b: ellipse(200, 180, 74, 84, RD) },
      { bb: reinEar + mirror(reinEar) },
      { bbb: reinAntler + mirror(reinAntler) },
      circle(170, 172, 13, SNOW) + circle(172, 174, 6, INK) + circle(230, 172, 13, SNOW) + circle(228, 174, 6, INK) +
      path('M182 262 Q200 276 218 262') + ellipse(148, 214, 10, 6, CHEEK) + ellipse(252, 214, 10, 6, CHEEK),
      flake(60, 230, 14) + flake(340, 240, 14) + flake(50, 330, 10) + flake(350, 340, 10) + flake(300, 300, 8) + flake(100, 290, 8)
    ]
  };

  /* ---------- Montaña rusa ---------- */
  var coaster = tube([[-10, 350], [50, 280], [115, 160], [175, 240], [225, 310], [282, 240], [332, 205], [372, 245], [420, 320]], 18, 18);
  var cTop = 0;
  for (var ci = 0; ci < coaster.c.length; ci++) if (coaster.c[ci][1] < coaster.c[cTop][1]) cTop = ci;
  var cX = r1(coaster.c[cTop][0]), cY = r1(coaster.R[cTop][1]);
  function polyline(P, from, to) { var d = ''; for (var i = from; i <= to; i++) d += (i === from ? 'M' : ' L') + pt(P[i]); return d; }
  var cLast = coaster.c.length - 1;
  var coasterTies = '', coasterPosts = '';
  for (ci = 2; ci < cLast; ci += 3) coasterTies += 'M' + pt(coaster.L[ci]) + ' L' + pt(coaster.R[ci]) + ' ';
  for (ci = 6; ci < cLast; ci += 12) {
    if (coaster.L[ci][1] < 360 && coaster.L[ci][0] > 10 && coaster.L[ci][0] < 390) {
      coasterPosts += 'M' + pt(coaster.L[ci]) + ' L' + r1(coaster.L[ci][0]) + ' 372 ';
    }
  }
  var rollercoaster = {
    id: 'rollercoaster', color: '#d8eefc',
    name: { es: 'Montaña rusa', eu: 'Mendi errusiarra', en: 'Roller coaster' },
    steps: [
      { f: rect(cX - 44, cY - 54, 88, 40, 12, fill('#ff5d5d')),
        b: circle(cX - 24, cY - 9, 9, DARK) + circle(cX + 24, cY - 9, 9, DARK) },
      { bb: path(polyline(coaster.L, 0, cLast)) + path(polyline(coaster.R, 0, cLast)) + path(coasterTies) },
      { bbb: path(coasterPosts) + path('M10 372 L390 372') },
      { b: circle(cX - 20, cY - 66, 15, SKIN) + circle(cX + 20, cY - 66, 15, SKIN) +
        path('M' + (cX - 36) + ' ' + (cY - 56) + ' L' + (cX - 46) + ' ' + (cY - 96) + ' M' + (cX + 36) + ' ' + (cY - 56) + ' L' + (cX + 46) + ' ' + (cY - 96)) },
      circle(cX - 25, cY - 68, 3, INK) + circle(cX - 15, cY - 68, 3, INK) + circle(cX + 15, cY - 68, 3, INK) + circle(cX + 25, cY - 68, 3, INK) +
      path('M' + (cX - 26) + ' ' + (cY - 60) + ' q6 6 12 0 M' + (cX + 14) + ' ' + (cY - 60) + ' q6 6 12 0') +
      circle(cX, cY - 34, 7, fill('#ffd23f')),
      circle(330, 60, 26, fill('#ffd23f')) + path('M240 70 q0 -18 18 -18 q6 -14 24 -10 q18 -4 20 14 q14 2 12 14Z', SNOW) +
      path('M180 150 q0 -14 14 -14 q5 -11 19 -8 q14 -3 16 11 q11 2 9 11Z', SNOW)
    ]
  };

  /* ---------- Tren ---------- */
  var TRR = fill('#ff5d5d'), TRB = fill('#5bb8ff'), TRY = fill('#ffd23f');
  var train = {
    id: 'train', color: '#ffe3c2',
    name: { es: 'Tren', eu: 'Trena', en: 'Train' },
    steps: [
      { f: rect(160, 88, 102, 16, 6, DARK), b: rect(170, 100, 80, 120, 0, TRR) },
      { b: rect(250, 150, 100, 70, 0, TRB), bb: path('M300 152 L292 112 L334 112 L326 152', DARK) + rect(286, 100, 54, 14, 4, DARK) },
      circle(205, 252, 26, DARK) + circle(205, 252, 9, TRY) + circle(285, 258, 20, DARK) + circle(285, 258, 7, TRY) +
      circle(335, 258, 20, DARK) + circle(335, 258, 7, TRY),
      { b: rect(160, 220, 210, 22, 0, fill('#8d6e63')) + path('M370 220 L394 244 L370 244', TRY) },
      { f: circle(60, 256, 20, DARK) + circle(60, 256, 7, TRY) + circle(110, 256, 20, DARK) + circle(110, 256, 7, TRY),
        b: rect(30, 160, 110, 60, 0, TRY) + rect(24, 220, 122, 22, 0, fill('#8d6e63')) + path('M146 231 L160 231') },
      rect(186, 118, 48, 40, 6, fill('#bfe6ff')) + circle(350, 185, 10, TRY) + rect(48, 176, 30, 28, 4, fill('#bfe6ff')) +
      rect(92, 176, 30, 28, 4, fill('#bfe6ff')) + path('M10 286 L390 286'),
      { bbb: circle(330, 82, 16, SNOW) + circle(352, 54, 20, SNOW) + circle(380, 24, 22, SNOW) }
    ]
  };

  /* ---------- Avión ---------- */
  var PLB = fill('#7fd0ff'), PLR = fill('#ff5d5d');
  var cloud = function (x, y, s) {
    return path('M' + x + ' ' + y + ' q0 -' + 18 * s + ' ' + 18 * s + ' -' + 18 * s + ' q6 -' + 14 * s + ' ' + 24 * s + ' -' + 10 * s +
      ' q18 -' + 4 * s + ' ' + 20 * s + ' ' + 14 * s + ' q14 ' + 2 * s + ' ' + 12 * s + ' ' + 14 * s + 'Z', SNOW);
  };
  var plane = {
    id: 'plane', color: '#d4ecfb',
    name: { es: 'Avión', eu: 'Hegazkina', en: 'Plane' },
    steps: [
      path('M60 186 Q60 160 100 160 L280 160 Q350 160 360 200 Q350 236 280 236 L100 236 Q60 236 60 212Z', PLB),
      { b: path('M84 166 L58 90 L100 90 L144 166', PLR) + path('M184 166 L156 104 L196 104 L250 166', fill('#e04848')) },
      path('M170 236 L140 314 L190 314 L248 236', PLR),
      { b: ellipse(374, 200, 9, 46, TRY) + circle(362, 200, 10, DARK) },
      circle(130, 192, 13, SNOW) + circle(175, 192, 13, SNOW) + circle(220, 192, 13, SNOW) +
      path('M292 172 Q330 174 342 198 L292 198Z', SNOW),
      cloud(30, 360, 1.4) + cloud(270, 360, 1.1) + cloud(250, 80, 1) + path('M10 140 H40 M4 176 H30 M14 212 H40')
    ]
  };

  /* ---------- Globo aerostático ---------- */
  var balloon = {
    id: 'balloon', color: '#d4ecfb',
    name: { es: 'Globo', eu: 'Globo aerostatikoa', en: 'Hot air balloon' },
    steps: [
      path('M200 40 C282 40 312 112 292 170 Q272 220 236 252 L164 252 Q128 220 108 170 C88 112 118 40 200 40Z', fill('#ff6b5b')),
      path('M200 40 Q156 140 170 252 L230 252 Q244 140 200 40Z', TRY),
      { f: path('M164 252 L172 268 L228 268 L236 252', fill('#c0703f')) + rect(165, 300, 70, 48, 8, fill('#c8a06a')),
        b: path('M174 268 L176 300 M226 268 L224 300') },
      { b: circle(200, 284, 17, SKIN) + path('M232 300 L262 270') + circle(266, 266, 8, SKIN) },
      circle(194, 282, 3, INK) + circle(206, 282, 3, INK) + path('M194 291 q6 5 12 0') +
      path('M165 318 H235 M165 334 H235 M188 300 V348 M212 300 V348'),
      cloud(30, 120, 1.3) + cloud(290, 330, 1.2) + path('M310 90 q10 -10 20 0 q10 -10 20 0 M60 260 q8 -8 16 0 q8 -8 16 0')
    ]
  };

  /* ---------- Camión de bomberos ---------- */
  var FT = fill('#e53935'), GREY = fill('#cfd8dc');
  var firetruck = {
    id: 'firetruck', color: '#ffd6d6',
    name: { es: 'Camión de bomberos', eu: 'Suhiltzaileen kamioia', en: 'Fire engine' },
    steps: [
      path('M260 140 L322 140 Q338 140 346 160 L370 216 L370 272 L350 272 A40 40 0 0 0 270 272 L260 272Z', FT),
      { b: path('M30 180 L260 180 L260 272 L140 272 A40 40 0 0 0 60 272 L30 272Z', FT) },
      { bb: circle(100, 278, 30, DARK) + circle(100, 278, 12, GREY) + circle(310, 278, 30, DARK) + circle(310, 278, 12, GREY) },
      { bb: rect(40, 160, 212, 20, 0, GREY + ' stroke="none"') + path('M40 160 H252 M40 160 V180 M252 160 V180') +
        path('M64 160 V180 M88 160 V180 M112 160 V180 M136 160 V180 M160 160 V180 M184 160 V180 M208 160 V180 M232 160 V180') },
      { f: path('M282 152 L322 152 Q330 152 334 162 L350 204 L282 204Z', fill('#bfe6ff')) + path('M284 222 H302'),
        b: path('M286 141 L286 128 Q296 116 306 128 L306 141', fill('#4cc3ff')) },
      circle(190, 226, 24, TRY) + circle(190, 226, 8, GREY) + rect(50, 196, 100, 46, 6, fill('#ff8a80')) + path('M100 196 V242') +
      circle(362, 236, 6, TRY),
      { bbb: path('M10 308 H390 M30 330 H70 M130 330 H170 M230 330 H270 M330 330 H370') }
    ]
  };

  /* ---------- Astronauta ---------- */
  var SUIT = fill('#eef3f8'), SUIT2 = fill('#b0bec5');
  var astroArm = path('M140 214 Q100 226 92 276 L118 282 Q124 248 146 240', SUIT) + circle(104, 288, 15, fill('#ff9f43'));
  var astroLeg = path('M150 300 L150 350 L190 350 L190 300', SUIT) + rect(142, 344, 54, 22, 10, SUIT2);
  var astronaut = {
    id: 'astronaut', color: '#d6d8f5',
    name: { es: 'Astronauta', eu: 'Astronauta', en: 'Astronaut' },
    steps: [
      circle(200, 130, 74, SUIT),
      ellipse(200, 134, 54, 44, fill('#bfe6ff')) + circle(182, 128, 6, INK) + circle(218, 128, 6, INK) +
      path('M186 148 Q200 160 214 148') + path('M164 110 Q172 98 186 96'),
      { b: rect(132, 190, 136, 120, 34, SUIT) },
      rect(165, 228, 70, 44, 8, SUIT2) + circle(184, 250, 8, fill('#ff5d5d')) + circle(216, 250, 8, TRY),
      { bb: astroArm + mirror(astroArm) },
      { bb: astroLeg + mirror(astroLeg) },
      { bbb: rect(110, 200, 180, 100, 16, SUIT2), b: path('M240 72 L262 34') + circle(265, 29, 8, fill('#ff5d5d')) },
      { b: ellipse(335, 330, 48, 12, fill('#ffd23f')), f: circle(335, 330, 24, fill('#ffb36b')) + path('M290 332 Q335 352 380 326') +
        star5(60, 60, 14) + star5(340, 70, 12) + star5(50, 330, 10) + star5(300, 200, 8) }
    ]
  };

  /* ---------- Princesa ---------- */
  var PDRESS = fill('#ff9fd0'), PHAIR = fill('#ffd54f');
  var princessArm = path('M168 214 Q130 236 108 262 L120 276 Q144 254 172 240', SKIN) + circle(110, 272, 11, SKIN);
  var princess = {
    id: 'princess', color: '#ffe0f0',
    name: { es: 'Princesa', eu: 'Printzesa', en: 'Princess' },
    steps: [
      path('M150 100 L150 60 L175 82 L200 52 L225 82 L250 60 L250 100Z', TRY),
      { b: circle(200, 140, 50, SKIN) + path('M152 114 Q172 126 200 108 Q228 126 248 114 Q244 96 200 96 Q156 96 152 114Z', PHAIR) },
      { bb: path('M138 140 Q128 78 200 78 Q272 78 262 140 L272 245 Q250 255 236 240 L228 165 L172 165 L164 240 Q150 255 128 245Z', PHAIR) },
      circle(182, 144, 6, INK) + circle(218, 144, 6, INK) +
      path('M188 166 Q200 176 212 166') + ellipse(168, 160, 9, 6, CHEEK) + ellipse(232, 160, 9, 6, CHEEK),
      { bbb: rect(188, 180, 24, 30, 0, SKIN) + path('M168 204 Q200 216 232 204 L234 256 L166 256Z', PDRESS) +
        path('M170 250 Q120 300 90 360 L310 360 Q280 300 230 250Z', PDRESS) },
      { bbbb: princessArm + mirror(princessArm), f: path('M292 268 L330 196') + star5(334, 188, 16) },
      circle(200, 72, 6, fill('#ff5d5d')) + circle(166, 84, 4, fill('#5bb8ff')) + circle(234, 84, 4, fill('#5bb8ff')) +
      path('M104 338 Q120 326 136 338 Q152 326 168 338 Q184 326 200 338 Q216 326 232 338 Q248 326 264 338 Q280 326 296 338') +
      path('M178 226 Q200 236 222 226')
    ]
  };

  /* ---------- Sirena ---------- */
  var MHAIR = fill('#ff7043'), MTAIL = fill('#4dd0b0');
  var mermaid = {
    id: 'mermaid', color: '#cdeefc',
    name: { es: 'Sirena', eu: 'Sirena', en: 'Mermaid' },
    steps: [
      circle(200, 110, 46, SKIN),
      { b: path('M152 110 Q148 58 200 58 Q252 58 248 110 Q262 150 250 190 Q268 220 246 236 L226 140 L174 140 L154 236 Q132 220 150 190 Q138 150 152 110Z', MHAIR) },
      { bb: path('M178 150 L172 232 L228 232 L222 150', SKIN) + circle(187, 186, 12, fill('#c39bd3')) + circle(213, 186, 12, fill('#c39bd3')) },
      { bbb: path(tube([[200, 226], [204, 280], [226, 322], [268, 340]], 58, 16).d, MTAIL) },
      { bbbb: path('M262 330 Q300 290 334 300 Q310 330 334 362 Q300 372 262 350Z', MTAIL) },
      { bbbb: path('M222 170 Q262 160 276 120 L292 126 Q280 176 226 190', SKIN) + circle(286, 114, 11, SKIN) +
        path('M176 172 Q130 190 120 230 L136 236 Q144 206 178 194', SKIN) + circle(126, 240, 11, SKIN) },
      circle(184, 110, 5, INK) + circle(216, 110, 5, INK) + path('M188 128 Q200 138 212 128') +
      ellipse(172, 122, 8, 5, CHEEK) + ellipse(228, 122, 8, 5, CHEEK) +
      path('M190 252 q10 10 20 0 M196 276 q10 10 20 0 M206 300 q10 10 20 0') +
      circle(330, 210, 10, fill('#d4f1ff')) + circle(350, 170, 7, fill('#d4f1ff')) + circle(336, 130, 12, fill('#d4f1ff')) +
      path(roundStar(80, 340, 26, 12, 5, 0.3, -Math.PI / 2), fill('#ffa94d'))
    ]
  };

  /* ---------- Dragón ---------- */
  var DRG = fill('#7cc576'), DRB = fill('#ffe08a');
  var dragonSpikes = '';
  for (var ds = -105; ds <= 15; ds += 24) {
    var th = ds * Math.PI / 180, th1 = th - 0.13, th2 = th + 0.13;
    var e = function (t, k) { return [225 + 85 * k * Math.cos(t), 255 + 95 * k * Math.sin(t)]; };
    dragonSpikes += 'M' + pt(e(th1, 0.96)) + ' L' + pt(e(th, 1.24)) + ' L' + pt(e(th2, 0.96)) + ' ';
  }
  var dragon = {
    id: 'dragon', color: '#d4efcc',
    name: { es: 'Dragón', eu: 'Herensugea', en: 'Dragon' },
    steps: [
      { b: ellipse(150, 120, 62, 52, DRG), f: ellipse(100, 145, 42, 32, DRG) },
      { bb: path('M150 72 L160 30 L176 78', DRB) + path('M182 80 L206 46 L204 96', DRB) },
      { bb: ellipse(225, 255, 85, 95, DRG) + ellipse(200, 265, 52, 72, DRB) +
        path('M156 236 Q200 248 244 236 M152 270 Q200 282 248 270 M160 304 Q200 316 240 304') },
      { bbb: path(dragonSpikes, DRB) },
      { bbbb: path('M270 190 Q300 120 362 108 Q350 140 362 162 Q336 160 340 188 Q314 180 292 214Z', fill('#5aa857')) },
      { bbbb: path(tube([[280, 320], [330, 344], [364, 322], [372, 292]], 40, 12).d, DRG) + path('M358 300 L372 262 L390 298Z', DRB),
        bbb: ellipse(180, 350, 32, 16, DRG) + ellipse(262, 350, 32, 16, DRG) },
      circle(152, 106, 13, SNOW) + circle(148, 108, 6, INK) + ellipse(72, 134, 3, 5, INK) + path('M76 160 Q100 172 124 160') +
      ellipse(134, 150, 9, 6, CHEEK) + path('M56 146 Q32 140 18 120 Q36 124 34 108 Q50 124 60 132', fill('#ff9f43'))
    ]
  };

  /* ---------- Calabaza ---------- */
  var PK = fill('#ff9f43'), PK2 = fill('#ff8a1f');
  var bat2 = function (x, y) { return path('M' + x + ' ' + y + ' q10 -12 20 0 q10 -12 20 0 q-10 0 -20 12 q-10 -12 -20 -12Z', INK); };
  var pumpkin = {
    id: 'pumpkin', color: '#ffe0bf',
    name: { es: 'Calabaza', eu: 'Kalabaza', en: 'Pumpkin' },
    steps: [
      ellipse(200, 235, 62, 105, PK),
      { b: ellipse(140, 240, 62, 96, PK2) + ellipse(260, 240, 62, 96, PK2) },
      { bb: ellipse(96, 246, 48, 82, PK) + ellipse(304, 246, 48, 82, PK) },
      { bbb: path('M190 140 L184 92 Q196 82 214 90 L210 140', fill('#7a5a2a')) + path('M214 100 Q240 70 262 90 Q276 104 260 112') +
        path(leaf([214, 112], [270, 128], 14, 0), fill('#5cbf5c')) },
      path('M158 214 L188 214 L173 186Z', INK) + path('M212 214 L242 214 L227 186Z', INK) + path('M192 238 L208 238 L200 226Z', INK) +
      path('M150 258 Q200 300 250 258 L238 268 L226 258 L214 272 L200 262 L186 272 L174 258 L162 268Z', INK),
      circle(340, 60, 28, fill('#fff3b0')) + bat2(50, 70) + bat2(110, 40) + star5(300, 110, 10) + star5(40, 140, 8)
    ]
  };

  /* ---------- Tarta de cumpleaños ---------- */
  var candle = function (x, c) {
    return rect(x, 98, 14, 58, 4, fill(c));
  };
  var flame = function (x) { return path('M' + x + ' 92 Q' + (x - 13) + ' 76 ' + x + ' 56 Q' + (x + 13) + ' 76 ' + x + ' 92Z', TRY); };
  var cake = {
    id: 'cake', color: '#ffe1ea',
    name: { es: 'Tarta', eu: 'Tarta', en: 'Birthday cake' },
    steps: [
      rect(130, 150, 140, 80, 10, fill('#ffb6c8')),
      { b: rect(90, 226, 220, 100, 12, fill('#ffe0b2')) },
      { bb: ellipse(200, 330, 150, 16, GREY) },
      { b: candle(156, '#7fd0ff') + candle(193, '#ffd23f') + candle(230, '#7cc576') },
      flame(163) + flame(200) + flame(237) + path('M163 98 V92 M200 98 V92 M237 98 V92'),
      path(waves(130, 270, 176, 20, -12)) + path(waves(90, 310, 258, 22, -12)) +
      join([[120, 296], [160, 300], [200, 296], [240, 300], [280, 296]], function (p) { return circle(p[0], p[1], 9, fill('#ff5d5d')); }) +
      path('M150 196 l8 4 M180 206 l6 -6 M210 198 l8 2 M240 206 l4 -8 M196 214 l-6 4')
    ]
  };

  /* ---------- León ---------- */
  var LION = fill('#ffd27f'), MANE = fill('#e08a2e');
  var lionEar = circle(150, 140, 24, LION) + circle(150, 140, 11, fill('#f2b25c'));
  var lion = {
    id: 'lion', color: '#fde3b0',
    name: { es: 'León', eu: 'Lehoia', en: 'Lion' },
    steps: [
      circle(200, 200, 72, LION),
      { b: lionEar + mirror(lionEar) },
      { bb: path(scallop(200, 205, 110, 14, 8), MANE) },
      path('M200 222 Q170 210 164 236 Q170 260 200 250 Q230 260 236 236 Q230 210 200 222Z', fill('#fff1d6')) +
      path('M186 210 L214 210 L200 226Z', fill('#8d5a3b')) + path('M200 226 V240'),
      circle(174, 184, 7, INK) + circle(226, 184, 7, INK) + path('M160 168 Q172 160 184 166 M216 166 Q228 160 240 168') +
      circle(180, 236, 2.5, INK) + circle(188, 244, 2.5, INK) + circle(220, 236, 2.5, INK) + circle(212, 244, 2.5, INK) +
      ellipse(152, 220, 10, 6, CHEEK) + ellipse(248, 220, 10, 6, CHEEK)
    ]
  };

  /* ---------- Elefante ---------- */
  var ELE = fill('#b0bec5');
  var eleLeg = function (x) {
    return path('M' + x + ' 270 L' + x + ' 350 L' + (x + 34) + ' 350 L' + (x + 34) + ' 270', ELE) +
      path('M' + (x + 6) + ' 350 q5 -8 10 0 M' + (x + 18) + ' 350 q5 -8 10 0');
  };
  var elephant = {
    id: 'elephant', color: '#dde3ea',
    name: { es: 'Elefante', eu: 'Elefantea', en: 'Elephant' },
    steps: [
      circle(130, 150, 62, ELE),
      { b: ellipse(200, 160, 48, 66, ELE) + ellipse(206, 162, 30, 46, fill('#ffc1d4')) },
      { b: path(tube([[100, 180], [80, 230], [72, 272], [52, 290], [38, 272]], 42, 22).d, ELE) },
      { bb: ellipse(250, 240, 100, 70, ELE) },
      { bbb: eleLeg(170) + eleLeg(212) + eleLeg(272) + eleLeg(310) },
      { bbb: path('M346 226 Q372 240 366 272') + path('M366 270 L356 290 L368 286 L376 292Z', INK),
        f: circle(118, 140, 7, INK) + ellipse(146, 172, 10, 6, CHEEK) + path('M96 196 Q108 204 118 196') },
      circle(36, 240, 6, fill('#7fd0ff')) + circle(22, 214, 7, fill('#7fd0ff')) + circle(46, 206, 6, fill('#7fd0ff')) + circle(30, 180, 8, fill('#7fd0ff'))
    ]
  };

  /* ---------- Panda ---------- */
  var pandaPatch = ellipse(170, 140, 17, 24, DARK + ' transform="rotate(30 170 140)"') + circle(172, 136, 7, SNOW) + circle(173, 137, 3.5, INK);
  var pandaFoot = ellipse(150, 330, 34, 26, DARK) + circle(150, 336, 11, fill('#ffb3c7'));
  var pandaArm = ellipse(116, 258, 24, 46, DARK + ' transform="rotate(25 116 258)"');
  var panda = {
    id: 'panda', color: '#e0ecd8',
    name: { es: 'Panda', eu: 'Panda', en: 'Panda' },
    steps: [
      circle(200, 140, 72, SNOW),
      { b: circle(142, 82, 26, DARK) + circle(258, 82, 26, DARK) },
      pandaPatch + mirror(pandaPatch) + ellipse(200, 166, 12, 8, INK) + path('M188 180 Q194 188 200 180 Q206 188 212 180') +
      ellipse(152, 176, 9, 6, CHEEK) + ellipse(248, 176, 9, 6, CHEEK),
      pandaFoot + mirror(pandaFoot),
      { b: ellipse(200, 270, 92, 80, SNOW) },
      { bb: pandaArm + mirror(pandaArm) },
      { bbbb: rect(326, 80, 20, 290, 4, fill('#7cc576')) + path('M326 160 H346 M326 240 H346 M326 320 H346') +
        path(leaf([346, 156], [384, 126], 9, 0), fill('#5cbf5c')) + path(leaf([326, 236], [292, 206], 9, 0), fill('#5cbf5c')) }
    ]
  };

  /* ---------- Rana ---------- */
  var FRG = fill('#7cc576'), FRL = fill('#d4efb0');
  var frogEye = circle(150, 116, 20, SNOW) + circle(152, 118, 10, INK);
  var frogLeg = ellipse(124, 318, 46, 30, FRG) + path('M84 336 L60 350 M84 336 L66 360 M84 336 L86 362');
  var frogHand = path('M170 344 L158 362 M170 344 L170 364 M170 344 L182 362');
  var frog = {
    id: 'frog', color: '#d4efcc',
    name: { es: 'Rana', eu: 'Igela', en: 'Frog' },
    steps: [
      circle(150, 118, 36, FRG) + circle(250, 118, 36, FRG),
      { b: ellipse(200, 190, 112, 74, FRG) },
      frogEye + mirror(frogEye),
      path('M130 206 Q200 256 270 206') + circle(188, 180, 3, INK) + circle(212, 180, 3, INK) +
      ellipse(116, 214, 12, 7, CHEEK) + ellipse(284, 214, 12, 7, CHEEK),
      { bb: ellipse(200, 290, 86, 66, FRG) + ellipse(200, 300, 54, 44, FRL), f: frogHand + mirror(frogHand) },
      { bbb: frogLeg + mirror(frogLeg) },
      { bbbb: path('M200 364 L60 360 Q20 356 22 334 Q30 308 200 304 Q370 308 378 334 Q380 356 340 360Z', fill('#4caf50')),
        f: ellipse(330, 70, 10, 7, INK) + ellipse(322, 58, 9, 12, fill('#e3f2fd')) + ellipse(338, 58, 9, 12, fill('#e3f2fd')) +
        path('M300 90 q-10 10 -20 0 q-10 -10 -20 0') }
    ]
  };

  /* ======================== PERSONAJES DE DIBUJOS ======================== */
  /* Versiones muy simplificadas para aprender a dibujar (uso educativo).    */

  /* ---------- Peppa Pig y George ---------- */
  var PEP = fill('#ffb3c7'), PEP2 = fill('#ff9fbf');
  var pigHeadSteps = [
    { b: path('M92 92 C130 88 150 96 170 96 C215 90 252 118 250 156 C248 196 214 210 184 208 C150 206 140 160 96 150Z', PEP),
      f: ellipse(90, 121, 18, 31, PEP2) },
    { bb: path('M172 106 L176 70 L196 106', PEP) + path('M206 108 L218 74 L226 120', PEP) },
    circle(124, 114, 10, SNOW) + circle(126, 114, 5, INK) + circle(152, 112, 10, SNOW) + circle(154, 112, 5, INK) +
    ellipse(86, 112, 3, 6, INK) + ellipse(94, 130, 3, 6, INK) + circle(198, 160, 14, fill('#ff7aa8')) + path('M120 168 Q150 190 176 172')
  ];
  var peppa = {
    id: 'peppa', color: '#ffe0ea',
    name: { es: 'Peppa Pig', eu: 'Peppa Pig', en: 'Peppa Pig' },
    steps: pigHeadSteps.concat([
      { bb: path('M158 190 L112 304 Q186 316 260 304 L224 190', SCARF) },
      { f: path('M138 240 L96 222 M96 222 L84 212 M96 222 L84 230 M240 240 L284 222 M284 222 L296 212 M284 222 L296 230'),
        bbb: path('M164 300 V350 M208 300 V350'), b: ellipse(158, 354, 15, 8, INK) + ellipse(202, 354, 15, 8, INK) },
      { f: path('M250 272 q22 -8 20 8 q-2 12 -12 4 q-6 -8 12 -14'), bbbb: ellipse(180, 358, 130, 20, fill('#a1887f')) }
    ])
  };
  var george = {
    id: 'george', color: '#dbeafb',
    name: { es: 'George Pig', eu: 'George Pig', en: 'George Pig' },
    steps: pigHeadSteps.concat([
      { bb: path('M158 190 L132 294 Q190 304 248 294 L224 190', fill('#4fa3e0')) },
      { f: path('M142 238 L100 220 M100 220 L88 210 M100 220 L88 228 M236 238 L278 220'),
        bbb: path('M168 290 V350 M210 290 V350'), b: ellipse(162, 354, 15, 8, INK) + ellipse(204, 354, 15, 8, INK) },
      { b: path('M298 252 Q288 214 298 194 Q306 178 328 180 Q348 184 344 200 Q340 212 322 208 Q314 224 328 242', fill('#7cc576')),
        f: ellipse(322, 258, 32, 22, fill('#7cc576')) + circle(322, 192, 4, INK) + path('M306 278 V292 M336 278 V292'),
        bb: path('M346 250 L378 266 L346 268', fill('#7cc576')) + path('M308 240 L314 226 L322 238 L330 226 L338 240', fill('#5aa857')) }
    ])
  };

  /* ---------- Hello Kitty ---------- */
  var KITTY_RED = fill('#ff3b5c');
  var kittyEar = path('M100 140 L104 70 L160 104', SNOW);
  var kittyWhisk = path('M122 186 L70 176 M120 200 L66 200 M122 214 L70 224');
  var hellokitty = {
    id: 'hellokitty', color: '#ffe0e8',
    name: { es: 'Hello Kitty', eu: 'Hello Kitty', en: 'Hello Kitty' },
    steps: [
      { f: circle(266, 96, 13, KITTY_RED),
        b: ellipse(240, 84, 26, 18, KITTY_RED + ' transform="rotate(-20 240 84)"') + ellipse(292, 84, 26, 18, KITTY_RED + ' transform="rotate(20 292 84)"') },
      { bb: ellipse(200, 175, 118, 84, SNOW) },
      { bbb: kittyEar + mirror(kittyEar) },
      ellipse(150, 182, 9, 13, INK) + ellipse(250, 182, 9, 13, INK) + ellipse(200, 204, 13, 9, TRY),
      kittyWhisk + mirror(kittyWhisk),
      { bbbb: path('M154 246 L130 330 L270 330 L246 246', fill('#5b8fd6')),
        bbbbb: ellipse(128, 282, 16, 28, SNOW + ' transform="rotate(30 128 282)"') + ellipse(272, 282, 16, 28, SNOW + ' transform="rotate(-30 272 282)"') +
        ellipse(166, 336, 26, 13, SNOW) + ellipse(234, 336, 26, 13, SNOW) },
      { bbbb: circle(178, 290, 6, TRY) + circle(222, 290, 6, TRY),
        f: path('M60 70 q-10 -14 0 -18 q6 -2 10 6 q4 -8 10 -6 q10 4 0 18 l-10 10Z', CHEEK) +
        path('M330 300 q-10 -14 0 -18 q6 -2 10 6 q4 -8 10 -6 q10 4 0 18 l-10 10Z', CHEEK) }
    ]
  };

  /* ---------- Bluey y Bingo ---------- */
  function heeler(id, name, col, light, darkC, earTall, bg) {
    var C = fill(col), L = fill(light), D = fill(darkC);
    var ear = earTall ?
      path('M140 100 L118 18 L182 82', C) + path('M146 92 L130 42 L170 84', D) :
      path('M138 104 Q112 40 128 34 Q150 40 182 82', C) + path('M146 94 Q128 52 136 48 Q152 54 170 84', D);
    var arm = path('M152 236 L112 288 L130 302 L158 264', C) + circle(118, 300, 12, L);
    var leg = rect(152, 316, 34, 36, 0, C) + ellipse(166, 354, 22, 11, L);
    return {
      id: id, color: bg,
      name: { es: name, eu: name, en: name },
      steps: [
        ellipse(200, 196, 48, 34, L) + ellipse(200, 172, 16, 11, INK),
        { b: ellipse(200, 150, 84, 76, C) },
        { bb: ear + mirror(ear) },
        circle(168, 138, 8, INK) + circle(232, 138, 8, INK) + path('M156 120 Q166 114 176 118 M224 118 Q234 114 244 120', 'stroke-width="8"') +
        path('M182 206 Q200 220 218 206'),
        { bbb: path('M152 214 L142 330 L258 330 L248 214', C) + ellipse(200, 284, 40, 44, L) },
        { bbbb: arm + mirror(arm) + leg + mirror(leg) },
        { bbbbb: path(tube([[248, 300], [290, 292], [314, 258], [318, 226]], 22, 14).d, C), f: path('M306 244 L326 248') }
      ]
    };
  }
  var bluey = heeler('bluey', 'Bluey', '#7fb6ea', '#f1e4b8', '#3f5fa8', true, '#d8eafb');
  var bingo = heeler('bingo', 'Bingo', '#f5a65b', '#f8ebcb', '#c8662e', false, '#ffe3c8');

  /* ---------- Pandy Paws ---------- */
  var pandyEar = path('M140 96 L130 34 L184 78', DARK);
  var pandyPatch = ellipse(170, 140, 18, 22, DARK + ' transform="rotate(-25 170 140)"') + circle(171, 138, 8, SNOW) + circle(172, 139, 4, INK);
  var pandyWhisk = path('M150 168 L112 160 M150 178 L112 184');
  var pandyArm = ellipse(122, 262, 20, 40, DARK + ' transform="rotate(30 122 262)"');
  var pandypaws = {
    id: 'pandypaws', color: '#efe0f5',
    name: { es: 'Pandy Paws', eu: 'Pandy Paws', en: 'Pandy Paws' },
    steps: [
      circle(200, 140, 70, SNOW),
      { b: pandyEar + mirror(pandyEar) },
      pandyPatch + mirror(pandyPatch),
      path('M190 160 L210 160 L200 172Z', fill('#ff9fbf')) + path('M200 172 V178 M186 180 Q193 188 200 178 Q207 188 214 180') +
      pandyWhisk + mirror(pandyWhisk),
      { b: ellipse(200, 270, 78, 76, SNOW) },
      { bb: pandyArm + mirror(pandyArm) + ellipse(162, 344, 28, 18, DARK) + ellipse(238, 344, 28, 18, DARK) },
      path('M200 262 q-14 -16 -24 -4 q-8 12 24 30 q32 -18 24 -30 q-10 -12 -24 4Z', fill('#ff9fd0')) +
      ellipse(152, 176, 9, 6, CHEEK) + ellipse(248, 176, 9, 6, CHEEK)
    ]
  };

  /* ---------- Cakey Cat ---------- */
  var cakeyEar = path('M140 116 L134 60 L180 96', SNOW) + path('M146 104 L142 74 L168 96', fill('#ffb3c7'));
  var cakeyArm = ellipse(136, 262, 14, 22, SNOW + ' transform="rotate(30 136 262)"');
  var cakey = {
    id: 'cakey', color: '#ffe1ea',
    name: { es: 'Cakey', eu: 'Cakey', en: 'Cakey Cat' },
    steps: [
      ellipse(200, 150, 82, 64, SNOW),
      { b: cakeyEar + mirror(cakeyEar), bb: circle(200, 78, 14, fill('#ff3b3b')) + path('M200 66 Q204 52 216 46') },
      circle(172, 150, 12, INK) + circle(175, 146, 4, SNOW) + circle(228, 150, 12, INK) + circle(231, 146, 4, SNOW) +
      path('M194 168 L206 168 L200 175Z', fill('#ff9fbf')) + path('M188 180 Q194 188 200 178 Q206 188 212 180'),
      { b: path('M140 196 L156 320 L244 320 L260 196', fill('#ff9fd0')) },
      path('M170 214 L176 318 M200 214 V318 M230 214 L224 318'),
      { bb: cakeyArm + mirror(cakeyArm) + ellipse(176, 326, 18, 10, SNOW) + ellipse(224, 326, 18, 10, SNOW) },
      join([[154, 110, -25, '#4cc3ff'], [236, 106, 25, '#ffd23f'], [182, 102, 45, '#6fd36f'], [258, 134, 70, '#ff5d5d'],
        [138, 144, -70, '#b98ae0'], [214, 96, -10, '#ff9f43'], [196, 120, 80, '#ff7aa8']], function (s) {
        return rect(s[0] - 8, s[1] - 3.5, 16, 7, 3.5, fill(s[3]) + ' stroke-width="3" transform="rotate(' + s[2] + ' ' + s[0] + ' ' + s[1] + ')"');
      }) +
      ellipse(150, 176, 10, 6, CHEEK) + ellipse(250, 176, 10, 6, CHEEK)
    ]
  };

  /* ---------- Pocoyó ---------- */
  var PBLUE = fill('#3d8fe0');
  var pocoArm = path('M168 246 L130 280 L144 294 L172 270', PBLUE) + circle(134, 290, 11, SKIN);
  var pocoLeg = rect(170, 314, 26, 26, 0, PBLUE) + ellipse(180, 342, 22, 10, fill('#1f5fa8'));
  var pocoyo = {
    id: 'pocoyo', color: '#d6e8fb',
    name: { es: 'Pocoyó', eu: 'Pocoyo', en: 'Pocoyo' },
    steps: [
      path('M118 152 Q116 62 200 62 Q284 62 282 152 Q200 128 118 152Z', PBLUE),
      { b: circle(200, 160, 78, SKIN) },
      ellipse(174, 182, 11, 14, INK) + circle(178, 176, 4, SNOW) + ellipse(226, 182, 11, 14, INK) + circle(230, 176, 4, SNOW) +
      path('M188 210 Q200 220 212 210') + ellipse(152, 204, 10, 6, CHEEK) + ellipse(248, 204, 10, 6, CHEEK),
      { bb: path('M168 230 L160 320 L240 320 L232 230', PBLUE) },
      { bbb: pocoArm + mirror(pocoArm) + pocoLeg + mirror(pocoLeg) },
      { bbbb: circle(320, 330, 30, fill('#ffd23f')), f: path('M290 330 Q320 320 350 330 M320 300 Q330 330 320 360') }
    ]
  };

  /* ---------- Pikachu ---------- */
  var PIKA = fill('#ffd93d');
  var pikaEar = path('M150 104 L96 22 L176 92', PIKA) + path('M112.2 46.6 L96 22 L120 43 Q116 48 112.2 46.6Z', INK);
  var pikachu = {
    id: 'pikachu', color: '#fff3c4',
    name: { es: 'Pikachu', eu: 'Pikachu', en: 'Pikachu' },
    steps: [
      ellipse(200, 150, 80, 66, PIKA),
      { b: pikaEar + mirror(pikaEar) },
      circle(170, 142, 10, INK) + circle(173, 138, 3.5, SNOW) + circle(230, 142, 10, INK) + circle(233, 138, 3.5, SNOW) +
      ellipse(200, 158, 4, 3, INK) + path('M186 170 Q193 178 200 170 Q207 178 214 170') +
      circle(144, 172, 15, fill('#ff5d5d')) + circle(256, 172, 15, fill('#ff5d5d')),
      { bb: ellipse(200, 280, 70, 76, PIKA) },
      { f: ellipse(168, 250, 11, 16, PIKA + ' transform="rotate(-35 168 250)"') + ellipse(232, 250, 11, 16, PIKA + ' transform="rotate(35 232 250)"'), bbb: ellipse(170, 352, 24, 12, PIKA) + ellipse(230, 352, 24, 12, PIKA) },
      { bbbb: path('M262 300 L300 270 L282 250 L340 200 L318 186 L372 130 L320 150 L336 168 L284 210 L300 228 L256 262Z', PIKA) }
    ]
  };

  /* Orden de la galería: personajes, animales, naturaleza, fiestas, fantasía y objetos/transportes */
  global.DRAWINGS = [
    peppa, george, bluey, bingo, hellokitty, pikachu, pocoyo, pandypaws, cakey,
    giraffe, dog, cat, bunny, pig, monkey, bear, lion, elephant, panda, leopard, rhino, dinosaur, penguin, owl, frog,
    fish, dolphin, octopus, crab, starfish, shark, turtle, snake, snail,
    bee, ladybird, butterfly, spider, bat,
    flower, island, rainbow,
    xmastree, snowman, santa, olentzero, maridomingi, reindeer, pumpkin, cake,
    unicorn, dragon, princess, mermaid, ghost, gnome,
    house, castle, rollercoaster, car, firetruck, train, motorbike, sailboat, plane, balloon, rocket, astronaut, robot, icecream
  ];
})(window);
