import { createContext, useContext } from 'react';

// Context to allow triggering tab refreshes from anywhere
export const TabRefreshContext = createContext<{
  triggerRefresh: (tab: 'home' | 'shop') => void;
  registerRefresh: (tab: 'home' | 'shop', callback: () => void) => void;
}>({
  triggerRefresh: () => {},
  registerRefresh: () => {},
});

export const useTabRefresh = () => useContext(TabRefreshContext);

// Legacy export for backwards compatibility
export const HomeRefreshContext = TabRefreshContext;
export const useHomeRefresh = () => {
  const { triggerRefresh, registerRefresh } = useTabRefresh();
  return {
    triggerRefresh: () => triggerRefresh('home'),
    registerRefresh: (callback: () => void) => registerRefresh('home', callback),
  };
};
