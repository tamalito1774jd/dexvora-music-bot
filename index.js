require('dotenv').config();
const http = require('http');
const { Client, GatewayIntentBits } = require('discord.js');
const play = require('play-dl');
const musicManager = require('./musicManager');

const PREFIX = '.';

// Si hay una cookie de YouTube configurada, se la pasamos a play-dl.
// Esto hace que los pedidos vayan autenticados en vez de anónimos, lo que
// reduce bastante los bloqueos "429 Too Many Requests" que YouTube aplica
// a las IPs compartidas de hostings como Render.
if (process.env.YOUTUBE_COOKIE) {
  play.setToken({
    youtube: {
      cookie: process.env.YOUTUBE_COOKIE,
    },
  });
  console.log('Cookie de YouTube cargada para play-dl.');
} else {
  console.log('No hay YOUTUBE_COOKIE configurada: los pedidos van anónimos y son más propensos a bloqueos 429.');
}

// Si algo revienta sin que lo hayamos capturado, lo logueamos pero NO
// dejamos que tumbe todo el proceso (antes esto hacía que Render reiniciara
// el bot entero por un solo video que fallaba).
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection (no crashea el proceso):', err);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (no crashea el proceso):', err);
});

// Servidor HTTP mínimo: Render (plan free) necesita que el servicio escuche
// un puerto para no marcarlo como caído. También es el endpoint que
// UptimeRobot (u otro ping externo) usa para evitar que Render lo duerma.
const PORT = process.env.PORT || 3000;
http
  .createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Dexvora Music bot activo.');
  })
  .listen(PORT, () => {
    console.log(`Servidor HTTP de keep-alive escuchando en el puerto ${PORT}`);
  });

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', () => {
  console.log(`Bot conectado como ${client.user.tag}`);
});

// ---- Lógica compartida entre slash commands y comandos con prefijo "." ----

async function handlePlay({ guildId, voiceChannel, textChannel, query, reply }) {
  if (!voiceChannel) {
    return reply('Tenés que estar en un canal de voz para usar esto.');
  }

  if (!query || !query.trim()) {
    return reply('Pasame un link de YouTube o el nombre de una canción. Ej: `.play never gonna give you up`');
  }

  const pending = await reply('Procesando...');

  try {
    const result = await musicManager.addToQueueAndPlay({
      guildId,
      voiceChannel,
      textChannel,
      url: query,
    });

    const text = result.started
      ? `Uniéndome y reproduciendo: **${result.title}**`
      : `Agregado a la cola (posición ${result.position}): **${result.title}**`;

    if (pending?.edit) {
      await pending.edit(text);
    } else {
      await textChannel.send(text);
    }
  } catch (err) {
    console.error(err);
    const errText = 'No pude encontrar o reproducir eso. Probá con otro link o nombre.';
    if (pending?.edit) {
      await pending.edit(errText);
    } else {
      await textChannel.send(errText);
    }
  }
}

function handlePause({ guildId, reply }) {
  const ok = musicManager.pause(guildId);
  return reply(ok ? 'Pausado.' : 'No hay nada reproduciéndose ahora.');
}

function handleSkip({ guildId, reply }) {
  const ok = musicManager.skip(guildId);
  return reply(ok ? 'Saltando al siguiente...' : 'No hay nada reproduciéndose ahora.');
}

function handleStop({ guildId, reply }) {
  musicManager.stop(guildId);
  return reply('Detenido y salí del canal de voz.');
}

// ---- Comandos con prefijo "." ----

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();

  const guildId = message.guild.id;
  const voiceChannel = message.member?.voice?.channel;
  const textChannel = message.channel;
  const reply = (text) => message.reply(text);

  if (command === 'play') {
    const query = args.join(' ');
    return handlePlay({ guildId, voiceChannel, textChannel, query, reply });
  }
  if (command === 'pause') {
    return handlePause({ guildId, reply });
  }
  if (command === 'skip') {
    return handleSkip({ guildId, reply });
  }
  if (command === 'stop') {
    return handleStop({ guildId, reply });
  }
});

// ---- Slash commands ----

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, guildId, member, channel } = interaction;
  const voiceChannel = member.voice.channel;

  if (commandName === 'play') {
    const query = interaction.options.getString('link');

    if (!voiceChannel) {
      return interaction.reply('Tenés que estar en un canal de voz para usar esto.');
    }

    await interaction.deferReply();
    return handlePlay({
      guildId,
      voiceChannel,
      textChannel: channel,
      query,
      reply: (text) => interaction.editReply(text),
    });
  }

  if (commandName === 'pause') {
    return handlePause({ guildId, reply: (text) => interaction.reply(text) });
  }

  if (commandName === 'skip') {
    return handleSkip({ guildId, reply: (text) => interaction.reply(text) });
  }

  if (commandName === 'stop') {
    return handleStop({ guildId, reply: (text) => interaction.reply(text) });
  }
});

client.login(process.env.DISCORD_TOKEN);
