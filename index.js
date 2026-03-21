require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus
} = require('@discordjs/voice');

const ytdlp = require('yt-dlp-exec');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent
  ]
});

let player = createAudioPlayer();

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (!message.content.startsWith('!')) return;

  const args = message.content.split(' ');
  const command = args[0];

  if (command === '!play') {
    const url = args[1];
    if (!url) return message.reply('Add a YouTube URL after "!play".');

    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) return message.reply('Join a voice channel first.');

    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: message.guild.id,
      adapterCreator: message.guild.voiceAdapterCreator
    });

    try {
      const stream = ytdlp.exec(url, {
        format: 'bestaudio',
        output: '-'
      });

      const resource = createAudioResource(stream.stdout);

      connection.subscribe(player);
      player.play(resource);

      message.reply('Playing...');

    } catch (err) {
      console.error(err);
      message.reply('Error playing audio.');
    }
  }
  if (command === '!blyat') {
    const url = "https://www.youtube.com/watch?v=uQFMUv_cQBk"

    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) return message.reply('Blyat, join a voice channel first.');

    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: message.guild.id,
      adapterCreator: message.guild.voiceAdapterCreator
    });

    try {
      const stream = ytdlp.exec(url, {
        format: 'bestaudio',
        output: '-'
      });

      const resource = createAudioResource(stream.stdout);

      connection.subscribe(player);
      player.play(resource);

    } catch (err) {
      console.error(err);
      message.reply('Error playing audio.');
    }
  }
  if (command === '!stop' | command === '!stfu') {
    player.stop();
    message.reply('Stopped.');
  }
});

client.login(process.env.TOKEN);