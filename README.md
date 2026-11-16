# Viral Telegram Mini App

Telegram bot, Mini App API, and MongoDB-backed game backend.

## Requirements

- Node.js 20+
- MongoDB Atlas or another MongoDB replica set
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- A public HTTPS URL for the Mini App
- The bot must be an administrator in the channel used for membership tasks

The weekly prize is **100,000 UZS** by default. The bot calculates the previous
Tashkent week winner on Monday at 00:00 and notifies admins. An admin must send
the money outside the bot and then mark the award as paid in `/admin`.

## Setup

1. Copy `.env.example` to `.env` and set exactly these four values:

   - `MONGODB_URI`: MongoDB Atlas or another MongoDB replica-set URI.
   - `APP_URL`: public HTTPS address serving this project, including `https://`
     (for example, `https://your-app.onrender.com/`).
   - `ADMIN_IDS`: comma-separated numeric Telegram user IDs allowed to manage
     the game, e.g. `123456789,987654321`.
   - `API_TOKEN`: Telegram bot token from @BotFather.

   All other game configuration is stored in MongoDB and changed by an admin
   using the bot.
2. Install and start:

   ```sh
   npm install
   npm start
   ```

3. In BotFather, configure the Mini App domain to match the hostname in
   `APP_URL`. The server also sets the menu button to the same normalized HTTPS
   URL; `/start` shows a button to open the Mini App.

The Express server serves `index.html`, assets, and the `/api` endpoints from
the same origin. Do not expose `.env` or MongoDB credentials.
Telegram API startup requests retry with capped exponential backoff; the web
server can become healthy while Telegram is temporarily unreachable.

For an external uptime monitor such as cron-job.org, use
`https://your-app.onrender.com/cron` instead of the site root. The root serves
the full Mini App; `/cron` returns only `OK` so the monitor does not exceed its
response-size limit. This endpoint only checks that the web server responds;
weekly awards and daily reminders are scheduled by the app itself.

On opening, the Mini App displays its animated loading intro until initial app
data is ready. If the user needs CAPTCHA verification, the intro then hands off
to the CAPTCHA screen.

Bot text messages start with a matching premium emoji when one is available
(otherwise 💬); every supplied premium emoji is converted in messages and button
labels, and message text is escaped before it is sent. Telegram keyboard button
labels do not support HTML entities; their premium icons are sent with Telegram's
`icon_custom_emoji_id` button field instead. Inline buttons use Telegram's
`primary` (blue), `success` (green), and `danger` (red) styles. Premium button
icons require the bot owner to have Telegram Premium for direct messages, or
the bot to have purchased additional usernames on Fragment.

## Game and admin workflow

- Users complete the in-app CAPTCHA, claim a daily bonus, join the configured
  channel, submit external tasks for admin review, and invite verified friends.
- Channel membership is checked with Telegram's `getChatMember` API. Each
  referred user must complete the CAPTCHA and join every enabled mandatory
  channel before the referral counts. The inviter then receives their configured
  referral points and a Telegram notification. The bot must be an administrator
  in every selected channel to verify membership.
- The leaderboard compares points earned during the current Tashkent week or
  all time. Every CAPTCHA-verified user is shown, including users with zero
  points in the selected period.
- `/admin` is restricted to `ADMIN_IDS`. Its button-based panel manages pending
  reviews, weekly awards, tasks, channels, point rewards, and the Instagram URL.
  The panel also shows subscriber and leaderboard statistics and lets admins
  send a text announcement to all users in the bot database. New users receive
  an admin notification with a clickable name, including users without a
  Telegram username.
- In **Foydalanuvchini qidirish**, admins can look up a bot user by Telegram ID
  or exact `@username`, then choose and confirm a Telegram Stars gift. Gift
  costs are shown before sending and are paid from the bot's Stars balance.
  Gift attempts are recorded to prevent duplicate sends; if Telegram's result
  is ambiguous, check the bot's gift history before taking further action.
- In **Referral sovg‘asi**, an admin selects an available Telegram gift. For
  every 10 verified referrals (including the required-channel checks), the bot
  automatically sends that gift using its Telegram Stars balance. If no gift
  is configured or Telegram rejects a send, the award is queued; admins can
  review and retry queued gifts from the same panel. If the API result is
  ambiguous, the award is held for review to avoid accidentally sending a
  duplicate gift.
- The **Do‘stlar** Mini App page shows referral progress toward the next gift
  milestone and the selected gift's Stars price. A referral counts only after
  the friend passes verification and joins all mandatory channels.
- The Mini App profile includes **Donat qilish**. Users choose an amount of
  Telegram Stars and enter a message (up to 500 characters) before paying
  through Telegram's native invoice screen. The bot validates the checkout and
  records successful payments; donations are credited to the bot's Stars
  balance, not to the user's in-app coin balance. Each admin receives a pinned
  notification with the donor's username (if available), Telegram ID, Stars
  amount, and message.
- The **Reyting** page shows the top 10 donors ranked by total successful Stars
  donations. Only confirmed payments are included.
- Leaderboard and donor avatars use Telegram profile-photo URLs directly,
  lazy-load visible images, and show initials while loading or if no photo is
  available to keep image traffic low.
- In **Kanallar**, admins can add any number of mandatory or bonus channels.
  The channel picker lists channels where the admin has management rights and
  the bot is already a member. The bot must also be an administrator there.
  Mandatory channels gate referral rewards; bonus channels grant their
  configured points after membership is checked.
- Task and bonus-channel rewards can be edited in the panel. Instagram URL and
  referral/daily rewards can be edited from **Ball va havolalar**. Settings are
  stored in MongoDB.
- Admins can use:
  - `/setprize 100000`
  - `/setreward ref|bonus|channel|instagram|invite3|daily|streak POINTS`
  - `/setchannel @channel | https://t.me/channel`
  - `/setinstagram https://instagram.com/page`
  - `/task_add id reward channel|manual|referrals | Title | URL | CHAT_ID`
  The bot must be an administrator of a configured channel. Every task setting
  and reward changed through these commands is saved in MongoDB.
- A `manual` task is not paid until an admin approves its submission.
- Weekly prize transfers are **manual**. The bot never sends money or asks
  users for payment credentials. After sending the prize externally, the
  admin marks the award as paid in the bot panel.

## Security notes

- Live API requests require a valid, recent Telegram Web App `initData`
  signature; user IDs supplied by the browser are not trusted.
- MongoDB stores unique point ledger keys to prevent duplicate daily, task, and
  referral rewards.
- Use a MongoDB replica set (Atlas provides this) and HTTPS in production.
- Do not use the local/demo CAPTCHA as a production anti-abuse control. When
  opened outside Telegram, the frontend intentionally uses demo data only.
