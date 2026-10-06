/**
 * Skeleton capture fixtures for the staff area, rendered on the dev-only /__bones page.
 * Each named <Bones> is rendered exactly as its page renders it, inside the same content width: the officer shell
 * shows a 264px sidebar from `lg` and pads the main column `px-4 sm:px-6 lg:px-8`, so <StaffFrame> reproduces that
 * grid with an empty 264px spacer. Panels that sit inside a card or the demo frame are wrapped the same way here.
 * `npm run bones` snapshots them at 390/768/1024/1440 px into src/bones/*.bones.json.
 */
import type { ReactNode } from "react";
import { DemoFrame, DemoPanel } from "../../components/demo/DemoFrame";
import { AuditTable } from "../../components/officer/lists";
import { Bones } from "../../components/ui/Bones";
import { EntityGrid, ReadinessView } from "../../pages/admin/System";
import { OrgGrid, UsersTable } from "../../pages/admin/Users";
import { DefinitionList } from "../../pages/demo/AgentTesting";
import { DemoPanels } from "../../pages/demo/DemoControl";
import { AnalyticsView } from "../../pages/officer/Analytics";
import { ApprovalList } from "../../pages/officer/Approvals";
import { CallbacksBoard } from "../../pages/officer/Callbacks";
import { EscalationsBoard } from "../../pages/officer/Escalations";
import { CaseDetailView } from "../../pages/officer/OfficerCaseDetail";
import { CaseKpis, CaseQueue } from "../../pages/officer/OfficerCases";
import {
  STAFF_ANALYTICS, STAFF_APPROVALS, STAFF_AUDIT, STAFF_CALLBACKS, STAFF_CASES, STAFF_CASE_DETAIL, STAFF_DEMO_GRAPH, STAFF_DEMO_STATUS, STAFF_ENTITIES,
  STAFF_ESCALATIONS, STAFF_ORGS, STAFF_READY, STAFF_STATS, STAFF_TEST_DEFINITIONS, STAFF_USERS,
} from "../fixtures/staff";

const noop = () => {};
const BLOCKED = STAFF_CASES.filter((c) => c.current_node?.state === "BLOCKED" || c.current_node?.state === "DOCUMENT_MISSING" || c.current_node?.state === "STALLED");
const ORG_COUNTS = Object.fromEntries(STAFF_ORGS.map((o, i) => [o.id, 3 - i]));

/** Same content column as the officer shell: viewport minus the 264px sidebar from lg, with the shell's padding. */
function StaffFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="lg:grid lg:grid-cols-[264px_1fr]">
      <div aria-hidden className="hidden lg:block" />
      <div className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">{label}</p>
        {children}
      </div>
    </section>
  );
}

export default function StaffBones() {
  return (
    <div className="divide-y divide-line">
      <StaffFrame label="staff-cases-stats">
        <Bones name="staff-cases-stats" loading lines={2} fixture={<CaseKpis stats={STAFF_STATS} current="all" onPick={noop} />}>{null}</Bones>
      </StaffFrame>

      <StaffFrame label="staff-cases-table">
        <Bones name="staff-cases-table" loading lines={6} fixture={<CaseQueue items={STAFF_CASES} caption="Cases - all queue" setKey="capture" />}>{null}</Bones>
      </StaffFrame>

      <StaffFrame label="staff-blocked-table">
        <Bones name="staff-blocked-table" loading lines={6} fixture={<CaseQueue items={BLOCKED.length ? BLOCKED : STAFF_CASES.slice(0, 2)} caption="Cases - blocked queue" setKey="capture" />}>{null}</Bones>
      </StaffFrame>

      <StaffFrame label="staff-approvals">
        <Bones name="staff-approvals" loading lines={6} fixture={<ApprovalList items={STAFF_APPROVALS} staff onApprove={noop} onReject={noop} />}>{null}</Bones>
      </StaffFrame>

      <StaffFrame label="staff-escalations">
        <Bones
          name="staff-escalations" loading lines={6}
          fixture={<EscalationsBoard all={STAFF_ESCALATIONS} filter="all" onFilter={noop} reason="all" onReason={noop} includeResolved={false} onIncludeResolved={noop} onResolve={noop} staff />}
        >
          {null}
        </Bones>
      </StaffFrame>

      <StaffFrame label="staff-callbacks">
        <Bones name="staff-callbacks" loading lines={6} fixture={<CallbacksBoard all={STAFF_CALLBACKS} status="all" onStatus={noop} search="" onSearch={noop} />}>{null}</Bones>
      </StaffFrame>

      <StaffFrame label="staff-audit">
        <Bones name="staff-audit" loading lines={8} fixture={<AuditTable items={STAFF_AUDIT} expandable caption="Audit log entries" setKey="capture" maxH="max-h-[calc(100vh-14rem)]" />}>{null}</Bones>
      </StaffFrame>

      <StaffFrame label="staff-analytics">
        <Bones name="staff-analytics" loading lines={10} fixture={<AnalyticsView a={STAFF_ANALYTICS} />}>{null}</Bones>
      </StaffFrame>

      <StaffFrame label="staff-case-detail">
        <Bones name="staff-case-detail" loading lines={12} fixture={<CaseDetailView d={STAFF_CASE_DETAIL} view={STAFF_CASE_DETAIL.case} staffOverride />}>{null}</Bones>
      </StaffFrame>

      <StaffFrame label="staff-admin-users">
        <Bones name="staff-admin-users" loading lines={6} fixture={<UsersTable items={STAFF_USERS} actions={{ meId: STAFF_USERS[1]?.id, onToggle: noop, onResend: noop, onEdit: noop }} />}>{null}</Bones>
      </StaffFrame>

      <StaffFrame label="staff-admin-orgs">
        <Bones name="staff-admin-orgs" loading lines={3} fixture={<OrgGrid orgs={STAFF_ORGS} counts={ORG_COUNTS} />}>{null}</Bones>
      </StaffFrame>

      <StaffFrame label="staff-admin-system">
        <Bones name="staff-admin-system" loading lines={8} fixture={<ReadinessView r={STAFF_READY} />}>{null}</Bones>
      </StaffFrame>

      <StaffFrame label="staff-admin-entities">
        {/* System page: the catalogue sits inside a Panel card (p-4 sm:p-5). */}
        <div className="card p-4 sm:p-5">
          <Bones name="staff-admin-entities" loading lines={8} fixture={<EntityGrid catalogue={STAFF_ENTITIES} />}>{null}</Bones>
        </div>
      </StaffFrame>

      <StaffFrame label="staff-demo-panels">
        {/* Demo control: the panels sit inside the amber demo frame. */}
        <DemoFrame>
          <Bones
            name="staff-demo-panels" loading lines={10}
            fixture={<DemoPanels status={STAFF_DEMO_STATUS} graph={STAFF_DEMO_GRAPH} caseRef="LL-DEMO-001" connected events={[]} onReset={noop} />}
          >
            {null}
          </Bones>
        </DemoFrame>
      </StaffFrame>

      <StaffFrame label="staff-agent-tests">
        {/* Agent testing: the definitions list sits in a demo panel inside the demo frame. */}
        <DemoFrame>
          <DemoPanel id="bones-definitions" title="Agent Testing definitions">
            <Bones name="staff-agent-tests" loading lines={4} fixture={<DefinitionList items={STAFF_TEST_DEFINITIONS} />}>{null}</Bones>
          </DemoPanel>
        </DemoFrame>
      </StaffFrame>
    </div>
  );
}
