import { AnimatePresence, motion } from "framer-motion";
import { Building2, KeyRound, Loader2, MailCheck, MailWarning, Pencil, Plus, Power, Send, ShieldCheck, UserRound, UserRoundPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { adminApi } from "../../api";
import { Actions, DIALOG_BODY } from "../../components/officer/dialogs";
import {
  EmptyNote, InlineError, Mono, Notice, PageHead, RelTime, SearchInput, Segmented, TableFrame, Td, Th, useCardMotion, useDebounced, useRowMotion, useTx,
} from "../../components/officer/kit";
import { Bones } from "../../components/ui/Bones";
import { Badge, Button, ErrorState, Field, Modal, SelectField, Toggle } from "../../components/ui/primitives";
import { useAction, useOrganizations, useUsers } from "../../hooks/queries";
import { useT } from "../../i18n";
import { cn, humanEmirate } from "../../lib/format";
import type { Tone } from "../../lib/status";
import { useAuth } from "../../stores/auth";
import type { Organization, Role, User } from "../../types/api";

const ROLES: Role[] = ["OFFICER", "ADMIN", "RESIDENT"];
const ROLE_TONE: Record<Role, Tone> = { ADMIN: "violet", OFFICER: "azure", RESIDENT: "slate" };
const ROLE_ICON = { ADMIN: KeyRound, OFFICER: ShieldCheck, RESIDENT: UserRound };
const EMIRATES = ["DUBAI", "ABU_DHABI", "SHARJAH", "AJMAN", "UMM_AL_QUWAIN", "RAS_AL_KHAIMAH", "FUJAIRAH"];
const KINDS = ["SERVICE_CENTRE", "PLATFORM"] as const;

/** Compact row action: icon button with an accessible name and a tooltip (40px target on phones). */
function IconAction({ label, onClick, busy, tone, children }: { label: string; onClick: () => void; busy?: boolean; tone?: "rose" | "civic"; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={busy}
      onClick={onClick}
      className={cn(
        "grid h-10 w-10 cursor-pointer place-items-center rounded-full text-ink-2 transition-colors hover:bg-paper-2 disabled:cursor-wait disabled:opacity-50 md:h-8 md:w-8",
        tone === "rose" && "hover:bg-rose-soft hover:text-rose",
        tone === "civic" && "hover:bg-civic-soft hover:text-civic",
      )}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : children}
    </button>
  );
}

function RoleBadge({ role }: { role: Role }) {
  const t = useT();
  const Icon = ROLE_ICON[role];
  return <Badge tone={ROLE_TONE[role]} icon={<Icon className="h-3.5 w-3.5" aria-hidden />}>{t(`admin.role.${role}`)}</Badge>;
}

function OrgOptions({ orgs }: { orgs: Organization[] }) {
  const tx = useTx();
  return (
    <>
      {KINDS.map((k) => {
        const list = orgs.filter((o) => o.kind === k);
        if (!list.length) return null;
        return (
          <optgroup key={k} label={tx(`admin.orgKind.${k}`)}>
            {list.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.code}){o.is_active ? "" : " - inactive"}</option>)}
          </optgroup>
        );
      })}
    </>
  );
}

/* ---------------------------------------------------------------------------------------------------------------
 * Provision account
 * ------------------------------------------------------------------------------------------------------------- */

