# Bot de música para Discord

Reproduce el **audio** de un video de YouTube en el canal de voz donde estés, usando slash commands. No descarga ni guarda archivos: transmite el audio en vivo.

## Comandos

- `/play link:<url o nombre>` — Une al bot a tu canal de voz (si no está) y reproduce (o encola) el audio. Podés pasar un link de YouTube **o** el nombre de una canción; si no es un link, el bot busca en YouTube y reproduce el primer resultado.
- `/pause` — Pausa la reproducción actual.
- `/skip` — Salta al siguiente track en la cola.
- `/stop` — Corta la música, vacía la cola y saca al bot del canal.

## Requisitos

- Node.js 18 o superior instalado en tu PC/VPS.
- Una aplicación de Discord con un bot creado en https://discord.com/developers/applications

## Instalación

1. Copiá esta carpeta a tu PC o VPS.
2. Instalá las dependencias:
   ```
   npm install
   ```
3. Renombrá `.env.example` a `.env` y completá:
   - `DISCORD_TOKEN`: el token del bot (pestaña "Bot" en el portal de desarrolladores).
   - `CLIENT_ID`: el "Application ID" de tu aplicación.
4. Invitá al bot a tu servidor con estos permisos/scopes: `bot`, `applications.commands`, y en permisos del bot: **Connect** y **Speak** (canal de voz), más **Send Messages**.
5. Registrá los slash commands (solo hace falta una vez, o cada vez que cambies los comandos):
   ```
   npm run deploy
   ```
6. Iniciá el bot:
   ```
   npm start
   ```

## Hostear gratis en Render (Web Service + keep-alive)

Render no tiene plan gratis para "Background Workers", pero sí para "Web Services". Este bot ya trae un mini servidor HTTP incluido para poder usar esa modalidad gratis.

1. En Render: **New** → **Web Service** (no Worker) → conectá el repo.
2. Configuración:
   - **Build Command:** `npm install`
   - **Start Command:** `node index.js`
   - **Instance Type:** Free
3. Agregá las variables de entorno `DISCORD_TOKEN` y `CLIENT_ID`.
4. Deploy. Una vez arriba, Render te da una URL pública (algo como `https://dexvora-music-bot.onrender.com`).
5. Andá a [uptimerobot.com](https://uptimerobot.com), creá una cuenta gratis, y armá un **monitor HTTP(s)** que le pegue a esa URL cada 5 minutos. Esto evita que Render duerma el servicio por inactividad.

**Limitación a tener en cuenta:** aunque esto funciona la mayoría del tiempo, el free tier de Render puede igualmente reiniciar o dormir el servicio en algún momento. Si pasa mientras el bot está reproduciendo audio en una llamada, se corta la conexión de voz y hay que volver a usar `/play`. No es 100% confiable para uso serio 24/7 — si en algún momento el server crece y esto molesta, la alternativa más estable (aunque no gratis) es el plan Starter de Background Workers ($7/mes).

## Solucionar el error "Got 429 from the request" (bloqueo de YouTube)

Si en los logs de Render ves algo como `Error: Got 429 from the request`, es YouTube bloqueando pedidos anónimos desde la IP compartida del hosting — un problema muy común en Render, Railway, Heroku, etc., porque miles de bots usan las mismas IPs.

Este proyecto ya trae dos mitigaciones:

1. **El bot ya no se cae entero** por un error de este tipo (antes tumbaba todo el proceso; ahora lo loguea y sigue funcionando para el resto de los comandos).
2. **Autenticación opcional con cookie de YouTube**, que reduce bastante los bloqueos porque el pedido deja de ser 100% anónimo. Para configurarla:

### Cómo conseguir la cookie de YouTube

1. Iniciá sesión en YouTube desde Chrome o Firefox (podés usar una cuenta cualquiera, no hace falta que sea la tuya principal).
2. Instalá una extensión para exportar cookies, por ejemplo "Get cookies.txt LOCALLY" (Chrome) o "cookies.txt" (Firefox).
3. Andá a youtube.com, abrí la extensión y exportá las cookies del sitio.
4. Copiá el contenido en formato de cookie de header (la extensión suele tener una opción "copy as header string" o similar) — tiene que quedar como una sola línea tipo `VISITOR_INFO1_LIVE=xxx; CONSENT=xxx; ...`
5. En Render, andá a tu servicio → **Environment** → agregá una variable `YOUTUBE_COOKIE` con ese valor pegado.
6. Redeploy del servicio.

**Importante:** esa cookie identifica tu sesión de YouTube. No la compartas en ningún lado público (ni en el código del repo, ni en chats). Va solo como variable de entorno en Render, nunca en el `.env` que subís al repo.

**Aviso honesto:** esto reduce el bloqueo, pero no lo elimina al 100% — sigue siendo un tema del lado de YouTube y puede variar con el tiempo. Si el bloqueo persiste incluso con cookie, la alternativa más confiable es hostear en una VPS con IP residencial/dedicada en vez de un hosting compartido tipo Render.

## Notas importantes

- Esto transmite **audio**, no video. Discord no permite que un bot transmita video/cámara en una llamada de voz — eso es una función exclusiva de clientes de usuario (compartir pantalla), no de la API de bots.
- Para mantenerlo corriendo 24/7 en tu VPS, te conviene usar `pm2`:
  ```
  npm install -g pm2
  pm2 start index.js --name music-bot
  pm2 save
  ```
- Si en el futuro querés meter esto adentro de tu proyecto "Discord Studio", los archivos `musicManager.js` y los comandos de `index.js` se pueden migrar tal cual a esa base de código.
