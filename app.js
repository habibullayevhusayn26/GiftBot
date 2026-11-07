/* ============================================================
   Viral Mini App — frontend
   Hozircha DEMO ma'lumotlar bilan ishlaydi.
   API productionda Telegram Web App imzosi bilan tasdiqlanadi.
   ============================================================ */
const CONFIG = {
  BOT_USERNAME: 'sizning_bot',   // @ belgisiz bot username
  API_URL: '/api',
  REF_REWARD: 50,
  REF_BONUS: 25,
  WEEKLY_PRIZE: 100000,          // so'm — har yakshanba eng ko'p ball yig'ganga
  LEVELS: [0, 100, 300, 700, 1500, 3000, 6000],
};

const tg = window.Telegram?.WebApp;
const LIVE_MODE = Boolean(tg?.initData && CONFIG.API_URL);
function getDeviceId() {
  const key = 'viral_device_id';
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      id = typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : [...crypto.getRandomValues(new Uint8Array(24))]
          .map((byte) => byte.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return [...crypto.getRandomValues(new Uint8Array(24))]
      .map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }
}
const DEVICE_ID = getDeviceId();
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ANIMATION_FILES = {
  '🌙': 'CAACAgEAAxUAAWrncguskyqISIUj84Nn4l1FFYEEAAK6BAACOUQ5RJ7IoKaWrlJ6PQQ.json',
  '📣': 'CAACAgIAAxUAAWri0idH2Nk1MRr-GEz_IeGP7mKKAAKPHAACVToAAUm5x1GN_thJkT0E.json',
  '📖': 'CAACAgIAAxUAAWri0if1NZaHjJwO6tPtFQujC160AAJ_HQACzlX5SLos2yopOdbTPQQ.json',
  '🦆': 'CAACAgIAAxUAAWrjVHQFg3nZP-usukJH3R5OfYIfAAJcJQACnSTAScv4eQRkW1clPQQ.json',
  '🦊': 'CAACAgIAAxUAAWrkatU6dKmIWg3al99a_5ecZickAAKkJwACTitRSUHlRvShsD1mPQQ.json',
  '🐧': 'CAACAgIAAxUAAWrkatUae97hmIQ4jGgSGpDZpcNsAAIgJQACVwVoSmBlxpLNfog4PQQ.json',
  '🐰': 'CAACAgIAAxUAAWrkatUeTFCM_mxUk4ymvMkdxSYgAAKUKwACzxIhS16Dsrzf9vhePQQ.json',
  '🚀': 'CAACAgIAAxUAAWrkatUk6WsQFwL1vGkuSX0PUmGRAALLGwAC14mRSzvrMNfF90DPPQQ.json',
  '🎈': 'CAACAgIAAxUAAWrkatUq8ngePEP3cbumCNBQv0WzAAJMGwACEcbwS4-d4PPmE6LxPQQ.json',
  '🐵': 'CAACAgIAAxUAAWrkatUVLoBOOlo0ck9cRW1QAdUsAAK4HgACPS3ZSyxJYEREl78JPQQ.json',
  '🐱': 'CAACAgIAAxUAAWrkatUVv_8qtFc9PsAZdRXdBCBRAAJzIgACrFVQSQv7Un3E5fnRPQQ.json',
  '🦁': 'CAACAgIAAxUAAWrkatUyW_spp_ikUDiMKCCsY9FkAAIEIQACenPpSqxV0aX5q0qUPQQ.json',
  '🍌': 'CAACAgIAAxUAAWrkatV4JM9f1VuQWJiNFk4ZB1yyAALRHQACd4DQShe1Ku-wRnGXPQQ.json',
  '🐷': 'CAACAgIAAxUAAWrkatVbzBxrkVwjJRCuLpamKeIGAALDIgACErdYSo3fRqwn79ZfPQQ.json',
  '🐮': 'CAACAgIAAxUAAWrkatVdDS9MDYXQYWwvkUzrit1lAAKhVwACejnYSjrlUNNG-r9fPQQ.json',
  '🐸': 'CAACAgIAAxUAAWrkatVDROgVvjMAAcXj82k6UOTWFQACoycAAgEIGEucqWeeJqOq5j0E.json',
  '🚗': 'CAACAgIAAxUAAWrkatVf2MIEjiPVheX1A9shWG-OAALgGAAC09SQSy_J3SbEAXYZPQQ.json',
  '🐝': 'CAACAgIAAxUAAWrkatVhpX2V3u61T9vhljAzLbAZAAJoJwAC4IIZS8G7gG_BkEfcPQQ.json',
  '🦋': 'CAACAgIAAxUAAWrkatVi8Ijflog5XbltFUZBL2knAAKtGAACft6QS4KaEwABzy5KqT0E.json',
  '🎁': 'gift.json',
  '🏅': 'level-badge.json',
  '🐴': 'CAACAgIAAxUAAWrkatVqRN4aIrRXWrk2Js4G-qZOAAJWJQACEMgYSlAlJtMfL4jUPQQ.json',
  '🍓': 'CAACAgIAAxUAAWrkatVVl2Tf2qK5a5bbVlXMULX0AAKEHAACgjbpS5BZvCO3vc7GPQQ.json',
  '🐔': 'CAACAgIAAxUAAWrkatVXTY2zUCFzTvz9Lixpfhu5AAIlKgACTLRRSd0YIMfPUIGaPQQ.json',
  '🐙': 'CAACAgIAAxUAAWrkatW1-Gv1ght9PzoKR8e2BY0OAAKZJAACggVJSvpbD8ofzdpIPQQ.json',
  '🐻': 'CAACAgIAAxUAAWrkatW2_lWpLu7Ko2RJDag6mIwbAALVJgACGVtQSb7EiGC73VqNPQQ.json',
  '🐼': 'CAACAgIAAxUAAWrkatW93eJzuGoqkTpJ38zrn4sNAAI3IgACwJlIScEoiyZU0nTSPQQ.json',
  '🐢': 'CAACAgIAAxUAAWrkatWBTv4yICNCPD5UfgKmuGXiAAIFKwAC-uhBSoLJ3uOIiTbGPQQ.json',
  '🐘': 'CAACAgIAAxUAAWrkatWKiqXn543iprjDxeFJ_LQ7AAJdJQACROSBSJBIQody3iWKPQQ.json',
  '🐟': 'CAACAgIAAxUAAWrkatWpLTOXfowC-1giyV5Ste-uAAIsHAAC2nOxSuelncmnN9HAPQQ.json',
  '🐬': 'CAACAgIAAxUAAWrkatWQyXfwomuvBDUzNYWb4Q9SAAJgLwAC999pSuqV520vq0nvPQQ.json',
  '🍉': 'CAACAgIAAxUAAWrkatX0fPcFgh20-IkuHsOJg-o0AALFMgACElegSZje8QAB8o3-zz0E.json',
  '🌳': 'CAACAgIAAxUAAWrkatXeM1JnQNCox0PH21F_aHSQAAKkGwACu_-hS5CtP6gu67oaPQQ.json',
  '🐶': 'CAACAgIAAxUAAWrkatXiA5I5nhzKskYLKySIu3fMAAL1KQACmg9RSdVT_mX7LMVIPQQ.json',
  '🍒': 'CAACAgIAAxUAAWrkatXntVp3Z6G8XOCCOmiAoFupAAJlXgAC16oIS3to2Uh9RezEPQQ.json',
  '⭐': 'CAACAgIAAxUAAWrkatXx8z4B1Dl9vfIx5u76C3NBAAKlGgACUWZwS3E_duH6N7YWPQQ.json',
  '🥇': 'gold-medal.json',
  '🥈': 'CAACAgIAAxUAAWrkzgOgn0esJDgb-69JMIdz69q3AALZRwAC0lqYSwGDRJICAcXxPQQ.json',
  '🏠': 'CAACAgIAAxUAAWrkzgOOcSt9GaL2rrkFlLE6GT4MAAJcUgACxaQpS1OP2qTvqMSVPQQ.json',
  '🥉': 'CAACAgIAAxUAAWrkzgPCo1Tv2e7hR22MmoAYExreAAKhVAACNyewS0vOrkgGsdXHPQQ.json',
  '💬': 'CAACAgIAAxUAAWrm1VyokKd3DTKtNJqt_LC9ycEHAAIRbwACkebYSi9oj76BzO2WPQQ.json',
  '🛡️': 'CAACAgIAAxUAAWrvL-QPKWkotEvfOVY--DexLfxxAAIwhAACKHyRSOOsW9SgVf4SPQQ.json',
  '⚽': 'CAACAgIAAxUAAWrvL-SJfHZhX_zZmDtGisHhEg0fAALClwACrCmYSgiVq-j2nfcwPQQ.json',
  '✅': 'CAACAgIAAxUAAWrvL-Snb669XWC2AAHXMvUgCQABmM8AAjFtAALTmtlKMbmvOMDS58A9BA.json',
  '🏆': 'CAACAgIAAxUAAWrvL-TJkTtDnn3ZkrbP0wteWD4OAAJbmgACsPVRSRpTdnh-PQTPPQQ.json',
  '👥': 'CAACAgQAAxUAAWrvL-R0d6df0hmYHgKZOE3cUQ6IAAKvHgAC2g3oUhbM8xIXIfGKPQQ.json',
  '🔑': 'CAACAgQAAxUAAWrvL-TXT0Q8op7jW-ABc212O8b8AAKRIAACburoUoHX2B9Z4yhAPQQ.json',
  '📳': 'vibrate.json',
  '📷': 'camera.json',
};
const icon = (emoji) => `<span class="emoji-icon" data-emoji="${esc(emoji)}" aria-hidden="true"></span>`;
function destroyAnimations(root) {
  const nodes = [...(root.matches?.('.emoji-icon') ? [root] : []), ...root.querySelectorAll('.emoji-icon')];
  nodes.forEach((node) => {
    node._animationObserver?.disconnect();
    if (node._animationPointerEnter) node.removeEventListener('pointerenter', node._animationPointerEnter);
    if (node._animationClick) node.removeEventListener('click', node._animationClick);
    node._lottieAnimation?.destroy();
    delete node._animationObserver;
    delete node._animationPointerEnter;
    delete node._animationClick;
    delete node._lottieAnimation;
    delete node.dataset.animationMounted;
  });
}
function mountAnimations(root = document) {
  const nodes = [...(root.matches?.('.emoji-icon') ? [root] : []), ...root.querySelectorAll('.emoji-icon')]
    .filter((node) => !node.dataset.animationMounted);
  nodes.forEach((node) => {
    node.dataset.animationMounted = 'true';
    const emoji = node.dataset.emoji || '';
    const file = ANIMATION_FILES[emoji];
    if (!file || !window.lottie) {
      if (file && !window.lottie) console.error('Lottie player did not load; using emoji fallback.');
      node.textContent = emoji;
      return;
    }
    const animation = window.lottie.loadAnimation({
      container: node,
      renderer: 'svg',
      loop: false,
      autoplay: false,
      path: `icons/${file}`,
    });
    node._lottieAnimation = animation;
    let isReady = false;
    let pendingPlay = false;
    const playFromStart = () => {
      if (!isReady) {
        pendingPlay = true;
        return;
      }
      pendingPlay = false;
      animation.goToAndPlay(0, true);
    };
    animation.addEventListener('DOMLoaded', () => {
      isReady = true;
      if (pendingPlay) playFromStart();
    });
    const pointerEnter = (event) => {
      if (event.pointerType !== 'touch') playFromStart();
    };
    const click = () => playFromStart();
    node._animationPointerEnter = pointerEnter;
    node._animationClick = click;
    node.addEventListener('pointerenter', pointerEnter);
    node.addEventListener('click', click);
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          playFromStart();
        }
      }, { threshold: 0.15 });
      node._animationObserver = observer;
      observer.observe(node);
    } else {
      playFromStart();
    }
    animation.addEventListener('data_failed', () => {
      node._animationObserver?.disconnect();
      console.error(`Animation failed to load: icons/${file}`);
      node.textContent = emoji;
    });
  });
}
const fmt = (n) => Number(n).toLocaleString('ru-RU').replace(/\u00a0/g, ' ');