function ProvisionDialog({ open, onClose, orgs }: { open: boolean; onClose: () => void; orgs: Organization[] }) {
  const t = useT();
  const empty = { email: "", full_name: "", role: "OFFICER" as Role, organization_id: "", title: "", phone: "" };
  const [f, setF] = useState(empty);
  const m = useAction((body: typeof empty) => adminApi.provision({
    email: body.email.trim(), full_name: body.full_name.trim(), role: body.role, organization_id: body.organization_id || null,
    title: body.title.trim() || null, phone: body.phone.trim() || null,
  }), { success: (u) => t("admin.provision.done", { email: u.email }), invalidate: [["users"]] });
  const close = () => {
    setF(empty);
    m.reset();
    onClose();
  };
  const needsOrg = f.role === "OFFICER";
  const valid = /\S+@\S+\.\S+/.test(f.email) && f.full_name.trim().length >= 2 && (!needsOrg || !!f.organization_id);
  return (
    <Modal open={open} onClose={close} title={t("admin.provision.title")}>
      <form
        className={cn(DIALOG_BODY, "space-y-4")}
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) m.mutate(f, { onSuccess: close });
        }}
      >
        <p className="text-sm text-ink-2">{t("admin.provision.explain")}</p>
        <Field label={t("admin.field.email")} type="email" required autoComplete="off" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <Field label={t("admin.field.fullName")} required minLength={2} maxLength={160} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label={t("admin.field.role")} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
            {ROLES.map((r) => <option key={r} value={r}>{t(`admin.role.${r}`)}</option>)}
          </SelectField>
          <Field label={t("admin.field.title")} maxLength={120} placeholder={t("admin.field.titlePh")} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </div>
        <SelectField
          label={needsOrg ? t("admin.field.orgRequired") : t("admin.field.org")}
          value={f.organization_id}
          required={needsOrg}
          hint={needsOrg ? t("admin.rule.officerOrg") : undefined}
          onChange={(e) => setF({ ...f, organization_id: e.target.value })}
        >
          <option value="">{t("admin.field.noOrg")}</option>
          <OrgOptions orgs={orgs} />
        </SelectField>
        <Field label={t("admin.field.phone")} type="tel" maxLength={32} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <InlineError error={m.error} />
        <Actions>
          <Button variant="secondary" onClick={close}>{t("common.cancel")}</Button>
          <Button type="submit" disabled={!valid} loading={m.isPending} icon={<Send className="h-4 w-4 rtl-flip" aria-hidden />}>{t("admin.provision.submit")}</Button>
        </Actions>
      </form>
    </Modal>
  );
}

/* ---------------------------------------------------------------------------------------------------------------
 * Edit account (role, organisation, title, active)
 * ------------------------------------------------------------------------------------------------------------- */

function EditDialog({ user, onClose, orgs }: { user: User | null; onClose: () => void; orgs: Organization[] }) {
  const t = useT();
  const me = useAuth((s) => s.user);
  const [f, setF] = useState<{ role: Role; organization_id: string; title: string; is_active: boolean } | null>(null);
  const form = f ?? (user ? { role: user.role, organization_id: user.organization_id ?? "", title: user.title ?? "", is_active: user.is_active } : null);
  const m = useAction((a: { id: string; body: Parameters<typeof adminApi.updateUser>[1] }) => adminApi.updateUser(a.id, a.body), {
    success: (u) => t("admin.edit.done", { name: u.full_name }), invalidate: [["users"], ["officers"]],
  });
  const close = () => {
    setF(null);
    m.reset();
    onClose();
  };
  if (!user || !form) return <Modal open={false} onClose={close} title="">{null}</Modal>;
  const body: Parameters<typeof adminApi.updateUser>[1] = {};
  if (form.role !== user.role) body.role = form.role;
  if (form.organization_id && form.organization_id !== (user.organization_id ?? "")) body.organization_id = form.organization_id;
  if (form.title.trim() !== (user.title ?? "")) body.title = form.title.trim();
  if (form.is_active !== user.is_active) body.is_active = form.is_active;
  const changed = Object.keys(body).length > 0;
  const self = me?.id === user.id;
  return (
    <Modal open={!!user} onClose={close} title={t("admin.edit.title")}>
      <form
        className={cn(DIALOG_BODY, "space-y-4")}
        onSubmit={(e) => {
          e.preventDefault();
          if (changed) m.mutate({ id: user.id, body }, { onSuccess: close });
        }}
      >
        <div className="rounded-2xl border border-line bg-paper-2/50 px-4 py-3">
          <p className="font-medium">{user.full_name}{self && <span className="ms-2 text-xs text-muted">({t("admin.users.you")})</span>}</p>
          <p className="text-sm text-muted" dir="ltr">{user.email}</p>
        </div>
        <SelectField label={t("admin.field.role")} value={form.role} onChange={(e) => setF({ ...form, role: e.target.value as Role })} hint={self ? t("admin.rule.selfDemote") : undefined}>
          {ROLES.map((r) => <option key={r} value={r}>{t(`admin.role.${r}`)}</option>)}
        </SelectField>
        <SelectField
          label={form.role === "OFFICER" ? t("admin.field.orgRequired") : t("admin.field.org")}
          value={form.organization_id}
          onChange={(e) => setF({ ...form, organization_id: e.target.value })}
          hint={form.role === "OFFICER" ? t("admin.rule.officerOrg") : undefined}
        >
          {!user.organization_id && <option value="">{t("admin.field.noOrg")}</option>}
          <OrgOptions orgs={orgs} />
        </SelectField>
        <Field label={t("admin.field.title")} maxLength={120} value={form.title} onChange={(e) => setF({ ...form, title: e.target.value })} />
        <div className="rounded-2xl border border-line px-4 py-3">
          <Toggle checked={form.is_active} onChange={(v) => setF({ ...form, is_active: v })} label={t("admin.field.active")} description={t("admin.field.activeHint")} />
        </div>
        <InlineError error={m.error} />
        <Actions>
          <Button variant="secondary" onClick={close}>{t("common.cancel")}</Button>
          <Button type="submit" disabled={!changed} loading={m.isPending}>{t("common.save")}</Button>
        </Actions>
      </form>
    </Modal>
  );
}

