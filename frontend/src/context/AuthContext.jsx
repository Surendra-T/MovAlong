import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { loginApi, registerApi, getMeApi, setOnUnauthorized } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('movalong_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState(() => {
    return localStorage.getItem('movalong_token') || null;
  });

  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    localStorage.removeItem('movalong_token');
    localStorage.removeItem('movalong_user');
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setOnUnauthorized(() => {
      logout();
    });

    // Validate stored session on mount if token exists
    if (token) {
      getMeApi()
        .then((res) => {
          if (res && res.user) {
            setUser(res.user);
            localStorage.setItem('movalong_user', JSON.stringify(res.user));
          }
        })
        .catch(() => {
          // If network is offline, don't immediately drop user - allow offline usage!
          if (navigator.onLine === false) {
            // Keep cached user
          } else {
            // If server explicitly rejected token, logout
            // logout();
          }
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [token, logout]);

  const login = async (email, password) => {
    const data = await loginApi({ email, password });
    localStorage.setItem('movalong_token', data.token);
    localStorage.setItem('movalong_user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const register = async (email, password, name) => {
    const data = await registerApi({ email, password, name });
    localStorage.setItem('movalong_token', data.token);
    localStorage.setItem('movalong_user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
