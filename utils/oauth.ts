import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Configure Google Sign-In with your Web client ID (the one from Google Cloud Console)
GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
});

/**
 * Sign in with Google using native Google Sign-In + Supabase signInWithIdToken
 */
export async function signInWithGoogle(): Promise<{ error: Error | null }> {
  try {
    // Check if Google Play Services are available (Android only, always true on iOS)
    await GoogleSignin.hasPlayServices();

    // Show the native Google sign-in dialog
    const response = await GoogleSignin.signIn();

    if (!response.data?.idToken) {
      throw new Error('No ID token received from Google');
    }

    // Exchange the Google ID token for a Supabase session
    const { error: signInError } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: response.data.idToken,
    });

    if (signInError) throw signInError;
    return { error: null };
  } catch (error: any) {
    // Google sign-in cancellation
    if (error.code === 'SIGN_IN_CANCELLED' || error.code === '12501') {
      return { error: new Error('Sign in was cancelled') };
    }
    console.error('Google sign in error:', error);
    return { error: error as Error };
  }
}

/**
 * Sign in with Apple using native iOS flow + Supabase
 */
export async function signInWithApple(): Promise<{ error: Error | null }> {
  try {
    if (Platform.OS !== 'ios') {
      return { error: new Error('Apple Sign In is only available on iOS') };
    }

    // Check if Apple Authentication is available
    const isAvailable = await AppleAuthentication.isAvailableAsync();
    if (!isAvailable) {
      return { error: new Error('Apple Sign In is not available on this device') };
    }

    // Generate a nonce for security
    const rawNonce = generateNonce();
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce
    );

    // Request Apple credentials
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    if (!credential.identityToken) {
      throw new Error('No identity token received from Apple');
    }

    // Exchange Apple credential for Supabase session
    const { error: signInError } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: rawNonce,
    });

    if (signInError) throw signInError;

    // If Apple provided a name (only on first sign-in), update user metadata
    if (credential.fullName?.givenName || credential.fullName?.familyName) {
      const displayName = [
        credential.fullName?.givenName,
        credential.fullName?.familyName,
      ]
        .filter(Boolean)
        .join(' ');

      if (displayName) {
        await supabase.auth.updateUser({
          data: { display_name: displayName },
        });
      }
    }

    return { error: null };
  } catch (error: any) {
    // Apple auth cancellation
    if (error.code === 'ERR_REQUEST_CANCELED') {
      return { error: new Error('Sign in was cancelled') };
    }
    console.error('Apple sign in error:', error);
    return { error: error as Error };
  }
}

/**
 * Generate a random nonce string for Apple Sign In
 */
function generateNonce(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const randomValues = new Uint8Array(length);
  // Use Math.random as a fallback for React Native
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