/* ---------- Telegram init ---------- */
if (tg) {
  tg.ready();
  tg.expand();
  try { tg.disableVerticalSwipes?.(); } catch {}
  try { tg.setHeaderColor?.('secondary_bg_color'); tg.setBackgroundColor?.('secondary_bg_color'); } catch {}
}
const tgUser = tg?.initDataUnsafe?.user || { id: 777001, first_name: 'Azizbek', username: 'azizbek' };
let liveInviteLink = '';
let liveRank = null;
let liveLeaderboard = null;
let referralGift = null;
let referralGiftProgress = { milestone: 10, progress: 0, remaining: 10, completedMilestones: 0, completedMilestone: false };

/* ---------- Haptika ---------- */
let hapticOn = true;
const haptic = (kind = 'light') => {
  if (!hapticOn || !tg?.HapticFeedback) return;
  if (['success', 'error', 'warning'].includes(kind)) tg.HapticFeedback.notificationOccurred(kind);
  else if (kind === 'select') tg.HapticFeedback.selectionChanged();
  else tg.HapticFeedback.impactOccurred(kind);
};

/* ---------- Demo ma'lumot ---------- */
const NAMES = ['Dilshod', 'Madina', 'Jasur', 'Nilufar', 'Sardor', 'Zarina', 'Otabek', 'Malika', 'Bekzod', 'Sevara', 'Javlon', 'Kamola'];
const GRADS = [['#0a84ff', '#5e5ce6'], ['#ff9f0a', '#ff375f'], ['#30d158', '#0a84ff'], ['#bf5af2', '#ff375f'], ['#64d2ff', '#30d158']];
const demo = {
  user: { id: tgUser.id, name: tgUser.first_name, username: tgUser.username, balance: 1240, streak: 4, dailyClaimed: false },
  tasks: [
    { id: 't1', icon: '📣', color: '#0a84ff', title: 'Kanalga obuna bo\'ling', sub: 'Yangiliklar kanali', reward: 100, done: false },
    { id: 't2', icon: '📷', color: '#ff375f', title: 'Instagram\'da kuzating', sub: 'Rasmiy sahifa', reward: 75, done: false },
    { id: 't4', icon: '👥', color: '#30d158', title: '3 ta do\'st taklif qiling', sub: 'Bronza mukofot', reward: 200, done: false },
  ],
  friends: Array.from({ length: 5 }, (_, i) => ({ name: NAMES[i], username: NAMES[i].toLowerCase(), earned: CONFIG.REF_REWARD, ago: `${i + 1} kun oldin` })),
  top: NAMES.map((n, i) => ({ name: n, score: 9800 - i * 740 - i * i * 20, invited: 120 - i * 9 })),
};

