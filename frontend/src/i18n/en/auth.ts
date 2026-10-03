// auth section of the English dictionary (sign in, register, email verification, password reset, invitations).
// Keys are prefixed "auth.". Resident-facing: will be translated into all six languages - keep values complete sentences.
const auth = {
  "auth._section": "auth",

  // brand panel
  "auth.brand.title": "Your life-event case, coordinated.",
  "auth.brand.point1": "One account follows your case from the first call to the last document.",
  "auth.brand.point2": "An Amer officer releases every submission before it reaches an authority.",
  "auth.brand.point3": "Each authority still makes its own decision. LifeLoop never invents a status.",
  "auth.brand.prototype": "Prototype. Government integrations are simulated.",

  // fields
  "auth.field.email": "Email address",
  "auth.field.password": "Password",
  "auth.field.newPassword": "New password",
  "auth.field.confirmPassword": "Confirm the new password",
  "auth.field.fullName": "Full name",
  "auth.field.fullNameOptional": "Full name (optional)",
  "auth.field.phone": "Mobile number (optional)",
  "auth.field.phoneHint": "Used for callbacks and SMS updates about your case.",
  "auth.field.language": "Preferred language",
  "auth.field.languageHint": "LifeLoop will call and write to you in this language.",

  // validation
  "auth.validation.email": "Enter a valid email address.",
  "auth.validation.passwordRequired": "Enter your password.",
  "auth.validation.name": "Enter your full name (at least 2 characters).",
  "auth.validation.phone": "Enter a valid phone number, for example +971 50 000 0000.",
  "auth.validation.passwordRules": "The password does not meet all the rules below.",
  "auth.validation.mismatch": "The two passwords do not match.",

  // password rules
  "auth.password.ruleLength": "At least 10 characters",
  "auth.password.ruleLetter": "A letter",
  "auth.password.ruleNumber": "A number",
  "auth.password.met": "Done.",
  "auth.password.notMet": "Not yet.",
  "auth.password.show": "Show password",
  "auth.password.hide": "Hide password",

  // errors
  "auth.error.invalidCredentials": "The email address or password is incorrect.",
  "auth.error.locked": "This account is locked after too many failed attempts. Try again in a few minutes, or reset your password.",
  "auth.error.rateLimited": "Too many attempts in a short time. Please wait a moment and try again.",
  "auth.error.emailTaken": "An account with this email address already exists.",
  "auth.error.weakPassword": "The password must have at least 10 characters, with a letter and a number.",
  "auth.error.invalidToken": "This link is invalid or has expired.",
  "auth.error.server": "LifeLoop could not complete this request. Please try again shortly.",
  "auth.error.network": "LifeLoop could not be reached. Check your connection and try again.",

  // sign in
  "auth.login.eyebrow": "Sign in",
  "auth.login.title": "Sign in to LifeLoop",
  "auth.login.subtitle": "Follow your case, or open the officer workspace.",
  "auth.login.signedInAs": "You are already signed in as {name}.",
  "auth.login.continue": "Continue to your workspace",
  "auth.login.demoTitle": "Demo accounts",
  "auth.login.demoTitleHint": "View the demo with a ready-made account",
  "auth.login.demoBody": "Choose a role to fill in its email address. The Officer account opens the demo controls.",
  "auth.login.demoPassword": "The password for every demo account is the {name} value in your .env file.",
  "auth.login.demoUnavailable": "Demo accounts are not enabled on this server.",
  "auth.login.role.RESIDENT": "Resident",
  "auth.login.role.OFFICER": "Officer",
  "auth.login.role.ADMIN": "Admin",
  "auth.login.roleHint.RESIDENT": "A parent following the demo case.",
  "auth.login.roleHint.OFFICER": "An Amer officer who releases filings.",
  "auth.login.roleHint.ADMIN": "Users, system health and agent setup.",
  "auth.login.forgot": "Forgot your password?",
  "auth.login.submit": "Sign in",
  "auth.login.noAccount": "New to LifeLoop?",
  "auth.login.createAccount": "Create an account",

  // register
  "auth.register.eyebrow": "Start LifeLoop",
  "auth.register.title": "Create your account",
  "auth.register.subtitle": "One account for your whole case. You can report a birth by voice or on the web once you are signed in.",
  "auth.register.prototypeNote": "This is a prototype. Please do not enter real personal or family details.",
  "auth.register.submit": "Create account",
  "auth.register.haveAccount": "Already have an account?",
  "auth.register.signInInstead": "Sign in instead",

  // check your email
  "auth.check.title": "Check your email",
  "auth.check.sent": "We sent a confirmation link to {email}.",
  "auth.check.body": "Open the link in that email to confirm your address. It works once and expires after a while.",
  "auth.check.required": "You need to confirm your email address before you can open a case.",
  "auth.check.resent": "A new confirmation email is on its way.",
  "auth.check.resend": "Send the email again",
  "auth.check.continue": "Continue to LifeLoop",

  // verify email
  "auth.verify.eyebrow": "Email confirmation",
  "auth.verify.workingTitle": "Confirming your email address",
  "auth.verify.working": "Checking your confirmation link...",
  "auth.verify.doneTitle": "Email address confirmed",
  "auth.verify.done": "{email} is confirmed.",
  "auth.verify.doneBody": "You can now open a case and receive updates by email.",
  "auth.verify.failedTitle": "This link did not work",
  "auth.verify.failedSignedIn": "Send yourself a new link below.",
  "auth.verify.failedSignedOut": "Sign in to send yourself a new link.",
  "auth.verify.continue": "Continue",
  "auth.verify.signIn": "Sign in",
  "auth.verify.alreadyTitle": "Your email is confirmed",
  "auth.verify.already": "{email} is already confirmed.",
  "auth.verify.signedOutBody": "Open the confirmation link we emailed you. If you need a new one, sign in first.",

  // forgot password
  "auth.forgot.eyebrow": "Password help",
  "auth.forgot.title": "Reset your password",
  "auth.forgot.subtitle": "Enter the email address you signed up with. We will send you a link to choose a new password.",
  "auth.forgot.submit": "Send the reset link",
  "auth.forgot.sentTitle": "Check your email",
  "auth.forgot.sent": "If an account exists for {email}, we have sent it a link to reset the password.",
  "auth.forgot.sentHint": "The link works once and expires soon. If nothing arrives, check your spam folder or try again.",
  "auth.forgot.back": "Back to sign in",
  "auth.forgot.again": "Use another email address",

  // reset password
  "auth.reset.eyebrow": "Password help",
  "auth.reset.title": "Choose a new password",
  "auth.reset.subtitle": "Signing in with the new password ends your other sessions.",
  "auth.reset.submit": "Save the new password",
  "auth.reset.missingTitle": "This reset link is incomplete",
  "auth.reset.missing": "Open the full link from the email, or request a new one.",
  "auth.reset.requestNew": "Request a new reset link",
  "auth.reset.doneTitle": "Password changed",
  "auth.reset.done": "The password for {email} has been changed. Sign in with your new password.",

  // dev mailbox
  "auth.mailbox.badge": "Development only",
  "auth.mailbox.title": "Development mailbox",
  "auth.mailbox.note": "No mail server is configured, so emails are captured here instead of being sent. This panel never appears outside development.",
  "auth.mailbox.emailLabel": "Show emails sent to",
  "auth.mailbox.refresh": "Refresh",
  "auth.mailbox.empty": "No emails for {email} yet. New emails appear here within a few seconds.",
  "auth.mailbox.error": "The development mailbox could not be loaded.",
  "auth.mailbox.to": "To {email}",
  "auth.mailbox.openVerify": "Open the confirmation link",
  "auth.mailbox.openReset": "Open the reset link",
  "auth.mailbox.openInvite": "Open the invitation link",
  "auth.mailbox.showText": "Show the full email",

  // accept invitation
  "auth.invite.eyebrow": "Officer invitation",
  "auth.invite.title": "Activate your officer account",
  "auth.invite.subtitle": "Choose a password to finish setting up the account your administrator created for you.",
  "auth.invite.submit": "Activate and open the workspace",
  "auth.invite.nameHint": "Leave this empty to keep the name your administrator entered.",
  "auth.invite.askAdmin": "Ask your administrator to send a new invitation.",
  "auth.invite.missingTitle": "This invitation link is incomplete",
  "auth.invite.missing": "Open the full link from the invitation email, or ask your administrator to send a new one.",
  "auth.invite.asideTitle": "The human gate.",
  "auth.invite.asideBody": "Officers review what LifeLoop prepares and release each submission. Every decision is recorded under your name.",
};

export default auth;
