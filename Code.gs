/**
 * AI LinkedIn Content Pipeline for IT Businesses
 * Serverless daily content automation: Google Sheets -> Gemini -> Telegram
 * Setup: see docs/setup-guide.md | License: MIT
 */

const CONFIG = {
  GEMINI_API_KEY: '',        // https://aistudio.google.com/apikey
  TELEGRAM_BOT_TOKEN: '',    // from @BotFather
  TELEGRAM_CHAT_ID: '',      // from @userinfobot
  SHEET_NAME: 'تقویم',
  MODEL: 'gemini-2.5-flash'  // any Gemini text model
};

// ═══════════════════════════════════════════
// Brand voice prompt
// ═══════════════════════════════════════════
function buildPrompt(topic, lang) {
  return `You are the AI content manager for "AsanAbr" (asanabr.ir), an Iranian cloud & managed IT company founded by a senior Microsoft System Administrator.
BRAND VOICE: professional but friendly, B2B, no hype, no fake stats.
SERVICES: Microsoft Remote Desktop, Nextcloud private cloud, PRTG 24/7 monitoring, cloud hosting with off-site backup, enterprise email, Microsoft infrastructure design, AI support platform.
STRUCTURE: 1) Hook (real IT pain point) 2) Short insight 3) Solution tied to ONE service 4) Slogan: "You focus on growing your business. Leave the technology to us." 5) CTA 6) HASHTAGS: first 4-5 Persian hashtags, then 4-5 English hashtags.
LENGTH: 120-180 words, short paragraphs, max 4 emojis.
TOPIC: ${topic}
OUTPUT LANGUAGE: ${lang}

IMPORTANT: Your response MUST follow this EXACT format (do not add anything else):
[POST]
Your LinkedIn post in ${lang}
[/POST]`;
}

// ═══════════════════════════════════════════
// Gemini API call
// ═══════════════════════════════════════════
function callGemini(prompt) {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.MODEL}:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
    const res = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      muteHttpExceptions: true
    });
    const json = JSON.parse(res.getContentText());
    if (json.error) return '⚠️ Gemini error: ' + json.error.message;
    if (json.candidates && json.candidates[0]) return json.candidates[0].content.parts[0].text;
    return '⚠️ No valid response';
  } catch (e) {
    return '⚠️ Gemini connection error: ' + e.message;
  }
}

