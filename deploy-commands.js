require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Reproduce un video de YouTube por link o busca por nombre de canción')
    .addStringOption(option =>
      option.setName('link')
        .setDescription('Link de YouTube o nombre de la canción')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pausa la reproducción actual'),
  new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Salta a la siguiente canción en la cola'),
  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Detiene la música y saca al bot del canal de voz'),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Registrando slash commands...');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('Slash commands registrados con éxito.');
  } catch (error) {
    console.error(error);
  }
})();
