import 'dotenv/config';
import { Client } from 'discord.js-selfbot-v13';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { MongoStateManager } from './mongoStateManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ─── Validate ──────────────────────────────────────────────────────────[...]
if (!process.env.DISCORD_USER_TOKEN) {
  console.error('[FATAL] DISCORD_USER_TOKEN is not set. Exiting.');
  process.exit(1);
}

if (!process.env.MONGODB_URI) {
  console.error('[FATAL] MONGODB_URI is not set. Exiting.');
  console.error('[INFO] Add MONGODB_URI to your .env file or Railway variables');
  console.error('[INFO] See MONGODB_SETUP.md for instructions');
  process.exit(1);
}

// ─── Config ────────────────────────────────────────────────────────────[...]
const TOKEN = process.env.DISCORD_USER_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;

// Bump bot
const BUMP_GUILD_ID = process.env.GUILD_ID    || '1272650515108593809';
const BUMP_CHAN_ID  = process.env.CHANNEL_ID  || '1415535745174601838';

// VC bot
const VC_GUILD_ID   = process.env.VC_GUILD_ID   || '505974446914535426';
const VC_CHANNEL_ID = process.env.VC_CHANNEL_ID || '1122343326083993631';
const OWNER_USER_ID = process.env.OWNER_USER_ID || '1271399565513195666';

// How long to wait before auto-rejoining after an unexpected disconnect (ms)
const VC_REJOIN_DELAY_MS = 10_000;

// Time to wait after bot is ready before joining VC (Discord needs time to sync)
const VC_JOIN_DELAY_MS = 3_000;

