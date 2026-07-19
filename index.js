import 'dotenv/config';
import { Client } from 'discord.js-selfbot-v13';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ─── Validate environment ────────────────────────────────────────────────────
if (!process.env.DISCORD_USER_TOKEN) {
  console.error('[FATAL] DISCORD_USER_TOKEN is not set. Exiting.');
  process.exit(1);
}

// ─── Config ───────────────────────────────────────────────────────────────────
const TOKEN    = process.env.DISCORD_USER_TOKEN;
const GUILD_ID = process.env.GUILD_ID   || '1272650515108593809';
const CHAN_ID  = process.env.CHANNEL_ID || '1415535745174601838';

const BOTS = [
  {
    name       : 'DISBOARD',
    id         : '302050872383242240',
    command    : 'bump',
    cooldownMs : 2  * 60 * 60 * 1000,  // 2 hours
    jitterMs   : 15 * 60 * 1000,       // +0–15 min random
    retryMs    : 30 * 60 * 1000,       // retry after 30 min on failure
  },
  {
    name       : 'Discadia',
    id         : '1222548162741538938',
    command    : 'bump',
    cooldownMs : 12 * 60 * 60 * 1000,  // 12 hours
    jitterMs   : 20 * 60 * 1000,       // +0–20 min random
    retryMs    : 30 * 60 * 1000,
  },
];

// ─── State persistence ────────────────────────────────────────────────────────
const STATE_FILE = join(__dirname, 'data', 'state.json');

function loadState() {
  try {
    mkdirSync(dirname(STATE_FILE), { recursive: true });
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    }
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

// ─── Scheduler ────────────────────────────────────────────────────────────────
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
  const guild   = client.guilds.cache.get(GUILD_ID);
  const channel = guild?.channels.cache.get(CHAN_ID);

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

// ─── Boot ─────────────────────────────────────────────────────────────────────
const client = new Client({ checkUpdate: false });
const state  = loadState();

client.on('ready', () => {
  console.log(`[bot] Logged in as ${client.user.tag}`);
  console.log(`[bot] Guild: ${GUILD_ID} | Channel: ${CHAN_ID}`);
  for (const bot of BOTS) scheduleBump(client, bot, state);
  console.log('[bot] ✅ Ready!');
});

client.on('error', (err) => console.error('[client error]', err.message));

// Keep process alive on Railway
setInterval(() => {}, 1 << 30);

// Never let one bot failure kill the whole process
process.on('unhandledRejection', (r) => console.error('[unhandledRejection]', r));
process.on('uncaughtException',  (e) => console.error('[uncaughtException]', e.message));

client.login(TOKEN).catch((err) => {
  console.error('[FATAL] Login failed:', err.message);
  process.exit(1);
});
