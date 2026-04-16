import { User } from '@supabase/supabase-js';
import { router } from 'expo-router';
import { Alert } from 'react-native';

/**
 * Check if user is authenticated. If not, show an alert prompting login.
 * Returns true (and narrows the type) if authenticated, false otherwise.
 */
export function requireAuth(user: User | null, action: string): user is User {
  if (user) return true;

  Alert.alert(
    'Sign In Required',
    `Sign in to ${action}`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign In', onPress: () => router.push('/(auth)/login') },
    ]
  );
  return false;
}
