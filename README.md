# ¡A dibujar! — Dibujos paso a paso para niños

Aplicación web muy sencilla para que los niños aprendan a dibujar animales y objetos paso a paso.
Funciona en móvil, tablet y TV LG (webOS). Es solo HTML + CSS + JavaScript: no hay backend, ni cuentas,
ni se guarda el progreso. Lo único que se guarda en el dispositivo es el idioma elegido.

## Cómo funciona

1. **Inicio**: dos botones grandes, **Elegir dibujo** (galería) y **¡Sorpresa!** (un dibujo al azar).
2. **Pasos**: se muestra una imagen por paso. Lo nuevo de cada paso aparece en **rosa** y se dibuja solo
   con una animación; lo de los pasos anteriores queda en negro. Arriba están los puntos de progreso y,
   en la esquina, una miniatura de cómo quedará el dibujo.
   - Para avanzar o retroceder: botones ◀ ▶, deslizar el dedo, flechas del teclado o del mando.
   - Tocar el dibujo repite la animación del paso.
3. **¡Muy bien!**: se muestra el dibujo terminado y coloreado (para animar a colorearlo), con opciones
   para repetir, otro al azar, elegir otro o volver al inicio.

Idiomas: castellano, euskera e inglés (botones ES / EU / EN en el inicio).

## Dibujos incluidos (40)

Cada dibujo tiene entre 4 y 8 pasos.

- **Animales:** jirafa, perro, gato, conejo, cerdito, mono, osito, leopardo, rinoceronte, dinosaurio,
  pingüino, búho, pez, delfín, pulpo, cangrejo, estrella de mar, tiburón, tortuga marina, serpiente,
  caracol, abeja, mariquita, mariposa, araña y murciélago.
- **Naturaleza:** flor, isla con palmera, arcoíris y árbol de Navidad.
- **Objetos y fantasía:** casa, castillo, coche, moto, barco de vela, cohete, robot, fantasma, duende y helado.

Los 18 primeros que se hicieron están **redibujados en SVG (vectorial)** siguiendo los pasos de las fichas
de `examples/`; los demás son diseños propios con el mismo estilo y dificultad. Ninguno reutiliza las imágenes
originales, que tienen copyright de Twinkl. La carpeta `examples/` es solo material de referencia:
**no la publiques** junto con la app.

## Probar en local

```bash
node tools/serve.js
```

Abre `http://localhost:8080`. Para probar en un móvil o tablet conectado a la misma Wi-Fi, usa la
dirección `http://192.168.x.x:8080` que muestra el script.

También se puede abrir `index.html` directamente con doble clic, aunque así no funciona el modo sin conexión.

Herramientas de desarrollo:

- `tools/preview.html` muestra todos los dibujos con todos sus pasos en una sola página (para revisarlos).
- `tools/devices.html?r=gallery` muestra la app a la vez en móvil, tablet y TV (`r` = ruta, p. ej. `draw/cat/2`).

## Publicar (móvil y tablet)

Basta con subir estos ficheros a cualquier hosting estático con HTTPS (GitHub Pages, Netlify, el servidor
web del centro...):

```
index.html  manifest.webmanifest  sw.js  css/  js/  img/
```

Con HTTPS, la app se puede **instalar en la pantalla de inicio** (Android: menú ⋮ → *Instalar app*;
iPad/iPhone: Compartir → *Añadir a pantalla de inicio*). Después funciona **sin conexión**.
Cuando publiques cambios, sube el número de `CACHE` en `sw.js` (`a-dibujar-v2`, ...) para que los
dispositivos descarguen la versión nueva.

## TV LG (webOS)

La app ya está preparada para el mando: las flechas mueven el foco (resaltado en rosa), **OK** pulsa,
**Atrás** vuelve a la pantalla anterior y sale de la app desde el inicio. En la pantalla de pasos,
◀ ▶ cambian de paso directamente. El puntero del Magic Remote también funciona.

### 1. Generar el paquete `.ipk`

```bash
npm install -g @webos-tools/cli      # una sola vez
node tools/build-webos.js
```

Esto crea `dist/webos/app/` (la app con su `appinfo.json`, iconos y pantalla de carga) y, si encuentra
`ares-package`, también genera `dist/com.adibujar.app_1.0.0_all.ipk`.