/* ---------------------------------------------------------------------------------------------------------------
 * Accounts list: cards on phones, a dense table from tablet up
 * ------------------------------------------------------------------------------------------------------------- */

export interface UserActions {
  meId?: string;
  onToggle: (u: User) => void;
  onResend: (u: User) => void;
  onEdit: (u: User) => void;
  busyToggle?: string | null;
  busyResend?: string | null;
}

function MailState({ u }: { u: User }) {
  const t = useT();
  return (
    <span className="flex flex-col items-start gap-1">
      {u.email_verified
        ? <span className="inline-flex items-center gap-1 text-[12.5px] text-civic"><MailCheck className="h-3.5 w-3.5" aria-hidden />{t("admin.users.verified")}</span>
        : <span className="inline-flex items-center gap-1 text-[12.5px] text-muted"><MailWarning className="h-3.5 w-3.5" aria-hidden />{t("admin.users.unverified")}</span>}
      {u.invitation_pending && <Badge tone="amber">{t("admin.users.invitePending")}</Badge>}
    </span>
  );
}

function RowActions({ u, a }: { u: User; a: UserActions }) {
  const t = useT();
  return (
    <div className="flex justify-end gap-0.5">
      {u.invitation_pending && (
        <IconAction label={t("admin.users.resendFor", { email: u.email })} busy={a.busyResend === u.id} onClick={() => a.onResend(u)}>
          <Send className="h-4 w-4 rtl-flip" aria-hidden />
        </IconAction>
      )}
      <IconAction
        label={`${u.is_active ? t("admin.users.deactivate") : t("admin.users.activate")} - ${u.full_name}`}
        busy={a.busyToggle === u.id}
        tone={u.is_active ? "rose" : "civic"}
        onClick={() => a.onToggle(u)}
      >
        <Power className="h-4 w-4" aria-hidden />
      </IconAction>
      <IconAction label={t("admin.users.editFor", { name: u.full_name })} onClick={() => a.onEdit(u)}>
        <Pencil className="h-4 w-4" aria-hidden />
      </IconAction>
    </div>
  );
}

function OrgCell({ u }: { u: User }) {
  const t = useT();
  return <>{u.organization_name ?? <span className={u.role === "OFFICER" ? "text-rose" : "text-faint"}>{u.role === "OFFICER" ? t("admin.users.noOrgWarn") : "-"}</span>}</>;
}

