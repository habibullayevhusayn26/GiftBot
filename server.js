require('dotenv').config();

const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoose = require('mongoose');
const { Telegraf, Markup } = require('telegraf');

const TIME_ZONE = 'Asia/Tashkent';
const DAY_MS = 24 * 60 * 60 * 1000;

function toTelegramHtml(value) {
  const escaped = String(value).replace(/[&<>]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
  })[character]);
  return `<tg-emoji emoji-id="5972237795584909109">💬</tg-emoji> ${escaped}`;
}

const DEFAULTS = {
  weeklyPrize: 100000,
  refReward: 50,
  refBonus: 25,
  channelReward: 100,
  instagramReward: 75,
  invite3Reward: 200,
  dailyBonusBase: 20,
  dailyStreakBonus: 10,
  channelChatId: '',
  channelUrl: '',
  instagramUrl: '',
};

function getTashkentDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function getWeekRange(date = new Date()) {
  const shifted = new Date(date.getTime() + 5 * 60 * 60 * 1000);
  const day = (shifted.getUTCDay() + 6) % 7;
  const localMonday = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() - day,
  );
  const start = new Date(localMonday - 5 * 60 * 60 * 1000);
  return { start, end: new Date(start.getTime() + 7 * DAY_MS) };
}

function verifyTelegramInitData(initData, botToken, now = Date.now()) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) return null;
  params.delete('hash');

  const checkString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secret).update(checkString).digest();
  const actual = Buffer.from(hash, 'hex');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;

  const authDate = Number(params.get('auth_date'));
  if (!Number.isInteger(authDate) || authDate > Math.floor(now / 1000) + 60 ||
      now / 1000 - authDate > 24 * 60 * 60) return null;

  try {
    const user = JSON.parse(params.get('user') || 'null');
    if (!user || !/^\d+$/.test(String(user.id))) return null;
    return { user, startParam: params.get('start_param') || '' };
  } catch {
    return null;
  }
}

const userSchema = new mongoose.Schema({
  _id: { type: String },
  username: { type: String, default: '' },
  firstName: { type: String, default: 'Foydalanuvchi' },
  lastName: { type: String, default: '' },
  photoUrl: { type: String, default: '' },
  invitedBy: { type: String, default: null },
  referralRewarded: { type: Boolean, default: false },
  verified: { type: Boolean, default: false },
  streak: { type: Number, default: 0 },
  lastDailyDate: { type: String, default: '' },
}, { timestamps: true, versionKey: false });

const ledgerSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  points: { type: Number, required: true },
  type: { type: String, required: true },
  key: { type: String, required: true, unique: true },
  details: { type: String, default: '' },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });
ledgerSchema.index({ createdAt: 1, userId: 1 });

const taskSchema = new mongoose.Schema({
  _id: { type: String },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  icon: { type: String, default: '✅' },
  type: { type: String, enum: ['channel', 'manual', 'referrals'], required: true },
  reward: { type: Number, min: 1, required: true },
  url: { type: String, default: '' },
  chatId: { type: String, default: '' },
  requiredForReferral: { type: Boolean, default: false },
  requiredCount: { type: Number, default: 0 },
  enabled: { type: Boolean, default: true },
  position: { type: Number, default: 0 },
}, { timestamps: true, versionKey: false });

const claimSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  taskId: { type: String, required: true },
  proof: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  reviewedBy: { type: String, default: '' },
  reviewedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });
claimSchema.index({ userId: 1, taskId: 1 }, { unique: true });

const captchaSchema = new mongoose.Schema({
  _id: { type: String },
  userId: { type: String, required: true },
  answers: { type: [String], required: true },
  expiresAt: { type: Date, required: true },
  used: { type: Boolean, default: false },
}, { versionKey: false });
captchaSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const weeklyAwardSchema = new mongoose.Schema({
  _id: { type: String },
  userId: { type: String, default: '' },
  points: { type: Number, default: 0 },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'paid', 'empty'], default: 'pending' },
  paidAt: { type: Date, default: null },
  paidBy: { type: String, default: '' },
}, { timestamps: true, versionKey: false });

const settingSchema = new mongoose.Schema({
  _id: { type: String },
  value: { type: mongoose.Schema.Types.Mixed },
}, { versionKey: false });

const User = mongoose.model('User', userSchema);
const Ledger = mongoose.model('Ledger', ledgerSchema);
const Task = mongoose.model('Task', taskSchema);
const Claim = mongoose.model('Claim', claimSchema);
const Captcha = mongoose.model('Captcha', captchaSchema);
const WeeklyAward = mongoose.model('WeeklyAward', weeklyAwardSchema);
const Setting = mongoose.model('Setting', settingSchema);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

function parseAdminIds(value) {
  const ids = String(value || '').split(',').map((part) => part.trim()).filter(Boolean);
  if (!ids.length || ids.some((id) => !/^\d+$/.test(id))) {
    throw new Error('ADMIN_IDS must contain one or more numeric Telegram user IDs.');
  }
  return new Set(ids);
}

function normalizeAppUrl(value) {
  let appUrl;
  try {
    appUrl = new URL(String(value || '').trim());
  } catch {
    throw new Error('APP_URL must be a public HTTPS URL, for example https://your-app.onrender.com/.');
  }
  if (appUrl.protocol !== 'https:' || !appUrl.hostname || appUrl.username || appUrl.password) {
    throw new Error('APP_URL must be a public HTTPS URL without embedded credentials.');
  }
  return appUrl.href;
}

function isActiveChatMember(member) {
  return ['member', 'administrator', 'creator'].includes(member?.status) ||
    (member?.status === 'restricted' && member.is_member === true);
}