async function refreshLiveData() {
  const data = await api('/me');
  demo.user = { ...demo.user, ...data.user };
  demo.tasks = data.tasks.map((task) => ({
    ...task,
    color: task.type === 'manual' ? '#ff375f' : task.type === 'referrals' ? '#30d158' : '#0a84ff',
  }));
  demo.friends = data.friends;
  referralGift = data.referralGift || null;
  referralGiftProgress = data.referralGiftProgress || referralGiftProgress;
  liveInviteLink = data.inviteLink;
  liveRank = data.user.rank;
  CONFIG.WEEKLY_PRIZE = data.prize;
  CONFIG.BOT_USERNAME = data.botUsername;
  CONFIG.REF_REWARD = data.rewards.refReward;
  CONFIG.REF_BONUS = data.rewards.refBonus;
  return data;
}

/* ---------- MongoDB API qatlami ---------- */
async function api(path, opts = {}) {
  if (!LIVE_MODE) return null;
  const res = await fetch(CONFIG.API_URL + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': tg?.initData || '',
      'X-Device-ID': DEVICE_ID,
      ...(opts.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Server xatosi (${res.status})`);
  return data;
}

/* ---------- Yordamchilar ---------- */
const initials = (n) => (n || '?').trim().charAt(0).toUpperCase();
const grad = (i) => { const g = GRADS[i % GRADS.length]; return `--a:${g[0]};--b:${g[1]}`; };
function avatarMarkup(user, index) {
  const photoUrl = typeof user.photoUrl === 'string' ? user.photoUrl : '';
  let safePhotoUrl = '';
  if (photoUrl) {
    try {
      const parsed = new URL(photoUrl);
      if (parsed.protocol === 'https:') safePhotoUrl = parsed.href;
    } catch {}
  }
  const fallback = `<span class="avatar-fallback">${esc(initials(user.name))}</span>`;
  const image = safePhotoUrl
    ? `<img class="avatar-photo" src="${esc(safePhotoUrl)}" alt="" loading="lazy" decoding="async" fetchpriority="low" />`
    : '';
  return `<div class="avatar" style="${grad(index)}">${fallback}${image}</div>`;
}
function mountAvatarImages(root) {
  root.querySelectorAll('.avatar-photo:not([data-avatar-bound])').forEach((image) => {
    image.dataset.avatarBound = 'true';
    image.addEventListener('load', () => image.parentElement.classList.add('has-photo'), { once: true });
    image.addEventListener('error', () => image.remove(), { once: true });
    if (image.complete && image.naturalWidth > 0) image.parentElement.classList.add('has-photo');
    else if (image.complete) image.remove();
  });
}
const refLink = () => {
  if (liveInviteLink) return liveInviteLink;
  const p = `ref_${tgUser.id}`;
  return `https://t.me/${CONFIG.BOT_USERNAME}?start=${p}`;
};
let toastT;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 2200);
}
function countUp(el, to, ms = 900) {
  const from = Number(el.dataset.v || 0);
  el.dataset.v = to;
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(Math.round(from + (to - from) * e));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function confetti() {
  const colors = ['#0a84ff', '#30d158', '#ff9f0a', '#ff375f', '#bf5af2', '#ffd60a'];
  for (let i = 0; i < 36; i++) {
    const c = document.createElement('i');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = colors[i % colors.length];
    c.style.setProperty('--x', (Math.random() * 160 - 80) + 'px');
    c.style.animationDelay = Math.random() * .3 + 's';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 2200);
  }
}

