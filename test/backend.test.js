const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Markup, Telegraf } = require('telegraf');
const {
  createApplication,
  getTashkentDate,
  getWeekRange,
  isActiveChatMember,
  decorateTelegramButton,
  decorateTelegramReplyMarkup,
  toTelegramHtml,
  verifyTelegramInitData,
} = require('../server');

function signedInitData(botToken, fields) {
  const params = new URLSearchParams(fields);
  const checkString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  params.set('hash', crypto.createHmac('sha256', secret).update(checkString).digest('hex'));
  return params.toString();
}

test('Telegram initData signature validates and returns the signed user', () => {
  const botToken = 'test-token';
  const now = Date.parse('2026-11-07T12:00:00Z');
  const initData = signedInitData(botToken, {
    auth_date: String(now / 1000),
    query_id: 'query',
    start_param: 'ref_123',
    user: JSON.stringify({ id: 456, first_name: 'Ali' }),
  });

  assert.deepEqual(verifyTelegramInitData(initData, botToken, now), {
    user: { id: 456, first_name: 'Ali' },
    startParam: 'ref_123',
  });
  assert.equal(verifyTelegramInitData(initData, 'wrong-token', now), null);
});

test('Telegram initData rejects modified and expired payloads', () => {
  const botToken = 'test-token';
  const now = Date.parse('2026-11-07T12:00:00Z');
  const initData = signedInitData(botToken, {
    auth_date: String(now / 1000 - 86401),
    user: JSON.stringify({ id: 456, first_name: 'Ali' }),
  });
  assert.equal(verifyTelegramInitData(initData, botToken, now), null);

  const fresh = signedInitData(botToken, {
    auth_date: String(now / 1000),
    user: JSON.stringify({ id: 456, first_name: 'Ali' }),
  }).replace('Ali', 'Vali');
  assert.equal(verifyTelegramInitData(fresh, botToken, now), null);
});

test('weekly boundaries follow the Tashkent Monday-to-Monday week', () => {
  const saturday = new Date('2026-11-07T17:59:59Z');
  const range = getWeekRange(saturday);

  assert.equal(range.start.toISOString(), '2026-11-01T19:00:00.000Z');
  assert.equal(range.end.toISOString(), '2026-11-08T19:00:00.000Z');
  assert.equal(getTashkentDate(new Date('2026-11-07T19:00:00Z')), '2026-11-08');
});

test('Telegram channel membership accepts active members and rejects left users', () => {
  assert.equal(isActiveChatMember({ status: 'member' }), true);
  assert.equal(isActiveChatMember({ status: 'administrator' }), true);
  assert.equal(isActiveChatMember({ status: 'creator' }), true);
  assert.equal(isActiveChatMember({ status: 'restricted', is_member: true }), true);
  assert.equal(isActiveChatMember({ status: 'restricted', is_member: false }), false);
  assert.equal(isActiveChatMember({ status: 'left' }), false);
  assert.equal(isActiveChatMember({ status: 'kicked' }), false);
});

test('Telegram HTML prefixes every message inline and safely escapes message text', () => {
  assert.equal(
    toTelegramHtml('✅ <script>&'),
    '<tg-emoji emoji-id="5972237795584909109">💬</tg-emoji> ✅ &lt;script&gt;&amp;',
  );
  assert.equal(
    toTelegramHtml('Oddiy xabar'),
    '<tg-emoji emoji-id="5972237795584909109">💬</tg-emoji> Oddiy xabar',
  );
  assert.equal(
    toTelegramHtml('⚙️ sozlama'),
    '<tg-emoji emoji-id="5972237795584909109">💬</tg-emoji> ⚙️ sozlama',
  );
});

test('Telegram inline and reply keyboard buttons receive custom emoji icons and supported colors', () => {
  const markup = decorateTelegramReplyMarkup({
    inline_keyboard: [[
      { text: '✅ Tasdiqlash', callback_data: 'approve' },
      { text: '❌ Rad etish', callback_data: 'reject' },
      { text: '🧾 Topshiriqlar', callback_data: 'tasks' },
      { text: 'Mini ilovani ochish', web_app: { url: 'https://example.com' } },
    ]],
  });

  const [approve, reject, tasks, appButton] = markup.inline_keyboard[0];
  assert.equal(approve.text, 'Tasdiqlash');
  assert.equal(approve.icon_custom_emoji_id, '5971815857997750999');
  assert.equal(approve.style, 'success');
  assert.equal(reject.text, 'Rad etish');
  assert.equal(reject.icon_custom_emoji_id, '5971958979192962630');
  assert.equal(reject.style, 'danger');
  assert.equal(tasks.text, 'Topshiriqlar');
  assert.equal(tasks.icon_custom_emoji_id, '5974361382034874415');
  assert.equal(tasks.style, 'primary');
  assert.equal(appButton.icon_custom_emoji_id, '5974236196623098000');
  assert.equal(appButton.style, 'primary');

  const keyboard = decorateTelegramReplyMarkup({
    keyboard: [[
      { text: '📢 Kanalni tanlash', request_chat: { request_id: 1, chat_is_channel: true } },
      'Bekor qilish',
    ]],
    resize_keyboard: true,
  });
  const [channelButton, cancelButton] = keyboard.keyboard[0];
  assert.equal(channelButton.text, 'Kanalni tanlash');
  assert.equal(channelButton.icon_custom_emoji_id, '5972335630644943766');
  assert.equal(channelButton.style, 'primary');
  assert.equal(cancelButton.style, 'primary');
  assert.equal(cancelButton.icon_custom_emoji_id, '5974236196623098000');

  assert.deepEqual(decorateTelegramButton({ text: 'X', style: 'danger' }), {
    text: 'X',
    style: 'danger',
    icon_custom_emoji_id: '5971958979192962630',
  });
});

