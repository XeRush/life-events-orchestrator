import PublicBones from "../../bones/capture/public";
import ResidentBones from "../../bones/capture/resident";
import StaffBones from "../../bones/capture/staff";

/** Dev only (/__bones): every skeleton fixture on one page so boneyard-js can capture them in a single crawl. */
export default function BonesCapture() {
  return (
    <div className="min-h-screen bg-paper" data-bones-capture>
      <PublicBones />
      <ResidentBones />
      <StaffBones />
    </div>
  );
}
