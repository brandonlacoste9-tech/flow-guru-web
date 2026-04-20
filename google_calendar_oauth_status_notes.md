# Google Calendar OAuth status notes

The current browser state shows that the duplicate provider pills are now gone and the app is back to a single `Google Calendar staged` connection pill. That confirms the duplicate-row issue in persistence was real and that the cleanup repaired the visible symptom.

The root cause is a schema and query mismatch. The `providerConnections` table originally had only a normal index on `(userId, provider)`, but the application relied on `onDuplicateKeyUpdate(...)` semantics for `upsertProviderConnection(...)`. Because there was no unique key to collide on, every new Google Calendar connect attempt inserted another staged row instead of updating the existing one.

A defensive code fix has now been applied in two places. First, the schema now defines a unique index for `(userId, provider)`. Second, the database helpers now prefer the newest connection record by ordering on `updatedAt` and `id`, and `listProviderConnections(...)` deduplicates to the latest row per provider before returning data to the UI.

The live database was also repaired. Older duplicate Google Calendar rows were deleted, and only the newest staged record remains for the current user. The next step is to retry the Google Calendar OAuth flow end-to-end and confirm that the callback now marks the connection as `connected` instead of leaving it staged.

A fresh end-to-end retry of the Google Calendar OAuth flow surfaced a second blocker after the persistence fix. Google now shows an `Access blocked` screen stating that `manus.computer has not completed the Google verification process` and that the app is currently being tested and can only be accessed by developer-approved test users. The error shown is `403: access_denied`.

This means the callback bug was not the only issue. The live OAuth flow is now reaching Google correctly, but Google is refusing consent before the app can return an authorization code. The next step is to inspect the Google Cloud OAuth consent screen configuration and confirm whether `brandonlacoste9@gmail.com` is registered as an approved test user, or whether the app needs a different consent-screen/testing configuration.

A later verification pass confirms that the Google Cloud Audience page now lists `brandonlacoste9@gmail.com` as an approved OAuth test user while the app remains in Testing. That removes the original access-blocked issue caused by having zero approved test users.

A fresh database inspection also confirms that the provider-connection persistence repair is holding. There is now exactly one `google-calendar` row for the current user, it is in `connected` status, and the duplicate-row query returns no duplicate groups.

The stored Google scope string now includes both `https://www.googleapis.com/auth/calendar.readonly` and `https://www.googleapis.com/auth/calendar.events`, which means the token has the Calendar read and write permissions that were missing during the earlier `403 insufficient permissions` failure.

The current Flow Guru chat transcript now shows a successful booking confirmation for the physiotherapy appointment, indicating that the repaired OAuth configuration, deduplicated provider connection state, and expanded scopes are working together end to end.

A fresh post-fix booking validation now confirms the timezone and confirmation cleanup on the write path. The request `Book physiotherapy with Rick on April 22 at 9:30 AM.` returned a single clean booking confirmation and displayed the correct local time of `Wednesday, April 22, 2026 at 9:30 AM`.

A follow-up read test also confirms that the Google Calendar read path is executing, but it still has a remaining UX issue. The request `What's on my calendar tomorrow?` produced a Google Calendar action result showing that events were found, yet the assistant text above it still included awkward generative copy (`I can check that for you, david. What is today's date?`) instead of a clean direct summary of the fetched calendar result.
