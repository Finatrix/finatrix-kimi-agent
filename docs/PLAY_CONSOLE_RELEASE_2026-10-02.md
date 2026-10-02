# Google Play Console release state — 2 October 2026

This records what was checked in the live FinatriX Play Console, separately
from the repository's build checks. The console has **managed publishing on**.

## Closed testing and production access

- The closed **Alpha** track is active with release `1 (1.0.0)`, versionCode 1.
- The production-access panel showed **12 opted-in testers for 1 continuous
  day** on 2 October 2026. Google requires 14 continuous days; the application
  control was disabled. The exact opt-in timestamp was not exposed, so an
  earliest eligible date cannot be given more precisely than around 15 October
  if all 12 remain opted in.
- Production is inactive. No production application or public release has been
  submitted.

## Declarations and listing

All 10 App content declarations are actioned; the **Data safety** and
**Financial features** revisions show **In review**.

- Financial features now declares educational budgeting, expense tracking,
  net-worth and goal tools under **Other**, with an explanation that FinatriX
  holds no funds, executes no trades, issues no loans and recommends no specific
  financial product. The former "no financial features" answer was inaccurate.
- Data safety now includes Name, Email address and User IDs; Purchase history
  and Other financial info; App interactions and Other user-generated content;
  Crash logs and Diagnostics. Purchase history, Other financial info and Other
  user-generated content are disclosed as potentially shared for optional AI
  functionality after consent. Purchase history and User IDs are optional
  collection for signed-in users. The preview includes the account-deletion
  URL `https://finatrix.co/privacy#delete-account` and encryption in transit.
- The default en-GB listing has a new short and full description that state
  assumptions, educational scope and optional AI data flow clearly. The old
  Goal-plan image with dated investment wording was removed. Five other phone
  screenshots remain, above Play's two-image minimum. The local corrected
  `android/store/screenshots/4-goal-plan.png` is ready to add later.
- The listing's three changes plus Data safety were sent for review on
  2 October 2026. **In review is not live**; managed publishing also requires
  an explicit publish action after approval. The financial-features update is
  accounted for separately by the console.

## Final Android artifact awaiting upload

A draft closed Alpha release exists with name
`1.0.0 (4) - WebView compatibility` and en-GB release notes. It has **no app
bundle attached**. The final versionCode 4 bundle is:

`android/release-candidates/1.0.0-code4/finatrix-1.0.0-code4.aab`

SHA-256: `4659f31d28f8a134cc0b3c9ae45d3f1567b9a88e26d7e63b7b3221507e23ec6c`.
It was built from commit `18731721edd7cdc3ff3cf41186afc6502c48a073`.
Its APK counterpart has SHA-256
`e9fe84a25e38708b111c3f4b2f2e3caa218a28633d59eece4d6ca44a8664b873`.

The Chrome computer-use file chooser returned **"Not allowed"** when asked to
select either the AAB or the corrected screenshot. This was an upload-tool
failure: Play did not reject the files, and they were not transmitted. The
release draft and local files are ready for an owner upload in the console.
After upload, check Play's parsed versionCode **4**, versionName **1.0.0**,
min SDK **24**, target SDK **36**, signing certificate and pre-launch report
before sending the release for review.

## Console links

- [Publishing overview](https://play.google.com/console/u/0/developers/7823622614998702068/app/4974122264088929838/publishing)
- [Closed Alpha track](https://play.google.com/console/u/0/developers/7823622614998702068/app/4974122264088929838/tracks/4698855542178505056)
- [Draft versionCode 4 release](https://play.google.com/console/u/0/developers/7823622614998702068/app/4974122264088929838/tracks/4698855542178505056/releases/2/prepare)
- [Default store listing](https://play.google.com/console/u/0/developers/7823622614998702068/app/4974122264088929838/store-listings/default/edit)

This document records console observations, not a claim of public-launch
eligibility or of a successful signed-in end-to-end test.
