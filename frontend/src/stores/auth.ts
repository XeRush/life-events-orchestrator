import { create } from "zustand";
import type { Session, Tokens, User } from "../types/api";

const KEY = "lifeloop.session";

interface AuthState {
  tokens: Tokens | null;
  user: User | null;
  setSession: (session: Session) => void;
  setTokens: (tokens: Tokens) => void;
  setUser: (user: User) => void;
  clear: () => void;
}

function load(): Pick<AuthState, "tokens" | "user"> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* storage unavailable - start signed out */
  }
  return { tokens: null, user: null };
}

function persist(state: Pick<AuthState, "tokens" | "user">) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/** Session only. Everything the server owns is fetched with TanStack Query. */
export const useAuth = create<AuthState>((set, get) => ({
  ...load(),
  setSession: ({ tokens, user }) => {
    persist({ tokens, user });
    set({ tokens, user });
  },
  setTokens: (tokens) => {
    persist({ tokens, user: get().user });
    set({ tokens });
  },
  setUser: (user) => {
    persist({ tokens: get().tokens, user });
    set({ user });
  },
  clear: () => {
    persist({ tokens: null, user: null });
    set({ tokens: null, user: null });
  },
}));

export function homeFor(user: User | null): string {
  if (!user) return "/login";
  if (user.role === "ADMIN") return "/officer";
  if (user.role === "OFFICER") return "/officer";
  return "/app";
}
