const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  StreamType,
} = require('@discordjs/voice');
const play = require('play-dl');

// Un estado de cola/reproductor por servidor (guildId)
const guildStates = new Map();

function getGuildState(guildId) {
  if (!guildStates.has(guildId)) {
    guildStates.set(guildId, {
      connection: null,
      player: null,
      queue: [],
      playing: false,
    });
  }
  return guildStates.get(guildId);
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout: ${label} tardó más de ${ms / 1000}s`)), ms)
    ),
  ]);
}

async function playNext(guildId, textChannel) {
  const state = getGuildState(guildId);

  if (state.queue.length === 0) {
    state.playing = false;
    return;
  }

  const nextTrack = state.queue.shift();
  state.playing = true;

  console.log(`[${guildId}] Pidiendo stream para: ${nextTrack.title} (${nextTrack.url})`);

  try {
    const stream = await withTimeout(play.stream(nextTrack.url), 15_000, 'play.stream');
    console.log(`[${guildId}] Stream obtenido, arrancando reproducción.`);

    const resource = createAudioResource(stream.stream, {
      inputType: stream.type,
    });

    state.player.play(resource);
    await textChannel?.send(`Reproduciendo ahora: **${nextTrack.title}**`);
  } catch (err) {
    console.error(`[${guildId}] Error al reproducir el track:`, err);
    try {
      await textChannel?.send(
        `No pude reproducir **${nextTrack.title}** (${err.message || 'error desconocido'}). Paso al siguiente si hay más en la cola.`
      );
    } catch (sendErr) {
      console.error(`[${guildId}] Encima falló mandar el mensaje de error:`, sendErr);
    }
    playNext(guildId, textChannel);
  }
}

async function resolveTrack(query) {
  const isUrl = play.yt_validate(query) === 'video';

  if (isUrl) {
    const info = await withTimeout(play.video_info(query), 15_000, 'play.video_info');
    return {
      url: query,
      title: info.video_details.title,
    };
  }

  // No es un link: lo tratamos como búsqueda por nombre y usamos el primer resultado
  const results = await withTimeout(
    play.search(query, { source: { youtube: 'video' }, limit: 1 }),
    15_000,
    'play.search'
  );
  if (!results || results.length === 0) {
    throw new Error('No se encontraron resultados para esa búsqueda.');
  }

  return {
    url: results[0].url,
    title: results[0].title,
  };
}

async function addToQueueAndPlay({ guildId, voiceChannel, textChannel, url }) {
  const state = getGuildState(guildId);

  console.log(`[${guildId}] Resolviendo track para: ${url}`);
  const track = await resolveTrack(url);
  console.log(`[${guildId}] Track resuelto: ${track.title}`);

  // Conectar al canal de voz si todavía no está conectado
  if (!state.connection) {
    console.log(`[${guildId}] Conectando al canal de voz ${voiceChannel.id}...`);
    state.connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true,
    });

    let ready = false;
    try {
      await entersState(state.connection, VoiceConnectionStatus.Ready, 30_000);
      ready = true;
      console.log(`[${guildId}] Conexión de voz lista.`);
    } catch (err) {
      console.error(`[${guildId}] La conexión de voz nunca llegó a "Ready" en 30s:`, err.message || err);
      state.connection.destroy();
      state.connection = null;
      await textChannel?.send(
        'No pude establecer la conexión de voz a tiempo. Esto suele pasar por restricciones de red del hosting (UDP bloqueado), no por el bot en sí.'
      );
      return { started: false, title: track.title, failed: true };
    }

    state.player = createAudioPlayer();
    state.connection.subscribe(state.player);

    state.player.on(AudioPlayerStatus.Idle, () => {
      playNext(guildId, textChannel);
    });

    state.player.on('error', (error) => {
      console.error(`[${guildId}] Error del audio player:`, error);
      playNext(guildId, textChannel);
    });
  }

  state.queue.push(track);

  if (!state.playing) {
    await playNext(guildId, textChannel);
    return { started: true, title: track.title };
  }

  return { started: false, title: track.title, position: state.queue.length };
}

function pause(guildId) {
  const state = getGuildState(guildId);
  if (state.player) {
    state.player.pause();
    return true;
  }
  return false;
}

function resume(guildId) {
  const state = getGuildState(guildId);
  if (state.player) {
    state.player.unpause();
    return true;
  }
  return false;
}

function skip(guildId) {
  const state = getGuildState(guildId);
  if (state.player) {
    // Al detener el track actual, el evento "Idle" dispara playNext automáticamente
    state.player.stop();
    return true;
  }
  return false;
}

function stop(guildId) {
  const state = getGuildState(guildId);
  state.queue = [];
  state.playing = false;

  if (state.player) {
    state.player.stop();
  }
  if (state.connection) {
    state.connection.destroy();
    state.connection = null;
  }
}

module.exports = {
  addToQueueAndPlay,
  pause,
  resume,
  skip,
  stop,
  getGuildState,
};