function createApplication(options = {}) {
  const env = options.env || process.env;
  const botToken = env.API_TOKEN;
  if (!botToken) throw new Error('API_TOKEN is required (Telegram bot token from @BotFather).');
  if (!env.APP_URL) throw new Error('APP_URL is required.');
  const adminIds = parseAdminIds(env.ADMIN_IDS);
  const config = {
    botToken,
    appUrl: normalizeAppUrl(env.APP_URL),
    botUsername: '',
    ...DEFAULTS,
    adminIds,
  };

  const bot = options.bot || new Telegraf(botToken);
  const originalCallApi = bot.telegram.callApi.bind(bot.telegram);
  bot.telegram.callApi = (method, payload, ...args) => {
    if (method === 'sendMessage' && typeof payload.text === 'string') {
      const { entities, ...message } = payload;
      return originalCallApi(method, {
        ...message,
        text: toTelegramHtml(payload.text),
        parse_mode: 'HTML',
      }, ...args);
    }
    return originalCallApi(method, payload, ...args);
  };
  const app = express();
  const pendingAdminInputs = new Map();
  const pendingChannelSelections = new Map();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(express.json({ limit: '32kb' }));
  app.use('/api', rateLimit({
    windowMs: 60 * 1000,
    limit: 90,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  }));

  const botLink = () => `https://t.me/${config.botUsername}`;
  const inviteLink = (userId) => `${botLink()}?start=ref_${userId}`;

  async function saveSetting(key, value) {
    await Setting.updateOne({ _id: key }, { $set: { value } }, { upsert: true });
    config[key] = value;
  }

  async function ensureUser(telegramUser, startParam = '') {
    const id = String(telegramUser.id);
    const refMatch = /^ref_(\d+)$/.exec(startParam);
    const inviterId = refMatch && refMatch[1] !== id ? refMatch[1] : null;
    const firstName = String(telegramUser.first_name || 'Foydalanuvchi').slice(0, 64);
    const lastName = String(telegramUser.last_name || '').slice(0, 64);
    const username = String(telegramUser.username || '').slice(0, 64);
    const photoUrl = String(telegramUser.photo_url || '').slice(0, 500);
    return User.findByIdAndUpdate(id, {
      $set: { firstName, lastName, username, photoUrl },
      $setOnInsert: { invitedBy: inviterId },
    }, { new: true, upsert: true, setDefaultsOnInsert: true });
  }

  function authenticate(req, res, next) {
    const verified = verifyTelegramInitData(req.get('X-Telegram-Init-Data'), config.botToken);
    if (!verified) return next(new HttpError(401, 'Telegram sessiyasi yaroqsiz yoki eskirgan. Mini ilovani qayta oching.'));
    req.telegram = verified.user;
    req.startParam = verified.startParam;
    next();
  }

  const requireVerified = asyncRoute(async (req, res, next) => {
    const user = await User.findById(String(req.telegram.id));
    if (!user?.verified) throw new HttpError(403, 'Avval mini-ilova tekshiruvini bajaring.');
    req.gameUser = user;
    next();
  });

  async function addPoints(userId, points, type, key, details = '') {
    if (!Number.isSafeInteger(points) || points <= 0) throw new Error('Point rewards must be positive integers.');
    try {
      const result = await Ledger.updateOne(
        { key },
        { $setOnInsert: { userId: String(userId), points, type, key, details } },
        { upsert: true },
      );
      return result.upsertedCount === 1;
    } catch (error) {
      if (error.code === 11000) return false;
      throw error;
    }
  }

  async function isMemberOfRequiredChannels(userId) {
    const channels = await Task.find({
      type: 'channel',
      enabled: true,
      requiredForReferral: true,
    }).select('title chatId').lean();
    for (const channel of channels) {
      try {
        const member = await bot.telegram.getChatMember(channel.chatId, Number(userId));
        if (!isActiveChatMember(member)) return false;
      } catch (error) {
        console.error(`Could not check membership in required channel ${channel.chatId}:`, error.message);
        throw new HttpError(503, 'Majburiy kanal a’zoligini tekshirib bo‘lmadi. Keyinroq qayta urinib ko‘ring.');
      }
    }
    return true;
  }

  async function awardReferral(user) {
    if (!user.invitedBy || user.referralRewarded || !user.verified) return;
    if (!(await isMemberOfRequiredChannels(user._id))) return;
    const inviter = await User.findById(user.invitedBy);
    if (!inviter) return;
    await addPoints(inviter._id, config.refReward, 'referral', `referrer:${user._id}`, `Taklif: ${user.firstName}`);
    await addPoints(user._id, config.refBonus, 'referral', `referred:${user._id}`, 'Taklif havolasi orqali qo‘shildi');
    const result = await User.updateOne(
      { _id: user._id, referralRewarded: false },
      { $set: { referralRewarded: true } },
    );
    if (result.modifiedCount === 1) {
      try {
        await bot.telegram.sendMessage(
          inviter._id,
          `🎉 Do‘stingiz ${user.firstName} referraldan o‘tdi! Sizga +${config.refReward} coin qo‘shildi.`,
        );
      } catch (error) {
        console.error(`Could not notify referrer ${inviter._id}:`, error.message);
      }
    }
  }

  async function ensureSeedTasks() {
    for (const [key, value] of Object.entries(DEFAULTS)) {
      await Setting.updateOne({ _id: key }, { $setOnInsert: { value } }, { upsert: true });
    }
    const savedSettings = await Setting.find({ _id: { $in: Object.keys(DEFAULTS) } }).lean();
    for (const setting of savedSettings) {
      config[setting._id] = setting.value;
    }
    const seeds = [
      {
        _id: 'channel',
        title: 'Kanalga obuna bo‘ling',
        description: 'Yangiliklar kanaliga qo‘shiling',
        icon: '📣',
        type: 'channel',
        reward: config.channelReward,
        url: config.channelUrl,
        chatId: config.channelChatId,
        enabled: Boolean(config.channelUrl && config.channelChatId),
        position: 0,
      },
      {
        _id: 'instagram',
        title: 'Instagram sahifasini kuzating',
        description: 'Rasmiy sahifani kuzatib, tasdiqqa yuboring',
        icon: '📷',
        type: 'manual',
        reward: config.instagramReward,
        url: config.instagramUrl,
        enabled: Boolean(config.instagramUrl),
        position: 1,
      },
      {
        _id: 'invite3',
        title: '3 ta do‘st taklif qiling',
        description: 'Tekshirilgan 3 ta do‘st taklif qiling',
        icon: '👥',
        type: 'referrals',
        reward: config.invite3Reward,
        requiredCount: 3,
        enabled: true,
        position: 2,
      },
    ];
    for (const task of seeds) {
      await Task.updateOne({ _id: task._id }, { $setOnInsert: task }, { upsert: true });
    }
    await Task.updateOne({ _id: 'channel' }, { $set: {
      reward: config.channelReward,
      url: config.channelUrl,
      chatId: config.channelChatId,
    } });
    await Task.updateOne({ _id: 'instagram' }, { $set: {
      reward: config.instagramReward,
      url: config.instagramUrl,
    } });
    for (const key of ['weeklyPrize', 'refReward', 'refBonus', 'channelReward', 'instagramReward', 'invite3Reward', 'dailyBonusBase', 'dailyStreakBonus']) {
      const value = Number(config[key]);
      if (!Number.isSafeInteger(value) || value < 1) {
        throw new Error(`MongoDB setting "${key}" must be a positive integer.`);
      }
      config[key] = value;
    }
  }

  async function getPointTotal(userId, range = null) {
    const match = { userId: String(userId), points: { $gt: 0 } };
    if (range) match.createdAt = { $gte: range.start, $lt: range.end };
    const [result] = await Ledger.aggregate([
      { $match: match },
      { $group: { _id: null, points: { $sum: '$points' } } },
    ]);
    return result?.points || 0;
  }

  async function leaderboard(period, currentUserId) {
    const range = period === 'week' ? getWeekRange() : null;
    const match = { points: { $gt: 0 } };
    if (range) match.createdAt = { $gte: range.start, $lt: range.end };
    const pipeline = [
      { $match: match },
      { $group: { _id: '$userId', score: { $sum: '$points' } } },
      { $sort: { score: -1, _id: 1 } },
      { $limit: 100 },
      { $lookup: { from: User.collection.name, localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $project: { _id: 0, userId: '$_id', name: '$user.firstName', username: '$user.username', score: 1 } },
    ];
    const rows = await Ledger.aggregate(pipeline);
    const ownScore = await getPointTotal(currentUserId, range);
    let rank = null;
    if (ownScore > 0) {
      const higherMatch = { points: { $gt: 0 } };
      if (range) higherMatch.createdAt = { $gte: range.start, $lt: range.end };
      const [result] = await Ledger.aggregate([
        { $match: higherMatch },
        { $group: { _id: '$userId', score: { $sum: '$points' } } },
        { $match: { score: { $gt: ownScore } } },
        { $count: 'count' },
      ]);
      rank = (result?.count || 0) + 1;
    }
    return { rows, ownScore, rank };
  }

  async function currentTasks(userId) {
    const [tasks, claims, invitedCount] = await Promise.all([
      Task.find({ enabled: true }).sort({ position: 1, _id: 1 }).lean(),
      Claim.find({ userId }).lean(),
      User.countDocuments({ invitedBy: userId, referralRewarded: true }),
    ]);
    const claimMap = new Map(claims.map((claim) => [claim.taskId, claim]));
    return tasks.map((task) => {
      const claim = claimMap.get(task._id);
      const done = claim?.status === 'approved';
      const pending = claim?.status === 'pending';
      const progress = task.type === 'referrals' ? invitedCount : 0;
      return {
        id: task._id,
        title: task.title,
        sub: task.description,
        icon: task.icon,
        reward: task.reward,
        type: task.type,
        url: task.url,
        requiredForReferral: task.requiredForReferral,
        done,
        pending,
        progress,
        requiredCount: task.requiredCount,
        canClaim: task.type !== 'referrals' || progress >= task.requiredCount,
      };
    });
  }

  async function getMe(user) {
    await awardReferral(user);
    const current = await User.findById(user._id).lean();
    const range = getWeekRange();
    const [balance, weekly, referrals, referralCount, tasks, weekRank] = await Promise.all([
      getPointTotal(current._id),
      getPointTotal(current._id, range),
      User.find({ invitedBy: current._id, referralRewarded: true })
        .sort({ createdAt: -1 }).limit(50).select('firstName username createdAt').lean(),
      User.countDocuments({ invitedBy: current._id, referralRewarded: true }),
      currentTasks(current._id),
      leaderboard('week', current._id),
    ]);
    return {
      verified: current.verified,
      user: {
        id: current._id,
        name: current.firstName,
        username: current.username,
        photoUrl: current.photoUrl,
        balance,
        weeklyPoints: weekly,
        rank: weekRank.rank,
        referralCount,
        streak: current.streak,
        dailyClaimed: current.lastDailyDate === getTashkentDate(),
      },
      tasks,
      friends: referrals.map((friend) => ({
        name: friend.firstName,
        username: friend.username,
        earned: config.refReward,
        ago: new Intl.RelativeTimeFormat('uz', { numeric: 'auto' }).format(
          -Math.max(0, Math.floor((Date.now() - friend.createdAt.getTime()) / DAY_MS)),
          'day',
        ),
      })),
      inviteLink: inviteLink(current._id),
      botUsername: config.botUsername,
      prize: config.weeklyPrize,
      rewards: { refReward: config.refReward, refBonus: config.refBonus },
    };
  }

  const CAPTCHA_EMOJIS = [
    ['🐼', 'Panda'], ['🦊', 'Tulki'], ['🐴', 'Ot'], ['🐸', 'Baqa'], ['🦁', 'Sher'],
    ['🐧', 'Pingvin'], ['🐙', 'Sakkizoyoq'], ['🐢', 'Toshbaqa'], ['🐘', 'Fil'],
    ['🐵', 'Maymun'], ['🐰', 'Quyon'], ['🐻', 'Ayiq'], ['🐶', 'It'], ['🐱', 'Mushuk'],
    ['🐮', 'Sigir'], ['🐷', 'Cho‘chqa'], ['🐔', 'Tovuq'], ['🦆', 'O‘rdak'],
    ['🐝', 'Asalari'], ['🦋', 'Kapalak'], ['🐟', 'Baliq'], ['🐬', 'Delfin'],
    ['🍎', 'Olma'], ['🍌', 'Banan'], ['🍇', 'Uzum'], ['🍉', 'Tarvuz'],
    ['🍒', 'Gilos'], ['🍓', 'Qulupnay'], ['🍋', 'Limon'], ['🥕', 'Sabzi'],
    ['🚗', 'Mashina'], ['🚲', 'Velosiped'], ['⚽', 'To‘p'], ['🌙', 'Oy'],
    ['⭐', 'Yulduz'], ['🌳', 'Daraxt'], ['🏠', 'Uy'], ['🎈', 'Shar'],
    ['🔑', 'Kalit'], ['🚀', 'Raketa'],
  ];

  function shuffle(items) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function makeCaptchaRound(kind) {
    if (kind === 'name') {
      const options = shuffle(CAPTCHA_EMOJIS).slice(0, 9);
      const target = options[crypto.randomInt(options.length)];
      const answer = String(options.indexOf(target));
      return {
        answer,
        round: { q: 'Quyidagi rasmni toping:', big: target[1], options: options.map((item, id) => ({ id: String(id), label: item[0] })) },
      };
    }
    if (kind === 'math') {
      const a = crypto.randomInt(3, 26);
      const b = crypto.randomInt(2, 21);
      const add = crypto.randomInt(2) === 0;
      const left = !add && b > a ? b : a;
      const right = !add && b > a ? a : b;
      const answer = add ? left + right : left - right;
      const values = new Set([answer]);
      while (values.size < 9) values.add(Math.max(0, answer + crypto.randomInt(-9, 10)));
      const options = shuffle([...values]);
      return {
        answer: String(answer),
        round: { q: 'Natijani toping:', big: `${left} ${add ? '+' : '−'} ${right} = ?`, num: true, options: options.map((value) => ({ id: String(value), label: String(value) })) },
      };
    }
    const [emoji] = CAPTCHA_EMOJIS[crypto.randomInt(CAPTCHA_EMOJIS.length)];
    const count = crypto.randomInt(3, 10);
    const values = new Set([count]);
    while (values.size < 9) values.add(crypto.randomInt(1, 13));
    const options = shuffle([...values]);
    return {
      answer: String(count),
      round: { q: 'Nechta rasm bor?', big: emoji.repeat(count), image: emoji, count, num: true, options: options.map((value) => ({ id: String(value), label: String(value) })) },
    };
  }

  async function createChallenge(userId) {
    const kinds = shuffle(['name', 'math', 'count']);
    const rounds = kinds.map(makeCaptchaRound);
    const id = crypto.randomBytes(24).toString('hex');
    await Captcha.create({
      _id: id,
      userId,
      answers: rounds.map((round) => round.answer),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });
    return { id, rounds: rounds.map((round) => round.round) };
  }

  async function notifyAdmins(text, extra = {}) {
    for (const adminId of config.adminIds) {
      try {
        await bot.telegram.sendMessage(adminId, text, extra);
      } catch (error) {
        console.error(`Could not notify admin ${adminId}:`, error.message);
      }
    }
  }

  async function adminOnly(ctx, next) {
    if (!config.adminIds.has(String(ctx.from?.id))) {
      if (ctx.callbackQuery) await ctx.answerCbQuery('Bu bo‘lim adminlar uchun.', { show_alert: true });
      else await ctx.reply('Bu buyruq faqat adminlar uchun.');
      return;
    }
    return next();
  }

  const adminKeyboard = () => Markup.inlineKeyboard([
    [Markup.button.callback('🧾 Topshiriq tasdiqlari', 'admin_claims')],
    [Markup.button.callback('🏆 Haftalik g‘olib', 'admin_week')],
    [
      Markup.button.callback('📋 Topshiriqlar', 'admin_tasks'),
      Markup.button.callback('📢 Kanallar', 'admin_channels'),
    ],
    [Markup.button.callback('⚙️ Ball va havolalar', 'admin_settings')],
  ]);

  async function showChannelSettings(ctx, page = 0) {
    const pageSize = 8;
    const [channels, total] = await Promise.all([
      Task.find({ type: 'channel' }).sort({ requiredForReferral: -1, position: 1, _id: 1 })
        .skip(page * pageSize).limit(pageSize).lean(),
      Task.countDocuments({ type: 'channel' }),
    ]);
    const rows = [
      [Markup.button.callback('➕ Majburiy kanal', 'channel_add_required')],
      [Markup.button.callback('➕ Bonus kanal', 'channel_add_bonus')],
    ];
    for (const channel of channels) {
      const kind = channel.requiredForReferral ? '🔒 Majburiy' : '🎁 Bonus';
      const reward = channel.requiredForReferral ? '' : ` · ${channel.reward} coin`;
      rows.push([Markup.button.callback(
        `${channel.enabled ? '🟢' : '⚫'} ${kind}: ${channel.title}${reward}`.slice(0, 60),
        `channel_info_${channel._id}`,
      )]);
    }
    const navigation = [];
    if (page > 0) navigation.push(Markup.button.callback('⬅️ Oldingi', `admin_channels_${page - 1}`));
    if ((page + 1) * pageSize < total) navigation.push(Markup.button.callback('Keyingi ➡️', `admin_channels_${page + 1}`));
    if (navigation.length) rows.push(navigation);
    rows.push([Markup.button.callback('⬅️ Admin panel', 'admin_home')]);
    await ctx.reply(
      `📢 Kanal sozlamalari\nMajburiy obunalar: ${await Task.countDocuments({ type: 'channel', requiredForReferral: true, enabled: true })}\nBonus kanallar: ${await Task.countDocuments({ type: 'channel', requiredForReferral: false, enabled: true })}\n\nKanal qo‘shish uchun tugmani bosing va ro‘yxatdan bot hamda siz admin bo‘lgan kanalni tanlang.`,
      Markup.inlineKeyboard(rows),
    );
  }

  async function showTaskSettings(ctx, page = 0) {
    const pageSize = 8;
    const tasks = await Task.find({ type: { $ne: 'channel' } })
      .sort({ position: 1, _id: 1 }).skip(page * pageSize).limit(pageSize).lean();
    const total = await Task.countDocuments({ type: { $ne: 'channel' } });
    if (!total) {
      await ctx.reply('Kanal bo‘lmagan topshiriqlar topilmadi.', Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ Admin panel', 'admin_home')],
      ]));
      return;
    }
    for (const task of tasks) {
      await ctx.reply(
        `${task.enabled ? '🟢' : '⚫'} ${task.title}\nMukofot: ${task.reward} coin`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback(task.enabled ? 'O‘chirish' : 'Yoqish', `task_toggle_${task._id}`),
            Markup.button.callback('✏️ Ballni o‘zgartirish', `task_reward_${task._id}`),
          ],
        ]),
      );
    }
    const rows = [];
    if (page > 0) rows.push([Markup.button.callback('⬅️ Oldingi', `admin_tasks_${page - 1}`)]);
    if ((page + 1) * pageSize < total) rows.push([Markup.button.callback('Keyingi ➡️', `admin_tasks_${page + 1}`)]);
    rows.push([Markup.button.callback('⬅️ Admin panel', 'admin_home')]);
    await ctx.reply(
      '📋 Topshiriqlar boshqaruvi\nYangi topshiriq uchun /task_add buyrug‘idan foydalaning.',
      Markup.inlineKeyboard(rows),
    );
  }

  async function promptAdminInput(ctx, input) {
    const prompt = await ctx.reply(input.prompt, Markup.forceReply());
    pendingAdminInputs.set(String(ctx.from.id), { ...input, promptMessageId: prompt.message_id });
  }

  async function showSettings(ctx) {
    const keys = [
      ['Haftalik sovrin', 'weeklyPrize'],
      ['Taklif qiluvchiga bonus', 'refReward'],
      ['Taklif bilan kelganga bonus', 'refBonus'],
      ['Yangi bonus kanal balli', 'channelReward'],
      ['Instagram topshirig‘i', 'instagramReward'],
      ['Do‘st taklif qilish topshirig‘i', 'invite3Reward'],
      ['Kunlik bonus', 'dailyBonusBase'],
      ['Ketma-ket kun bonusi', 'dailyStreakBonus'],
    ];
    const rows = keys.map(([title, key]) => [Markup.button.callback(
      `✏️ ${title}: ${Number(config[key]).toLocaleString('uz-UZ')}`,
      `setting_edit_${key}`,
    )]);
    rows.push([Markup.button.callback('📷 Instagram havolasini o‘zgartirish', 'setting_edit_instagramUrl')]);
    rows.push([Markup.button.callback('⬅️ Admin panel', 'admin_home')]);
    await ctx.reply(
      `⚙️ Ball va havolalar\n\nInstagram: ${config.instagramUrl || 'sozlanmagan'}\n\nQiymatni o‘zgartirish uchun tegishli tugmani bosing. Sozlamalar MongoDB’da saqlanadi.`,
      Markup.inlineKeyboard(rows),
    );
  }

  async function showAdminPanel(ctx) {
    const latest = await WeeklyAward.findOne({ status: { $in: ['pending', 'paid'] } }).sort({ _id: -1 }).lean();
    const pending = await Claim.countDocuments({ status: 'pending' });
    const awardLine = latest
      ? `\nSo‘nggi haftalik sovrin: ${latest.status === 'paid' ? 'to‘langan' : 'to‘lash kutilmoqda'}`
      : '\nHaftalik g‘olib hali aniqlanmagan.';
    await ctx.reply(
      `🛠 Admin panel\n\nHaftalik sovrin: ${Number(config.weeklyPrize).toLocaleString('uz-UZ')} so‘m\nKutilayotgan tasdiqlar: ${pending}${awardLine}\n\nBarcha o‘yin sozlamalari MongoDB’da saqlanadi.`,
      adminKeyboard(),
    );
  }

  bot.on('message', async (ctx, next) => {
    const adminId = String(ctx.from?.id || '');
    if (!config.adminIds.has(adminId)) return next();

    const shared = ctx.message.chat_shared;
    if (shared) {
      const pending = pendingChannelSelections.get(adminId);
      if (!pending || pending.requestId !== shared.request_id) {
        await ctx.reply('Kanal tanlash so‘rovi eskirgan. /admin panelidan qayta boshlang.', Markup.removeKeyboard());
        return;
      }
      pendingChannelSelections.delete(adminId);
      try {
        const chatId = String(shared.chat_id);
        const [chat, identity, adminMember] = await Promise.all([
          bot.telegram.getChat(chatId),
          bot.telegram.getMe(),
          bot.telegram.getChatMember(chatId, Number(adminId)),
        ]);
        if (!['administrator', 'creator'].includes(adminMember.status)) {
          throw new Error('Tanlangan kanalda siz administrator emassiz.');
        }
        const botMember = await bot.telegram.getChatMember(chatId, identity.id);
        if (!['administrator', 'creator'].includes(botMember.status)) {
          throw new Error('A’zolikni tekshirish uchun bot tanlangan kanalda admin bo‘lishi kerak.');
        }
        let url = chat.username ? `https://t.me/${chat.username}` : chat.invite_link;
        if (!url) {
          try {
            url = await bot.telegram.exportChatInviteLink(chatId);
          } catch (error) {
            console.error(`Could not create an invite link for channel ${chatId}:`, error.message);
            throw new Error('Yopiq kanal uchun taklif havolasini olish imkonsiz. Botga taklif havolasi yaratish huquqini bering.');
          }
        }
        const duplicate = await Task.exists({
          type: 'channel',
          chatId,
          requiredForReferral: pending.kind === 'required',
        });
        if (duplicate) {
          await ctx.reply('Bu kanal ushbu turda allaqachon qo‘shilgan.', Markup.removeKeyboard());
          await showChannelSettings(ctx);
          return;
        }
        const requiredForReferral = pending.kind === 'required';
        const id = `${requiredForReferral ? 'required' : 'bonus'}_${crypto.randomBytes(8).toString('hex')}`;
        await Task.create({
          _id: id,
          title: String(chat.title || 'Telegram kanali').slice(0, 120),
          description: requiredForReferral ? 'Do‘st taklifini tasdiqlash uchun obuna bo‘ling' : 'Kanalga obuna bo‘ling',
          icon: '📣',
          type: 'channel',
          reward: requiredForReferral ? 1 : config.channelReward,
          url,
          chatId,
          requiredForReferral,
          enabled: true,
          position: requiredForReferral ? -10 : 10,
        });
        await ctx.reply(
          `${requiredForReferral ? 'Majburiy' : 'Bonus'} kanal qo‘shildi: ${chat.title}`,
          Markup.removeKeyboard(),
        );
        await showChannelSettings(ctx);
      } catch (error) {
        console.error('Could not add selected channel:', error.message);
        await ctx.reply(error.message, Markup.removeKeyboard());
      }
      return;
    }

    if (ctx.message.text === 'Bekor qilish' && pendingChannelSelections.has(adminId)) {
      pendingChannelSelections.delete(adminId);
      await ctx.reply('Kanal tanlash bekor qilindi.', Markup.removeKeyboard());
      return;
    }

    const pending = pendingAdminInputs.get(adminId);
    if (!pending || ctx.message.reply_to_message?.message_id !== pending.promptMessageId || !ctx.message.text) {
      return next();
    }
    pendingAdminInputs.delete(adminId);
    const value = ctx.message.text.trim();
    if (pending.kind === 'instagram') {
      let url;
      try {
        url = new URL(value);
        if (url.protocol !== 'https:' || !/(^|\.)instagram\.com$/i.test(url.hostname)) throw new Error();
      } catch {
        await ctx.reply('Instagram havolasi noto‘g‘ri. Masalan: https://www.instagram.com/sahifa/');
        return;
      }
      await saveSetting('instagramUrl', url.href);
      await Task.updateOne({ _id: 'instagram' }, { $set: { url: url.href, enabled: true } });
      await ctx.reply('Instagram havolasi saqlandi.');
      await showSettings(ctx);
      return;
    }
    const amount = Number(value.replace(/[,_\s]/g, ''));
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1_000_000_000) {
      await ctx.reply('Ball/mablag‘ 1 dan 1 000 000 000 gacha butun son bo‘lishi kerak.');
      return;
    }
    if (pending.kind === 'task_reward') {
      const task = await Task.findById(pending.taskId);
      if (!task) {
        await ctx.reply('Topshiriq topilmadi.');
        return;
      }
      task.reward = amount;
      await task.save();
      await ctx.reply(`“${task.title}” topshirig‘i endi ${amount} coin beradi.`);
      await showTaskSettings(ctx);
      return;
    }
    const settingKeys = new Set([
      'weeklyPrize', 'refReward', 'refBonus', 'channelReward', 'instagramReward',
      'invite3Reward', 'dailyBonusBase', 'dailyStreakBonus',
    ]);
    if (!settingKeys.has(pending.key)) {
      await ctx.reply('Noma’lum sozlama.');
      return;
    }
    await saveSetting(pending.key, amount);
    const taskId = {
      channelReward: 'channel',
      instagramReward: 'instagram',
      invite3Reward: 'invite3',
    }[pending.key];
    if (taskId) await Task.updateOne({ _id: taskId }, { $set: { reward: amount } });
    await ctx.reply('Sozlama MongoDB’da saqlandi.');
    await showSettings(ctx);
  });

  bot.catch((error, ctx) => {
    console.error(`Bot error on ${ctx.updateType}:`, error);
  });

  bot.on('chat_member', async (ctx) => {
    const update = ctx.update.chat_member;
    if (!isActiveChatMember(update.new_chat_member)) return;
    const user = await User.findById(String(update.new_chat_member.user.id)).lean();
    if (!user?.invitedBy || user.referralRewarded || !user.verified) return;
    try {
      await awardReferral(user);
    } catch (error) {
      console.error(`Could not process referral after channel join for ${user._id}:`, error);
    }
  });

  bot.start(async (ctx) => {
    const payload = ctx.startPayload || '';
    await ensureUser(ctx.from, payload);
    if (!config.botUsername) {
      const identity = await bot.telegram.getMe();
      config.botUsername = identity.username;
    }
    await ctx.reply(
      'Viral mini-ilovasiga xush kelibsiz! Do‘st taklif qiling, topshiriqlarni bajaring va haftalik sovrin uchun bellashing.',
      Markup.inlineKeyboard([[Markup.button.webApp('Mini ilovani ochish', config.appUrl)]]),
    );
  });

  bot.command('admin', adminOnly, showAdminPanel);
  bot.action('admin_home', adminOnly, async (ctx) => {
    await ctx.answerCbQuery();
    await showAdminPanel(ctx);
  });
  bot.command('setprize', adminOnly, async (ctx) => {
    const amount = Number((ctx.message.text.split(/\s+/)[1] || '').replace(/[,_\s]/g, ''));
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1_000_000_000) {
      await ctx.reply('Miqdorni to‘g‘ri kiriting: /setprize 100000');
      return;
    }
    await saveSetting('weeklyPrize', amount);
    await ctx.reply(`Haftalik sovrin ${amount.toLocaleString('uz-UZ')} so‘m qilib belgilandi.`);
  });

  bot.command('setreward', adminOnly, async (ctx) => {
    const [, name, rawAmount] = ctx.message.text.trim().split(/\s+/);
    const keys = {
      ref: ['refReward', 'do‘st taklif qilgan foydalanuvchiga beriladigan ball'],
      bonus: ['refBonus', 'taklif bilan kelgan do‘stga beriladigan ball'],
      channel: ['channelReward', 'kanal topshirig‘i uchun ball'],
      instagram: ['instagramReward', 'Instagram topshirig‘i uchun ball'],
      invite3: ['invite3Reward', '3 do‘st topshirig‘i uchun ball'],
      daily: ['dailyBonusBase', 'kunlik asosiy bonus'],
      streak: ['dailyStreakBonus', 'kunlik ketma-ketlik uchun har kunlik qo‘shimcha bonus'],
    };
    const reward = Number(String(rawAmount || '').replace(/[,_]/g, ''));
    if (!keys[name] || !Number.isSafeInteger(reward) || reward < 1 || reward > 1_000_000_000) {
      await ctx.reply('Format: /setreward ref|bonus|channel|instagram|invite3|daily|streak BALL');
      return;
    }
    const [key, description] = keys[name];
    await saveSetting(key, reward);
    const taskId = { channel: 'channel', instagram: 'instagram', invite3: 'invite3' }[name];
    if (taskId) await Task.updateOne({ _id: taskId }, { $set: { reward } });
    await ctx.reply(`${description}: ${reward} ball. MongoDB’da saqlandi.`);
  });

  bot.command('setchannel', adminOnly, async (ctx) => {
    const [chatId, url] = ctx.message.text.replace(/^\/setchannel(?:@\w+)?\s*/i, '').split('|').map((part) => part.trim());
    if (!chatId || !url) {
      await ctx.reply('Format: /setchannel @kanal_yoki_CHAT_ID | https://t.me/kanal\nBot kanalda admin bo‘lishi kerak.');
      return;
    }
    try {
      if (new URL(url).protocol !== 'https:') throw new Error('HTTPS required');
    } catch {
      await ctx.reply('Kanal havolasi HTTPS formatida bo‘lishi kerak.');
      return;
    }
    await saveSetting('channelChatId', chatId);
    await saveSetting('channelUrl', url);
    await Task.updateOne(
      { _id: 'channel' },
      { $set: { chatId, url, enabled: true } },
    );
    await ctx.reply('Kanal topshirig‘i yangilandi va MongoDB’da saqlandi.');
  });

  bot.command('setinstagram', adminOnly, async (ctx) => {
    const url = ctx.message.text.replace(/^\/setinstagram(?:@\w+)?\s*/i, '').trim();
    let parsed;
    try {
      parsed = new URL(url);
      if (parsed.protocol !== 'https:' || !/(^|\.)instagram\.com$/i.test(parsed.hostname)) throw new Error('Instagram URL required');
    } catch {
      await ctx.reply('Format: /setinstagram https://instagram.com/sahifa');
      return;
    }
    await saveSetting('instagramUrl', parsed.href);
    await Task.updateOne({ _id: 'instagram' }, { $set: { url: parsed.href, enabled: true } });
    await ctx.reply('Instagram topshirig‘i yangilandi va MongoDB’da saqlandi.');
  });

  bot.command('task_add', adminOnly, async (ctx) => {
    const raw = ctx.message.text.replace(/^\/task_add(?:@\w+)?\s*/i, '');
    const parts = raw.split('|').map((part) => part.trim());
    const [id, rewardText, type] = (parts[0] || '').split(/\s+/);
    const [title, url = '', chatId = ''] = parts.slice(1);
    const reward = Number(rewardText);
    if (!/^[a-z0-9_-]{2,40}$/.test(id || '') ||
        !Number.isSafeInteger(reward) || reward < 1 ||
        !['channel', 'manual', 'referrals'].includes(type) || !title) {
      await ctx.reply('Format: /task_add id ball channel|manual|referrals | Nomi | URL | CHAT_ID\nCHAT_ID faqat channel uchun kerak.');
      return;
    }
    if (type === 'channel' && (!url || !chatId)) {
      await ctx.reply('Kanal topshirig‘i uchun URL va bot admin bo‘lgan CHAT_ID kerak.');
      return;
    }
    if (type === 'manual' && !url) {
      await ctx.reply('Manual tekshiriladigan topshiriq uchun URL kiriting.');
      return;
    }
    if (url) {
      try {
        if (new URL(url).protocol !== 'https:') throw new Error('HTTPS required');
      } catch {
        await ctx.reply('Topshiriq havolasi HTTPS formatida bo‘lishi kerak.');
        return;
      }
    }
    await Task.findByIdAndUpdate(id, {
      title: title.slice(0, 120),
      description: 'Topshiriqni bajaring',
      type,
      reward,
      url,
      chatId: type === 'channel' ? chatId : '',
      icon: type === 'channel' ? '📣' : type === 'manual' ? '✅' : '👥',
      requiredCount: type === 'referrals' ? 3 : 0,
      enabled: true,
      position: 10,
    }, { upsert: true, new: true, runValidators: true });
    await ctx.reply(`“${title}” topshirig‘i qo‘shildi. Uni /admin panelidan boshqarishingiz mumkin.`);
  });

  bot.action('admin_claims', adminOnly, async (ctx) => {
    await ctx.answerCbQuery();
    const claims = await Claim.find({ status: 'pending' }).sort({ createdAt: 1 }).limit(10).lean();
    if (!claims.length) {
      await ctx.reply('Kutilayotgan topshiriq tasdig‘i yo‘q.');
      return;
    }
    for (const claim of claims) {
      const [user, task] = await Promise.all([User.findById(claim.userId).lean(), Task.findById(claim.taskId).lean()]);
      if (!user || !task) continue;
      await ctx.reply(
        `Topshiriq tasdig‘i\nFoydalanuvchi: ${user.firstName} (@${user.username || 'username yo‘q'}, ID ${user._id})\nTopshiriq: ${task.title}\nIsbot: ${claim.proof || '—'}\nMukofot: ${task.reward} coin`,
        Markup.inlineKeyboard([[
          Markup.button.callback('✅ Tasdiqlash', `claim_approve_${claim._id}`),
          Markup.button.callback('❌ Rad etish', `claim_reject_${claim._id}`),
        ]]),
      );
    }
  });

  bot.action('admin_week', adminOnly, async (ctx) => {
    await ctx.answerCbQuery();
    const award = await WeeklyAward.findOne({ status: { $in: ['pending', 'paid'] } }).sort({ _id: -1 }).lean();
    if (!award) {
      await ctx.reply('Haftalik g‘olib hali aniqlanmagan.');
      return;
    }
    if (!award.userId) {
      await ctx.reply(`Hafta ${award._id}: ball to‘plagan foydalanuvchi bo‘lmadi.`);
      return;
    }
    const user = await User.findById(award.userId).lean();
    const text = `Hafta: ${award._id}\nG‘olib: ${user?.firstName || 'Foydalanuvchi'} (ID ${award.userId})\nBall: ${award.points}\nSovrin: ${Number(award.amount).toLocaleString('uz-UZ')} so‘m\nHolat: ${award.status === 'paid' ? 'To‘langan' : 'To‘lash kutilmoqda'}`;
    const keyboard = award.status === 'pending'
      ? Markup.inlineKeyboard([[Markup.button.callback('✅ Pul yuborildi', `pay_week_${award._id}`)]])
      : undefined;
    await ctx.reply(text, keyboard);
  });

  bot.action('admin_tasks', adminOnly, async (ctx) => {
    await ctx.answerCbQuery();
    await showTaskSettings(ctx);
  });

  bot.action(/^admin_tasks_(\d+)$/, adminOnly, async (ctx) => {
    await ctx.answerCbQuery();
    await showTaskSettings(ctx, Number(ctx.match[1]));
  });

  bot.action('admin_channels', adminOnly, async (ctx) => {
    await ctx.answerCbQuery();
    await showChannelSettings(ctx);
  });

  bot.action(/^admin_channels_(\d+)$/, adminOnly, async (ctx) => {
    await ctx.answerCbQuery();
    await showChannelSettings(ctx, Number(ctx.match[1]));
  });

  bot.action(/^channel_add_(required|bonus)$/, adminOnly, async (ctx) => {
    await ctx.answerCbQuery();
    const requestId = crypto.randomInt(1, 2_147_483_647);
    const kind = ctx.match[1];
    pendingChannelSelections.set(String(ctx.from.id), { kind, requestId });
    await ctx.reply(
      `Telegram ro‘yxatidan ${kind === 'required' ? 'majburiy' : 'bonus'} kanalni tanlang. Siz kanal admini, bot esa kanal a’zosi bo‘lishi kerak.`,
      Markup.keyboard([[
        Markup.button.channelRequest('📢 Kanalni tanlash', requestId, {
          user_administrator_rights: { can_manage_chat: true },
          bot_is_member: true,
        }),
      ], ['Bekor qilish']]).resize().oneTime(),
    );
  });

  bot.action(/^channel_info_([a-z0-9_-]{2,40})$/, adminOnly, async (ctx) => {
    await ctx.answerCbQuery();
    const channel = await Task.findOne({ _id: ctx.match[1], type: 'channel' }).lean();
    if (!channel) {
      await ctx.reply('Kanal topilmadi.');
      return;
    }
    const rows = [[Markup.button.callback(
      channel.enabled ? '⚫ O‘chirish' : '🟢 Yoqish',
      `task_toggle_${channel._id}`,
    )]];
    if (!channel.requiredForReferral) {
      rows.push([Markup.button.callback('✏️ Ballni o‘zgartirish', `task_reward_${channel._id}`)]);
    }
    rows.push([Markup.button.callback('🗑 Kanalni ro‘yxatdan olib tashlash', `channel_delete_${channel._id}`)]);
    rows.push([Markup.button.callback('⬅️ Kanallar', 'admin_channels')]);
    await ctx.reply(
      `${channel.requiredForReferral ? '🔒 Majburiy kanal' : '🎁 Bonus kanal'}\n${channel.title}\nHolat: ${channel.enabled ? 'Yoqilgan' : 'O‘chirilgan'}${channel.requiredForReferral ? '' : `\nMukofot: ${channel.reward} coin`}`,
      Markup.inlineKeyboard(rows),
    );
  });

  bot.action(/^channel_delete_([a-z0-9_-]{2,40})$/, adminOnly, async (ctx) => {
    await ctx.answerCbQuery();
    const id = ctx.match[1];
    const result = await Task.deleteOne({ _id: id, type: 'channel' });
    if (!result.deletedCount) {
      await ctx.reply('Kanal topilmadi.');
      return;
    }
    await Claim.deleteMany({ taskId: id });
    await ctx.reply('Kanal sozlamalardan olib tashlandi.');
    await showChannelSettings(ctx);
  });

  bot.action('admin_settings', adminOnly, async (ctx) => {
    await ctx.answerCbQuery();
    await showSettings(ctx);
  });

  bot.action(/^setting_edit_(weeklyPrize|refReward|refBonus|channelReward|instagramReward|invite3Reward|dailyBonusBase|dailyStreakBonus)$/, adminOnly, async (ctx) => {
    await ctx.answerCbQuery();
    const key = ctx.match[1];
    const title = {
      weeklyPrize: 'Haftalik sovrin miqdori (so‘m)',
      refReward: 'Taklif qiluvchi bonus balli',
      refBonus: 'Taklif bilan kelgan bonus balli',
      channelReward: 'Yangi bonus kanal uchun ball',
      instagramReward: 'Instagram topshirig‘i balli',
      invite3Reward: 'Do‘st taklif qilish topshirig‘i balli',
      dailyBonusBase: 'Kunlik asosiy bonus balli',
      dailyStreakBonus: 'Ketma-ket kunlik qo‘shimcha ball',
    }[key];
    await promptAdminInput(ctx, {
      kind: 'setting',
      key,
      prompt: `${title}ni yuboring (faqat musbat butun son).`,
    });
  });

  bot.action('setting_edit_instagramUrl', adminOnly, async (ctx) => {
    await ctx.answerCbQuery();
    await promptAdminInput(ctx, {
      kind: 'instagram',
      prompt: 'Instagram sahifa havolasini yuboring (https://www.instagram.com/...).',
    });
  });

  bot.action(/^task_reward_([a-z0-9_-]{2,40})$/, adminOnly, async (ctx) => {
    await ctx.answerCbQuery();
    const task = await Task.findById(ctx.match[1]).lean();
    if (!task || (task.type === 'channel' && task.requiredForReferral)) {
      await ctx.reply('Bu topshiriq uchun ball sozlab bo‘lmaydi.');
      return;
    }
    await promptAdminInput(ctx, {
      kind: 'task_reward',
      taskId: task._id,
      prompt: `“${task.title}” topshirig‘i uchun yangi ball miqdorini yuboring.`,
    });
  });

  bot.action(/^task_toggle_([a-z0-9_-]{2,40})$/, adminOnly, async (ctx) => {
    await ctx.answerCbQuery();
    const task = await Task.findById(ctx.match[1]);
    if (!task) {
      await ctx.reply('Topshiriq topilmadi.');
      return;
    }
    task.enabled = !task.enabled;
    await task.save();
    await ctx.reply(`${task.title}: ${task.enabled ? 'yoqildi' : 'o‘chirildi'}.`);
    if (task.type === 'channel') await showChannelSettings(ctx);
    else await showTaskSettings(ctx);
  });

  bot.action(/^claim_(approve|reject)_([a-f0-9]{24})$/, adminOnly, async (ctx) => {
    await ctx.answerCbQuery();
    const [, action, claimId] = ctx.match;
    const claim = await Claim.findOne({ _id: claimId, status: 'pending' });
    if (!claim) {
      await ctx.reply('Bu tasdiq allaqachon ko‘rib chiqilgan.');
      return;
    }
    const task = await Task.findById(claim.taskId);
    if (!task) {
      claim.status = 'rejected';
      await claim.save();
      await ctx.reply('Topshiriq topilmadi; so‘rov bekor qilindi.');
      return;
    }
    if (action === 'approve') {
      await addPoints(claim.userId, task.reward, 'task', `task:${claim._id}`, task.title);
      claim.status = 'approved';
      claim.reviewedBy = String(ctx.from.id);
      claim.reviewedAt = new Date();
      await claim.save();
      await bot.telegram.sendMessage(claim.userId, `“${task.title}” topshirig‘i tasdiqlandi. +${task.reward} coin.`);
      await ctx.reply('Topshiriq tasdiqlandi va ball berildi.');
    } else {
      claim.status = 'rejected';
      claim.reviewedBy = String(ctx.from.id);
      claim.reviewedAt = new Date();
      await claim.save();
      await bot.telegram.sendMessage(claim.userId, `“${task.title}” topshirig‘i rad etildi. Tekshirib qayta yuborishingiz mumkin.`);
      await ctx.reply('Topshiriq rad etildi.');
    }
  });

  bot.action(/^pay_week_(\d{4}-\d{2}-\d{2})$/, adminOnly, async (ctx) => {
    await ctx.answerCbQuery();
    const award = await WeeklyAward.findOneAndUpdate(
      { _id: ctx.match[1], status: 'pending' },
      { $set: { status: 'paid', paidAt: new Date(), paidBy: String(ctx.from.id) } },
      { new: true },
    );
    if (!award) {
      await ctx.reply('Sovrin topilmadi yoki allaqachon to‘langan.');
      return;
    }
    await bot.telegram.sendMessage(award.userId, `Tabriklaymiz! ${Number(award.amount).toLocaleString('uz-UZ')} so‘mlik haftalik sovrin sizga yuborildi.`);
    await ctx.reply('Sovrin to‘langan deb belgilandi.');
  });

  app.get('/health', (req, res) => res.json({ ok: true }));

  app.get('/api/me', authenticate, asyncRoute(async (req, res) => {
    const user = await ensureUser(req.telegram, req.startParam);
    const data = await getMe(user);
    res.json(data);
  }));

  app.get('/api/captcha', authenticate, asyncRoute(async (req, res) => {
    const user = await ensureUser(req.telegram, req.startParam);
    if (user.verified) {
      res.json({ verified: true });
      return;
    }
    res.json(await createChallenge(user._id));
  }));

  app.post('/api/captcha/verify', authenticate, asyncRoute(async (req, res) => {
    const user = await ensureUser(req.telegram, req.startParam);
    const { id, answers } = req.body || {};
    if (typeof id !== 'string' || !Array.isArray(answers) || answers.length !== 3 ||
        answers.some((answer) => typeof answer !== 'string' || answer.length > 10)) {
      throw new HttpError(400, 'Tekshiruv javoblari noto‘g‘ri formatda.');
    }
    const challenge = await Captcha.findOneAndUpdate(
      { _id: id, userId: user._id, used: false, expiresAt: { $gt: new Date() } },
      { $set: { used: true } },
      { new: true },
    ).lean();
    if (!challenge) throw new HttpError(400, 'Tekshiruv muddati tugagan. Yangi savollarni oling.');
    if (!answers.every((answer, index) => answer === challenge.answers[index])) {
      res.json({ ok: false });
      return;
    }
    await User.updateOne({ _id: user._id }, { $set: { verified: true } });
    await awardReferral({ ...user.toObject(), verified: true });
    res.json({ ok: true });
  }));

  app.get('/api/leaderboard', authenticate, requireVerified, asyncRoute(async (req, res) => {
    const period = req.query.period === 'all' ? 'all' : 'week';
    res.json(await leaderboard(period, String(req.telegram.id)));
  }));

  app.post('/api/daily', authenticate, requireVerified, asyncRoute(async (req, res) => {
    const userId = String(req.telegram.id);
    const user = await User.findById(userId);
    const today = getTashkentDate();
    if (user.lastDailyDate === today) throw new HttpError(409, 'Bugungi bonusni oldingiz.');
    const bonus = config.dailyBonusBase + Math.min(user.streak, 7) * config.dailyStreakBonus;
    const inserted = await addPoints(userId, bonus, 'daily', `daily:${userId}:${today}`, 'Kunlik bonus');
    if (!inserted && user.lastDailyDate === today) throw new HttpError(409, 'Bugungi bonusni oldingiz.');
    const yesterday = new Date(new Date(`${today}T00:00:00Z`).getTime() - DAY_MS).toISOString().slice(0, 10);
    const streak = user.lastDailyDate === yesterday ? user.streak + 1 : 1;
    await User.updateOne({ _id: userId }, { $set: { lastDailyDate: today, streak } });
    res.json({ ok: true, reward: inserted ? bonus : 0, balance: await getPointTotal(userId), streak });
  }));

  app.post('/api/tasks/:taskId', authenticate, requireVerified, asyncRoute(async (req, res) => {
    const task = await Task.findById(req.params.taskId);
    if (!task?.enabled) throw new HttpError(404, 'Topshiriq mavjud emas yoki o‘chirilgan.');
    const userId = String(req.telegram.id);
    const previous = await Claim.findOne({ userId, taskId: task._id }).lean();
    if (previous?.status === 'approved') throw new HttpError(409, 'Bu topshiriq bajarilgan.');
    if (previous?.status === 'pending') throw new HttpError(409, 'Topshiriq admin ko‘rib chiqishini kutmoqda.');

    if (task.type === 'channel') {
      if (!task.chatId) throw new HttpError(503, 'Kanal tekshiruvi sozlanmagan.');
      let member;
      try {
        member = await bot.telegram.getChatMember(task.chatId, Number(userId));
      } catch (error) {
        console.error('Channel membership check failed:', error.message);
        throw new HttpError(503, 'Bot kanal a’zoligini tekshira olmadi. Bot kanal admini ekanini tekshiring.');
      }
      if (!isActiveChatMember(member)) throw new HttpError(403, 'Avval ko‘rsatilgan kanalga a’zo bo‘ling.');
      if (!task.requiredForReferral) {
        await addPoints(userId, task.reward, 'task', `task:${userId}:${task._id}`, task.title);
      }
      await Claim.findOneAndUpdate(
        { userId, taskId: task._id },
        { $set: { status: 'approved', reviewedAt: new Date() }, $setOnInsert: { userId, taskId: task._id } },
        { upsert: true },
      );
      if (task.requiredForReferral) {
        const user = await User.findById(userId).lean();
        await awardReferral(user);
      }
      res.json({ ok: true, status: 'approved', reward: task.requiredForReferral ? 0 : task.reward });
      return;
    }

    if (task.type === 'referrals') {
      const count = await User.countDocuments({ invitedBy: userId, referralRewarded: true });
      if (count < task.requiredCount) throw new HttpError(403, `Kamida ${task.requiredCount} ta tasdiqlangan do‘st kerak. Hozir: ${count}.`);
      await addPoints(userId, task.reward, 'task', `task:${userId}:${task._id}`, task.title);
      await Claim.findOneAndUpdate(
        { userId, taskId: task._id },
        { $set: { status: 'approved', reviewedAt: new Date() }, $setOnInsert: { userId, taskId: task._id } },
        { upsert: true },
      );
      res.json({ ok: true, status: 'approved', reward: task.reward });
      return;
    }

    const proof = String(req.body?.proof || '').trim().slice(0, 300);
    if (proof.length < 3) throw new HttpError(400, 'Instagram username yoki profilingiz havolasini yozing.');
    const claim = await Claim.findOneAndUpdate(
      { userId, taskId: task._id },
      { $set: { status: 'pending', proof, reviewedBy: '', reviewedAt: null }, $setOnInsert: { userId, taskId: task._id } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    const user = await User.findById(userId).lean();
    const keyboard = Markup.inlineKeyboard([[
      Markup.button.callback('✅ Tasdiqlash', `claim_approve_${claim._id}`),
      Markup.button.callback('❌ Rad etish', `claim_reject_${claim._id}`),
    ]]);
    await notifyAdmins(
      `Yangi topshiriq tasdig‘i\nFoydalanuvchi: ${user.firstName} (@${user.username || 'username yo‘q'}, ID ${userId})\nTopshiriq: ${task.title}\nIsbot: ${proof}\nMukofot: ${task.reward} coin`,
      keyboard,
    );
    res.json({ ok: true, status: 'pending' });
  }));

  app.use('/assets', express.static(path.join(__dirname, 'assets'), { dotfiles: 'deny', index: false }));
  app.use('/icons', express.static(path.join(__dirname, 'icons'), { dotfiles: 'deny', index: false }));
  app.get(['/', '/index.html'], (req, res, next) => {
    res.sendFile(path.join(__dirname, 'index.html'), (error) => error && next(error));
  });
  app.get('/style.css', (req, res, next) => {
    res.sendFile(path.join(__dirname, 'style.css'), (error) => error && next(error));
  });
  app.get('/app.js', (req, res, next) => {
    res.sendFile(path.join(__dirname, 'app.js'), (error) => error && next(error));
  });
  app.use((req, res) => {
    res.status(404).json({ error: 'Sahifa topilmadi.' });
  });
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = Number.isInteger(error.status) ? error.status : 500;
    if (status >= 500) console.error('HTTP request failed:', error);
    res.status(status).json({
      error: status >= 500 ? 'Serverda xatolik. Keyinroq qayta urinib ko‘ring.' : error.message,
    });
  });

  async function closePreviousWeek() {
    const current = getWeekRange();
    const start = new Date(current.start.getTime() - 7 * DAY_MS);
    const end = current.start;
    const weekId = getTashkentDate(new Date(start.getTime() + 5 * 60 * 60 * 1000));
    const existing = await WeeklyAward.findById(weekId);
    if (existing) return existing;

    const [winner] = await Ledger.aggregate([
      { $match: { points: { $gt: 0 }, createdAt: { $gte: start, $lt: end } } },
      { $group: { _id: '$userId', points: { $sum: '$points' } } },
      { $sort: { points: -1, _id: 1 } },
      { $limit: 1 },
    ]);
    const award = await WeeklyAward.findOneAndUpdate(
      { _id: weekId },
      { $setOnInsert: {
        userId: winner?._id || '',
        points: winner?.points || 0,
        amount: config.weeklyPrize,
        status: winner ? 'pending' : 'empty',
      } },
      { upsert: true, new: true },
    );
    if (award.userId) {
      const user = await User.findById(award.userId).lean();
      const message = `🏆 Haftalik g‘olib: ${user?.firstName || 'Foydalanuvchi'} (ID ${award.userId})\nBall: ${award.points}\nSovrin: ${Number(award.amount).toLocaleString('uz-UZ')} so‘m\nPulni tashqarida yuboring, keyin /admin panelida “Pul yuborildi”ni bosing.`;
      await notifyAdmins(message, Markup.inlineKeyboard([[
        Markup.button.callback('✅ Pul yuborildi', `pay_week_${award._id}`),
      ]]));
      try {
        await bot.telegram.sendMessage(award.userId, `Tabriklaymiz! O‘tgan haftada ${award.points} ball bilan g‘olib bo‘ldingiz. Sovrin: ${Number(award.amount).toLocaleString('uz-UZ')} so‘m. To‘lov admin tomonidan yuborilgach xabar olasiz.`);
      } catch (error) {
        console.error(`Could not notify weekly winner ${award.userId}:`, error.message);
      }
    } else {
      await notifyAdmins(`Hafta ${weekId} yakunlandi, lekin ball to‘plagan foydalanuvchi bo‘lmadi.`);
    }
    return award;
  }

  return { app, bot, config, ensureSeedTasks, closePreviousWeek };
}