/* ---------- Render ---------- */
function levelOf(b) {
  let i = 0;
  while (i < CONFIG.LEVELS.length - 1 && b >= CONFIG.LEVELS[i + 1]) i++;
  const lo = CONFIG.LEVELS[i], hi = CONFIG.LEVELS[i + 1] ?? lo;
  return { n: i + 1, lo, hi, pct: hi === lo ? 100 : ((b - lo) / (hi - lo)) * 100 };
}

function renderHome() {
  const u = demo.user;
  $('#greeting').textContent = `Salom, ${u.name}`;
  countUp($('#balance'), u.balance);
  const L = levelOf(u.balance);
  $('#levelName').textContent = `${L.n}-daraja`;
  $('#levelBadge').hidden = L.n < 2;
  $('#levelNext').textContent = `${fmt(u.balance)} / ${fmt(L.hi)}`;
  setTimeout(() => ($('#levelBar').style.width = L.pct + '%'), 80);
  $('#statFriends').textContent = LIVE_MODE ? (demo.user.referralCount || 0) : demo.friends.length;
  $('#statRank').textContent = LIVE_MODE ? (liveRank ? `#${liveRank}` : '—') : '#' + (demo.top.length + 38);
  $('#statStreak').textContent = u.streak;

  const btn = $('#dailyBtn');
  btn.disabled = u.dailyClaimed;
  destroyAnimations(btn);
  btn.innerHTML = `${icon(u.dailyClaimed ? '✅' : '🎁')} ${u.dailyClaimed ? 'Bugungi bonus olingan' : 'Kunlik bonusni olish'}`;

  destroyAnimations($('#taskList'));
  $('#taskList').innerHTML = demo.tasks.map((t) => `
    <div class="item">
      <span class="ico" style="--c:${t.color}">${icon(t.icon)}</span>
      <div class="txt"><b>${esc(t.title)}</b><span>${esc(t.sub)} · ${t.requiredForReferral ? 'Majburiy obuna' : `+${fmt(t.reward)} coin`}${t.type === 'referrals' ? ` · ${t.progress}/${t.requiredCount}` : ''}</span>${t.url ? `<a class="task-link" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">Topshiriqni ochish ↗</a>` : ''}${LIVE_MODE && t.type === 'manual' && !t.done && !t.pending ? '<input class="task-proof" data-proof type="text" maxlength="300" placeholder="Instagram username yoki havola" aria-label="Topshiriq isboti">' : ''}</div>
      <button class="pill ${t.done ? 'done' : ''}" data-task="${esc(t.id)}" ${t.done || t.pending || (t.type === 'referrals' && !t.canClaim) ? 'disabled' : ''}>${t.done ? icon('✅') : t.pending ? 'Kutilmoqda' : t.requiredForReferral ? 'Obunani tekshirish' : t.type === 'manual' ? 'Tasdiqqa yuborish' : t.type === 'referrals' && !t.canClaim ? 'Do‘st taklif qiling' : 'Tekshirish'}</button>
    </div>`).join('');
  mountAnimations(btn);
  mountAnimations($('#taskList'));
}

function renderFriends() {
  $('#refReward').textContent = CONFIG.REF_REWARD;
  $('#refBonus').textContent = CONFIG.REF_BONUS;
  $('#refLink').textContent = refLink();

  const n = LIVE_MODE ? (demo.user.referralCount || 0) : demo.friends.length;
  $('#invCount').textContent = n;
  const progress = LIVE_MODE
    ? referralGiftProgress
    : {
      milestone: 10,
      progress: n > 0 && n % 10 === 0 ? 10 : n % 10,
      remaining: n > 0 && n % 10 === 0 ? 10 : 10 - (n % 10),
      completedMilestones: Math.floor(n / 10),
      completedMilestone: n > 0 && n % 10 === 0,
    };
  const ratio = Math.min(100, (progress.progress / progress.milestone) * 100);
  const progressBar = $('#referralGiftBar');
  const progressTrack = progressBar.parentElement;
  progressBar.style.width = `${ratio}%`;
  progressTrack.setAttribute('aria-valuenow', String(progress.progress));
  $('#referralGiftCount').textContent = `${progress.progress} / ${progress.milestone} ta tasdiqlangan do‘st`;
  $('#referralGiftRemaining').textContent = progress.completedMilestone
    ? 'Bosqich bajarildi'
    : `Yana ${progress.remaining} ta qoldi`;
  $('#referralGiftDescription').textContent = referralGift
    ? `${referralGift.emoji} Gift · ${fmt(referralGift.stars)} Stars. Faqat tasdiqlangan takliflar hisoblanadi.`
    : 'Faqat tasdiqlangan takliflar hisoblanadi. Admin hali yuboriladigan giftni tanlamagan.';
  $('#friendList').innerHTML = n
    ? demo.friends.map((f, i) => `
      <div class="item">
        <div class="avatar" style="${grad(i)}">${esc(initials(f.name))}</div>
        <div class="txt"><b>${esc(f.name)}</b><span>${esc(f.ago)}</span></div>
        <span class="score" style="color:var(--green)">+${f.earned}</span>
      </div>`).join('')
    : `<div class="empty">Hali hech kim taklif qilinmagan.<br>Havolani ulashing.</div>`;
}

let period = 'week';
async function renderTop() {
  const donorsRequest = renderTopDonors();
  let data;
  let own = null;
  if (LIVE_MODE) {
    try {
      liveLeaderboard = await api(`/leaderboard?period=${period}`);
      data = liveLeaderboard.rows;
      own = { name: `${demo.user.name} (Siz)`, score: liveLeaderboard.ownScore, rank: liveLeaderboard.rank };
    } catch (error) {
      toast(error.message);
      await donorsRequest;
      return;
    }
  } else {
    data = [...demo.top].map((x) => ({ ...x, score: period === 'week' ? Math.round(x.score * 0.22) : x.score }));
    own = { name: `${demo.user.name} (Siz)`, score: Math.round(demo.user.balance * (period === 'week' ? 0.3 : 1)), rank: demo.top.length + 38 };
  }
  const [a, b, c] = data;
  const podiumUser = (x, fallback) => x || { name: fallback, score: 0 };
  const pod = (x, rank, cls) => `
    <div class="pod glass ${cls}">
      <span class="medal ${cls}">${icon({ p1: '🥇', p2: '🥈', p3: '🥉' }[cls])}</span>
      ${avatarMarkup(x, rank)}
      <b>${esc(x.name)}</b><span>${fmt(x.score)}</span>
    </div>`;
  destroyAnimations($('#podium'));
  $('#podium').innerHTML = pod(podiumUser(b, '—'), 1, 'p2') + pod(podiumUser(a, 'Hali yo‘q'), 0, 'p1') + pod(podiumUser(c, '—'), 2, 'p3');
  mountAnimations($('#podium'));

  const rows = data.slice(3).map((x, i) => `
    <div class="item lbrow">
      <span class="rank">${i + 4}</span>
      ${avatarMarkup(x, i + 3)}
      <div class="txt"><b>${esc(x.name)}</b><span>${x.invited === undefined ? (x.username ? `@${esc(x.username)}` : 'Ishtirokchi') : `${x.invited} ta taklif`}</span></div>
      <span class="score">${fmt(x.score)}</span>
    </div>`).join('');
  const ownVisible = data.some((x) => String(x.userId) === String(tgUser.id));
  const ownRow = own.score > 0 && !ownVisible ? `
    <div class="item lbrow me">
      <span class="rank">${own.rank || '—'}</span>
      ${avatarMarkup({ name: demo.user.name, photoUrl: demo.user.photoUrl }, 1)}
      <div class="txt"><b>${esc(own.name)}</b><span>Sizning o‘rningiz</span></div>
      <span class="score">${fmt(own.score)}</span>
    </div>` : '';
  $('#topList').innerHTML = rows + ownRow || (data.length
    ? '<div class="empty">Top-3 ishtirokchilar yuqorida ko‘rsatilgan.</div>'
    : '<div class="empty">Hali reytingda qatnashuvchi yo‘q.</div>');
  mountAvatarImages($('#podium'));
  mountAvatarImages($('#topList'));
  await donorsRequest;
}

async function renderTopDonors() {
  const container = $('#topDonors');
  if (!LIVE_MODE) {
    container.innerHTML = '<div class="empty">Donaterlar ro‘yxati Telegram Mini App’da ko‘rinadi.</div>';
    return;
  }
  try {
    const donors = await api('/top-donors');
    container.innerHTML = donors.length
      ? donors.map((donor, index) => `
        <div class="item donor-row">
          <span class="rank">${index + 1}</span>
          ${avatarMarkup(donor, index)}
          <div class="txt"><b>${esc(donor.name || 'Foydalanuvchi')}</b><span>${donor.username ? `@${esc(donor.username)}` : 'Donater'}</span></div>
          <span class="donor-stars">${fmt(donor.stars)} ⭐</span>
        </div>`).join('')
      : '<div class="empty">Hali donat qilganlar yo‘q.</div>';
    mountAvatarImages(container);
  } catch (error) {
    container.innerHTML = '<div class="empty">Donaterlar ro‘yxatini yuklab bo‘lmadi.</div>';
    toast(error.message);
  }
}

function renderProfile() {
  const firstName = LIVE_MODE ? demo.user.name : tgUser.first_name;
  const username = LIVE_MODE ? demo.user.username : tgUser.username;
  $('#meName').textContent = firstName + (LIVE_MODE ? '' : (tgUser.last_name ? ' ' + tgUser.last_name : ''));
  $('#meUser').textContent = username ? '@' + username : `ID: ${tgUser.id}`;
  const av = $('#meAvatar');
  av.setAttribute('style', grad(0));
  if (tgUser.photo_url) av.innerHTML = `<img src="${esc(tgUser.photo_url)}" alt="" />`;
  else av.textContent = initials(tgUser.first_name);
}

/* ---------- Navigatsiya ---------- */
const TABS = ['home', 'friends', 'top', 'me', 'rules'];
function go(tab, silent) {
  const idx = TABS.indexOf(tab);
  if (idx < 0) return;
  $$('.page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + tab));
  const tabIndex = tab === 'rules' ? TABS.indexOf('me') : idx;
  $$('#tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.t === (tab === 'rules' ? 'me' : tab)));
  $('.tab-thumb').style.transform = `translateX(${tabIndex * 100}%)`;
  window.scrollTo({ top: 0 });
  if (!silent) haptic('select');
  if (tab === 'friends') renderFriends();
  if (tab === 'top') renderTop();
}
$('#tabbar').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) go(b.dataset.t);
});

/* Segmented */
$('#seg').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  period = b.dataset.p;
  $$('#seg button').forEach((x) => x.classList.toggle('on', x === b));
  $('#seg .thumb').style.transform = `translateX(${period === 'week' ? 0 : 100}%)`;
  haptic('select');
  renderTop();
});

/* ---------- Harakatlar ---------- */
$('#dailyBtn').addEventListener('click', async () => {
  const u = demo.user;
  if (u.dailyClaimed) return;
  if (LIVE_MODE) {
    try {
      const result = await api('/daily', { method: 'POST' });
      await refreshLiveData();
      haptic('success'); confetti(); toast(`+${fmt(result.reward)} coin qo‘shildi`);
      renderHome();
    } catch (error) {
      toast(error.message);
    }
    return;
  }
  const bonus = 20 + Math.min(u.streak, 7) * 10;
  u.balance += bonus; u.streak += 1; u.dailyClaimed = true;
  haptic('success'); confetti(); toast(`+${bonus} coin qo'shildi`);
  renderHome();
});

