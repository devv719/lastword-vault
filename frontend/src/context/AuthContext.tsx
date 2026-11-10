import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import type { AuthUser, TokenResponse } from '../types';
import {
  generateVaultKey,
  wrapVaultKey,
  unwrapVaultKey,
  persistKeyEnvelope,
  loadKeyEnvelope,
} from '../utils/crypto';

interface RegisterParams {
  name: string;
  email: string;
  password: string;
}

interface LoginParams {
  email: string;
  password: string;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  vaultKey: CryptoKey | null;
  isAuthenticated: boolean;
  hasVaultKey: boolean;
  isLoading: boolean;
  register: (params: RegisterParams) => Promise<void>;
  login: (params: LoginParams) => Promise<void>;
  logout: () => Promise<void>;
  unlockVault: (password: string) => Promise<boolean>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_STORAGE_KEY = 'lastword_access_token';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Clear all in-memory and persisted authentication credentials
  const clearAuthState = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
    setVaultKey(null);
  }, []);

  // Validate existing token and restore user profile on mount / page refresh
  useEffect(() => {
    let isMounted = true;

    const restoreSession = async () => {
      const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (!storedToken) {
        if (isMounted) setIsLoading(false);
        return;
      }

      try {
        const response = await api.get<AuthUser>('/users/me');
        if (isMounted) {
          setUser(response.data);
          setToken(storedToken);
        }
      } catch (err) {
        // Token is invalid, expired, or revoked
        clearAuthState();
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, [clearAuthState]);

  // Unlock / recover the vault key in memory using master password
  const unlockVault = async (password: string): Promise<boolean> => {
    if (!user) return false;
    const envelope = loadKeyEnvelope(user.id) || loadKeyEnvelope(user.email);
    if (!envelope) return false;

    try {
      const key = await unwrapVaultKey(envelope, password);
      setVaultKey(key);
      return true;
    } catch {
      return false;
    }
  };

  // User Registration with Zero-Knowledge Client Key Generation
  const registerUser = async ({ name, email, password }: RegisterParams): Promise<void> => {
    // 1. Generate 256-bit AES-GCM vault key locally in the browser
    const clientVaultKey = await generateVaultKey();

    // 2. Wrap vault key using master password-derived key (PBKDF2 + AES-GCM)
    const keyEnvelope = await wrapVaultKey(clientVaultKey, password);

    // 3. Register user with backend (transmitting only display_name, email, password for Argon2)
    // Never transmit plaintext vault keys or encryption material to the server
    const response = await api.post<TokenResponse>('/auth/register', {
      email,
      password,
      display_name: name,
    });

    const { access_token, user: registeredUser } = response.data;

    // 4. Persist password-wrapped envelope in client storage for future session recovery
    persistKeyEnvelope(registeredUser.id, keyEnvelope);
    persistKeyEnvelope(registeredUser.email, keyEnvelope);

    // 5. Store JWT token & update in-memory state
    localStorage.setItem(TOKEN_STORAGE_KEY, access_token);
    setToken(access_token);
    setUser(registeredUser);
    setVaultKey(clientVaultKey); // Active in memory for this session
  };

  // User Login with Zero-Knowledge Client Key Recovery
  const loginUser = async ({ email, password }: LoginParams): Promise<void> => {
    // 1. Authenticate with backend
    const response = await api.post<TokenResponse>('/auth/login', {
      email,
      password,
    });

    const { access_token, user: authenticatedUser } = response.data;

    // 2. Recover encrypted vault key envelope from client storage
    const envelope =
      loadKeyEnvelope(authenticatedUser.id) ||
      loadKeyEnvelope(authenticatedUser.email) ||
      loadKeyEnvelope(email);

    if (envelope) {
      try {
        // Decrypt / unwrap vault key into memory using the master password
        const recoveredKey = await unwrapVaultKey(envelope, password);
        setVaultKey(recoveredKey);
      } catch (err) {
        console.error('Failed to unwrap vault key with provided master password:', err);
      }
    } else {
      // If logging in on a new device where local envelope is absent,
      // generate and initialize a key envelope for this device
      try {
        const freshKey = await generateVaultKey();
        const freshEnvelope = await wrapVaultKey(freshKey, password);
        persistKeyEnvelope(authenticatedUser.id, freshEnvelope);
        persistKeyEnvelope(authenticatedUser.email, freshEnvelope);
        setVaultKey(freshKey);
      } catch (err) {
        console.error('Could not initialize client vault key envelope:', err);
      }
    }

    // 3. Store JWT token & update in-memory state
    localStorage.setItem(TOKEN_STORAGE_KEY, access_token);
    setToken(access_token);
    setUser(authenticatedUser);
  };

  // Logout with Backend Revocation and Memory Purge
  const logoutUser = async (): Promise<void> => {
    try {
      if (token) {
        await api.post('/auth/logout');
      }
    } catch (err) {
      // Proceed with local cleanup even if network fails
      console.warn('Backend logout call completed with warning:', err);
    } finally {
      clearAuthState();
    }
  };

  // Refresh current user profile from backend
  const refreshUser = async (): Promise<void> => {
    if (!token) return;
    try {
      const response = await api.get<AuthUser>('/users/me');
      setUser(response.data);
    } catch (err) {
      clearAuthState();
    }
  };

  const value: AuthContextType = {
    user,
    token,
    vaultKey,
    isAuthenticated: !!user && !!token,
    hasVaultKey: !!vaultKey,
    isLoading,
    register: registerUser,
    login: loginUser,
    logout: logoutUser,
    unlockVault,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