export function UsersTable({ items, actions }: { items: User[]; actions: UserActions }) {
  const t = useT();
  const row = useRowMotion();
  return (
    <>
      <ul aria-label={t("admin.users.caption")} className="grid gap-2.5 sm:grid-cols-2 md:hidden">
        <AnimatePresence initial>
          {items.map((u, i) => {
            const self = actions.meId === u.id;
            return (
              <motion.li key={u.id} {...row(i)} layout="position" className={cn("card p-3.5", !u.is_active && "opacity-75")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{u.full_name}{self && <span className="ms-2 rounded bg-ink px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-paper">{t("admin.users.you")}</span>}</p>
                    <p className="truncate text-[12.5px] text-muted" dir="ltr">{u.email}</p>
                  </div>
                  {u.is_active ? <Badge tone="civic" dot>{t("admin.users.active")}</Badge> : <Badge tone="slate" dot>{t("admin.users.inactive")}</Badge>}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5"><RoleBadge role={u.role} /></div>
                <p className="mt-2 text-[13px] text-ink-2"><OrgCell u={u} />{u.title && <span className="text-muted"> · {u.title}</span>}</p>
                <div className="mt-2.5 flex items-end justify-between gap-3 border-t border-dashed border-line pt-2">
                  <div className="min-w-0 space-y-1">
                    <MailState u={u} />
                    <p className="text-[12px] text-muted">{t("admin.col.lastLogin")}: <RelTime iso={u.last_login_at} /></p>
                  </div>
                  <RowActions u={u} a={actions} />
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      <TableFrame dense stickyFirst caption={t("admin.users.caption")} className="hidden md:block" maxH="max-h-[calc(100vh-16rem)]">
        <thead>
          <tr>
            <Th>{t("admin.col.account")}</Th>
            <Th>{t("admin.col.role")}</Th>
            <Th>{t("admin.col.org")}</Th>
            <Th className="hidden xl:table-cell">{t("admin.col.title")}</Th>
            <Th>{t("admin.col.active")}</Th>
            <Th>{t("admin.col.email")}</Th>
            <Th>{t("admin.col.lastLogin")}</Th>
            <Th><span className="sr-only">{t("officer.col.actions")}</span></Th>
          </tr>
        </thead>
        <tbody>
          <AnimatePresence initial>
            {items.map((u, i) => {
              const self = actions.meId === u.id;
              return (
                <motion.tr key={u.id} {...row(i)} layout="position" className={cn("transition-colors hover:bg-paper-2/60", !u.is_active && "text-muted")}>
                  <Td className="min-w-48 max-w-64">
                    <p className="truncate font-medium text-ink">{u.full_name}{self && <span className="ms-2 rounded bg-ink px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-paper">{t("admin.users.you")}</span>}</p>
                    <p className="truncate text-[12.5px] text-muted" dir="ltr">{u.email}</p>
                  </Td>
                  <Td><RoleBadge role={u.role} /></Td>
                  <Td className="min-w-36 text-[13px]"><OrgCell u={u} /></Td>
                  <Td className="hidden max-w-48 truncate text-[13px] text-ink-2 xl:table-cell" title={u.title ?? undefined}>{u.title ?? <span className="text-faint">-</span>}</Td>
                  <Td>{u.is_active ? <Badge tone="civic" dot>{t("admin.users.active")}</Badge> : <Badge tone="slate" dot>{t("admin.users.inactive")}</Badge>}</Td>
                  <Td><MailState u={u} /></Td>
                  <Td><RelTime iso={u.last_login_at} className="text-[13px]" /></Td>
                  <Td><RowActions u={u} a={actions} /></Td>
                </motion.tr>
              );
            })}
          </AnimatePresence>
        </tbody>
      </TableFrame>
    </>
  );
}

/* ---------------------------------------------------------------------------------------------------------------
 * Organisations
 * ------------------------------------------------------------------------------------------------------------- */

function OrgDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const tx = useTx();
  const empty = { code: "", name: "", emirate: "DUBAI", kind: "SERVICE_CENTRE" as (typeof KINDS)[number] };
  const [f, setF] = useState(empty);
  const m = useAction((b: typeof empty) => adminApi.createOrganization({ ...b, code: b.code.trim().toUpperCase(), name: b.name.trim() }), {
    success: (o) => t("admin.org.done", { name: o.name }), invalidate: [["organizations"]],
  });
  const close = () => {
    setF(empty);
    m.reset();
    onClose();
  };
  const valid = /^[A-Za-z0-9_-]{2,40}$/.test(f.code.trim()) && f.name.trim().length >= 2;
  return (
    <Modal open={open} onClose={close} title={t("admin.org.create")}>
      <form className={cn(DIALOG_BODY, "space-y-4")} onSubmit={(e) => { e.preventDefault(); if (valid) m.mutate(f, { onSuccess: close }); }}>
        <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
          <Field label={t("admin.org.code")} required maxLength={40} pattern="[A-Za-z0-9_\-]+" className="font-mono" hint={t("admin.org.codeHint")} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
          <Field label={t("admin.org.name")} required minLength={2} maxLength={160} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label={t("admin.org.emirate")} value={f.emirate} onChange={(e) => setF({ ...f, emirate: e.target.value })}>
            {EMIRATES.map((em) => <option key={em} value={em}>{humanEmirate(em)}</option>)}
          </SelectField>
          <SelectField label={t("admin.org.kind")} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as typeof f.kind })}>
            {KINDS.map((k) => <option key={k} value={k}>{tx(`admin.orgKind.${k}`)}</option>)}
          </SelectField>
        </div>
        <InlineError error={m.error} />
        <Actions>
          <Button variant="secondary" onClick={close}>{t("common.cancel")}</Button>
          <Button type="submit" disabled={!valid} loading={m.isPending} icon={<Plus className="h-4 w-4" aria-hidden />}>{t("admin.org.submit")}</Button>
        </Actions>
      </form>
    </Modal>
  );
}

export function OrgGrid({ orgs, counts }: { orgs: Organization[]; counts: Record<string, number> }) {
  const t = useT();
  const tx = useTx();
  const card = useCardMotion();
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {orgs.map((o, i) => (
        <motion.article key={o.id} {...card(i)} className={cn("card min-w-0 p-4", !o.is_active && "opacity-60")}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-display text-lg leading-snug">{o.name}</p>
              <Mono className="text-[11px] text-muted">{o.code}</Mono>
            </div>
            <Badge tone={o.kind === "PLATFORM" ? "violet" : "civic"}>{tx(`admin.orgKind.${o.kind}`)}</Badge>
          </div>
          <dl className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 border-t border-dashed border-line pt-2.5 text-[13px]">
            <div><dt className="sr-only">{t("admin.org.emirate")}</dt><dd className="text-ink-2">{humanEmirate(o.emirate)}</dd></div>
            <div><dt className="sr-only">{t("admin.org.members")}</dt><dd className="num text-muted">{t("admin.org.membersN", { n: counts[o.id] ?? 0 })}</dd></div>
            {!o.is_active && <div><dd className="text-rose">{t("admin.users.inactive")}</dd></div>}
          </dl>
        </motion.article>
      ))}
    </div>
  );
}

