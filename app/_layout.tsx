import { AuthProvider } from '@/contexts/AuthContext';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    'Zodiak-Thin': require('../assets/fonts/Zodiak-Thin.ttf'),
    'AbrilFatface-Regular': require('../assets/fonts/AbrilFatface-Regular.ttf'),
  });
  const [splashHidden, setSplashHidden] = useState(false);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().then(() => setSplashHidden(true));
    }
  }, [fontsLoaded, fontError]);

  // Safety timeout: hide splash after 3s even if fonts haven't loaded
  useEffect(() => {
    const timer = setTimeout(() => {
      SplashScreen.hideAsync().then(() => setSplashHidden(true));
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  if (!splashHidden && !fontsLoaded && !fontError) {
    return null;
  }
  

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <AuthProvider>
      <NotificationProvider>
        <Stack
          screenOptions={{
            headerShown: false,
          }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen 
            name="product/[id]" 
            options={{
              presentation: 'card',
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen 
            name="brand/[slug]" 
            options={{
              presentation: 'card',
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen 
            name="user/[id]" 
            options={{
              presentation: 'card',
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen 
            name="edit-profile" 
            options={{
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
        </Stack>
      </NotificationProvider>
    </AuthProvider>
    </GestureHandlerRootView>
  );
}
