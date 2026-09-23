import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Logo } from "../components/ui/primitives";
import { authApi, DEMO_CREDENTIALS } from "../services/auth";
import { useAuth } from "../stores/auth";
import { useUI } from "../stores/ui";

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col justify-between bg-ink p-8 text-paper sm:p-12">
        <Link to="/" aria-label="LIFELOOP home"><Logo light /></Link>
        <div className="my-16 max-w-md">
          <p className="font-display text-4xl leading-tight sm:text-5xl">One event. One call. Every next step.</p>
          <p className="mt-5 text-paper/70">A persistent case that remembers what happened, coordinates every connected service, and calls you only when it matters.</p>
        </div>
        <p className="text-xs text-paper/45">Prototype · mock government entities · AI orchestrates, government decides.</p>
      </div>
      <div className="flex items-center justify-center px-5 py-12 sm:px-12">
        <div className="w-full max-w-md">
          <h1 className="text-4xl">{title}</h1>
          <p className="mt-2 text-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <p className="mt-6 text-sm text-muted">{footer}</p>
        </div>
      </div>
    </div>
  );
}

export function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium">{label}</span>
      <input {...props} className="h-12 w-full rounded-xl border border-line-2 bg-surface px-4 text-[15px] placeholder:text-faint" />
    </label>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const setSession = useAuth((s) => s.setSession);
  const toast = useUI((s) => s.toast);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async (e: string, p: string, target = "/app") => {
    setBusy(true); setError(null);
    try {
      const tokens = await authApi.login(e, p);
      setSession(tokens, null);
      const user = await authApi.me();
      setSession(tokens, user);
      useUI.getState().setLang(user.preferred_language);
      navigate(target, { replace: true });
    } catch (err) {
      setError((err as Error).message);
      useAuth.getState().clear();
      toast("error", "Could not sign in");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (params.get("demo") === "1") signIn(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password, "/app/life-events/L-49281");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = (ev: FormEvent) => { ev.preventDefault(); signIn(email, password); };

  return (
    <AuthLayout title="Sign in" subtitle="Continue to your life events." footer={<>New here? <Link to="/register" className="font-medium text-ink underline underline-offset-4">Create an account</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p role="alert" className="rounded-xl bg-rose-soft px-4 py-2.5 text-sm text-rose">{error}</p>}
        <Button type="submit" size="lg" className="w-full" loading={busy}>Sign in</Button>
      </form>
      <div className="mt-6 rounded-2xl border border-dashed border-line-2 p-4">
        <p className="eyebrow mb-2">Demo account</p>
        <p className="mb-3 text-sm text-muted">Seeded operator with the sample case L-49281 and the Demo Control Center.</p>
        <Button variant="secondary" className="w-full" loading={busy} onClick={() => signIn(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password)}>Use the demo account</Button>
        <p className="mt-2 text-center font-mono text-[11px] text-faint">{DEMO_CREDENTIALS.email} / {DEMO_CREDENTIALS.password}</p>
      </div>
    </AuthLayout>
  );
}
