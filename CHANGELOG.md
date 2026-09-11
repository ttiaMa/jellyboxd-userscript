# Changelog

All notable changes to this project are documented in this file.

## 2.2.1 - 2026-09-11

- fixed long media version names overflowing the details panel while preserving the full text.

## 2.2.0 - 2026-09-10

- made the available status chip expandable and keyboard accessible;
- added on-demand media details for resolution, codecs, HDR format, container, bitrate, file size, and audio channels;
- added support for displaying multiple matching Jellyfin items and multiple media versions;
- added direct links from the details panel to the matching Jellyfin items.

## 2.1.0 - 2026-09-09

- redesigned the availability widget as a compact, Letterboxd-native charcoal chip;
- replaced status symbols and tinted borders with a small state-colored indicator;
- softened the typography, spacing, and shadows without changing availability checks or request handling.

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
- added the official Jellyfin icon to userscript manager listings;
- converted the userscript interface, messages, metadata, and repository documentation to English;
- added GitHub installation and automatic update metadata;

## 1.0.0

- initial userscript version.