### 2. Instalarlo en la TV (modo desarrollador)

1. En la TV, instala la app **Developer Mode** desde la LG Content Store e inicia sesión con una cuenta de
   [LG Developer](https://webostv.developer.lge.com/) (gratuita). Activa *Dev Mode Status* y *Key Server*;
   la TV se reinicia.
2. En el ordenador (misma red), registra la TV con la IP y la passphrase que muestra la app Developer Mode:
   ```bash
   ares-setup-device            # añade un dispositivo llamado "tv"
   ares-novacom --device tv --getkey
   ```
3. Instala y lanza:
   ```bash
   ares-install --device tv dist/com.adibujar.app_1.0.0_all.ipk
   ares-launch  --device tv com.adibujar.app
   ```

El modo desarrollador caduca a las 50 horas; desde la app Developer Mode se puede ampliar.
Para distribuirla en muchas TV sin modo desarrollador habría que publicarla en la LG Content Store
(requiere revisión de LG).

**Alternativa sin instalar nada:** publica la web (ver arriba) y ábrela con el navegador de la TV.
También detecta la TV y activa la navegación con el mando. Si no la detecta, añade `?tv=1` a la URL.

Para cambiar el identificador, la versión o el nombre de la app en la TV, edita `webos/appinfo.json`.

### Compatibilidad

Pensada para **webOS 5 o posterior** (TV de 2020 en adelante, Chromium 68+). Las TV con webOS 4
(2018–2019) usan un navegador sin CSS Grid y la maquetación no se vería bien.

## Añadir un dibujo nuevo

Los dibujos están en `js/drawings.js`. Cada uno es un objeto con su lista de pasos. Cada paso es un
fragmento SVG en un lienzo de 400×400:

```js
var sol = {
  id: 'sun', color: '#fff0a8',
  name: { es: 'Sol', eu: 'Eguzkia', en: 'Sun' },
  steps: [
    '<circle cx="200" cy="200" r="80" fill="#ffd23f"/>',                 // paso 1
    { b: '<path d="M200 60 V100 M200 300 V340 M60 200 H100 M300 200 H340"/>' },  // paso 2 (detrás)
    '<circle class="ink" cx="175" cy="190" r="8"/><circle class="ink" cx="225" cy="190" r="8"/>' +
    '<path d="M170 225 Q200 250 230 225"/>'                              // paso 3
  ]
};
```

Después se añade a la lista `DRAWINGS` del final del fichero.

- `fill="#color"`: color en el dibujo final coloreado. En los pasos se ve como papel blanco.
- `class="ink"`: relleno del color de la línea (ojos, narices...).
- `class="guide"`: línea de ayuda discontinua que desaparece en el dibujo final.
- Capas `{ bbb, bb, b, f }`: lo más al fondo / muy detrás / detrás / delante (por defecto). Sirven para que,
  por ejemplo, las patas queden detrás del cuerpo sin tener que calcular dónde se cruzan.
- Hay utilidades para formas comunes: `tube()` (tentáculos, colas, troncos), `blob()` (manchas), `roundStar()`,
  `leaf()` (hojas), `band()`/`arcLine()` (arcos), `spiral()`, `waves()` (olas), `rect()` y
  `mirror()` (repetir algo en espejo para el lado derecho).
- El orden de la galería es el de la lista `DRAWINGS`.

Revisa el resultado con `tools/preview.html` (o `tools/preview.html?ids=sun` para ver solo uno).

## Estructura

```
index.html            pantallas de la app
css/styles.css        interfaz (responsive móvil / tablet / TV)
css/art.css           estilo de los dibujos (paso actual en rosa, modo coloreado...)
js/drawings.js        los dibujos y sus pasos (SVG)
js/art.js             renderizado y animación de los pasos
js/i18n.js            textos ES / EU / EN
js/app.js             navegación, mando a distancia, gestos
sw.js, manifest.webmanifest   PWA (instalable y sin conexión)
img/                  iconos de la PWA
webos/                appinfo.json e iconos de la app para LG webOS
tools/                servidor local, empaquetado webOS, iconos y páginas de revisión
examples/             fichas originales de referencia (no publicar)
```

Para regenerar los iconos tras cambiar su diseño (en `tools/make-icons.js`): `node tools/make-icons.js`
(usa Chrome o Edge instalados).
