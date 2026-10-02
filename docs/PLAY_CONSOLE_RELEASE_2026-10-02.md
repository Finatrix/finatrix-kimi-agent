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

All 10 App content declarations are actioned. The **Data safety** revision is
approved and published; the **Financial features** declaration was last seen
as **In review** in App content.

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
- The listing's three changes plus Data safety were approved by Google and
  published through managed publishing on 2 October 2026. Publishing overview
  shows **Last published on 2 October 2026** with no changes waiting to publish.
  The financial-features declaration is accounted for separately by the console.

## Final Android artifact awaiting upload

A draft closed Alpha release exists with name
`1.0.0 (5) - WebView compatibility` and en-GB release notes. It has **no app
bundle attached**. The latest release candidate is:

`android/release-candidates/1.0.0-code5/finatrix-1.0.0-code5.aab`

SHA-256: `a10d8d4af786d7e97469673738c0b021da51533d7076e5418b2d31dcc6b2ca46`.
It was built from commit `bff53e16fdd6b9a09a3fc890a86fd46b410ad8f2`
(tag `android-1.0.0-code5-rc1`). Code 4 predates the private-email account
deletion fix and the latest financial wording; **do not upload code 4**.
Its APK counterpart has SHA-256
`2d15b57b22eda5b85cec85906ef3248940a947afcf65fb570100cfdd567b3e12`.
The exact code 5 APK launched Dashboard, Budget, Expenses, Goals and Net Worth
on API 36/WebView 133 and API 30/WebView 91, without logged JavaScript or
fatal errors. The code 5 APK and AAB signatures were verified.

The Chrome computer-use file chooser returned **"Not allowed"** when asked to
select either the AAB or the corrected screenshot. This was an upload-tool
failure: Play did not reject the files, and they were not transmitted. The
Chrome extension needs **Allow access to file URLs** enabled under its Details
page before another automated upload attempt. The release draft and local files
are ready. After upload, check Play's parsed versionCode **5**, versionName **1.0.0**,
min SDK **24**, target SDK **36**, signing certificate and pre-launch report
before sending the release for review.

## Console links

- [Publishing overview](https://play.google.com/console/u/0/developers/7823622614998702068/app/4974122264088929838/publishing)
- [Closed Alpha track](https://play.google.com/console/u/0/developers/7823622614998702068/app/4974122264088929838/tracks/4698855542178505056)
- [Draft versionCode 5 release](https://play.google.com/console/u/0/developers/7823622614998702068/app/4974122264088929838/tracks/4698855542178505056/releases/2/prepare)
- [Default store listing](https://play.google.com/console/u/0/developers/7823622614998702068/app/4974122264088929838/store-listings/default/edit)

This document records console observations, not a claim of public-launch
eligibility or of a successful signed-in end-to-end test.
