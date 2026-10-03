/**
 * Skeleton capture fixtures for the public area, rendered on the dev-only /__bones page.
 * Render each named <Bones> exactly as its page does (same wrapper widths and grid), with `loading` and a `fixture`.
 * `npm run bones` snapshots them at 390/768/1024/1440 px into src/bones/*.bones.json.
 *
 * Public skeletons (all inside the auth form column, AuthCaptureFrame = AuthLayout's grid, paddings and card):
 * - pub-demo-accounts : Login, the demo-account picker while /auth/config loads
 * - pub-dev-mailbox   : Register / Forgot / Verify, the development mailbox list while /dev/mailbox loads
 * - pub-verify-state  : Verify email, the confirmed panel while the single-use token is checked
 */
import { AuthCaptureFrame } from "../../components/auth/AuthLayout";
import { DemoAccounts } from "../../components/auth/DemoAccounts";
import { MailboxFrame, MailboxList } from "../../components/auth/DevMailbox";
import { VerifyResult } from "../../components/auth/VerifyState";

const noop = () => undefined;

export default function PublicBones() {
  return (
    <div data-bones-area="public" className="bg-paper">
      <AuthCaptureFrame>
        <DemoAccounts loading accounts={[]} highlight={false} selected="" onPick={noop} />
      </AuthCaptureFrame>
      <AuthCaptureFrame
        below={(
          <MailboxFrame titleId="bones-mailbox-title">
            <div className="mt-4"><MailboxList loading items={[]} /></div>
          </MailboxFrame>
        )}
      />
      <AuthCaptureFrame>
        <VerifyResult loading email={null} continueTo="/login" signedIn={false} />
      </AuthCaptureFrame>
    </div>
  );
}
