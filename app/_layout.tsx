import { AuthProvider } from '@/contexts/AuthContext';
import { Stack } from 'expo-router';
// Uncomment these imports after adding the font file:
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

// Uncomment after adding font file:
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // Uncomment this section after adding AlbraDisplay-Light.ttf to assets/fonts/:
  
  const [fontsLoaded, fontError] = useFonts({
    'Zodiak-Thin': require('../assets/fonts/Zodiak-Thin.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }
  

  return (
    <AuthProvider>
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
    </AuthProvider>
  );
}