function OrganisationsPanel({ orgs, loading, error, counts }: { orgs: Organization[]; loading: boolean; error: unknown; counts: Record<string, number> }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <section aria-labelledby="orgs-title" className="space-y-3 border-t border-line pt-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow mb-1">{t("admin.org.eyebrow")}</p>
          <h2 id="orgs-title" className="text-xl sm:text-2xl">{t("admin.org.title")}</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">{t("admin.org.hint")}</p>
        </div>
        <Button variant="secondary" icon={<Building2 className="h-4 w-4" aria-hidden />} onClick={() => setOpen(true)}>{t("admin.org.create")}</Button>
      </div>
      <Bones name="staff-admin-orgs" loading={loading} lines={3}>
        {error ? <InlineError error={error} /> : !loading && !orgs.length ? <EmptyNote icon={<Building2 aria-hidden />} title={t("admin.org.empty")} /> : !loading ? <OrgGrid orgs={orgs} counts={counts} /> : null}
      </Bones>
      <OrgDialog open={open} onClose={() => setOpen(false)} />
    </section>
  );
}

/* ---------------------------------------------------------------------------------------------------------------
 * Page
 * ------------------------------------------------------------------------------------------------------------- */

export default function Users() {
  const t = useT();
  const me = useAuth((s) => s.user);
  const [role, setRole] = useState<Role | "all">("all");
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 300);
  const users = useUsers({ role: role === "all" ? undefined : role, q: q || undefined });
  const allUsers = useUsers({});
  const orgs = useOrganizations();
  const [provision, setProvision] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const toggleActive = useAction((u: User) => adminApi.updateUser(u.id, { is_active: !u.is_active }), {
    success: (u) => (u.is_active ? t("admin.users.activated", { name: u.full_name }) : t("admin.users.deactivated", { name: u.full_name })), invalidate: [["users"], ["officers"]],
  });
  const resend = useAction((u: User) => adminApi.resendInvitation(u.id).then(() => u), { success: (u) => t("admin.users.resent", { email: u.email }), invalidate: [["users"]] });
  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    (allUsers.data?.items ?? []).forEach((u) => { if (u.organization_id) out[u.organization_id] = (out[u.organization_id] ?? 0) + 1; });
    return out;
  }, [allUsers.data]);
  const roleCounts = useMemo(() => {
    const out: Partial<Record<Role, number>> = {};
    (allUsers.data?.items ?? []).forEach((u) => { out[u.role] = (out[u.role] ?? 0) + 1; });
    return out;
  }, [allUsers.data]);
  const items = users.data?.items ?? [];

  return (
    <div className="space-y-5">
      <PageHead
        eyebrow={t("admin.users.eyebrow")}
        title={t("admin.users.title")}
        subtitle={t("admin.users.subtitle")}
        actions={<Button icon={<UserRoundPlus className="h-4 w-4" aria-hidden />} onClick={() => setProvision(true)}>{t("admin.provision.title")}</Button>}
      />

      <div className="grid gap-3 md:grid-cols-3">
        <Notice tone="azure" icon={Send} title={t("admin.rule.inviteTitle")}>{t("admin.rule.invite")}</Notice>
        <Notice tone="civic" icon={Building2} title={t("admin.rule.orgTitle")}>{t("admin.rule.officerOrg")}</Notice>
        <Notice tone="violet" icon={KeyRound} title={t("admin.rule.selfTitle")}>{t("admin.rule.selfDemote")}</Notice>
      </div>

      <section aria-label={t("admin.users.caption")} className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented
            label={t("admin.users.filterRole")}
            value={role}
            onChange={setRole}
            items={[
              { value: "all", label: t("admin.users.all"), count: allUsers.data?.total },
              ...ROLES.map((r) => ({ value: r, label: t(`admin.role.${r}`), count: roleCounts[r] ?? 0 })),
            ]}
          />
          <SearchInput className="w-full sm:w-64 lg:w-72" value={search} onChange={setSearch} label={t("admin.users.search")} placeholder={t("admin.users.searchPh")} />
        </div>

        <InlineError error={toggleActive.error ?? resend.error} />

        <Bones name="staff-admin-users" loading={users.isLoading} lines={6}>
          {users.error ? (
            <ErrorState error={users.error} onRetry={() => users.refetch()} />
          ) : users.data && !items.length ? (
            <EmptyNote icon={<UserRound aria-hidden />} title={t("admin.users.empty")} />
          ) : users.data ? (
            <UsersTable
              items={items}
              actions={{
                meId: me?.id,
                onToggle: (u) => toggleActive.mutate(u),
                onResend: (u) => resend.mutate(u),
                onEdit: setEditing,
                busyToggle: toggleActive.isPending ? toggleActive.variables?.id : null,
                busyResend: resend.isPending ? resend.variables?.id : null,
              }}
            />
          ) : null}
        </Bones>
        {users.data && users.data.total > items.length && <p className="text-xs text-muted">{t("admin.users.truncated", { n: items.length, total: users.data.total })}</p>}
      </section>

      <OrganisationsPanel orgs={orgs.data ?? []} loading={orgs.isLoading} error={orgs.error} counts={counts} />

      <ProvisionDialog open={provision} onClose={() => setProvision(false)} orgs={orgs.data ?? []} />
      <EditDialog key={editing?.id ?? "none"} user={editing} onClose={() => setEditing(null)} orgs={orgs.data ?? []} />
    </div>
  );
}
