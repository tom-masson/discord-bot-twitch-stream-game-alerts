import {config} from 'dotenv';
import {ApiClient} from '@twurple/api';
import {AppTokenAuthProvider} from '@twurple/auth';
import axios from 'axios';
import {Client, EmbedBuilder, GatewayIntentBits, TextChannel} from 'discord.js';

// Load environment variables
config();

const clientId = process.env.TWITCH_CLIENT_ID as string;
const clientSecret = process.env.TWITCH_CLIENT_SECRET as string;
const discordToken = process.env.DISCORD_BOT_TOKEN as string;
const discordTwitchChannel = process.env.DISCORD_TWITCH_CHANNEL as string;
const gameName = process.env.GAME_NAME as string;
let gameId: string | null = null;
let discordChannel: TextChannel | null = null;

if (
  !clientId ||
  !clientSecret ||
  !discordTwitchChannel ||
  !discordToken ||
  !gameName
) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const authProvider = new AppTokenAuthProvider(clientId, clientSecret);
const apiClient = new ApiClient({authProvider});

// Discord client setup
const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// Cache to store notified streamer names
const notifiedStreamers = new Set<string>();
async function setGameIdFromName() {
  const resp = await apiClient.games.getGameByName(gameName);
  if (!resp?.id) {
    console.error('gameId null');
    process.exit(1);
  }
  gameId = resp?.id;
  console.log(gameId);
}

async function checkStreamsAndNotify() {
  try {
    if (!gameId) return;
    const streams = await apiClient.streams.getStreams({
      game: gameId,
    });

    const currentStreamers = new Set<string>();
    console.log(`${streams.data.length} streamers`);

    for (const stream of streams.data) {
      const streamerName = stream.userDisplayName;
      currentStreamers.add(streamerName);

      if (!notifiedStreamers.has(streamerName)) {
        await sendDiscordNotification(stream);
        notifiedStreamers.add(streamerName);
      }
    }

    // Clear cache entries for streamers who are no longer streaming the game
    for (const streamer of notifiedStreamers) {
      if (!currentStreamers.has(streamer)) {
        notifiedStreamers.delete(streamer);
        console.log(
          `Removed ${streamer} from cache as they're no longer streaming ${gameName}`
        );
      }
    }
  } catch (error) {
    console.error('Error checking streams:', error);
  }
}

async function sendDiscordNotification(stream: any) {
  const streamerName = stream.userDisplayName;
  const viewerCount = stream.viewers;

  const embed = new EmbedBuilder()
    .setColor('#6441A4')
    .setTitle(`${streamerName} is now streaming ${gameName}`)
    .setURL(`https://twitch.tv/${streamerName}`)
    .setDescription(`🎮 New stream alert for ${gameName}!`)
    .addFields(
      {name: 'Streamer', value: streamerName, inline: true},
      {name: 'Viewers', value: viewerCount.toString(), inline: true}
    )
    .setThumbnail(
      stream.thumbnailUrl.replace('{width}', '320').replace('{height}', '180')
    )
    .setFooter({text: 'Twitch Stream Notification'})
    .setTimestamp();

  if (!discordChannel)
    return console.error('Error during discord notif sending');

  await discordChannel.send({embeds: [embed]});
  console.log(
    `Sent Discord notification: ${streamerName} is streaming ${gameName}`
  );
}

discordClient.once('ready', () => {
  console.log(`Logged in as ${discordClient.user?.tag}!`);

  discordChannel = discordClient.channels.cache.get(
    discordTwitchChannel
  ) as TextChannel;

  setGameIdFromName().then(() => {
    checkStreamsAndNotify();
  });

  // Check every 5 minutes (adjust as needed)
  setInterval(checkStreamsAndNotify, 5 * 60 * 1000);
});

// Login to Discord
discordClient.login(discordToken);
