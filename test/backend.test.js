const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Markup, Telegraf } = require('telegraf');
const {
  createApplication,
  getTashkentDate,
  getTashkentDayRange,
  getNextSundayAnnouncement,
  getNextDailyReminder,
  getWeekRange,
  normalizePromoCode,
  isReferralEligible,
  getTelegramRetryDelay,
  getReferralGiftMilestones,
  getReferralGiftProgress,
  validateDonationAmount,
  validateDonationMessage,
  createDonationAdminMessage,
  notifyAdminsAndPin,
  createDonationInvoiceLink,
  isValidStarDonationPayment,
  buildLeaderboardPipeline,
  buildTopDonorsPipeline,
  isActiveChatMember,
  decorateTelegramButton,
  decorateTelegramReplyMarkup,
  sendTelegramGift,
  telegramUserMention,
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

test('Tashkent calendar-day ranges include the full local day', () => {
  const range = getTashkentDayRange(new Date('2026-11-08T19:00:00Z'));
  assert.equal(range.start.toISOString(), '2026-11-08T19:00:00.000Z');
  assert.equal(range.end.toISOString(), '2026-11-09T19:00:00.000Z');
});

test('weekly announcement is scheduled for Sunday 23:59 Tashkent time', () => {
  const before = getNextSundayAnnouncement(new Date('2026-11-07T18:00:00Z'));
  const after = getNextSundayAnnouncement(new Date('2026-11-08T19:00:00Z'));
  assert.equal(before.toISOString(), '2026-11-08T18:59:00.000Z');
  assert.equal(after.toISOString(), '2026-11-15T18:59:00.000Z');
});

test('daily reminder is scheduled for 20:00 Tashkent time', () => {
  assert.equal(
    getNextDailyReminder(new Date('2026-11-08T14:00:00Z')).toISOString(),
    '2026-11-08T15:00:00.000Z',
  );
  assert.equal(
    getNextDailyReminder(new Date('2026-11-08T15:00:00Z')).toISOString(),
    '2026-11-09T15:00:00.000Z',
  );
});

test('promo codes are normalized and reject unsupported input', () => {
  assert.equal(normalizePromoCode('  yangi_2026  '), 'YANGI_2026');
  for (const code of ['abc', 'a'.repeat(33), 'SAVE 20', 'SO‘G‘A', '', null]) {
    assert.throws(() => normalizePromoCode(code), /Promo-kod/);
  }
});

test('referrals require a verified invited user with at least one approved task', () => {
  const referredUser = {
    _id: '456',
    invitedBy: '123',
    verified: true,
    banned: false,
    referralRewarded: false,
  };
  assert.equal(isReferralEligible(referredUser, true), true);
  assert.equal(isReferralEligible(referredUser, false), false);
  assert.equal(isReferralEligible({ ...referredUser, verified: false }, true), false);
  assert.equal(isReferralEligible({ ...referredUser, referralRewarded: true }, true), false);
  assert.equal(isReferralEligible({ ...referredUser, banned: true }, true), false);
});

test('Telegram connection retries use capped exponential backoff', () => {
  assert.equal(getTelegramRetryDelay(1), 1000);
  assert.equal(getTelegramRetryDelay(2), 2000);
  assert.equal(getTelegramRetryDelay(6), 32000);
  assert.equal(getTelegramRetryDelay(7), 60000);
  assert.equal(getTelegramRetryDelay(20), 60000);
  assert.throws(() => getTelegramRetryDelay(0), /positive integer/);
});

test('referral gifts are queued at each ten verified referrals', () => {
  assert.deepEqual(getReferralGiftMilestones(9), []);
  assert.deepEqual(getReferralGiftMilestones(10), [10]);
  assert.deepEqual(getReferralGiftMilestones(25), [10, 20]);
  assert.deepEqual(getReferralGiftMilestones(Number.NaN), []);
});

test('referral gift progress advances to every ten verified referrals', () => {
  assert.deepEqual(getReferralGiftProgress(0), {
    milestone: 10,
    progress: 0,
    remaining: 10,
    completedMilestones: 0,
    completedMilestone: false,
  });
  assert.deepEqual(getReferralGiftProgress(9), {
    milestone: 10,
    progress: 9,
    remaining: 1,
    completedMilestones: 0,
    completedMilestone: false,
  });
  assert.deepEqual(getReferralGiftProgress(10), {
    milestone: 10,
    progress: 10,
    remaining: 10,
    completedMilestones: 1,
    completedMilestone: true,
  });
  assert.deepEqual(getReferralGiftProgress(21), {
    milestone: 10,
    progress: 1,
    remaining: 9,
    completedMilestones: 2,
    completedMilestone: false,
  });
  assert.equal(getReferralGiftProgress(-5).progress, 0);
});

test('leaderboard includes every verified user and gives users without points a zero score', () => {
  const range = {
    start: new Date('2026-11-02T00:00:00Z'),
    end: new Date('2026-11-09T00:00:00Z'),
  };
  const pipeline = buildLeaderboardPipeline('ledgers', range);

  assert.deepEqual(pipeline[0], {
    $match: {
      verified: true,
      banned: { $ne: true },
      referralReviewStatus: { $ne: 'rejected' },
    },
  });
  assert.deepEqual(pipeline[1].$lookup.pipeline[0].$match, {
    $expr: { $eq: ['$userId', '$$leaderboardUserId'] },
    points: { $ne: 0 },
    createdAt: { $gte: range.start, $lt: range.end },
  });
  assert.deepEqual(pipeline[2].$project.score, {
    $max: [0, { $ifNull: [{ $arrayElemAt: ['$ledgerTotals.score', 0] }, 0] }],
  });
  assert.equal(pipeline[2].$project.photoUrl, '$photoUrl');
  assert.deepEqual(pipeline[3], { $sort: { score: -1, userId: 1 } });

  const allTimePipeline = buildLeaderboardPipeline('ledgers');
  assert.equal('createdAt' in allTimePipeline[1].$lookup.pipeline[0].$match, false);
});

test('top donor pipeline sums only successful Stars donations and returns named top users', () => {
  const pipeline = buildTopDonorsPipeline('donations', 'users');
  assert.deepEqual(pipeline[0], { $match: { status: 'paid', amount: { $gt: 0 } } });
  assert.deepEqual(pipeline[1], { $group: { _id: '$userId', stars: { $sum: '$amount' } } });
  assert.deepEqual(pipeline[2], { $sort: { stars: -1, _id: 1 } });
  assert.deepEqual(pipeline[3], { $limit: 10 });
  assert.equal(pipeline[4].$lookup.from, 'users');
  assert.deepEqual(pipeline[4].$lookup.pipeline[0], {
    $match: { $expr: { $eq: ['$_id', '$$donorUserId'] } },
  });
  assert.equal(pipeline[4].$lookup.pipeline[1].$project.photoUrl, 1);
  assert.deepEqual(pipeline[5], { $unwind: '$user' });
  assert.deepEqual(pipeline[6].$project, {
    _id: 0,
    name: '$user.name',
    username: '$user.username',
    photoUrl: '$user.photoUrl',
    stars: 1,
  });
  assert.equal(buildTopDonorsPipeline('donations', 'users', 5)[3].$limit, 5);
  assert.throws(() => buildTopDonorsPipeline('donations', 'users', 0), /limit/);
});

test('Telegram gift sends use the Bot API user_id and gift_id fields', async () => {
  let request;
  const bot = {
    telegram: {
      callApi: async (...args) => {
        request = args;
        return true;
      },
    },
  };
  await sendTelegramGift(bot, '123456', 'gift-id');
  assert.deepEqual(request, ['sendGift', { user_id: 123456, gift_id: 'gift-id' }]);
  assert.throws(() => sendTelegramGift(bot, 'not-an-id', 'gift-id'), /must be numeric/);
  assert.throws(() => sendTelegramGift(bot, '123456', ''), /gift ID is required/);
});

test('Stars donation amounts are positive whole numbers within the Bot API limit', () => {
  assert.equal(validateDonationAmount(1), 1);
  assert.equal(validateDonationAmount('250'), 250);
  for (const amount of [0, -1, 1.5, '1.5', '', true, 10000001, Number.NaN]) {
    assert.throws(() => validateDonationAmount(amount), /Donat miqdori/);
  }
});

test('donation messages are required and bounded to 500 characters', () => {
  assert.equal(validateDonationMessage('  Rahmat!  '), 'Rahmat!');
  assert.throws(() => validateDonationMessage('   '), /1 dan 500/);
  assert.throws(() => validateDonationMessage('a'.repeat(501)), /1 dan 500/);
  assert.throws(() => validateDonationMessage(null), /Donat xabarini yozing/);
});

test('admin donation message includes username, Telegram ID, Stars, and user text', () => {
  const message = createDonationAdminMessage({
    userId: '12345',
    name: 'Ali',
    username: 'ali_user',
    amount: 80,
    message: 'Loyihaga omad!',
  });
  assert.match(message, /Username: @ali_user/);
  assert.match(message, /Telegram ID: 12345/);
  assert.match(message, /Miqdor: 80 Stars/);
  assert.match(message, /Xabar: Loyihaga omad!/);
  assert.match(toTelegramHtml(message), /Loyihaga omad!/);
  assert.match(toTelegramHtml(createDonationAdminMessage({
    userId: '12345', name: 'Ali', username: '', amount: 1, message: '<b>salom</b>',
  })), /Xabar: &lt;b&gt;salom&lt;\/b&gt;/);
  assert.throws(() => createDonationAdminMessage({
    userId: 'invalid', name: 'Ali', username: '', amount: 1, message: 'x',
  }), /user ID must be numeric/);
});

test('donation notifications are sent and then pinned in each admin chat', async () => {
  const calls = [];
  const bot = {
    telegram: {
      sendMessage: async (chatId, text) => {
        calls.push(['sendMessage', chatId, text]);
        return { message_id: Number(chatId) + 100 };
      },
      callApi: async (method, payload) => {
        calls.push([method, payload.chat_id, payload.message_id]);
        return true;
      },
    },
  };
  await notifyAdminsAndPin(bot, new Set(['10', '20']), 'donation');
  assert.deepEqual(calls, [
    ['sendMessage', '10', 'donation'],
    ['pinChatMessage', '10', 110],
    ['sendMessage', '20', 'donation'],
    ['pinChatMessage', '20', 120],
  ]);
});

test('Stars donation invoices use the XTR currency and exact user-selected amount', async () => {
  let invoice;
  const bot = {
    telegram: {
      createInvoiceLink: async (value) => {
        invoice = value;
        return 'https://t.me/$invoice';
      },
    },
  };
  assert.equal(await createDonationInvoiceLink(bot, 'donation:123:nonce', 75), 'https://t.me/$invoice');
  assert.deepEqual(invoice, {
    title: 'Viral donati',
    description: 'Viral loyihasini Telegram Stars orqali qo‘llab-quvvatlash.',
    payload: 'donation:123:nonce',
    provider_token: '',
    currency: 'XTR',
    prices: [{ label: 'Ixtiyoriy donat', amount: 75 }],
  });
});

test('Stars donations accept only matching, recent Telegram payments', () => {
  const now = Date.parse('2026-11-07T12:00:00Z');
  const donation = {
    userId: '123',
    amount: 40,
    status: 'pending',
    createdAt: new Date(now - 1000),
  };
  const payment = { currency: 'XTR', total_amount: 40 };
  assert.equal(isValidStarDonationPayment(donation, payment, '123', now), true);
  assert.equal(isValidStarDonationPayment(donation, payment, '123', now, 'checkout'), false);
  assert.equal(isValidStarDonationPayment(donation, payment, '456', now), false);
  assert.equal(isValidStarDonationPayment(donation, { ...payment, total_amount: 41 }, '123', now), false);
  assert.equal(isValidStarDonationPayment(donation, { ...payment, currency: 'USD' }, '123', now), false);
  assert.equal(isValidStarDonationPayment({
    ...donation,
    status: 'checkout',
  }, payment, '123', now, 'checkout'), true);
  assert.equal(isValidStarDonationPayment({
    ...donation,
    createdAt: new Date(now - 24 * 60 * 60 * 1000 - 1),
  }, payment, '123', now), false);
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
    '<tg-emoji emoji-id="5971815857997750999">✅</tg-emoji> &lt;script&gt;&amp;',
  );
  assert.equal(
    toTelegramHtml('Oddiy xabar'),
    '<tg-emoji emoji-id="5406631276042002796">📨</tg-emoji> Oddiy xabar',
  );
  assert.equal(
    toTelegramHtml('⚙️ sozlama'),
    '<tg-emoji emoji-id="5974411495713294659">⚙</tg-emoji> sozlama',
  );
  assert.equal(
    toTelegramHtml('👋 Xush kelibsiz!'),
    '<tg-emoji emoji-id="5972185031911677527">👋</tg-emoji> Xush kelibsiz!',
  );
  assert.equal(
    toTelegramHtml('⚙️ Admin panel\nHaftalik sovrin: 50 000 so‘m'),
    '<tg-emoji emoji-id="5974411495713294659">⚙</tg-emoji> Admin panel\n' +
      '<tg-emoji emoji-id="5472030678633684592">💸</tg-emoji> Haftalik sovrin: 50 000 so‘m',
  );
  assert.equal(
    toTelegramHtml('👥 Do‘st taklif qiling, 📋 topshiriqlarni bajaring'),
    '<tg-emoji emoji-id="5974040135661002415">👥</tg-emoji> Do‘st taklif qiling, ' +
      '<tg-emoji emoji-id="5974423955413409429">📋</tg-emoji> topshiriqlarni bajaring',
  );
  assert.equal(
    toTelegramHtml(`👤 ${telegramUserMention('123456', 'Ali <Admin>')}`),
    '<tg-emoji emoji-id="5972291697424473566">👤</tg-emoji> <a href="tg://user?id=123456">Ali &lt;Admin&gt;</a>',
  );
  assert.throws(() => telegramUserMention('invalid', 'Ali'), /must be numeric/);
});