async function start() {
  const { app, bot, config, ensureSeedTasks, closePreviousWeek } = createApplication();
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  await mongoose.connect(process.env.MONGODB_URI);
  await Promise.all([User, Ledger, Task, Claim, Captcha, WeeklyAward, Setting].map((model) => model.init()));
  await ensureSeedTasks();
  const identity = await bot.telegram.getMe();
  config.botUsername = config.botUsername || identity.username;
  await closePreviousWeek();
  await bot.telegram.setChatMenuButton({
    menuButton: { type: 'web_app', text: 'Mini ilova', web_app: { url: config.appUrl } },
  }).catch((error) => console.error('Could not set the Telegram menu button:', error.message));

  const scheduleWeeklyAward = () => {
    const now = new Date();
    const localNow = new Date(now.getTime() + 5 * 60 * 60 * 1000);
    const daysUntilMonday = (8 - localNow.getUTCDay()) % 7 || 7;
    const nextMonday = new Date(Date.UTC(
      localNow.getUTCFullYear(),
      localNow.getUTCMonth(),
      localNow.getUTCDate() + daysUntilMonday,
    ) - 5 * 60 * 60 * 1000);
    const timer = setTimeout(async () => {
      try {
        await closePreviousWeek();
      } catch (error) {
        console.error('Weekly award calculation failed:', error);
      }
      scheduleWeeklyAward();
    }, Math.max(1000, nextMonday.getTime() - now.getTime()));
    timer.unref();
  };
  scheduleWeeklyAward();
  bot.launch({ allowedUpdates: ['message', 'callback_query', 'chat_member'] }).catch((error) => {
    console.error('Telegram bot stopped:', error);
    process.exitCode = 1;
  });

  const port = Number(process.env.PORT || 3000);
  const server = app.listen(port, () => console.log(`Mini App server listening on port ${port}`));
  const stop = async (signal) => {
    console.log(`${signal} received; shutting down.`);
    server.close();
    bot.stop(signal);
    await mongoose.disconnect();
    process.exit(0);
  };
  process.once('SIGINT', () => stop('SIGINT'));
  process.once('SIGTERM', () => stop('SIGTERM'));
}

if (require.main === module) {
  start().catch((error) => {
    console.error('Startup failed:', error);
    process.exitCode = 1;
  });
}

module.exports = {
  createApplication,
  getTashkentDate,
  getWeekRange,
  isActiveChatMember,
  toTelegramHtml,
  verifyTelegramInitData,
};
