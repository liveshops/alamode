import { supabase } from '@/utils/supabase';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

export default function AuthCallbackScreen() {
  const params = useLocalSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Verifying your email...');

  useEffect(() => {
    handleAuthCallback();
  }, []);

  const handleAuthCallback = async () => {
    try {
      // Extract token from URL parameters
      // Supabase sends: access_token, refresh_token, and type
      const accessToken = params.access_token as string;
      const refreshToken = params.refresh_token as string;
      const type = params.type as string;

      if (accessToken && refreshToken) {
        // Set session from URL tokens
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          setStatus('error');
          setMessage('Verification failed. Please try again.');
          setTimeout(() => router.replace('/(auth)/login'), 3000);
          return;
        }

        if (data.session) {
          setStatus('success');
          setMessage('Email verified! Redirecting...');
          setTimeout(() => router.replace('/(tabs)'), 1500);
          return;
        }
      }

      // Fallback: try to get existing session
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        setStatus('error');
        setMessage('Verification failed. Please try again.');
        setTimeout(() => router.replace('/(auth)/login'), 3000);
        return;
      }

      if (session) {
        setStatus('success');
        setMessage('Email verified! Redirecting...');
        setTimeout(() => router.replace('/(tabs)'), 1500);
      } else {
        setStatus('error');
        setMessage('Session not found. Please try logging in.');
        setTimeout(() => router.replace('/(auth)/login'), 3000);
      }
    } catch (err) {
      console.error('Auth callback error:', err);
      setStatus('error');
      setMessage('Something went wrong. Please try logging in.');
      setTimeout(() => router.replace('/(auth)/login'), 3000);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.appName}>cherry</Text>
      
      {status === 'loading' && (
        <>
          <ActivityIndicator size="large" color="#000" style={styles.loader} />
          <Text style={styles.message}>{message}</Text>
        </>
      )}
      
      {status === 'success' && (
        <>
          <Text style={styles.successIcon}>✓</Text>
          <Text style={styles.message}>{message}</Text>
        </>
      )}
      
      {status === 'error' && (
        <>
          <Text style={styles.errorIcon}>✕</Text>
          <Text style={styles.message}>{message}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  appName: {
    fontFamily: 'AbrilFatface-Regular',
    fontSize: 48,
    textAlign: 'center',
    marginBottom: 60,
    letterSpacing: 2,
  },
  loader: {
    marginBottom: 20,
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  successIcon: {
    fontSize: 60,
    color: '#4CAF50',
    marginBottom: 20,
  },
  errorIcon: {
    fontSize: 60,
    color: '#F44336',
    marginBottom: 20,
  },
});
