# Jellyboxd

A userscript that shows whether a movie on Letterboxd is available in your Jellyfin library.

[Install Jellyboxd](https://raw.githubusercontent.com/ttiaMa/jellyboxd-userscript/main/src/jellyboxd.user.js)

## Current features

- Jellyfin 12-compatible authentication through `Authorization: MediaBrowser Token="…"`;
- a stable loading indicator that remains visible for at least one second;
- separate available, unavailable, configuration, and error states;
- automatic retries for temporary request failures;
- manual retry after errors and automatic recovery when the connection returns;
- server URL and API key stored outside the updateable source code;
- English-only interface and documentation.

## Installation

1. Install a userscript manager such as Violentmonkey or Tampermonkey.
2. Open the **Install Jellyboxd** link above and confirm the installation.
3. Open a Letterboxd movie page.
4. Select **Configure** in the widget, or open the userscript manager menu and select **Configure Jellyfin…**.
5. Enter the full Jellyfin server URL and an API key created in the Jellyfin administration dashboard.

Example server URLs: `https://jellyfin.example.com` or `http://192.168.1.100:8096`.

## Configuration and security

The API key is never written to the `.user.js` file, so it cannot be committed or overwritten by updates from GitHub. It is stored locally by the userscript manager. This separates the secret from the updateable source code, but does not encrypt it: the browser extension and the installed userscript can read it.

The `@connect *` metadata entry is necessary because each user can configure a different Jellyfin domain or local IP address. The userscript manager may ask for permission before the first connection. The script only sends the displayed movie title and year to the configured server.

An API key must still be treated as a secret. Never share it, include it in screenshots, or commit it. If it may have been exposed, revoke it in Jellyfin and create a new one.

## Availability checks

The widget has four states:

- **yellow**: configuration is required, a request is running, or a retry is scheduled;
- **blue**: the movie is available;
- **grey**: Jellyfin responded successfully, but no matching title and year were found;
- **red**: a network, response, or authentication error occurred.

The loading state remains visible for at least one second, preventing fast responses and Letterboxd DOM updates from causing visible flicker. If Letterboxd replaces the injected widget, Jellyboxd restores the last known state without sending the same request again.

Temporary errors such as timeouts and HTTP 408, 429, or 5xx responses are retried up to three times. HTTP 401 and 403 responses open the path to credential configuration. An unavailable result is final for that check and does not display a recheck button.

## Development

There are no runtime or build dependencies. Node.js is only required for the syntax check:

```powershell
npm test
```

Installable file: `src/jellyboxd.user.js`.

## Updates from GitHub

The `@downloadURL` and `@updateURL` metadata entries point to the raw userscript on the `main` branch. The server URL and API key remain in the userscript manager storage and are not overwritten during updates.

## Possible next steps

- display resolution, codecs, HDR, and other media source information;
- improve matching with TMDB or IMDb identifiers when available;
- refine the final widget design;
- add automated tests for matching and state transitions.

## License

No open-source license has been assigned to the project yet.
