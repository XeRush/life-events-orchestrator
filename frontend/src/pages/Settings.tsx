import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Badge, Button, Card, PageHeader } from "../components/ui/primitives";
import { useVoiceConfig } from "../hooks/queries";
import { useT } from "../i18n";
import { authApi } from "../services/auth";
import { useAuth } from "../stores/auth";
import { useUI } from "../stores/ui";
import { cn } from "../utils/format";

export default function Settings() {
  const t = useT();
  const user = useAuth((s) => s.user)!;
  const setUser = useAuth((s) => s.setUser);
  const lang = useUI((s) => s.lang);
  const setLang = useUI((s) => s.setLang);
  const toast = useUI((s) => s.toast);
  const { data: voice } = useVoiceConfig();
  const [name, setName] = useState(user.full_name);
  const [phone, setPhone] = useState(user.phone ?? "");
  const save = useMutation({
    mutationFn: () => authApi.update({ full_name: name, phone: phone || null, preferred_language: lang }),
    onSuccess: (u) => { setUser(u); toast("success", "Settings saved"); },
    onError: (e: Error) => toast("error", e.message),
  });
  return (
    <>
      <PageHeader eyebrow="Account" title={t("set.title")} />
      <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-4 text-xl">{t("set.profile")}</h2>
          <div className="space-y-4">
            <label className="block text-sm"><span className="mb-1 block text-muted">Full name</span><input value={name} onChange={(e) => setName(e.target.value)} className="h-11 w-full rounded-xl border border-line-2 bg-surface px-3" /></label>
            <label className="block text-sm"><span className="mb-1 block text-muted">Phone for real callbacks</span><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+971 ..." inputMode="tel" className="h-11 w-full rounded-xl border border-line-2 bg-surface px-3" /></label>
            <p className="text-xs text-muted">Only used when ElevenLabs telephony is configured. Otherwise callbacks run on the simulated voice channel.</p>
            <div><p className="mb-2 text-sm text-muted">{t("set.language")}</p>
              <div className="flex gap-2" role="radiogroup" aria-label={t("set.language")}>
                {(["en", "ar"] as const).map((l) => <button key={l} role="radio" aria-checked={lang === l} onClick={() => setLang(l)} className={cn("rounded-full border px-4 py-1.5 text-sm cursor-pointer", lang === l ? "border-ink bg-ink text-paper" : "border-line-2 hover:bg-paper-2")}>{l === "en" ? "English" : "العربية"}</button>)}
              </div></div>
            <Button loading={save.isPending} onClick={() => save.mutate()}>{t("common.save")}</Button>
          </div>
        </Card>
        <Card className="p-6">
          <h2 className="mb-4 text-xl">Voice provider</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Provider</dt><dd><Badge tone={voice?.elevenlabs_configured ? "civic" : "amber"} dot>{voice?.provider ?? "-"}</Badge></dd></div>
            <div className="flex justify-between"><dt className="text-muted">Outbound telephony</dt><dd>{voice?.outbound_telephony_configured ? "Configured" : "Simulated"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Signed in as</dt><dd className="font-mono text-xs">{user.email}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Role</dt><dd>{user.role}</dd></div>
          </dl>
          {voice?.note && <p className="mt-4 rounded-xl bg-paper-2 p-3 text-xs text-muted">{voice.note}</p>}
          <p className="mt-4 text-xs text-muted">API keys never reach the browser: it receives a short-lived signed URL from the backend.</p>
        </Card>
      </div>
    </>
  );
}