test('all bot sendMessage calls use premium-emoji HTML formatting', async () => {
  let request;
  const bot = new Telegraf('123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi');
  bot.telegram.callApi = async (...args) => {
    request = args;
    return { message_id: 1 };
  };
  const { bot: configuredBot } = createApplication({
    bot,
    env: {
      API_TOKEN: '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi',
      ADMIN_IDS: '12345',
      APP_URL: 'https://example.com',
    },
  });

  await configuredBot.telegram.sendMessage(12345, 'Taklif ✅', Markup.inlineKeyboard([[
    Markup.button.callback('✅ Tasdiqlash', 'approve'),
    Markup.button.callback('❌ Rad etish', 'reject'),
  ]]));
  assert.equal(request[0], 'sendMessage');
  assert.equal(request[1].parse_mode, 'HTML');
  assert.equal(
    request[1].text,
    '<tg-emoji emoji-id="5972237795584909109">💬</tg-emoji> Taklif ✅',
  );
  assert.deepEqual(request[1].reply_markup.inline_keyboard[0].map((button) => ({
    text: button.text,
    icon_custom_emoji_id: button.icon_custom_emoji_id,
    style: button.style,
  })), [
    { text: 'Tasdiqlash', icon_custom_emoji_id: '5971815857997750999', style: 'success' },
    { text: 'Rad etish', icon_custom_emoji_id: '5971958979192962630', style: 'danger' },
  ]);
});

test('.env.example contains only the four deployment secrets/settings', () => {
  const contents = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8');
  const keys = contents.split(/\r?\n/).filter(Boolean).map((line) => line.split('=', 1)[0]);
  assert.deepEqual(keys, ['MONGODB_URI', 'APP_URL', 'ADMIN_IDS', 'API_TOKEN']);
});

test('APP_URL is normalized and must be an HTTPS URL without credentials', () => {
  const { config } = createApplication({
    env: {
      API_TOKEN: '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi',
      ADMIN_IDS: '12345',
      APP_URL: '  https://example.com/mini-app  ',
    },
  });
  assert.equal(config.appUrl, 'https://example.com/mini-app');

  assert.throws(() => createApplication({
    env: {
      API_TOKEN: '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi',
      ADMIN_IDS: '12345',
      APP_URL: 'http://example.com',
    },
  }), /APP_URL must be a public HTTPS URL/);
  assert.throws(() => createApplication({
    env: {
      API_TOKEN: '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi',
      ADMIN_IDS: '12345',
      APP_URL: 'https://user:password@example.com',
    },
  }), /without embedded credentials/);
});

test('game defaults do not read rewards or bot identity from environment variables', () => {
  const { config } = createApplication({
    env: {
      API_TOKEN: '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi',
      ADMIN_IDS: '12345',
      APP_URL: 'https://example.com',
      WEEKLY_PRIZE: '999999',
      REF_REWARD: '999999',
      BOT_USERNAME: 'must-not-be-used',
      CHANNEL_URL: 'https://t.me/must-not-be-used',
    },
  });
  assert.equal(config.weeklyPrize, 100000);
  assert.equal(config.refReward, 50);
  assert.equal(config.botUsername, '');
  assert.equal(config.channelUrl, '');
});

test('API health is public but game data rejects unsigned requests', async (t) => {
  const { app } = createApplication({
    env: {
      API_TOKEN: '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi',
      ADMIN_IDS: '12345',
      APP_URL: 'https://example.com',
    },
  });
  const server = app.listen(0);
  t.after(() => new Promise((resolve, reject) => {
    server.closeAllConnections();
    server.close((error) => error ? reject(error) : resolve());
  }));
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true });

  const response = await fetch(`${baseUrl}/api/me`, {
    headers: { 'X-Telegram-Init-Data': 'user=%7B%22id%22%3A1%7D' },
  });
  assert.equal(response.status, 401);

  const miniApp = await fetch(`${baseUrl}/`);
  assert.equal(miniApp.status, 200);
  assert.match(await miniApp.text(), /<title>Viral<\/title>/);
  const background = await fetch(`${baseUrl}/assets/background.png`);
  assert.equal(background.status, 200);
  const backendSource = await fetch(`${baseUrl}/server.js`);
  assert.equal(backendSource.status, 404);
});
