/**
 * Mock data for the public area's skeleton captures (boneyard-js). Rendered only on the dev /__bones page and during
 * `npm run bones`; never shown to users. Shapes match the real API responses so the captured layout is identical.
 */
import type { Role } from "../../types/api";

/** /auth/config demo_accounts (Login: "pub-demo-accounts"). */
export const FIXTURE_DEMO_ACCOUNTS: { email: string; role: Role }[] = [
  { email: "demo.resident@lifeloop.local", role: "RESIDENT" },
  { email: "demo.officer@lifeloop.local", role: "OFFICER" },
  { email: "demo.admin@lifeloop.local", role: "ADMIN" },
];

/** /dev/mailbox items (DevMailbox: "pub-dev-mailbox"). */
export const FIXTURE_MAIL: { to: string; subject: string; text: string; sent_at: string }[] = [
  {
    to: "parent@example.com",
    subject: "Confirm your email address for LifeLoop",
    text: "Open this link to confirm your email address: http://localhost:5173/verify-email?token=fixture-token-0001",
    sent_at: "2026-10-03T09:12:00Z",
  },
  {
    to: "parent@example.com",
    subject: "Reset your LifeLoop password",
    text: "Open this link to choose a new password: http://localhost:5173/reset-password?token=fixture-token-0002",
    sent_at: "2026-10-03T09:02:00Z",
  },
];

/** The address shown in the confirmed state (VerifyEmail: "pub-verify-state"). */
export const FIXTURE_VERIFIED_EMAIL = "parent@example.com";
