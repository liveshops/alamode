import { HomeRefreshContext } from '@/contexts/HomeRefreshContext';
import { Ionicons } from '@expo/vector-icons';
import { Tabs, usePathname } from 'expo-router';
import { useRef } from 'react';

export default function TabsLayout() {
  const refreshCallbackRef = useRef<(() => void) | null>(null);
  const pathname = usePathname();

  const triggerRefresh = () => {
    if (refreshCallbackRef.current) {
      refreshCallbackRef.current();
    }
  };

  const registerRefresh = (callback: () => void) => {
    refreshCallbackRef.current = callback;
  };

  return (
    <HomeRefreshContext.Provider value={{ triggerRefresh, registerRefresh }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#000',
          tabBarInactiveTintColor: '#999',
          tabBarStyle: {
            borderTopWidth: 1,
            borderTopColor: '#eee',
          },
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
          }}
          listeners={{
            tabPress: (e) => {
              // If already on home tab, trigger refresh
              if (pathname === '/' || pathname === '/index' || pathname === '') {
                triggerRefresh();
              }
            },
          }}
        />
      <Tabs.Screen
        name="shop"
        options={{
          title: 'Shop',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="storefront" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: 'Favorites',
          tabBarIcon: ({ color, size }) => <Ionicons name="heart" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color, size }) => <Ionicons name="search" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />
        </Tabs>
    </HomeRefreshContext.Provider>
  );
}