$('#taskList').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-task]');
  if (!b) return;
  const t = demo.tasks.find((x) => x.id === b.dataset.task);
  if (!t || t.done || t.pending || b.disabled) return;
  haptic('medium');
  if (LIVE_MODE) {
    try {
      const proof = b.closest('.item').querySelector('[data-proof]')?.value.trim();
      const result = await api('/tasks/' + encodeURIComponent(t.id), {
        method: 'POST',
        body: JSON.stringify(proof ? { proof } : {}),
      });
      await refreshLiveData();
      if (result.status === 'pending') toast('Topshiriq admin tasdig‘iga yuborildi.');
      else {
        haptic('success');
        toast(result.reward ? `+${fmt(result.reward)} coin` : 'Obuna tasdiqlandi.');
      }
      renderHome();
    } catch (error) {
      toast(error.message);
    }
    return;
  }
  t.done = true; demo.user.balance += t.reward;
  haptic('success'); toast(`+${t.reward} coin`);
  renderHome();
});

$('#donateBtn').addEventListener('click', async () => {
  const input = $('#donationAmount');
  const messageInput = $('#donationMessage');
  const button = $('#donateBtn');
  const amount = Number(input.value);
  const message = messageInput.value.trim();
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 10000000) {
    toast('Donat miqdori 1 dan 10 000 000 Stars gacha butun son bo‘lishi kerak.');
    input.focus();
    return;
  }
  if (!message || message.length > 500) {
    toast('Donat uchun 1 dan 500 belgigacha xabar yozing.');
    messageInput.focus();
    return;
  }
  if (!LIVE_MODE) {
    toast('Donat qilish uchun Mini-ilovani Telegram ichida oching.');
    return;
  }
  if (typeof tg?.openInvoice !== 'function') {
    toast('Stars to‘lovi uchun Telegram ilovasini yangilang.');
    return;
  }

  button.disabled = true;
  input.disabled = true;
  messageInput.disabled = true;
  try {
    const invoice = await api('/donations/invoice', {
      method: 'POST',
      body: JSON.stringify({ amount, message }),
    });
    if (typeof invoice?.invoiceLink !== 'string' || !invoice.invoiceLink) {
      throw new Error('To‘lov havolasini yaratib bo‘lmadi.');
    }
    tg.openInvoice(invoice.invoiceLink, (status) => {
      button.disabled = false;
      input.disabled = false;
      messageInput.disabled = false;
      if (status === 'paid') {
        haptic('success');
        toast(`Rahmat! ${fmt(amount)} Stars donat qilindi.`);
      } else if (status === 'failed') {
        toast('To‘lov amalga oshmadi. Qayta urinib ko‘ring.');
      }
    });
  } catch (error) {
    button.disabled = false;
    input.disabled = false;
    messageInput.disabled = false;
    toast(error.message);
  }
});

