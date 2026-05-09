import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API = process.env.REACT_APP_API_URL || 'http://127.0.0.1:5001';

/**
 * usePushNotifications hook
 *
 * Manages push notification subscription lifecycle:
 * - Checks browser support
 * - Requests notification permission
 * - Registers service worker
 * - Subscribes/unsubscribes to push via backend
 */
export function usePushNotifications() {
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  const [subscribed, setSubscribed] = useState(false);
  const [supported] = useState(
    () => typeof Notification !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
  );

  // Check existing subscription on mount
  useEffect(() => {
    if (!supported) return;

    navigator.serviceWorker.ready.then((registration) => {
      registration.pushManager.getSubscription().then((sub) => {
        setSubscribed(!!sub);
      });
    });
  }, [supported]);

  const subscribe = useCallback(async () => {
    if (!supported) return false;

    try {
      // 1. Request permission
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== 'granted') return false;

      // 2. Register service worker
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      // 3. Get VAPID key from server
      const { data } = await axios.get('/api/push/vapid-key', { baseURL: API });
      if (!data.key) {
        console.warn('[PUSH] No VAPID key configured on server');
        return false;
      }

      // Convert VAPID key to Uint8Array
      const urlBase64ToUint8Array = (base64String) => {
        const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
      };

      // 4. Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.key),
      });

      // 5. Send subscription to backend
      await axios.post(
        '/api/push/subscribe',
        { subscription: subscription.toJSON() },
        {
          baseURL: API,
          withCredentials: true,
        }
      );

      setSubscribed(true);
      return true;
    } catch (err) {
      console.error('[PUSH] Subscribe error:', err);
      return false;
    }
  }, [supported]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
      }

      await axios.post(
        '/api/push/unsubscribe',
        {},
        {
          baseURL: API,
          withCredentials: true,
        }
      );

      setSubscribed(false);
    } catch (err) {
      console.error('[PUSH] Unsubscribe error:', err);
    }
  }, [supported]);

  return {
    supported,
    permission,
    subscribed,
    subscribe,
    unsubscribe,
  };
}
