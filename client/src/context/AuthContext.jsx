import { createContext, useContext, useState, useCallback } from 'react';
import api from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('stocksense_user');
    return raw ? JSON.parse(raw) : null;
  });

  const persist = (token, user) => {
    localStorage.setItem('stocksense_token', token);
    localStorage.setItem('stocksense_user', JSON.stringify(user));
    setUser(user);
  };

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    persist(data.token, data.user);
  }, []);

  const signup = useCallback(async (payload) => {
    const { data } = await api.post('/auth/signup', payload);
    persist(data.token, data.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('stocksense_token');
    localStorage.removeItem('stocksense_user');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
