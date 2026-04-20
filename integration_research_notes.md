# Flow Guru Integration Research Notes

Google Calendar’s official authorization guidance shows that a web app should request the narrowest scopes possible, with `calendar.events` or the more limited read-only variants covering event access and creation needs for this project. The documentation also confirms that Google requires an OAuth 2.0 client configuration and consent-screen setup before a production app can request those scopes from end users.

Spotify’s official authorization guidance confirms that a server-backed web app should use the standard authorization code flow when it can safely store a client secret on the server, while browser-only apps should use PKCE instead. Because Flow Guru already has a server tier, the server-backed authorization code flow is the more natural fit for web account linking, while mobile apps can later adopt PKCE if we extend the same integration architecture beyond the web client.

Spotify’s official playback reference confirms that starting or resuming playback requires the `user-modify-playback-state` scope and only works for users with Spotify Premium. The endpoint can target an active device directly or a supplied device ID, which means Flow Guru should either detect an available device or later add the official Web Playback SDK if we want in-browser playback instead of only remote-control behavior.

Waze’s official Transport SDK documentation shows that it is partner-gated, mobile-oriented, and explicitly does not support server-side access to Waze data. That makes Waze unsuitable as the primary web integration path for Flow Guru right now, so Google Maps should be the primary route and traffic provider while Waze can remain a future mobile deep-link option.

Open-Meteo’s documentation confirms that current weather and forecast data can be requested directly by latitude and longitude without user-specific OAuth credentials, making it a strong immediate weather source for the first action-capable Flow Guru milestone.

Actually Relevant exposes a JSON news API with no API key and issue-based filtering, which makes it a practical immediate source for personalized headlines while richer account-linked providers are still deferred. Its response model includes titles, summaries, sources, URLs, issue area, and publication metadata, which is enough for clean in-chat news cards or concise assistant summaries.
