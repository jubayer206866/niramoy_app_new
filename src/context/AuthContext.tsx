import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, type Address, type Me, type User } from "../api";

interface AuthValue {
  user: User | null;
  addresses: Address[];
  defaultAddress: Address | null;
  wishlistCount: number;
  orderCount: number;
  ready: boolean;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<User>;
  register: (payload: {
    name: string;
    email: string;
    phone?: string;
    password: string;
  }) => Promise<User>;
  logout: () => Promise<void>;
  setAddresses: (addresses: Address[]) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await api.me();
      setMe(data);
    } catch {
      setMe(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<AuthValue>(() => {
    const login = async (email: string, password: string) => {
      const { user } = await api.login(email, password);
      const data = await api.me();
      setMe(data);
      return user;
    };
    const register = async (payload: {
      name: string;
      email: string;
      phone?: string;
      password: string;
    }) => {
      const { user } = await api.register(payload);
      const data = await api.me();
      setMe(data);
      return user;
    };
    const logout = async () => {
      await api.logout();
      setMe({
        user: null,
        addresses: [],
        defaultAddress: null,
        wishlistCount: 0,
        orderCount: 0,
      });
    };
    return {
      user: me?.user ?? null,
      addresses: me?.addresses ?? [],
      defaultAddress: me?.defaultAddress ?? null,
      wishlistCount: me?.wishlistCount ?? 0,
      orderCount: me?.orderCount ?? 0,
      ready,
      refresh,
      login,
      register,
      logout,
      setAddresses: (addresses) => setMe((prev) => (prev ? { ...prev, addresses } : prev)),
    };
  }, [me, ready, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
