/**
 * Skeleton capture fixtures for the resident area, rendered on the dev-only /__bones page.
 * Each named <Bones> is rendered exactly as its page renders it (same wrapper widths and grid), with `loading` and a
 * `fixture` (see src/bones/fixtures/resident.ts: the demo case LL-DEMO-001). `npm run bones` snapshots them at
 * 390/768/1024/1440 px into src/bones/*.bones.json.
 */
import type { ReactNode } from "react";
import { CaseHomeBones } from "../../pages/resident/CaseDashboard";
import { DocumentsBones } from "../../pages/resident/CaseDocuments";
import { GraphBones } from "../../pages/resident/CaseGraph";
import { TimelineBones } from "../../pages/resident/CaseTimelinePage";
import { HomeBones } from "../../pages/resident/ResidentHome";
import { SettingsBones } from "../../pages/resident/Settings";
import { VoiceCaseBones } from "../../pages/resident/Voice";

/** The resident shell's <main> (Shells.tsx): same max width and side padding. */
function ResidentMain({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6" data-capture="resident">{children}</div>;
}

export default function ResidentBones() {
  return (
    <>
      <ResidentMain><HomeBones /></ResidentMain>
      <ResidentMain><div><CaseHomeBones /></div></ResidentMain>
      <ResidentMain><GraphBones /></ResidentMain>
      <ResidentMain><TimelineBones /></ResidentMain>
      <ResidentMain><DocumentsBones /></ResidentMain>
      <ResidentMain>
        {/* Voice: the case card sits in the 340px side column beside the console. */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div className="hidden lg:block" />
          <aside className="space-y-4"><div><VoiceCaseBones /></div></aside>
        </div>
      </ResidentMain>
      <ResidentMain>
        {/* Settings: the case card sits in the content column beside the 200px section nav. */}
        <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-10">
          <div className="hidden lg:block" />
          <div className="min-w-0 max-w-3xl space-y-5"><div className="space-y-4"><SettingsBones /></div></div>
        </div>
      </ResidentMain>
    </>
  );
}
