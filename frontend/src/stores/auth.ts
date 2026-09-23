import { create } from "zustand";
import type { Tokens, User } from "../types";

const KEY = "lifeloop.auth";

interface AuthState {
  tokens: Tokens | null;
  user: User | null;
  setSession: (tokens: Tokens, user?: User | null) => void;
  setUser: (user: User) => void;
  clear: () => void;
}

function load(): Pick<AuthState, "tokens" | "user"> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* storage unavailable: start signed out */
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

/** Only session state lives here; all server data goes through TanStack Query. */
export const useAuth = create<AuthState>((set, get) => ({
  ...load(),
  setSession: (tokens, user) => {
    const next = { tokens, user: user ?? get().user };
    persist(next);
    set(next);
  },
  setUser: (user) => {
    const next = { tokens: get().tokens, user };
    persist(next);
    set({ user });
  },
  clear: () => {
    persist({ tokens: null, user: null });
    set({ tokens: null, user: null });
  },
}));
