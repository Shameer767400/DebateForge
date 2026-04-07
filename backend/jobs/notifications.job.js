'use strict';

const cron = require('node-cron');
const { User } = require('../models');
const { sendPushNotification } = require('../services/push.service');
const { resetWeeklyFreeze } = require('../services/streak.service');

/**
 * Schedule all notification-related cron jobs.
 */
function scheduleNotificationJobs() {
  /* ── Daily at 6 PM: remind users at risk of losing their streak ── */
  cron.schedule('0 18 * * *', async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      // Find users who haven't debated today but have an active streak
      const usersAtRisk = await User.find({
        'streak.current': { $gte: 1 },
        'streak.lastDebateDate': { $lt: today, $gte: yesterday },
        pushSubscription: { $ne: null },
      }).limit(500);

      for (const user of usersAtRisk) {
        if (!user.pushSubscription?.endpoint) continue;

        try {
          await sendPushNotification(user.pushSubscription, {
            title: `🔥 ${user.streak.current}-day streak at risk!`,
            body: 'Debate now to keep your streak alive. You still have time!',
            icon: '/logo192.png',
            data: { url: '/lobby' },
          });
        } catch (err) {
          if (err.message === 'SUBSCRIPTION_EXPIRED') {
            user.pushSubscription = null;
            await user.save();
          }
        }
      }

      // eslint-disable-next-line no-console
      console.log(`[CRON] Streak reminder sent to ${usersAtRisk.length} users`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[CRON] Streak reminder error:', err.message);
    }
  });

  /* ── Weekly Monday at midnight: reset streak freezes ── */
  cron.schedule('0 0 * * 1', async () => {
    try {
      const users = await User.find({ 'streak.freezeUsed': true });

      for (const user of users) {
        resetWeeklyFreeze(user);
        await user.save();
      }

      // eslint-disable-next-line no-console
      console.log(`[CRON] Weekly freeze reset for ${users.length} users`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[CRON] Freeze reset error:', err.message);
    }
  });

  // eslint-disable-next-line no-console
  console.log('[CRON] Notification jobs scheduled ✅');
}

module.exports = { scheduleNotificationJobs };
