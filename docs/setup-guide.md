# Setup Guide

## 1) Prerequisites
- A Google account + Google Sheet
- Gemini API key (free): https://aistudio.google.com/apikey
- Telegram bot token: create a bot via @BotFather
- Your chat id: message @userinfobot

## 2) Install
1. In your Sheet: **Extensions → Apps Script**
2. Paste the content of `Code.gs`
3. Fill `CONFIG` with your keys
4. Run once, in order (authorize when asked):
   - `setupSheet()`  — creates the calendar tab if missing
   - `seedYear()`    — fills 365 days of topics
   - `setupTrigger()`— daily 8:00 AM (Asia/Tehran)

## 3) Sheet columns
| A تاریخ | B موضوع | C زبان | D وضعیت | E متن تولیدشده |

## 4) Troubleshooting
| Symptom | Fix |
|---|---|
| Gemini 429 quota | Free tier limit — wait or switch API key |
| Telegram 404 chat not found | Start the bot once in your chat, re-check chat id |
| Trigger fires at wrong hour | Check Sheet timezone: File → Settings → Timezone |
| Nothing sent | Column D must be empty or «در انتظار» for today's row |