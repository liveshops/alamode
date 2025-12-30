import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface PushNotificationState {
  expoPushToken: string | null;
  notification: Notifications.Notification | null;
  error: string | null;
}

export function usePushNotifications() {
  const router = useRouter();
  const { user } = useAuth();
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  // Register for push notifications
  async function registerForPushNotificationsAsync(): Promise<string | null> {
    let token: string | null = null;

    // Must be a physical device
    if (!Device.isDevice) {
      console.log('Push notifications require a physical device');
      return null;
    }

    // Check/request permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      setError('Permission not granted for push notifications');
      return null;
    }

    try {
      // Get the Expo push token
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      
      if (!projectId) {
        console.log('No project ID found, using default');
      }

      const pushTokenData = await Notifications.getExpoPushTokenAsync({
        projectId,
      });
      
      token = pushTokenData.data;
      console.log('Expo Push Token:', token);
    } catch (err) {
      console.error('Error getting push token:', err);
      setError(`Error getting push token: ${err}`);
      return null;
    }

    // Android-specific channel setup
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    return token;
  }

  // Save push token to Supabase
  async function savePushToken(token: string) {
    if (!user) return;

    try {
      const { error: upsertError } = await supabase
        .from('push_tokens')
        .upsert(
          {
            user_id: user.id,
            expo_push_token: token,
            platform: Platform.OS,
            device_id: Device.modelId || Device.deviceName || 'unknown',
            is_active: true,
          },
          {
            onConflict: 'user_id,expo_push_token',
          }
        );

      if (upsertError) {
        console.error('Error saving push token:', upsertError);
      } else {
        console.log('Push token saved successfully');
      }
    } catch (err) {
      console.error('Error saving push token:', err);
    }
  }

  // Remove push token (on logout)
  async function removePushToken() {
    if (!expoPushToken || !user) return;

    try {
      await supabase
        .from('push_tokens')
        .update({ is_active: false })
        .eq('user_id', user.id)
        .eq('expo_push_token', expoPushToken);
    } catch (err) {
      console.error('Error removing push token:', err);
    }
  }

  // Handle notification tap (deep linking)
  function handleNotificationResponse(response: Notifications.NotificationResponse) {
    const data = response.notification.request.content.data;
    
    if (data?.screen) {
      switch (data.screen) {
        case 'user':
          if (data.userId) {
            router.push(`/user/${data.userId}`);
          }
          break;
        case 'product':
          if (data.productId) {
            router.push(`/product/${data.productId}`);
          }
          break;
        case 'brand':
          if (data.brandSlug) {
            router.push(`/brand/${data.brandSlug}`);
          }
          break;
        case 'notifications':
          // Navigate to notifications screen when implemented
          break;
        default:
          break;
      }
    }
  }

  // Initialize push notifications
  useEffect(() => {
    if (!user) return;

    // Register and save token
    registerForPushNotificationsAsync().then((token) => {
      if (token) {
        setExpoPushToken(token);
        savePushToken(token);
      }
    });

    // Listen for incoming notifications (foreground)
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      setNotification(notification);
    });

    // Listen for notification taps
    responseListener.current = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [user]);

  return {
    expoPushToken,
    notification,
    error,
    removePushToken,
  };
}

// Utility function to get badge count
export async function getBadgeCount(): Promise<number> {
  return await Notifications.getBadgeCountAsync();
}

// Utility function to set badge count
export async function setBadgeCount(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(count);
}

// Utility function to clear all notifications
export async function clearAllNotifications(): Promise<void> {
  await Notifications.dismissAllNotificationsAsync();
  await Notifications.setBadgeCountAsync(0);
}
