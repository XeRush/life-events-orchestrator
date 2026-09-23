import type { Tokens, User } from "../types";
import { get, patch, post } from "./api";

export const authApi = {
  login: (email: string, password: string) => post<Tokens>("/auth/login", { email, password }),
  register: (body: { email: string; password: string; full_name: string; phone?: string; preferred_language: string }) =>
    post<Tokens>("/auth/register", body),
  me: () => get<User>("/auth/me"),
  update: (body: Partial<Pick<User, "full_name" | "phone" | "preferred_language">>) => patch<User>("/auth/me", body),
  logout: (refreshToken?: string) => post<null>("/auth/logout", { refresh_token: refreshToken }),
};

export const DEMO_CREDENTIALS = { email: "demo@lifeloop.example", password: "demo1234" };
