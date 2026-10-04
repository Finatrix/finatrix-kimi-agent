# Reply to App Review — Guideline 2.1 Information Needed (2026-10-04)

Apple asked for six items. Paste the block below into **Reply to App Review**, and
also into **App Review Information → Notes** (they ask for both). Then resubmit.

Items marked **[OWNER]** cannot be done from the repo.

## Item 1 — screen recording [OWNER]

Record on a physical iPhone running the latest iOS, as one continuous take
(upload to App Store Connect with the reply, or host privately and link it):

1. Launch the app from the Home Screen (the recording must start here).
2. Budget → enter an income and an expense; show the totals update.
3. Expenses → Quick add "340 lunch upi"; show it categorised.
4. Tap SIGN IN → show Sign in with Apple, then sign in with the demo account
   (credentials are in the Sign-In Information fields; never put them in notes).
5. Open FinatriX AI (gold sparkle) → show the consent prompt, accept, ask one
   question.
6. Menu → Profile → **Delete account** → type the email → confirm. Record this
   last, with a **throwaway account created on camera**, not the demo account.
   Re-seed the demo account if you touch it (docs/APP_STORE_SUBMISSION.md §7).
7. Say or caption: "No purchases exist in the app" — there is no paid content
   to show, and no user-generated content visible to other users.

## Items 2–6 — text to paste

```
Thank you. Answers below; a screen recording from a physical iPhone is attached.

1. RECORDING. Shows launch, the typical flow (Budget, Expenses quick-add), sign-in (Sign in with Apple and demo account), the optional AI assistant with its consent prompt, and in-app account deletion. There is no user-generated content shared between users (nothing a user writes reaches any other user), so there are no reporting/blocking mechanisms to show. There is no paid content in the app (see 3.1.1 note below).

2. PURPOSE AND AUDIENCE. FinatriX is a personal-finance education and planning app for adults (18+), mainly in India, with market packs for the US, UK, UAE, Australia, Singapore and Mainland China. It solves the problem of people not understanding where their money goes or whether their goals are reachable: budget, expense tracking, goals, net worth and calculators, each with the assumptions stated. It is educational; all figures are estimates from the user's own input.

3. SETUP / ACCESS. No account is needed: every calculator works on open, with data stored on the device. Signing in adds cloud sync and the optional AI assistant. Demo account: see the Sign-In Information fields. Tap SIGN IN (top right) > "or sign in with email". Sign in with Apple is offered first, then Google. The demo account is pre-filled with three months of fictional data. Account deletion: menu > Profile > Delete account, type the email to confirm. Optional sample statement import: Expenses > Import (CSV/Excel/PDF/photo); the camera is used only for "Take Photo", read on-device.

4. EXTERNAL SERVICES.
- Supabase: authentication and database (cloud sync, only when signed in).
- Sign in with Apple and Google Sign-In: authentication.
- OpenRouter and the model it routes to: the optional FinatriX AI assistant; data is sent only after explicit in-app consent, which can be withdrawn in Settings > FinatriX AI.
- Cloudflare: hosting and delivery of the web content the app loads.
- On-device OCR for photographed statements (nothing uploaded).
- No payment processor is used in the app, no advertising SDKs, no tracking.

5. REGIONS. The app is the same in all regions. Users choose a market pack (India default; US, UK, UAE, Australia, Singapore, Mainland China) that changes currency, tax and benchmark assumptions in the calculators only. Features and content do not otherwise differ.

6. REGULATION. FinatriX is not a bank, broker, lender or registered investment adviser, holds no user funds, executes no transactions and connects to no bank accounts. It provides educational estimates only, with a disclaimer in the app and store description. No licensed or third-party protected material is included.

3.1.1: The app sells nothing and shows no prices. FinatriX Pro exists on the website only; in the app the pricing pages redirect and all purchase controls are hidden.
```

## Before replying — verify (I could not run the app on a device)

- [ ] Demo account still signs in and is not deleted.
- [ ] Item 5: confirm market packs change only calculator assumptions.
- [ ] Item 4: confirm Google Sign-In and Cloudflare are in the shipped build.
- [ ] Rejected build is "1.0.0 (2)": a 2.1 info request usually needs only a
  reply and resubmit, not a new binary.