$('#copyBtn').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(refLink()); }
  catch { const i = document.createElement('input'); i.value = refLink(); document.body.appendChild(i); i.select(); document.execCommand('copy'); i.remove(); }
  haptic('success'); toast('Havola nusxalandi');
});
$('#linkBox').addEventListener('click', () => $('#copyBtn').click());

$('#shareBtn').addEventListener('click', () => {
  haptic('medium');
  const text = `Menga qo'shiling va birga coin yig'amiz! Kirsangiz +${CONFIG.REF_BONUS} coin sovg'a.`;
  const url = `https://t.me/share/url?url=${encodeURIComponent(refLink())}&text=${encodeURIComponent(text)}`;
  if (tg?.openTelegramLink) tg.openTelegramLink(url); else window.open(url, '_blank');
});

$('#hapticToggle').addEventListener('change', (e) => { hapticOn = e.target.checked; if (hapticOn) haptic('medium'); });
let rulesLoaded = false;
async function openRulesPage() {
  go('rules');
  if (rulesLoaded) return;
  const content = $('#rulesContent');
  const retry = $('#rulesRetry');
  content.textContent = 'Qoidalar yuklanmoqda…';
  retry.hidden = true;
  try {
    const response = await fetch('/qoidalar.txt', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Qoidalarni yuklab bo‘lmadi (${response.status}).`);
    const rules = await response.text();
    if (!rules.trim()) throw new Error('Qoidalar fayli bo‘sh.');
    content.textContent = rules;
    rulesLoaded = true;
  } catch (error) {
    console.error('Could not load rules:', error);
    content.textContent = error.message || 'Qoidalarni yuklashda xatolik yuz berdi.';
    retry.hidden = false;
  }
}
$('#rulesBtn').addEventListener('click', () => { haptic('light'); void openRulesPage(); });
$('#rulesBack').addEventListener('click', () => go('me'));
$('#rulesRetry').addEventListener('click', () => { void openRulesPage(); });
async function redeemPromo() {
  const input = $('#promoCode');
  const button = $('#redeemPromoBtn');
  const code = input.value.trim().toUpperCase();
  if (!code) {
    toast('Promo-kodni kiriting.');
    input.focus();
    return;
  }
  if (!LIVE_MODE) {
    toast('Promo-kodni Telegram Mini-ilovada ishlating.');
    return;
  }
  button.disabled = true;
  try {
    const result = await api('/promos/redeem', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    input.value = '';
    haptic('success');
    toast(`Promo-kod qabul qilindi! +${fmt(result.reward)} coin`);
    await refreshLiveData();
    renderHome();
  } catch (error) {
    haptic('error');
    toast(error.message);
  } finally {
    button.disabled = false;
  }
}
$('#redeemPromoBtn').addEventListener('click', () => { haptic('light'); void redeemPromo(); });
$('#promoCode').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    void redeemPromo();
  }
});
function openPromoFromLaunch() {
  const queryCode = new URLSearchParams(window.location.search).get('promo');
  const startParam = tg?.initDataUnsafe?.start_param || '';
  const launchCode = queryCode || (startParam.startsWith('promo_') ? startParam.slice(6) : '');
  if (!launchCode) return;
  go('me', true);
  $('#promoCode').value = launchCode.slice(0, 32);
  setTimeout(() => {
    $('#promoCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('#promoCode').focus({ preventScroll: true });
  }, 200);
}
$('#supportBtn').addEventListener('click', () => {
  haptic('light');
  if (tg?.openTelegramLink) tg.openTelegramLink(`https://t.me/${CONFIG.BOT_USERNAME}`); else toast('Yordam: tez orada');
});

/* ---------- Haftalik sovg'a ---------- */
function weekEnd() {
  const now = new Date(Date.now() + 5 * 60 * 60 * 1000);
  const daysUntilMonday = (8 - now.getUTCDay()) % 7 || 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilMonday) - 5 * 60 * 60 * 1000);
}
function renderPrize() {
  const html = `
    <div class="card prize glass">
      <div class="prize-head">
        <span class="trophy">${icon('🏆')}</span>
        <div><b>Haftalik sovg'a</b><span>Har yakshanba eng ko'p ball yig'gan 1 kishiga</span></div>
      </div>
      <div class="prize-amount">${fmt(CONFIG.WEEKLY_PRIZE)} <small>so'm</small></div>
      <div class="countdown js-cd"></div>
    </div>`;
  $$('.js-prize-slot').forEach((el) => {
    destroyAnimations(el);
    el.innerHTML = html;
  });
  $$('.js-prize-slot').forEach(mountAnimations);
  tickCountdown();
}
function tickCountdown() {
  let s = Math.max(0, Math.floor((weekEnd() - new Date()) / 1000));
  const d = Math.floor(s / 86400); s %= 86400;
  const h = Math.floor(s / 3600); s %= 3600;
  const m = Math.floor(s / 60); s %= 60;
  const cell = (v, l) => `<div><b>${String(v).padStart(2, '0')}</b><span>${l}</span></div>`;
  const html = cell(d, 'kun') + cell(h, 'soat') + cell(m, 'daqiqa') + cell(s, 'soniya');
  $$('.js-cd').forEach((el) => (el.innerHTML = html));
}
setInterval(tickCountdown, 1000);

