import 'dotenv/config';
import { Client } from 'discord.js-selfbot-v13';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ─── Validate ────────────────────────────────────────────────────────────────
if (!process.env.DISCORD_USER_TOKEN) {
  console.error('[FATAL] DISCORD_USER_TOKEN is not set. Exiting.');
  process.exit(1);
}

// ─── Config ───────────────────────────────────────────────────────────────────
const TOKEN = process.env.DISCORD_USER_TOKEN;

// Bump bot
const BUMP_GUILD_ID = process.env.GUILD_ID    || '1272650515108593809';
const BUMP_CHAN_ID  = process.env.CHANNEL_ID  || '1415535745174601838';

// VC bot
const VC_GUILD_ID   = process.env.VC_GUILD_ID   || '505974446914535426';
const VC_CHANNEL_ID = process.env.VC_CHANNEL_ID || '1122343326083993631';
const OWNER_USER_ID = process.env.OWNER_USER_ID || '1271399565513195666';

// Set VC_AUTO_JOIN=true in Railway env vars to make the bot always join VC on start.
// This survives container restarts without needing a database or persistent file.
const VC_AUTO_JOIN = process.env.VC_AUTO_JOIN === 'true';

// How long to wait before auto-rejoining after an unexpected disconnect (ms)
const VC_REJOIN_DELAY_MS = 10_000;

// How often to check we're still in the VC (ms) — catches silent drops
const VC_HEARTBEAT_MS = 2 * 60 * 1000; // every 2 minutes

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

// ─── State persistence ────────────────────────────────────────────────────────
const STATE_FILE = join(__dirname, 'data', 'state.json');

