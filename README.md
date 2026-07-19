# discord-bump-bot

One process, one Railway service — bump bot + VC bot running together.

## What it does

- Auto-bumps DISBOARD every 2h and Discadia every 12h
- `%golive` → joins your voice channel (mic on, speaker on)
- `%gooffline` → leaves the voice channel
- Only your user ID can trigger VC commands

## Setup

```bash
npm install
cp .env.example .env
# Set DISCORD_USER_TOKEN in .env
node index.js
```

## Deploy on Railway

1. **New Project** → **Deploy from GitHub** → pick this repo
2. **Variables** → add everything from `.env.example` (fill in `DISCORD_USER_TOKEN`)
3. Done — Railway runs `node index.js` automatically

## Environment variables

| Variable | Description |
|---|---|
| `DISCORD_USER_TOKEN` | Your Discord account token (**required**) |
| `GUILD_ID` | Bump bot server ID (default hardcoded) |
| `CHANNEL_ID` | Bump bot channel ID (default hardcoded) |
| `VC_GUILD_ID` | VC server ID (default hardcoded) |
| `VC_CHANNEL_ID` | Voice channel ID (default hardcoded) |
| `OWNER_USER_ID` | Your Discord user ID — only you control the VC (default hardcoded) |

## VC commands

Send from any server your account is in:

| Command | Action |
|---|---|
| `%golive` | Joins the voice channel |
| `%gooffline` | Leaves the voice channel |

## Bump schedule

| Bot | Cooldown | Jitter |
|---|---|---|
| DISBOARD | 2 hours | +0–15 min |
| Discadia | 12 hours | +0–20 min |
