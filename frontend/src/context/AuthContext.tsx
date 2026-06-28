'use client';

/**
 * Authentication Context for Talentious
 * Manages user session, login/logout state globally
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, login as apiLogin, register as apiRegister, getMe, logout as apiLogout, isAuthenticated, getStoredUser } from '@/lib/auth';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load the user on component mount
  useEffect(() => {
    const initAuth = async () => {
      // Check if a token exists
      if (isAuthenticated()) {
        try {
          // First retrieve the user stored locally for quick display
          const storedUser = getStoredUser();
          if (storedUser) {
            setUser(storedUser);
          }
          
          // Then refresh from the API to be sure
          const currentUser = await getMe();
          setUser(currentUser);
          
          // Set session cookie for middleware
          document.cookie = 'talentious_session=true; path=/; max-age=2592000; SameSite=Strict';
        } catch (error) {
          // If error (expired/invalid token), clean up
          console.error('Failed to load user:', error);
          setUser(null);
          // Remove session cookie
          document.cookie = 'talentious_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  // Login
  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      await apiLogin({ email, password });
      
      // Retrieve user info after successful login
      const currentUser = await getMe();
      setUser(currentUser);
      
      // Set session cookie for middleware (add Secure flag in production)
      const secureCookie = process.env.NODE_ENV === 'production' ? '; Secure' : '';
      document.cookie = `talentious_session=true; path=/; max-age=2592000; SameSite=Strict${secureCookie}`;
    } catch (error) {
      setUser(null);
      throw error; // Re-throw so the component can display the error
    } finally {
      setIsLoading(false);
    }
  };

  // Registration
  const register = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      await apiRegister({ email, password });
      // After successful registration, do not log in automatically
      // The user must log in manually
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Logout
  const logout = () => {
    apiLogout();
    setUser(null);
    
    // Remove session cookie
    document.cookie = 'talentious_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  };

  // Refresh user info
  const refreshUser = async () => {
    if (!isAuthenticated()) {
      setUser(null);
      return;
    }
    
    try {
      const currentUser = await getMe();
      setUser(currentUser);
    } catch (error) {
      console.error('Failed to refresh user:', error);
      setUser(null);
    }
  };

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Custom hook to use the auth context
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
};