function loadState() {
  try {
    mkdirSync(dirname(STATE_FILE), { recursive: true });
    if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch (e) {
    console.warn('[state] Could not load state, starting fresh:', e.message);
  }
  return {};
}

function saveState(state) {
  try {
    mkdirSync(dirname(STATE_FILE), { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.warn('[state] Could not save state:', e.message);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const rand = (max) => Math.floor(Math.random() * max);

function fmt(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

// ─── Bump bot ─────────────────────────────────────────────────────────────────
function scheduleBump(client, bot, state) {
  const now      = Date.now();
  const lastBump = state[bot.id] || 0;
  const elapsed  = now - lastBump;
  const wait     = Math.max(0, bot.cooldownMs + rand(bot.jitterMs) - elapsed);

  console.log(
    `[${bot.name}] Next bump in ${fmt(wait)}` +
    (lastBump ? ` (last bump ${fmt(elapsed)} ago)` : ' (no previous bump)')
  );

  setTimeout(() => doBump(client, bot, state), wait);
}

async function doBump(client, bot, state) {
  const guild   = client.guilds.cache.get(BUMP_GUILD_ID);
  const channel = guild?.channels.cache.get(BUMP_CHAN_ID);

  if (!guild || !channel) {
    console.error(`[${bot.name}] Guild/channel not found — retrying in ${fmt(bot.retryMs)}`);
    setTimeout(() => doBump(client, bot, state), bot.retryMs);
    return;
  }

  console.log(`[${bot.name}] Sending /bump ...`);

  try {
    await channel.sendSlash(bot.id, bot.command);
    state[bot.id] = Date.now();
    saveState(state);
    console.log(`[${bot.name}] ✓ /bump sent successfully`);
  } catch (err) {
    console.error(`[${bot.name}] /bump failed: ${err.message} — retrying in ${fmt(bot.retryMs)}`);
    setTimeout(() => doBump(client, bot, state), bot.retryMs);
    return;
  }

  const next = bot.cooldownMs + rand(bot.jitterMs);
  console.log(`[${bot.name}] Next bump in ${fmt(next)}`);
  setTimeout(() => doBump(client, bot, state), next);
}

// ─── VC bot ───────────────────────────────────────────────────────────────────

/**
 * userWantsVC — the owner's intent.
 *   - Starts as VC_AUTO_JOIN (env var) so Railway restarts always restore VC.
 *   - Flips to true on %golive, false on %gooffline.
 *   - Also saved to state.json as a secondary fallback if VC_AUTO_JOIN is not set.
 */
let vcActive    = false;
let rejoinTimer = null;

function wantsVC(state) {
  // Env var takes priority (survives container restarts without a DB)
  if (VC_AUTO_JOIN) return true;
  return !!state.userWantsVC;
}

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

/**
 * Schedule a single auto-rejoin attempt. Clears any existing timer first.
 */
function scheduleRejoin(client, state) {
  if (rejoinTimer) clearTimeout(rejoinTimer);
  console.log(`[vc] ⏳ Auto-rejoin in ${fmt(VC_REJOIN_DELAY_MS)}…`);
  rejoinTimer = setTimeout(() => {
    rejoinTimer = null;
    if (!wantsVC(state)) {
      console.log('[vc] Auto-rejoin cancelled — owner is offline.');
      return;
    }
    console.log('[vc] 🔁 Auto-rejoining…');
    joinVC(client);
  }, VC_REJOIN_DELAY_MS);
}

/**
 * Heartbeat: every VC_HEARTBEAT_MS check that the bot is actually in the VC.
 * Catches silent drops that don't fire voiceStateUpdate (e.g. WebSocket reconnects).
 */
function startHeartbeat(client, state) {
  setInterval(() => {
    if (!wantsVC(state)) return; // owner is offline, nothing to do

    const guild  = client.guilds.cache.get(VC_GUILD_ID);
    const member = guild?.members?.me ?? guild?.members?.cache?.get(client.user.id);
    const inVC   = member?.voice?.channelId === VC_CHANNEL_ID;

    if (!inVC && !rejoinTimer) {
      console.warn('[vc] ⚠️ Heartbeat: not in VC — triggering rejoin.');
      vcActive = false;
      scheduleRejoin(client, state);
    }
  }, VC_HEARTBEAT_MS);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
const client = new Client({ checkUpdate: false });
const state  = loadState();

client.on('ready', () => {
  console.log(`[bot] Logged in as ${client.user.tag}`);
  console.log(`[bot] Bump      → guild: ${BUMP_GUILD_ID} | channel: ${BUMP_CHAN_ID}`);
  console.log(`[bot] VC        → guild: ${VC_GUILD_ID} | channel: ${VC_CHANNEL_ID}`);
  console.log(`[bot] Owner     → ${OWNER_USER_ID}`);
  console.log(`[bot] VC_AUTO_JOIN = ${VC_AUTO_JOIN}`);

  // Start bump scheduler
  for (const bot of BOTS) scheduleBump(client, bot, state);

  // Auto-join VC if desired
  if (wantsVC(state)) {
    console.log('[vc] 🔄 Auto-joining VC on startup…');
    joinVC(client);
  }

  // Start heartbeat to catch silent drops
  startHeartbeat(client, state);

  console.log('[bot] ✅ Ready!');
});

// ─── Reconnect guard ──────────────────────────────────────────────────────────
// After a WebSocket resume or reconnect, Discord resets voice state.
// Re-send the join opcode so the bot ends up back in the channel.
client.on('shardResumed', () => {
  console.log('[bot] 🔌 Shard resumed.');
  if (wantsVC(state)) {
    console.log('[vc] Re-joining VC after shard resume…');
    setTimeout(() => joinVC(client), 3000); // brief delay for guild cache to settle
  }
});

// ─── VC guard — detect unexpected disconnects ─────────────────────────────────
client.on('voiceStateUpdate', (oldState, newState) => {
  if (oldState.member?.id !== client.user?.id) return;

  const wasInOurChannel  = oldState.channelId === VC_CHANNEL_ID
                        && oldState.guild?.id  === VC_GUILD_ID;
  const isNowDisconnected = !newState.channelId;

  if (wasInOurChannel && isNowDisconnected) {
    vcActive = false;
    if (!wantsVC(state)) {
      console.log('[vc] Left VC (owner-commanded). Standing by.');
      return;
    }
    console.warn('[vc] ⚠️ Unexpectedly left VC — scheduling auto-rejoin.');
    scheduleRejoin(client, state);
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
    saveState(state);

    const ok = joinVC(client);
    if (ok) {
      await message.reply('🎙️ Joined the voice channel!').catch(() => {});
    } else {
      await message.reply('⚠️ Could not join — make sure the account is in the target server.').catch(() => {});
    }
  }

  if (cmd === '%gooffline') {
    if (rejoinTimer) { clearTimeout(rejoinTimer); rejoinTimer = null; }

    state.userWantsVC = false;
    saveState(state);

    if (!vcActive) {
      await message.reply('ℹ️ Not currently in a voice channel.').catch(() => {});
      return;
    }
    leaveVC(client);
    await message.reply('👋 Left the voice channel.').catch(() => {});
  }

  // Debug: check current VC status
  if (cmd === '%vcstatus') {
    const guild  = client.guilds.cache.get(VC_GUILD_ID);
    const member = guild?.members?.me ?? guild?.members?.cache?.get(client.user.id);
    const chan   = member?.voice?.channelId ?? 'none';
    await message.reply(
      `vcActive=${vcActive} | userWantsVC=${state.userWantsVC} | VC_AUTO_JOIN=${VC_AUTO_JOIN} | actualChannel=${chan}`
    ).catch(() => {});
  }
});

client.on('error', (err) => console.error('[client error]', err.message));

// Keep alive
setInterval(() => {}, 1 << 30);

process.on('unhandledRejection', (r) => console.error('[unhandledRejection]', r));
process.on('uncaughtException',  (e) => console.error('[uncaughtException]', e.message));

client.login(TOKEN).catch((err) => {
  console.error('[FATAL] Login failed:', err.message);
  process.exit(1);
});
