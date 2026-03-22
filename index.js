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

const guilds = new Map();

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// GUILD STATE
function getGuildState(guildId) {
  if (!guilds.has(guildId)) {
    guilds.set(guildId, {
      connection: null,
      player: createAudioPlayer(),
      queue: [],
      isPlaying: false
    });
  }
  return guilds.get(guildId);
}

// SEARCH / INFO
async function getVideoInfo(query) {
  try {
    const result = await ytdlp(query, {
      dumpSingleJson: true,
      noWarnings: true,
      preferFreeFormats: true,
      addHeader: ['referer:youtube.com', 'user-agent:googlebot'],
      format: 'bestaudio',
    });

    return {
      title: result.title,
      url: result.webpage_url
    };
  } catch (err) {
    console.error('Search error:', err);
    return null;
  }
}

// PLAYBACK
async function playNext(guildId) {
  const state = getGuildState(guildId);

  if (state.queue.length === 0) {
    state.isPlaying = false;
    return;
  }

  state.isPlaying = true;
  const song = state.queue.shift();

  try {
    const stream = ytdlp.exec(song.url, {
      format: 'bestaudio',
      output: '-'
    });

    const resource = createAudioResource(stream.stdout);

    state.player.play(resource);

    console.log(`Now playing: ${song.title}`);

  } catch (err) {
    console.error('Playback error:', err);
    playNext(guildId);
  }
}

// COMMAND HANDLER
client.on('messageCreate', async (message) => {
  if (!message.content.startsWith('!') || message.author.bot) return;

  const args = message.content.split(' ');
  const command = args[0];
  const query = args.slice(1).join(' ');

  const state = getGuildState(message.guild.id);


  // PLAY / NEXT

  if (command === '!play' || command === '!next' || command === '!blyat') {
    if (command !== '!blyat' && !query) return message.reply('Give me a URL or search term.');

    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) return message.reply('Join a voice channel first.');

    // connect if not already
    if (!state.connection) {
      state.connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator
      });

      state.connection.subscribe(state.player);

      state.player.on(AudioPlayerStatus.Idle, () => {
        playNext(message.guild.id);
      });
    }

    let video;

    if (command === '!blyat') {
        video = await getVideoInfo("https://www.youtube.com/watch?v=uQFMUv_cQBk")
    }
    else if (query.startsWith('http')) {
      video = await getVideoInfo(query);
    } 
    else {
      video = await getVideoInfo(`ytsearch1:${query}`);
    }

    if (!video) return message.reply('Could not find anything.');

    if (command === '!next') {
      state.queue.unshift(video);
      message.reply(`Next: ${video.title}`);
    } else {
      state.queue.push(video);
      if (command !== "!blyat"){
        message.reply(`Queued: ${video.title}`);
        }
      
    }

    if (!state.isPlaying) {
      playNext(message.guild.id);
    }
  }


  // SKIP

  if (command === '!skip') {
    state.player.stop();
    message.reply('Skipped.');
  }


  // QUEUE

  if (command === '!queue') {
    if (state.queue.length === 0) {
      return message.reply('Queue is empty.');
    }

    const list = state.queue
      .map((song, i) => `${i + 1}. ${song.title}`)
      .join('\n');

    message.reply(`Queue:\n${list}`);
  }


  // STOP

  if (command === '!stop' || command === '!stfu') {
    state.queue = [];
    state.player.stop();
    message.reply('Stopped and cleared queue.');
  }
});

client.login(process.env.TOKEN);