// ═══════════════════════════════════════════
// Optional AI image (Pollinations, free, no key)
// ═══════════════════════════════════════════
function generateImage(imagePrompt) {
  const encoded = encodeURIComponent(imagePrompt);
  const imageUrl = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=768&nologo=true&model=flux&seed=${Math.floor(Math.random() * 100000)}`;
  const imgRes = UrlFetchApp.fetch(imageUrl, { muteHttpExceptions: true });
  if (imgRes.getResponseCode() !== 200) return null;
  return imgRes.getBlob().setName('post-image.jpg');
}

// ═══════════════════════════════════════════
// Telegram delivery (4000-char safe)
// ═══════════════════════════════════════════
function sendTelegram(text) {
  let safe = String(text);
  if (safe.length > 4000) safe = safe.substring(0, 4000) + '\n… (continued in sheet)';
  UrlFetchApp.fetch('https://api.telegram.org/bot' + CONFIG.TELEGRAM_BOT_TOKEN + '/sendMessage', {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ chat_id: CONFIG.TELEGRAM_CHAT_ID, text: safe }),
    muteHttpExceptions: true
  });
}

// ═══════════════════════════════════════════
// Daily job: generate today's post + deliver
// ═══════════════════════════════════════════
function dailyJob() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(CONFIG.SHEET_NAME);
  const tz = ss.getSpreadsheetTimeZone() || Session.getScriptTimeZone();
  const todayStr = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const row = i + 1;
    const cell = data[i][0];
    const rowStr = (cell instanceof Date) ? Utilities.formatDate(cell, tz, 'yyyy-MM-dd') : String(cell).trim();
    const topic = String(data[i][1]).trim();
    const lang = String(data[i][2]).trim() || 'Persian';
    const status = String(data[i][3]).trim();

    if (rowStr === todayStr && topic && (!status || status === 'در انتظار')) {
      try {
        const response = callGemini(buildPrompt(topic, lang));
        const postMatch = response.match(/\[POST\]([\s\S]*?)\[\/POST\]/);
        const postText = postMatch ? postMatch[1].trim() : response;

        sh.getRange(row, 5).setValue(postText);
        sh.getRange(row, 4).setValue('ارسال شد');

        // Optional image (best effort)
        const imageBlob = generateImage(topic + ', flat vector illustration, corporate blue and white, no text');
        if (imageBlob) {
          UrlFetchApp.fetch('https://api.telegram.org/bot' + CONFIG.TELEGRAM_BOT_TOKEN + '/sendPhoto', {
            method: 'post',
            payload: { chat_id: CONFIG.TELEGRAM_CHAT_ID, photo: imageBlob, caption: '📝 Today post: ' + topic },
            muteHttpExceptions: true
          });
        }

        sendTelegram('📝 Today post is ready:\n\n🗓 Topic: ' + topic + '\n\n' + postText + '\n\n──────────\n📌 Copy and publish on LinkedIn.');
        report();
      } catch (err) {
        sendTelegram('⚠️ Error generating today post: ' + err.message);
      }
      break;
    }
  }
}

// ═══════════════════════════════════════════
// Status report
// ═══════════════════════════════════════════
function report() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  const data = sh.getDataRange().getValues();
  let sent = 0, pending = 0, empty = 0;
  for (let i = 1; i < data.length; i++) {
    const status = String(data[i][3]).trim();
    if (status === 'ارسال شد') sent++;
    else if (status === 'در انتظار') pending++;
    else if (!status) empty++;
  }
  sendTelegram(`📊 System report:\n\n✅ Sent: ${sent}\n⏳ Pending: ${pending}\n📝 Empty: ${empty}\n\n🗓 Total rows: ${data.length - 1}`);
}

// ═══════════════════════════════════════════
// Daily trigger at 8:00 AM (Asia/Tehran)
// ═══════════════════════════════════════════
function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'dailyJob') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyJob')
    .timeBased().everyDays(1).atHour(8)
    .inTimezone('Asia/Tehran')
    .create();
  sendTelegram('⏰ Daily trigger activated: 8:00 AM Asia/Tehran');
}

// ═══════════════════════════════════════════
// Sheet setup (run once)
// ═══════════════════════════════════════════
function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.SHEET_NAME);
    sh.getRange(1, 1, 1, 5).setValues([['Date', 'Topic', 'Language', 'Status', 'Generated Post']]);
    sh.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#f1f3f4');
  }
}

// ═══════════════════════════════════════════
// Seed 365 days of topics (run once)
// ═══════════════════════════════════════════
function seedYear() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(CONFIG.SHEET_NAME);
  const tz = ss.getSpreadsheetTimeZone() || Session.getScriptTimeZone();

  const services = [
    'Off-site Backup', 'PRTG 24/7 Monitoring', 'Nextcloud Private Cloud',
    'Microsoft Infrastructure', 'Enterprise Email', 'Microsoft Remote Desktop',
    'Cloud Hosting', 'Corporate Network Security', 'Secure Remote Work',
    'Managed IT Support', 'Cloud Migration', 'Cloud Servers',
    'Enterprise Network Design', 'Disaster Recovery', 'AI-based Support'
  ];

  const angles = [
    'Why %s is critical for your business?',
    '5 signs your company needs %s',
    '3 common mistakes in %s that cost you money',
    '%s: a practical guide for non-technical managers',
    '%s vs traditional solution: which is cheaper?',
    'How %s boosts your team productivity?',
    '7 myths and facts about %s',
    '%s for growing companies: where to start?',
    'FAQ about %s everyone asks',
    '%s and data security: what you should know',
    'Cost reduction with %s: a real analysis',
    'The future of %s in 2026 and beyond',
    '%s: 5 lessons from real customer projects',
    'Why big companies migrate to %s?',
    '%s and security standards: a checklist',
    'What risks threaten you without %s?',
    '%s for remote teams: key points',
    '%s: what makes us different from competitors?',
    '%s in 5 minutes: quick intro for busy managers',
    'ROI of %s: a real calculation',
    '%s: mistakes to avoid in first implementation',
    'How to beat competitors with %s?',
    '%s and your customer experience: the unseen link',
    'Real story: how %s saved a company from crisis',
    '%s: dos and donts for IT managers'
  ];

  const existingDates = {};
  const lastRow = sh.getLastRow();
  if (lastRow > 1) {
    sh.getRange(2, 1, lastRow - 1, 1).getValues().forEach(r => {
      if (r[0]) {
        const d = r[0] instanceof Date ? Utilities.formatDate(r[0], tz, 'yyyy-MM-dd') : String(r[0]).trim();
        existingDates[d] = true;
      }
    });
  }

  const newRows = [];
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i + 1);
    const dateStr = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
    if (existingDates[dateStr]) continue;
    const topic = angles[Math.floor(i / services.length) % angles.length]
      .replace('%s', services[i % services.length]);
    newRows.push([dateStr, topic, 'English', '', '']);
  }

  if (newRows.length > 0) {
    sh.getRange(lastRow + 1, 1, newRows.length, 5).setValues(newRows);
  }
}

// ═══════════════════════════════════════════
// Simple tests
// ═══════════════════════════════════════════
function testGemini() {
  const res = callGemini('Reply with one word: OK');
  Logger.log('Gemini says: ' + res);
}

function testTelegram() {
  sendTelegram('🎉 Test message from AI LinkedIn Content Pipeline');
}