test('all supplied premium emoji variants are formatted as Telegram custom emoji', () => {
  const emojis = [
    '📢', '👤', '💬', '⚙️', '⭐️', '👮', '💟', '🙂', '🖼', '📹', '📑', '🎙', '📼',
    '📊', '☑️', '🎞', '🎵', '📍', '😜', '🎲', '🆓', '↩️', 'ℹ️', '❔', '📤', '🫣',
    '🗑', '🟢', '🔴', '🔵', '🔘', '🔽', '🔼', '🔔', '🔕', '👁', '❗️', '❌', '✅',
    '⚠️', '📞', '📌', '🔑', '🤖', '🛡', '⬅️', '➡️', '🚫', '⛔️', '💤', '👋', '🗓',
    '#️⃣', '🗣', '🕓', '📐', '✏️', '👩‍⚖️', '📄', '🪂', '▶️', '➕', '📁', '🎁', '🎈',
    '👥', '🔗', '📋', '🆘', '📈', '✋', '🤳', '⏳', '✔️', '💰', '🔓', '🔧', '🆕',
    '🧑‍💻', '🍎', '🥚', '📺', '🐔', '🍑', '🌐', '⌨️', '🛒', '🧠', '📝',
  ];

  for (const emoji of emojis) {
    const normalizedEmoji = emoji.replace(/\uFE0F/g, '');
    const formatted = toTelegramHtml(`${emoji} Tekshiruv`);
    assert.match(
      formatted,
      new RegExp(`^<tg-emoji emoji-id="\\d+">${normalizedEmoji}</tg-emoji> Tekshiruv$`),
      `Missing custom emoji formatting for ${emoji}`,
    );
    const button = decorateTelegramButton({ text: `${emoji} Tekshiruv`, callback_data: 'test' });
    assert.equal(button.text, 'Tekshiruv', `Button emoji was not extracted for ${emoji}`);
    assert.match(button.icon_custom_emoji_id, /^\d+$/, `Button emoji was not decorated for ${emoji}`);
  }
});

