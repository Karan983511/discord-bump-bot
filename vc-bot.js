import 'dotenv/config';
import { Client } from 'discord.js-selfbot-v13';

// ─── Validate environment ────────────────────────────────────────────────────
if (!process.env.DISCORD_USER_TOKEN) {
  console.error('[FATAL] DISCORD_USER_TOKEN is not set. Exiting.');
  process.exit(1);
}

// ─── Config ───────────────────────────────────────────────────────────────────
const TOKEN         = process.env.DISCORD_USER_TOKEN;
const VC_GUILD_ID   = process.env.VC_GUILD_ID   || '505974446914535426';
const VC_CHANNEL_ID = process.env.VC_CHANNEL_ID || '1122343326083993631';
const OWNER_USER_ID = process.env.OWNER_USER_ID || '1271399565513195666';

// ─── VC helpers ───────────────────────────────────────────────────────────────
let vcActive = false;

function joinVC(client) {
  const guild = client.guilds.cache.get(VC_GUILD_ID);
  if (!guild) {
    console.warn('[vc] Not a member of VC_GUILD_ID — make sure the account is in that server.');
    return false;
  }
  guild.shard.send({
    op: 4,
    d: {
      guild_id  : VC_GUILD_ID,
      channel_id: VC_CHANNEL_ID,
      self_mute : false,
      self_deaf : false,
    },
  });
  vcActive = true;
  console.log(`[vc] ✅ Joined voice channel ${VC_CHANNEL_ID} in guild ${VC_GUILD_ID}`);
  return true;
}

function leaveVC(client) {
  const guild = client.guilds.cache.get(VC_GUILD_ID);
  if (!guild) return false;
  guild.shard.send({
    op: 4,
    d: {
      guild_id  : VC_GUILD_ID,
      channel_id: null,
      self_mute : false,
      self_deaf : false,
    },
  });
  vcActive = false;
  console.log('[vc] 👋 Left voice channel.');
  return true;
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
const client = new Client({ checkUpdate: false });

client.on('ready', () => {
  console.log(`[vc-bot] Logged in as ${client.user.tag}`);
  console.log(`[vc-bot] VC guild: ${VC_GUILD_ID} | VC channel: ${VC_CHANNEL_ID}`);
  console.log(`[vc-bot] Owner: ${OWNER_USER_ID}`);
  console.log('[vc-bot] ✅ Ready! Send %golive or %gooffline from any server.');
});

client.on('messageCreate', async (message) => {
  // Only respond to the owner
  if (message.author.id !== OWNER_USER_ID) return;

  const cmd = message.content.trim().toLowerCase();

  if (cmd === '%golive') {
    if (vcActive) {
      await message.reply('✅ Already live in the VC!').catch(() => {});
      return;
    }
    const ok = joinVC(client);
    if (ok) {
      await message.reply('🎙️ Joined the voice channel! (mic on, speaker on)').catch(() => {});
    } else {
      await message.reply('⚠️ Could not join — make sure the account is in the target server.').catch(() => {});
    }
  }

  if (cmd === '%gooffline') {
    if (!vcActive) {
      await message.reply('ℹ️ Not currently in a voice channel.').catch(() => {});
      return;
    }
    leaveVC(client);
    await message.reply('👋 Left the voice channel.').catch(() => {});
  }
});

client.on('error', (err) => console.error('[vc-bot error]', err.message));

// Keep process alive
setInterval(() => {}, 1 << 30);

process.on('unhandledRejection', (r) => console.error('[unhandledRejection]', r));
process.on('uncaughtException',  (e) => console.error('[uncaughtException]', e.message));

client.login(TOKEN).catch((err) => {
  console.error('[FATAL] Login failed:', err.message);
  process.exit(1);
});
