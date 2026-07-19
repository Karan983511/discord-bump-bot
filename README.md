# discord-bump-bot

Two separate bots in one repo — run them independently.

## Bots

| File | Command | What it does |
|---|---|---|
| `index.js` | `node index.js` | Auto-bumps DISBOARD (2h) and Discadia (12h) |
| `vc-bot.js` | `node vc-bot.js` | Sits in a voice channel, controlled by `%golive` / `%gooffline` |

Both use the same `DISCORD_USER_TOKEN` from `.env`.

## Setup

```bash
npm install
cp .env.example .env
# Add your DISCORD_USER_TOKEN to .env
```

Run bump bot:
```bash
node index.js
```

Run VC bot (separate terminal / separate process):
```bash
node vc-bot.js
```

## VC bot commands

Send from **any server** — only the hardcoded owner ID can trigger them:

| Command | Action |
|---|---|
| `%golive` | Joins the voice channel (mic on, speaker on) |
| `%gooffline` | Leaves the voice channel |

## Environment variables

| Variable | Used by | Description |
|---|---|---|
| `DISCORD_USER_TOKEN` | both | Your Discord account token |
| `GUILD_ID` | bump bot | Server to bump in (default hardcoded) |
| `CHANNEL_ID` | bump bot | Channel to send /bump in (default hardcoded) |
| `VC_GUILD_ID` | vc bot | Server where bot sits in VC (default hardcoded) |
| `VC_CHANNEL_ID` | vc bot | Voice channel to join (default hardcoded) |
| `OWNER_USER_ID` | vc bot | Your user ID — only you can trigger VC commands (default hardcoded) |

## Deploy on Railway (bump bot)

```bash
railway login && railway init && railway up
railway variables set DISCORD_USER_TOKEN=your_token_here
```

## Deploy VC bot separately (second Railway service)

Create a second Railway service pointing to the same repo, override the start command to `node vc-bot.js`.