test('Telegram inline and reply keyboard buttons receive custom emoji icons and supported colors', () => {
  const markup = decorateTelegramReplyMarkup({
    inline_keyboard: [[
      { text: '✅ Tasdiqlash', callback_data: 'approve' },
      { text: '❌ Rad etish', callback_data: 'reject' },
      { text: '🧾 Topshiriqlar', callback_data: 'tasks' },
      { text: 'Mini ilovani ochish', web_app: { url: 'https://example.com' } },
      { text: '▶️ Mini ilovani ochish', web_app: { url: 'https://example.com' } },
    ]],
  });

  const [approve, reject, tasks, appButton, launchButton] = markup.inline_keyboard[0];
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
  assert.equal(launchButton.text, 'Mini ilovani ochish');
  assert.equal(launchButton.icon_custom_emoji_id, '5974561351417212974');
  assert.equal(launchButton.style, 'primary');

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
    '<tg-emoji emoji-id="5974040135661002415">👥</tg-emoji> Taklif ' +
      '<tg-emoji emoji-id="5971815857997750999">✅</tg-emoji>',
  );
  assert.deepEqual(request[1].reply_markup.inline_keyboard[0].map((button) => ({
    text: button.text,
    icon_custom_emoji_id: button.icon_custom_emoji_id,
    style: button.style,
  })), [
    { text: 'Tasdiqlash', icon_custom_emoji_id: '5971815857997750999', style: 'success' },
    { text: 'Rad etish', icon_custom_emoji_id: '5971958979192962630', style: 'danger' },
  ]);

  await configuredBot.telegram.sendMessage(
    12345,
    `👤 ${telegramUserMention('67890', 'Ali <User>')}`,
  );
  assert.equal(
    request[1].text,
    '<tg-emoji emoji-id="5972291697424473566">👤</tg-emoji> <a href="tg://user?id=67890">Ali &lt;User&gt;</a>',
  );

  await configuredBot.telegram.sendMessage(
    12345,
    '👋 Xush kelibsiz!\n🏆 Reytingni oching.',
    Markup.inlineKeyboard([[
      Markup.button.webApp('▶️ Mini ilovani ochish', 'https://example.com'),
    ]]),
  );
  assert.equal(
    request[1].text,
    '<tg-emoji emoji-id="5972185031911677527">👋</tg-emoji> Xush kelibsiz!\n' +
      '<tg-emoji emoji-id="5974236196623098000">🏆</tg-emoji> Reytingni oching.',
  );
  assert.deepEqual(request[1].reply_markup.inline_keyboard[0][0], {
    text: 'Mini ilovani ochish',
    web_app: { url: 'https://example.com' },
    icon_custom_emoji_id: '5974561351417212974',
    style: 'primary',
  });
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
  assert.equal(config.referralGift, null);
  assert.equal(config.dailyReferralThreshold, 10);
  assert.equal(config.promoRedemptionLimit, 100);
  assert.equal(config.levelRewardCoins, 100);
});

