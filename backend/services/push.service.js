'use strict';

const webpush = require('web-push');

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL   = process.env.VAPID_EMAIL || 'mailto:admin@debateforge.com';

let configured = false;

function ensureConfigured() {
  if (configured) return true;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    // eslint-disable-next-line no-console
    console.warn('[PUSH] VAPID keys not set — push notifications disabled');
    return false;
  }
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);
  configured = true;
  return true;
}

/**
 * Send a push notification to a specific subscription.
 * @param {object} subscription — PushSubscription object { endpoint, keys: { p256dh, auth } }
 * @param {{ title: string, body: string, icon?: string, data?: object }} payload
 */
async function sendPushNotification(subscription, payload) {
  if (!ensureConfigured()) return;
  if (!subscription || !subscription.endpoint) return;

  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify(payload)
    );
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      // Subscription expired — caller should remove it
      throw new Error('SUBSCRIPTION_EXPIRED');
    }
    // eslint-disable-next-line no-console
    console.error('[PUSH] Send error:', err.message);
  }
}

module.exports = {
  sendPushNotification,
  VAPID_PUBLIC_KEY: VAPID_PUBLIC,
};
