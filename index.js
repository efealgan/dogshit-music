require('dotenv').config();

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
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
      isPlaying: false,
      current: null
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
    });

    // If it's a search result, yt-dlp returns entries[]
    const video = result.entries ? result.entries[0] : result;

    if (!video) return null;

    return { //basically only url is needed for playback. the rest is for finding lyrics.
    title: video.title || 'Unknown title',
    url: video.webpage_url || video.url,
    artist: video.artist || video.uploader || null,
    duration: video.duration || null,
    query: query  //to use in some fallbacks
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

    state.current = song;
    console.log(`Now playing: ${song.title}`);

  } catch (err) {
    console.error('Playback error:', err);
    playNext(guildId);
  }
}
function cleanTitle(title) {
  return title
    .replace(/\(.*?\)/g, '')     // remove (Official Video)
    .replace(/\[.*?\]/g, '')     // remove [HD], etc.
    .replace(/official/gi, '')
    .replace(/video/gi, '')
    .replace(/lyrics?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractArtistTitle(title) {
  const cleaned = cleanTitle(title);

  // Try "Artist - Track"
  const parts = cleaned.split(' - ');

  if (parts.length >= 2) {
    return {
      artist: parts[0].trim(),
      title: parts.slice(1).join(' - ').trim()
    };
  }

  return {
    artist: null,
    title: cleaned
  };
}

async function fetchLyrics(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    return data.plainLyrics || data.syncedLyrics || null;
  } catch {
    return null;
  }
}

async function getLyrics(song) {
  const attempts = [];

  const parsed = extractArtistTitle(song.title);

  // 1. Clean parsed artist/title
  if (parsed.artist && parsed.title) {
    attempts.push(
      `https://lrclib.net/api/get?artist_name=${encodeURIComponent(parsed.artist)}&track_name=${encodeURIComponent(parsed.title)}`
    );
  }

  // 2. Original query (cleaned)
  if (song.query) {
    attempts.push(
      `https://lrclib.net/api/search?q=${encodeURIComponent(song.query)}`
    );
  }

  // 3. Clean title only
  if (parsed.title) {
    attempts.push(
      `https://lrclib.net/api/search?q=${encodeURIComponent(parsed.title)}`
    );
  }

  const unique = [...new Set(attempts)];

  for (const url of unique) {
    const lyrics = await fetchLyrics(url);
    if (lyrics) {
      console.log('Lyrics found using:', url);
      return lyrics;
    } else {
      console.log('Failed attempt:', url);
    }
  }

  return null;
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

  // LYRICS

  if (command === '!lyrics') {
    if (!state.current) {
      return message.reply('Nothing is playing.');
    }
  
    //message.reply('Fetching lyrics...');
  
    const lyrics = await getLyrics(state.current);
    if (!lyrics) {
      return message.reply('Could not find lyrics.');
    }
  
    const chunks = lyrics.match(/[\s\S]{1,4000}/g); // embed limit
  
    for (let i = 0; i < chunks.length; i++) {
      const embed = new EmbedBuilder()
        .setTitle(`Lyrics: ${state.current.title}`)
        .setDescription(chunks[i]);
    
      await message.channel.send({ embeds: [embed] });
    }
  }
});

client.login(process.env.TOKEN);