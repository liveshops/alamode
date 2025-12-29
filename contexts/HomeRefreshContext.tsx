import { createContext, useContext } from 'react';

// Context to allow triggering home refresh from anywhere
export const HomeRefreshContext = createContext<{
  triggerRefresh: () => void;
  registerRefresh: (callback: () => void) => void;
}>({
  triggerRefresh: () => {},
  registerRefresh: () => {},
});

export const useHomeRefresh = () => useContext(HomeRefreshContext);
