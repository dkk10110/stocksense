import { createContext, useCallback, useContext, useState } from 'react';

const ModalContext = createContext(null);

export function ModalProvider({ children }) {
  const [buyTarget, setBuyTarget] = useState(null); // { watchlistItemId, name, suggestedPrice }

  const openBuyModal = useCallback((watchlistItemId, name, suggestedPrice) => {
    setBuyTarget({ watchlistItemId, name, suggestedPrice });
  }, []);
  const closeBuyModal = useCallback(() => setBuyTarget(null), []);

  return (
    <ModalContext.Provider value={{ buyTarget, openBuyModal, closeBuyModal }}>
      {children}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error('useModal must be used within ModalProvider');
  return ctx;
}