test('rules file and level badge animation are present and valid', () => {
  const rules = fs.readFileSync(path.join(__dirname, '..', 'QOIDALAR.txt'), 'utf8');
  const badge = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'icons', 'level-badge.json'), 'utf8'));
  assert.match(rules, /Haftalik sovrin/);
  assert.match(rules, /kamida bitta topshiriq/);
  assert.equal(badge.w, 512);
  assert.equal(badge.h, 512);
  assert.ok(Array.isArray(badge.layers));
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
  const miniAppHtml = await miniApp.text();
  assert.match(miniAppHtml, /<title>Viral<\/title>/);
  assert.match(miniAppHtml, /id="page-rules"/);
  assert.match(miniAppHtml, /id="rulesContent"/);
  const rules = await fetch(`${baseUrl}/qoidalar.txt`);
  assert.equal(rules.status, 200);
  assert.match(rules.headers.get('content-type'), /text\/plain/);
  assert.equal(await rules.text(), fs.readFileSync(path.join(__dirname, '..', 'QOIDALAR.txt'), 'utf8'));
  const background = await fetch(`${baseUrl}/assets/background.png`);
  assert.equal(background.status, 200);
  const badge = await fetch(`${baseUrl}/icons/level-badge.json`);
  assert.equal(badge.status, 200);
  assert.equal((await badge.json()).w, 512);
  const backendSource = await fetch(`${baseUrl}/server.js`);
  assert.equal(backendSource.status, 404);
});