/* ---------- Captcha (birinchi ochilganda) ----------
   Har bir foydalanuvchiga ALOHIDA, tasodifiy tuziladigan savollar beriladi:
   - 3 ta savol (rasm nomi bo'yicha topish, misol, rasmlarni sanash), tartibi har safar boshqacha
   - 40 ta rasm fondidan har safar yangi 9 talik to'plam, variantlar tartibi aralash
   - tasodifiy "nonce" + foydalanuvchi ID dan seed olinadi
   DIQQAT: haqiqiy kafolat serverda bo'ladi. API_URL yoqilganda savollarni server
   yaratadi (to'g'ri javoblar brauzerga yuborilmaydi), har savol bir martalik va
   MongoDB'dagi unique indeks 2 ta userga bir xil savol berilishiga yo'l qo'ymaydi.
   Brauzerdagi belgi (localStorage) ishonchli emas: tasdiqlanganlik serverda saqlanadi. */
const VERIFY_KEY = 'verified_' + tgUser.id;
const isVerified = () => { try { return localStorage.getItem(VERIFY_KEY) === '1'; } catch { return false; } };
const setVerified = () => { try { localStorage.setItem(VERIFY_KEY, '1'); } catch {} };

const CAP_POOL = [
  { e: '🐼', n: 'Panda' }, { e: '🦊', n: 'Tulki' }, { e: '🐴', n: 'Ot' }, { e: '🐸', n: 'Baqa' },
  { e: '🦁', n: 'Sher' }, { e: '🐧', n: 'Pingvin' }, { e: '🐙', n: 'Sakkizoyoq' }, { e: '🐢', n: 'Toshbaqa' },
  { e: '🐘', n: 'Fil' }, { e: '🐵', n: 'Maymun' }, { e: '🐰', n: 'Quyon' }, { e: '🐻', n: 'Ayiq' },
  { e: '🐶', n: 'It' }, { e: '🐱', n: 'Mushuk' }, { e: '🐮', n: 'Sigir' }, { e: '🐷', n: "Cho'chqa" },
  { e: '🐔', n: 'Tovuq' }, { e: '🦆', n: "O'rdak" }, { e: '🐝', n: 'Asalari' }, { e: '🦋', n: 'Kapalak' },
  { e: '🐟', n: 'Baliq' }, { e: '🐬', n: 'Delfin' }, { e: '🍎', n: 'Olma' }, { e: '🍌', n: 'Banan' },
  { e: '🍇', n: 'Uzum' }, { e: '🍉', n: 'Tarvuz' }, { e: '🍒', n: 'Gilos' }, { e: '🍓', n: 'Qulupnay' },
  { e: '🍋', n: 'Limon' }, { e: '🥕', n: 'Sabzi' }, { e: '🚗', n: 'Mashina' }, { e: '🚲', n: 'Velosiped' },
  { e: '⚽', n: "To'p" }, { e: '🌙', n: 'Oy' }, { e: '⭐', n: 'Yulduz' }, { e: '🌳', n: 'Daraxt' },
  { e: '🏠', n: 'Uy' }, { e: '🎈', n: 'Shar' }, { e: '🔑', n: 'Kalit' }, { e: '🚀', n: 'Raketa' },
];
function makeRng(s0, s1, s2, s3) {
  // sfc32: 128 bitli holat, shuning uchun seedlar to'qnashishi amalda mumkin emas
  let a = s0 >>> 0, b = s1 >>> 0, c = s2 >>> 0, d = s3 >>> 0;
  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 15; i++) next();
  return next;
}
function buildChallenge() {
  const nonce = crypto.getRandomValues(new Uint32Array(4));
  const uid = Number(tgUser.id);
  const rnd = makeRng(uid % 4294967296 ^ nonce[0], Math.floor(uid / 4294967296) ^ nonce[1], nonce[2], nonce[3]);
  const rint = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  const shuf = (arr) => { arr = [...arr]; for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  const nums = (arr) => arr.map((v) => ({ id: String(v), label: String(v) }));
  const makers = {
    name() {
      const opts = shuf(CAP_POOL).slice(0, 9);
      const t = opts[rint(0, 8)];
      return { q: 'Quyidagi rasmni toping:', big: t.n, options: opts.map((o, i) => ({ id: String(i), label: o.e })), answer: String(opts.indexOf(t)), key: opts.map((o) => o.e).join('') + t.e };
    },
    math() {
      let a = rint(3, 25), b = rint(2, 20);
      const plus = rnd() < 0.5;
      if (!plus && b > a) [a, b] = [b, a];
      const ans = plus ? a + b : a - b;
      const set = new Set([ans]);
      while (set.size < 9) { const v = ans + rint(-9, 9); if (v >= 0) set.add(v); }
      const opts = shuf([...set]);
      return { q: 'Natijani toping:', big: `${a} ${plus ? '+' : '−'} ${b} = ?`, num: true, options: nums(opts), answer: String(ans), key: `${a}${plus ? '+' : '-'}${b}:${opts.join(',')}` };
    },
    count() {
      const e = CAP_POOL[rint(0, CAP_POOL.length - 1)].e;
      const n = rint(3, 9);
      const set = new Set([n]);
      while (set.size < 9) set.add(rint(1, 12));
      const opts = shuf([...set]);
      return { q: 'Nechta rasm bor?', big: e.repeat(n), image: e, count: n, num: true, options: nums(opts), answer: String(n), key: `${e}${n}:${opts.join(',')}` };
    },
  };
  const rounds = shuf(['name', 'math', 'count']).map((t) => makers[t]());
  return { id: `${tgUser.id}:${[...nonce].map((n) => n.toString(36)).join('')}`, local: true, rounds, sig: rounds.map((r) => r.key).join('|') };
}

function playChallenge(ch) {
  return new Promise((resolve, reject) => {
    let round = 0;
    const answers = [];
    const grid = $('#capGrid');
    const dots = () => ($('#capDots').innerHTML = ch.rounds.map((_, i) => `<i class="${i < round ? 'on' : ''}"></i>`).join(''));
    const show = () => {
      const r = ch.rounds[round];
      $('#capQ').textContent = r.q;
      const target = $('#capTarget');
      destroyAnimations(target);
      if (r.image) target.innerHTML = Array.from({ length: r.count }, () => icon(r.image)).join('');
      else target.textContent = r.big;
      destroyAnimations(grid);
      grid.innerHTML = r.options.map((o) => `<button data-id="${esc(o.id)}" aria-label="${esc(o.label)}" class="${r.num ? 'num' : ''}">${r.num ? esc(o.label) : icon(o.label)}</button>`).join('');
      mountAnimations(target);
      mountAnimations(grid);
      dots();
    };
    grid.onclick = async (ev) => {
      const b = ev.target.closest('button');
      if (!b || grid.dataset.busy) return;
      const r = ch.rounds[round];
      const id = b.dataset.id;
      if (ch.local && id !== r.answer) {
        grid.dataset.busy = '1';
        haptic('error');
        b.classList.add('wrong');
        setTimeout(() => resolve(false), 450);
        return;
      }
      haptic('light');
      answers.push(id);
      round++;
      if (round < ch.rounds.length) return show();
      dots();
      if (ch.local) return resolve(true);
      grid.dataset.busy = '1';
      try {
        const res = await api('/captcha/verify', { method: 'POST', body: JSON.stringify({ id: ch.id, answers }) });
        resolve(!!res?.ok);
      } catch (error) {
        reject(error);
      }
    };
    delete grid.dataset.busy;
    show();
  });
}

async function runCaptcha() {
  mountAnimations($('.cap-ico'));
  if ((tg?.initDataUnsafe?.start_param || '').startsWith('ref_')) $('#capRef').hidden = false;
  let fails = 0;
  for (;;) {
    const ch = LIVE_MODE ? await api('/captcha') : buildChallenge();
    if (ch.verified) {
      await window.finishLoadingIntro?.();
      break;
    }
    await window.finishLoadingIntro?.();
    $('#captcha').hidden = false;
    document.body.classList.add('locked');
    if (await playChallenge(ch)) break;
    fails++;
    $('#capMsg').textContent = "Noto'g'ri. Siz uchun yangi savollar tayyorlandi";
    if (fails % 3 === 0) {
      for (let s = 8; s > 0; s--) { $('#capMsg').textContent = `Ko'p xato. ${s} soniya kuting`; await new Promise((r) => setTimeout(r, 1000)); }
      $('#capMsg').textContent = '';
    }
  }
  $('#captcha').hidden = true;
  document.body.classList.remove('locked');
  $('#capMsg').textContent = '';
}

/* ---------- Boshlash ---------- */
function boot(firstTime) {
  if (firstTime && (tg?.initDataUnsafe?.start_param || '').startsWith('ref_')) demo.user.balance += CONFIG.REF_BONUS;
  renderHome();
  renderProfile();
  renderPrize();
  mountAnimations(document);
  go('home', true);
}
async function startApp() {
  try {
    if (LIVE_MODE) {
      const data = await refreshLiveData();
      if (!data.verified) {
        await runCaptcha();
        await refreshLiveData();
        haptic('success'); confetti(); toast('Tasdiqlandi. Xush kelibsiz!');
      }
      renderHome();
      renderProfile();
      renderPrize();
      mountAnimations(document);
      go('home', true);
      openPromoFromLaunch();
      await window.finishLoadingIntro?.();
      return;
    }
    if (isVerified()) {
      boot(false);
      openPromoFromLaunch();
      await window.finishLoadingIntro?.();
      return;
    }
    await runCaptcha();
    setVerified();
    haptic('success'); confetti(); toast('Tasdiqlandi. Xush kelibsiz!');
    boot(true);
    openPromoFromLaunch();
  } catch (error) {
    console.error('Mini App initialization failed:', error);
    await window.finishLoadingIntro?.();
    $('#captcha').hidden = false;
    document.body.classList.add('locked');
    $('#capQ').textContent = 'Mini-ilovaga ulanib bo‘lmadi';
    $('#capMsg').textContent = error.message || 'Internetni tekshirib qayta urinib ko‘ring.';
  }
}
document.addEventListener('visibilitychange', () => {
  if (!LIVE_MODE || document.hidden) return;
  refreshLiveData().then(() => {
    renderHome();
    renderProfile();
    renderPrize();
    if ($('#page-friends').classList.contains('active')) renderFriends();
    if ($('#page-top').classList.contains('active')) renderTop();
  }).catch((error) => toast(error.message));
});
startApp();