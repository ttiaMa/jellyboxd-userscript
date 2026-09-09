# Changelog

All notable changes to this project are documented in this file.

## 2.0.0 - 2026-09-09

- replaced `X-Emby-Token` with the modern `Authorization: MediaBrowser Token="…"` header;
- moved the Jellyfin server URL and API key to userscript manager storage;
- added configuration through the userscript menu and a dedicated dialog;
- added explicit loading, available, unavailable, configuration, and error states;
- added request timeouts, automatic retries, and manual retry after errors;
- added dynamic initialization for delayed page content and browser navigation;
- guaranteed that the loading state remains visible for at least one second;
- prevented repeated requests and visual flicker when Letterboxd replaces or mutates the injected widget;
- restored the last stable state after DOM replacement instead of restarting the check;
- removed the recheck action from unavailable results;
- added exact TMDB ID matching using the provider link exposed by Letterboxd;
- added title and year matching as a fallback when TMDB data is unavailable or does not match;
- converted the userscript interface, messages, metadata, and repository documentation to English;
- added GitHub installation and automatic update metadata;
- prepared the repository structure and development checks.

## 1.0.0

- initial userscript version.