const BOTS = [
  {
    name       : 'DISBOARD',
    id         : '302050872383242240',
    command    : 'bump',
    cooldownMs : 2  * 60 * 60 * 1000,
    jitterMs   : 15 * 60 * 1000,
    retryMs    : 30 * 60 * 1000,
  },
  {
    name       : 'Discadia',
    id         : '1222548162741538938',
    command    : 'bump',
    cooldownMs : 12 * 60 * 60 * 1000,
    jitterMs   : 20 * 60 * 1000,
    retryMs    : 30 * 60 * 1000,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────–[...]
const rand = (max) => Math.floor(Math.random() * max);

function fmt(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

// ─── MongoDB State Manager ────────────────────────────────���────────────
const stateManager = new MongoStateManager(MONGODB_URI);
let state = {}; // In-memory cache

// ─── Bump bot ──────────────────────────────────────────────────────────[...]
function scheduleBump(client, bot) {
  const now      = Date.now();
  const lastBump = state.bumpTimestamps?.[bot.id] || 0;
  const elapsed  = now - lastBump;
  const wait     = Math.max(0, bot.cooldownMs + rand(bot.jitterMs) - elapsed);

  console.log(
    `[${bot.name}] Next bump in ${fmt(wait)}` +
    (lastBump ? ` (last bump ${fmt(elapsed)} ago)` : ' (no previous bump)')
  );

  setTimeout(() => doBump(client, bot), wait);
}

async function doBump(client, bot) {
  const guild   = client.guilds.cache.get(BUMP_GUILD_ID);
  const channel = guild?.channels.cache.get(BUMP_CHAN_ID);

  if (!guild || !channel) {
    console.error(`[${bot.name}] Guild/channel not found — retrying in ${fmt(bot.retryMs)}`);
    setTimeout(() => doBump(client, bot), bot.retryMs);
    return;
  }

  console.log(`[${bot.name}] Sending /bump ...`);

  try {
    await channel.sendSlash(bot.id, bot.command);
    
    // Update state in memory and MongoDB
    if (!state.bumpTimestamps) state.bumpTimestamps = {};
    state.bumpTimestamps[bot.id] = Date.now();
    await stateManager.updateField('bumpTimestamps', state.bumpTimestamps);
    
    console.log(`[${bot.name}] ✓ /bump sent successfully`);
  } catch (err) {
    console.error(`[${bot.name}] /bump failed: ${err.message} — retrying in ${fmt(bot.retryMs)}`);
    setTimeout(() => doBump(client, bot), bot.retryMs);
    return;
  }

  const next = bot.cooldownMs + rand(bot.jitterMs);
  console.log(`[${bot.name}] Next bump in ${fmt(next)}`);
  setTimeout(() => doBump(client, bot), next);
}

// ─── VC bot ──────────────────────────────────────────────────────────–[...]

/**
 * vcActive   — true while the bot is physically in the VC (live gateway state)
 * userWantsVC — true when the owner said %golive, false when they said %gooffline.
 *               Persisted in MongoDB so restarts honour the owner's last intent.
 */
let vcActive = false;
let rejoinTimer = null;

function joinVC(client) {
  const guild = client.guilds.cache.get(VC_GUILD_ID);
  if (!guild) {
    console.warn('[vc] Not in VC_GUILD_ID — make sure the account is in that server.');
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
  console.log(`[vc] ✅ Joined voice channel ${VC_CHANNEL_ID}`);
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

function scheduleRejoin(client) {
  if (rejoinTimer) clearTimeout(rejoinTimer);
  console.log(`[vc] ⏳ Auto-rejoin scheduled in ${fmt(VC_REJOIN_DELAY_MS)}…`);
  rejoinTimer = setTimeout(() => {
    rejoinTimer = null;
    if (!state.userWantsVC) {
      console.log('[vc] Auto-rejoin cancelled — owner went offline in the meantime.');
      return;
    }
    console.log('[vc] 🔁 Attempting auto-rejoin…');
    joinVC(client);
  }, VC_REJOIN_DELAY_MS);
}

// ─── Boot ───────────────────────────────────────────────────────────[...]
const client = new Client({ checkUpdate: false });

client.on('ready', async () => {
  console.log(`[bot] Logged in as ${client.user.tag}`);
  console.log(`[bot] Bump  → guild: ${BUMP_GUILD_ID} | channel: ${BUMP_CHAN_ID}`);
  console.log(`[bot] VC    → guild: ${VC_GUILD_ID} | channel: ${VC_CHANNEL_ID}`);
  console.log(`[bot] Owner → ${OWNER_USER_ID}`);

  // Load state from MongoDB
  state = await stateManager.loadState();
  console.log('[bot] State loaded from MongoDB:', state);

  // Start bump scheduler
  for (const bot of BOTS) scheduleBump(client, bot);

  // If the owner had the bot online before restart, rejoin automatically
  if (state.userWantsVC) {
    console.log(`[vc] 🔄 Restoring VC presence from MongoDB in ${fmt(VC_JOIN_DELAY_MS)}…`);
    setTimeout(() => {
      console.log('[vc] 🔄 Now joining voice channel…');
      joinVC(client);
    }, VC_JOIN_DELAY_MS);
  }

  console.log('[bot] ✅ Ready! (bump bot + vc bot running with MongoDB persistence)');
});

// ─── VC guard — detect unexpected disconnects ─────────────────────────────────
client.on('voiceStateUpdate', (oldState, newState) => {
  if (oldState.member?.id !== client.user?.id) return;

  const wasInOurChannel = oldState.channelId === VC_CHANNEL_ID && oldState.guild?.id === VC_GUILD_ID;
  const isNowDisconnected = !newState.channelId;

  if (wasInOurChannel && isNowDisconnected) {
    vcActive = false;

    if (!state.userWantsVC) {
      console.log('[vc] Left VC (owner-commanded). Standing by.');
      return;
    }

    console.warn('[vc] ⚠️  Unexpectedly left VC without %gooffline command! Scheduling auto-rejoin…');
    scheduleRejoin(client);
  }
});

// ─── Owner commands — %golive / %gooffline ────────────────────────────────────
client.on('messageCreate', async (message) => {
  if (message.author.id !== OWNER_USER_ID) return;

  const cmd = message.content.trim().toLowerCase();

  if (cmd === '%golive') {
    if (vcActive) {
      await message.reply('✅ Already live in the VC!').catch(() => {});
      return;
    }
    if (rejoinTimer) { clearTimeout(rejoinTimer); rejoinTimer = null; }

    state.userWantsVC = true;
    await stateManager.updateField('userWantsVC', true);

    const ok = joinVC(client);
    if (ok) {
      await message.reply('🎙️ Joined the voice channel! (mic on, speaker on)').catch(() => {});
    } else {
      await message.reply('⚠️ Could not join — make sure the account is in the target server.').catch(() => {});
    }
  }

  if (cmd === '%gooffline') {
    if (rejoinTimer) { clearTimeout(rejoinTimer); rejoinTimer = null; }

    state.userWantsVC = false;
    await stateManager.updateField('userWantsVC', false);

    if (!vcActive) {
      await message.reply('ℹ️ Not currently in a voice channel.').catch(() => {});
      return;
    }
    leaveVC(client);
    await message.reply('👋 Left the voice channel.').catch(() => {});
  }
});

client.on('error', (err) => console.error('[client error]', err.message));

// Keep alive
setInterval(() => {}, 1 << 30);

process.on('unhandledRejection', (r) => console.error('[unhandledRejection]', r));
process.on('uncaughtException',  (e) => console.error('[uncaughtException]', e.message));

// ─── Connect to MongoDB then login ──────────────────���───────────────────
(async () => {
  try {
    const connected = await stateManager.connect();
    if (!connected) {
      console.error('[FATAL] Could not connect to MongoDB');
      process.exit(1);
    }

    await client.login(TOKEN);
  } catch (err) {
    console.error('[FATAL] Startup error:', err.message);
    process.exit(1);
  }
})();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[bot] Shutting down gracefully...');
  await stateManager.disconnect();
  process.exit(0);
});
