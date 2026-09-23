import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/primitives";
import { authApi } from "../services/auth";
import { useAuth } from "../stores/auth";
import { useUI } from "../stores/ui";
import { AuthLayout, Field } from "./Login";

export default function Register() {
  const navigate = useNavigate();
  const setSession = useAuth((s) => s.setSession);
  const lang = useUI((s) => s.lang);
  const [form, setForm] = useState({ full_name: "", email: "", password: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setBusy(true); setError(null);
    try {
      const tokens = await authApi.register({ ...form, phone: form.phone || undefined, preferred_language: lang });
      setSession(tokens, null);
      setSession(tokens, await authApi.me());
      navigate("/app", { replace: true });
    } catch (err) {
      setError((err as Error).message);
      useAuth.getState().clear();
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Create your account" subtitle="Report a life event once. LIFELOOP remembers." footer={<>Already registered? <Link to="/login" className="font-medium text-ink underline underline-offset-4">Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name" autoComplete="name" required value={form.full_name} onChange={set("full_name")} />
        <Field label="Email" type="email" autoComplete="email" required value={form.email} onChange={set("email")} />
        <Field label="Password (8+ characters)" type="password" autoComplete="new-password" minLength={8} required value={form.password} onChange={set("password")} />
        <Field label="Phone for callbacks (optional)" type="tel" autoComplete="tel" placeholder="+971 ..." value={form.phone} onChange={set("phone")} />
        <p className="text-xs text-muted">Without a phone number, callbacks run on the simulated voice channel. Consent is always requested per life event.</p>
        {error && <p role="alert" className="rounded-xl bg-rose-soft px-4 py-2.5 text-sm text-rose">{error}</p>}
        <Button type="submit" size="lg" className="w-full" loading={busy}>Create account</Button>
      </form>
    </AuthLayout>
  );
}
