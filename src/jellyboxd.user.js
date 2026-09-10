// ==UserScript==
// @name         Jellyboxd
// @namespace    https://github.com/ttiaMa/jellyboxd-userscript
// @version      2.2.0
// @description  Shows whether a Letterboxd movie is available in your Jellyfin library.
// @author       Mattia
// @icon         https://raw.githubusercontent.com/jellyfin/jellyfin-ux/master/branding/web/icon-transparent.png
// @homepageURL  https://github.com/ttiaMa/jellyboxd-userscript
// @supportURL   https://github.com/ttiaMa/jellyboxd-userscript/issues
// @downloadURL  https://raw.githubusercontent.com/ttiaMa/jellyboxd-userscript/main/src/jellyboxd.user.js
// @updateURL    https://raw.githubusercontent.com/ttiaMa/jellyboxd-userscript/main/src/jellyboxd.user.js
// @match        https://letterboxd.com/film/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @connect      *
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    const SCRIPT_NAME = 'Jellyboxd';
    const WIDGET_ID = 'jellyboxd-status';
    const DETAILS_ID = 'jellyboxd-details';
    const SETTINGS_ID = 'jellyboxd-settings';
    const STORAGE_KEYS = Object.freeze({
        serverUrl: 'jellyfinServerUrl',
        apiKey: 'jellyfinApiKey'
    });
    const RETRY_DELAYS_MS = [0, 1500, 4000];
    const REQUEST_TIMEOUT_MS = 12000;
    const MIN_LOADING_DURATION_MS = 1000;
    const boundWidgets = new WeakSet();

    let activePageKey = '';
    let activeRequest = null;
    let requestGeneration = 0;
    let initializeTimer = null;
    let initializeForced = false;
    let lastState = 'idle';
    let currentView = { state: 'idle', message: '', action: null };
    let matchingMovies = [];
    let detailsData = null;
    let detailsOpen = false;
    let detailsLoading = false;

    GM_addStyle(`
        #${WIDGET_ID} {
            --jellyboxd-accent: #f0b429;
            align-items: center;
            background: #202830;
            border: 0;
            border-radius: 999px;
            box-sizing: border-box;
            box-shadow: 0 1px 2px rgba(0, 0, 0, .18);
            color: #b7c9d8;
            display: flex;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 12px;
            font-weight: 500;
            gap: 7px;
            height: 30px;
            letter-spacing: .1px;
            margin-bottom: 15px;
            padding: 0 11px;
            width: fit-content;
        }

        #${WIDGET_ID}[data-state="available"] { --jellyboxd-accent: #22d3bd; }
        #${WIDGET_ID}[data-state="unavailable"] { --jellyboxd-accent: #8d9aa5; }
        #${WIDGET_ID}[data-state="error"] { --jellyboxd-accent: #e45b4f; }
        #${WIDGET_ID}[data-state="configuration"] { --jellyboxd-accent: #f0b429; }

        #${WIDGET_ID}[data-interactive="true"] {
            cursor: pointer;
            transition: background-color .15s ease, box-shadow .15s ease;
            user-select: none;
        }

        #${WIDGET_ID}[data-interactive="true"]:hover { background: #28343d; }
        #${WIDGET_ID}[data-interactive="true"]:focus-visible {
            box-shadow: 0 0 0 2px rgba(64, 188, 244, .22);
            outline: 0;
        }
        #${WIDGET_ID}[aria-expanded="true"] { margin-bottom: 8px; }

        #${WIDGET_ID} .jellyboxd-message {
            align-items: center;
            display: inline-flex;
            gap: 7px;
        }

        #${WIDGET_ID} .jellyboxd-message::before {
            background: var(--jellyboxd-accent);
            border-radius: 50%;
            box-shadow: 0 0 0 2px color-mix(in srgb, var(--jellyboxd-accent) 14%, transparent);
            content: "";
            flex: 0 0 auto;
            height: 8px;
            width: 8px;
        }

        #${WIDGET_ID}[data-state="loading"] .jellyboxd-message::before { display: none; }

        #${WIDGET_ID} .jellyboxd-chevron {
            border: solid currentColor;
            border-width: 0 1.5px 1.5px 0;
            display: none;
            height: 5px;
            margin: -3px 1px 0 2px;
            transform: rotate(45deg);
            transition: transform .15s ease, margin .15s ease;
            width: 5px;
        }

        #${WIDGET_ID}[data-interactive="true"] .jellyboxd-chevron { display: inline-block; }
        #${WIDGET_ID}[aria-expanded="true"] .jellyboxd-chevron {
            margin-bottom: -3px;
            margin-top: 0;
            transform: rotate(225deg);
        }

        #${WIDGET_ID} .jellyboxd-spinner {
            animation: jellyboxd-spin .8s linear infinite;
            border: 2px solid rgba(255, 255, 255, .35);
            border-radius: 50%;
            border-top-color: #fff;
            box-sizing: border-box;
            display: none;
            height: 12px;
            width: 12px;
        }

        #${WIDGET_ID}[data-state="loading"] .jellyboxd-spinner { display: inline-block; }

        #${WIDGET_ID} button {
            background: transparent;
            border: 0;
            color: inherit;
            cursor: pointer;
            font: inherit;
            margin: -3px -4px -3px 2px;
            padding: 3px 4px;
            text-decoration: underline;
            text-underline-offset: 2px;
        }

        #${DETAILS_ID} {
            background: linear-gradient(180deg, #202a32 0%, #1b232a 100%);
            border: 1px solid #34434e;
            border-radius: 8px;
            box-shadow: 0 10px 28px rgba(0, 0, 0, .3);
            box-sizing: border-box;
            color: #9fb3c1;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 12px;
            margin: 0 0 15px;
            max-width: 470px;
            overflow: hidden;
            width: 100%;
        }

        #${DETAILS_ID} .jellyboxd-details-header {
            border-bottom: 1px solid #34434e;
            color: #b9cbd7;
            font-size: 13px;
            font-weight: 500;
            padding: 11px 13px;
        }

        #${DETAILS_ID} .jellyboxd-item-heading {
            background: rgba(255, 255, 255, .025);
            color: #8fa5b4;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: .35px;
            padding: 8px 13px;
            text-transform: uppercase;
        }

        #${DETAILS_ID} .jellyboxd-item-group + .jellyboxd-item-group,
        #${DETAILS_ID} .jellyboxd-version + .jellyboxd-version {
            border-top: 1px solid #34434e;
        }

        #${DETAILS_ID} .jellyboxd-version { padding: 10px 13px; }
        #${DETAILS_ID} .jellyboxd-version-title {
            color: #d5e0e7;
            font-size: 14px;
            font-weight: 700;
            margin-bottom: 4px;
        }
        #${DETAILS_ID} .jellyboxd-version-primary { color: #a9bdca; }
        #${DETAILS_ID} .jellyboxd-version-secondary { color: #8096a5; margin-top: 3px; }
        #${DETAILS_ID} .jellyboxd-version-primary,
        #${DETAILS_ID} .jellyboxd-version-secondary { line-height: 1.4; }

        #${DETAILS_ID} .jellyboxd-details-link {
            border-top: 1px solid #34434e;
            color: #40bcf4;
            display: block;
            font-size: 12px;
            padding: 9px 13px;
            text-decoration: none;
        }
        #${DETAILS_ID} .jellyboxd-details-link:hover { color: #78d3fa; }

        #${DETAILS_ID} .jellyboxd-details-status {
            align-items: center;
            display: flex;
            gap: 8px;
            min-height: 42px;
            padding: 0 13px;
        }
        #${DETAILS_ID} .jellyboxd-details-status[data-loading="true"]::before {
            animation: jellyboxd-spin .8s linear infinite;
            border: 2px solid rgba(183, 201, 216, .3);
            border-radius: 50%;
            border-top-color: #40bcf4;
            box-sizing: border-box;
            content: "";
            height: 12px;
            width: 12px;
        }
        #${DETAILS_ID} .jellyboxd-details-status button {
            background: transparent;
            border: 0;
            color: #40bcf4;
            cursor: pointer;
            font: inherit;
            margin-left: auto;
            padding: 4px 0;
        }

        @media (max-width: 600px) {
            #${DETAILS_ID} { max-width: 100%; }
        }

        #${SETTINGS_ID} {
            align-items: center;
            backdrop-filter: blur(3px);
            background: rgba(8, 12, 15, .8);
            display: flex;
            inset: 0;
            justify-content: center;
            padding: 20px;
            position: fixed;
            z-index: 2147483647;
        }

        #${SETTINGS_ID} .jellyboxd-dialog {
            background: #202830;
            border: 1px solid #34434e;
            border-radius: 12px;
            box-shadow: 0 18px 55px rgba(0, 0, 0, .55);
            box-sizing: border-box;
            color: #d8e2e8;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            max-width: 440px;
            padding: 24px;
            width: 100%;
        }

        #${SETTINGS_ID} h2 { color: #fff; font-size: 20px; letter-spacing: -.2px; margin: 0 0 8px; }
        #${SETTINGS_ID} p { color: #9ab0bf; font-size: 13px; line-height: 1.5; margin: 0 0 18px; }
        #${SETTINGS_ID} label {
            color: #c6d3dc;
            display: block;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: .25px;
            margin: 15px 0 6px;
        }
        #${SETTINGS_ID} input {
            background: #14191e;
            border: 1px solid #3d4b55;
            border-radius: 6px;
            box-sizing: border-box;
            color: #d8e2e8;
            font: inherit;
            padding: 10px 11px;
            transition: border-color .15s ease, box-shadow .15s ease;
            width: 100%;
        }
        #${SETTINGS_ID} input::placeholder { color: #6f818e; }
        #${SETTINGS_ID} input:focus {
            border-color: #40bcf4;
            box-shadow: 0 0 0 2px rgba(64, 188, 244, .14);
            outline: 0;
        }
        #${SETTINGS_ID} .jellyboxd-error { color: #ff8c84; margin: 10px 0 0; min-height: 18px; }
        #${SETTINGS_ID} .jellyboxd-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px; }
        #${SETTINGS_ID} button {
            background: #303c45;
            border: 0;
            border-radius: 999px;
            color: #c8d5dd;
            cursor: pointer;
            font: inherit;
            padding: 8px 14px;
            transition: background-color .15s ease, color .15s ease;
        }
        #${SETTINGS_ID} button:hover { background: #3a4852; color: #fff; }
        #${SETTINGS_ID} button:focus-visible { outline: 2px solid #40bcf4; outline-offset: 2px; }
        #${SETTINGS_ID} button[type="submit"] { background: #00a84f; color: #fff; font-weight: 700; }
        #${SETTINGS_ID} button[type="submit"]:hover { background: #00b85a; }
        #${SETTINGS_ID} button[data-action="clear"] { margin-right: auto; }

        @keyframes jellyboxd-spin { to { transform: rotate(360deg); } }
    `);

    class JellyfinRequestError extends Error {
        constructor(message, options = {}) {
            super(message);
            this.name = 'JellyfinRequestError';
            this.status = options.status ?? 0;
            this.retryable = options.retryable ?? false;
        }
    }

    function readConfiguration() {
        return {
            serverUrl: String(GM_getValue(STORAGE_KEYS.serverUrl, '')).trim().replace(/\/+$/, ''),
            apiKey: String(GM_getValue(STORAGE_KEYS.apiKey, '')).trim()
        };
    }

    function normalizeServerUrl(value) {
        const url = new URL(value.trim());
        if (!['http:', 'https:'].includes(url.protocol)) {
            throw new Error('Use an http:// or https:// address.');
        }

        url.hash = '';
        url.search = '';
        return url.toString().replace(/\/+$/, '');
    }

    function getMetadata() {
        const titleElement = document.querySelector('h1.headline-1 span[itemprop="name"]')
            || document.querySelector('h1.headline-1 span.name')
            || document.querySelector('h1.headline-1');
        const yearElement = document.querySelector('.releaseyear a')
            || document.querySelector('small.number[itemprop="copyrightYear"]');
        const tmdbLink = document.querySelector('a[href*="themoviedb.org/movie/"]');

        const title = titleElement?.textContent?.trim();
        if (!title) return null;

        const parsedYear = Number.parseInt(yearElement?.textContent?.trim() || '', 10);
        const tmdbId = tmdbLink?.href?.match(/themoviedb\.org\/movie\/(\d+)/i)?.[1] || null;
        return {
            title,
            year: Number.isFinite(parsedYear) ? parsedYear : null,
            tmdbId
        };
    }

    function normalizeTitle(value) {
        return value
            .normalize('NFKC')
            .replace(/\s+/g, ' ')
            .trim()
            .toLocaleLowerCase();
    }

    function findMatchingMoviesByTitle(items, metadata) {
        const expectedTitle = normalizeTitle(metadata.title);

        return items.filter((item) => {
            if (!item?.Name || normalizeTitle(item.Name) !== expectedTitle) return false;

            const productionYear = Number(item.ProductionYear);
            if (!metadata.year || !Number.isFinite(productionYear)) return true;
            return productionYear === metadata.year;
        });
    }

    function getProviderId(item, providerName) {
        const providerEntry = Object.entries(item?.ProviderIds || {})
            .find(([name]) => name.toLocaleLowerCase() === providerName.toLocaleLowerCase());
        return providerEntry ? String(providerEntry[1]) : null;
    }

    function findMatchingMoviesByTmdbId(items, tmdbId) {
        return items.filter((item) => getProviderId(item, 'tmdb') === String(tmdbId));
    }

    function getWidgetPlacement() {
        const synopsis = document.querySelector('.production-synopsis');
        if (synopsis) return { parent: synopsis, before: synopsis.firstChild };

        const titleHeader = document.querySelector('h1.headline-1');
        if (titleHeader?.parentNode) return { parent: titleHeader.parentNode, before: titleHeader.nextSibling };

        return null;
    }

    function bindWidgetEvents(widget) {
        if (boundWidgets.has(widget)) return;
        boundWidgets.add(widget);

        widget.addEventListener('click', (event) => {
            if (widget.dataset.interactive !== 'true' || event.target.closest('button, a')) return;
            void toggleMovieDetails();
        });
        widget.addEventListener('keydown', (event) => {
            if (widget.dataset.interactive !== 'true' || !['Enter', ' '].includes(event.key)) return;
            event.preventDefault();
            void toggleMovieDetails();
        });
    }

    function ensureWidget() {
        const existing = document.getElementById(WIDGET_ID);
        if (existing) {
            bindWidgetEvents(existing);
            return existing;
        }

        const placement = getWidgetPlacement();
        if (!placement) return null;

        const widget = document.createElement('div');
        widget.id = WIDGET_ID;
        widget.setAttribute('role', 'status');
        widget.setAttribute('aria-live', 'polite');

        const spinner = document.createElement('span');
        spinner.className = 'jellyboxd-spinner';
        spinner.setAttribute('aria-hidden', 'true');

        const message = document.createElement('span');
        message.className = 'jellyboxd-message';

        const chevron = document.createElement('span');
        chevron.className = 'jellyboxd-chevron';
        chevron.setAttribute('aria-hidden', 'true');

        widget.append(spinner, message, chevron);
        bindWidgetEvents(widget);
        placement.parent.insertBefore(widget, placement.before);
        return widget;
    }

    function setWidgetInteractivity(widget, interactive) {
        if (interactive) {
            widget.dataset.interactive = 'true';
            widget.tabIndex = 0;
            widget.setAttribute('role', 'button');
            widget.setAttribute('aria-controls', DETAILS_ID);
            widget.setAttribute('aria-expanded', String(detailsOpen));
            widget.setAttribute('aria-label', `${currentView.message}. Show media details.`);
            widget.removeAttribute('aria-live');
            return;
        }

        delete widget.dataset.interactive;
        widget.removeAttribute('tabindex');
        widget.removeAttribute('aria-controls');
        widget.removeAttribute('aria-expanded');
        widget.removeAttribute('aria-label');
        widget.setAttribute('role', 'status');
        widget.setAttribute('aria-live', 'polite');
        closeMovieDetails();
    }

    function renderWidgetState(view) {
        const widget = ensureWidget();
        if (!widget) return;

        widget.dataset.state = view.state;
        widget.querySelector('.jellyboxd-message').textContent = view.message;
        widget.querySelector('button')?.remove();
        setWidgetInteractivity(widget, view.state === 'available' && matchingMovies.length > 0);

        if (view.action) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = view.action.label;
            button.addEventListener('click', view.action.onClick);
            widget.append(button);
        }

        if (view.state === 'available' && detailsOpen) {
            if (detailsData) renderMovieDetails(detailsData, readConfiguration());
            else if (detailsLoading) renderDetailsStatus('Loading media details…', { loading: true });
        }
    }

    function setWidgetState(state, message, action = null) {
        lastState = state;
        currentView = { state, message, action };
        renderWidgetState(currentView);
    }

    function closeMovieDetails() {
        detailsOpen = false;
        document.getElementById(DETAILS_ID)?.remove();
        const widget = document.getElementById(WIDGET_ID);
        if (widget?.dataset.interactive === 'true') {
            widget.setAttribute('aria-expanded', 'false');
            widget.setAttribute('aria-label', `${currentView.message}. Show media details.`);
        }
    }

    function resetMovieDetails() {
        matchingMovies = [];
        detailsData = null;
        detailsLoading = false;
        closeMovieDetails();
    }

    function ensureDetailsPanel() {
        const widget = ensureWidget();
        if (!widget) return null;

        let panel = document.getElementById(DETAILS_ID);
        if (!panel) {
            panel = document.createElement('div');
            panel.id = DETAILS_ID;
            panel.setAttribute('role', 'region');
            panel.setAttribute('aria-live', 'polite');
            panel.setAttribute('aria-label', 'Jellyfin media details');
        }

        if (panel.previousElementSibling !== widget) widget.insertAdjacentElement('afterend', panel);
        return panel;
    }

    function renderDetailsStatus(message, options = {}) {
        const panel = ensureDetailsPanel();
        if (!panel) return;

        const status = document.createElement('div');
        status.className = 'jellyboxd-details-status';
        status.textContent = message;
        if (options.loading) status.dataset.loading = 'true';

        if (options.retry) {
            const retryButton = document.createElement('button');
            retryButton.type = 'button';
            retryButton.textContent = 'Retry';
            retryButton.addEventListener('click', () => {
                detailsData = null;
                void loadMovieDetails();
            });
            status.append(retryButton);
        }

        panel.replaceChildren(status);
    }

    function getStreams(item, source) {
        if (Array.isArray(source?.MediaStreams) && source.MediaStreams.length > 0) {
            return source.MediaStreams;
        }
        return Array.isArray(item?.MediaStreams) ? item.MediaStreams : [];
    }

    function getStream(item, source, type) {
        return getStreams(item, source)
            .find((stream) => String(stream?.Type || '').toLocaleLowerCase() === type) || null;
    }

    function formatCodec(value) {
        const codec = String(value || '').trim();
        if (!codec) return null;

        const normalized = codec.toLocaleLowerCase().replace(/[^a-z0-9]/g, '');
        const labels = {
            ac3: 'AC-3',
            aac: 'AAC',
            av1: 'AV1',
            avc: 'H.264',
            dts: 'DTS',
            dtshd: 'DTS-HD',
            eac3: 'E-AC-3',
            flac: 'FLAC',
            h264: 'H.264',
            h265: 'HEVC',
            hevc: 'HEVC',
            truehd: 'TrueHD',
            vp9: 'VP9'
        };
        return labels[normalized] || codec.toLocaleUpperCase();
    }

    function formatResolution(videoStream) {
        const height = Number(videoStream?.Height);
        if (!Number.isFinite(height) || height <= 0) return null;
        if (height >= 2160) return '2160p';
        if (height >= 1440) return '1440p';
        if (height >= 1080) return '1080p';
        if (height >= 720) return '720p';
        return `${Math.round(height)}p`;
    }

    function formatVideoRange(videoStream) {
        const sourceValue = String(videoStream?.VideoRangeType || videoStream?.VideoRange || '')
            .toLocaleUpperCase();
        if (sourceValue.includes('DOVI')) return 'Dolby Vision';
        if (sourceValue.includes('HDR10')) return 'HDR10';
        if (sourceValue.includes('HLG')) return 'HLG';
        if (sourceValue.includes('HDR')) return 'HDR';
        if (sourceValue.includes('SDR')) return 'SDR';

        const transfer = String(videoStream?.ColorTransfer || '').toLocaleLowerCase();
        if (transfer.includes('smpte2084')) return 'HDR10';
        if (transfer.includes('arib-std-b67')) return 'HLG';
        return null;
    }

    function formatBitrate(value) {
        const bitrate = Number(value);
        if (!Number.isFinite(bitrate) || bitrate <= 0) return null;
        return `${(bitrate / 1_000_000).toFixed(bitrate >= 10_000_000 ? 1 : 2)} Mbps`;
    }

    function formatSize(value) {
        const size = Number(value);
        if (!Number.isFinite(size) || size <= 0) return null;
        const gigabytes = size / 1_000_000_000;
        if (gigabytes >= 1) return `${gigabytes.toFixed(gigabytes >= 10 ? 1 : 2)} GB`;
        return `${(size / 1_000_000).toFixed(0)} MB`;
    }

    function formatChannels(audioStream) {
        const channels = Number(audioStream?.Channels);
        if (!Number.isFinite(channels) || channels <= 0) return null;
        if (channels === 8) return '7.1';
        if (channels === 6) return '5.1';
        if (channels === 2) return '2.0';
        if (channels === 1) return 'Mono';
        return `${channels} ch`;
    }

    function formatAudio(audioStream) {
        if (!audioStream) return null;
        const codec = formatCodec(audioStream.Profile || audioStream.Codec);
        const channels = formatChannels(audioStream);
        return [codec, channels].filter(Boolean).join(' ') || null;
    }

    function getMediaSources(item) {
        if (Array.isArray(item?.MediaSources) && item.MediaSources.length > 0) {
            return item.MediaSources.filter(Boolean);
        }

        if (Array.isArray(item?.MediaStreams) && item.MediaStreams.length > 0) {
            return [{
                Bitrate: item.Bitrate,
                Container: item.Container,
                MediaStreams: item.MediaStreams,
                Name: item.Name,
                Size: item.Size
            }];
        }

        return [{}];
    }

    function getVersionTitle(item, source, videoStream, index) {
        const sourceName = String(source?.Name || '').trim();
        if (sourceName && normalizeTitle(sourceName) !== normalizeTitle(item?.Name || '')) {
            return sourceName;
        }

        const resolution = formatResolution(videoStream);
        const videoRange = formatVideoRange(videoStream);
        const resolutionLabel = resolution === '2160p' ? '4K'
            : resolution === '1440p' ? 'QHD'
                : resolution === '1080p' ? 'Full HD'
                    : resolution;
        return [resolutionLabel, videoRange && videoRange !== 'SDR' ? videoRange : null]
            .filter(Boolean)
            .join(' ') || `Version ${index + 1}`;
    }

    function buildJellyfinItemUrl(serverUrl, itemId) {
        return `${serverUrl}/web/#/details?id=${encodeURIComponent(itemId)}`;
    }

    function appendVersion(panelGroup, item, source, index) {
        const videoStream = getStream(item, source, 'video');
        const audioStream = getStream(item, source, 'audio');
        const primaryParts = [
            formatResolution(videoStream),
            formatCodec(videoStream?.Codec),
            formatVideoRange(videoStream),
            formatCodec(source?.Container || item?.Container)
        ].filter(Boolean);
        const secondaryParts = [
            formatBitrate(source?.Bitrate || item?.Bitrate || videoStream?.BitRate),
            formatSize(source?.Size || item?.Size),
            formatAudio(audioStream)
        ].filter(Boolean);

        const version = document.createElement('div');
        version.className = 'jellyboxd-version';

        const title = document.createElement('div');
        title.className = 'jellyboxd-version-title';
        title.textContent = getVersionTitle(item, source, videoStream, index);

        const primary = document.createElement('div');
        primary.className = 'jellyboxd-version-primary';
        primary.textContent = primaryParts.join('  •  ') || 'Media details unavailable';

        version.append(title, primary);
        if (secondaryParts.length > 0) {
            const secondary = document.createElement('div');
            secondary.className = 'jellyboxd-version-secondary';
            secondary.textContent = secondaryParts.join('  •  ');
            version.append(secondary);
        }
        panelGroup.append(version);
    }

    function renderMovieDetails(items, configuration) {
        const panel = ensureDetailsPanel();
        if (!panel) return;

        const groups = items.map((item) => ({ item, sources: getMediaSources(item) }));
        const versionCount = groups.reduce((total, group) => total + group.sources.length, 0);
        if (versionCount === 0) {
            renderDetailsStatus('No media details were returned by Jellyfin.');
            return;
        }

        const header = document.createElement('div');
        header.className = 'jellyboxd-details-header';
        header.textContent = `${versionCount} ${versionCount === 1 ? 'version' : 'versions'} on Jellyfin`;
        panel.replaceChildren(header);

        groups.forEach(({ item, sources }) => {
            const group = document.createElement('div');
            group.className = 'jellyboxd-item-group';

            if (groups.length > 1) {
                const heading = document.createElement('div');
                heading.className = 'jellyboxd-item-heading';
                const year = Number(item?.ProductionYear);
                heading.textContent = `${item?.Name || 'Movie'}${Number.isFinite(year) ? ` (${year})` : ''}`;
                group.append(heading);
            }

            sources.forEach((source, index) => appendVersion(group, item, source, index));

            if (item?.Id) {
                const link = document.createElement('a');
                link.className = 'jellyboxd-details-link';
                link.href = buildJellyfinItemUrl(configuration.serverUrl, item.Id);
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.textContent = 'Open in Jellyfin ↗';
                group.append(link);
            }
            panel.append(group);
        });
    }

    function buildDetailsRequestUrl(serverUrl, matches) {
        const ids = [...new Set(matches.map((item) => item?.Id).filter(Boolean))];
        if (ids.length === 0) {
            throw new JellyfinRequestError('Jellyfin did not return item identifiers.');
        }

        const query = new URLSearchParams({
            ids: ids.join(','),
            recursive: 'true',
            fields: 'MediaSources,MediaStreams,ProductionYear,ProviderIds',
            enableImages: 'false',
            enableUserData: 'false',
            enableTotalRecordCount: 'false'
        });
        return `${serverUrl}/Items?${query}`;
    }

    async function loadMovieDetails() {
        if (!detailsOpen) return;
        if (detailsLoading) {
            renderDetailsStatus('Loading media details…', { loading: true });
            return;
        }
        detailsLoading = true;
        renderDetailsStatus('Loading media details…', { loading: true });

        const configuration = readConfiguration();
        const generation = requestGeneration;
        try {
            const response = await requestJson(
                buildDetailsRequestUrl(configuration.serverUrl, matchingMovies),
                configuration.apiKey
            );
            if (generation !== requestGeneration) return;
            detailsData = getItemsFromResponse(response);
            if (detailsOpen) renderMovieDetails(detailsData, configuration);
        } catch (error) {
            if (generation !== requestGeneration) return;
            console.error(`${SCRIPT_NAME}:`, error);
            if (detailsOpen) renderDetailsStatus('Could not load media details.', { retry: true });
        } finally {
            detailsLoading = false;
        }
    }

    async function toggleMovieDetails() {
        if (detailsOpen) {
            closeMovieDetails();
            return;
        }

        if (matchingMovies.length === 0) return;
        detailsOpen = true;
        const widget = document.getElementById(WIDGET_ID);
        widget?.setAttribute('aria-expanded', 'true');
        widget?.setAttribute('aria-label', `${currentView.message}. Hide media details.`);

        if (detailsData) {
            renderMovieDetails(detailsData, readConfiguration());
            return;
        }
        await loadMovieDetails();
    }

    function buildTitleRequestUrl(serverUrl, metadata) {
        const query = new URLSearchParams({
            searchTerm: metadata.title,
            includeItemTypes: 'Movie',
            recursive: 'true',
            limit: '10',
            fields: 'ProductionYear,ProviderIds',
            enableImages: 'false',
            enableUserData: 'false',
            enableTotalRecordCount: 'false'
        });
        return `${serverUrl}/Items?${query}`;
    }

    function buildTmdbRequestUrl(serverUrl, metadata) {
        if (!metadata.tmdbId || !metadata.year) return null;

        const query = new URLSearchParams({
            includeItemTypes: 'Movie',
            recursive: 'true',
            years: [metadata.year - 1, metadata.year, metadata.year + 1].join(','),
            fields: 'ProductionYear,ProviderIds',
            enableImages: 'false',
            enableUserData: 'false',
            enableTotalRecordCount: 'false'
        });
        return `${serverUrl}/Items?${query}`;
    }

    function requestJson(url, apiKey) {
        return new Promise((resolve, reject) => {
            let requestHandle = null;
            const clearActiveRequest = () => {
                if (activeRequest === requestHandle) activeRequest = null;
            };

            requestHandle = GM_xmlhttpRequest({
                method: 'GET',
                url,
                timeout: REQUEST_TIMEOUT_MS,
                headers: {
                    Accept: 'application/json',
                    Authorization: `MediaBrowser Token="${apiKey}"`
                },
                onload(response) {
                    clearActiveRequest();
                    if (response.status < 200 || response.status >= 300) {
                        reject(new JellyfinRequestError(`Jellyfin returned HTTP ${response.status}.`, {
                            status: response.status,
                            retryable: response.status === 0 || response.status === 408
                                || response.status === 429 || response.status >= 500
                        }));
                        return;
                    }

                    try {
                        resolve(JSON.parse(response.responseText));
                    } catch (error) {
                        reject(new JellyfinRequestError('Jellyfin returned invalid JSON.', {
                            retryable: true
                        }));
                    }
                },
                ontimeout() {
                    clearActiveRequest();
                    reject(new JellyfinRequestError('Jellyfin did not respond in time.', { retryable: true }));
                },
                onerror() {
                    clearActiveRequest();
                    reject(new JellyfinRequestError('Could not connect to Jellyfin.', { retryable: true }));
                },
                onabort() {
                    clearActiveRequest();
                    reject(new JellyfinRequestError('Request cancelled.'));
                }
            });
            activeRequest = requestHandle;
        });
    }

    function wait(milliseconds) {
        return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
    }

    async function finishMinimumLoading(startedAt, generation) {
        const remainingTime = MIN_LOADING_DURATION_MS - (Date.now() - startedAt);
        if (remainingTime > 0) await wait(remainingTime);
        return generation === requestGeneration;
    }

    function getItemsFromResponse(data) {
        if (!Array.isArray(data?.Items)) {
            throw new JellyfinRequestError('The Jellyfin response does not contain a movie list.', {
                retryable: true
            });
        }

        return data.Items;
    }

    async function findMovies(metadata, configuration, generation) {
        const tmdbRequestUrl = buildTmdbRequestUrl(configuration.serverUrl, metadata);
        if (tmdbRequestUrl) {
            const tmdbData = await requestJson(tmdbRequestUrl, configuration.apiKey);
            const tmdbMatches = findMatchingMoviesByTmdbId(getItemsFromResponse(tmdbData), metadata.tmdbId);
            if (tmdbMatches.length > 0) return tmdbMatches;
            if (generation !== requestGeneration) return [];
        }

        if (generation !== requestGeneration) return [];
        const titleData = await requestJson(
            buildTitleRequestUrl(configuration.serverUrl, metadata),
            configuration.apiKey
        );
        return findMatchingMoviesByTitle(getItemsFromResponse(titleData), metadata);
    }

    async function checkAvailability(metadata, configuration, generation, loadingStartedAt) {
        for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
            if (generation !== requestGeneration) return;

            if (RETRY_DELAYS_MS[attempt] > 0) {
                setWidgetState('loading', `Retrying ${attempt + 1}/${RETRY_DELAYS_MS.length}…`);
                await wait(RETRY_DELAYS_MS[attempt]);
                if (generation !== requestGeneration) return;
            }

            try {
                const matches = await findMovies(metadata, configuration, generation);
                if (generation !== requestGeneration) return;
                if (!await finishMinimumLoading(loadingStartedAt, generation)) return;

                matchingMovies = matches;
                detailsData = null;
                if (matches.length > 0) {
                    setWidgetState('available', 'Available on Jellyfin');
                } else {
                    setWidgetState('unavailable', 'Not available on Jellyfin');
                }
                return;
            } catch (error) {
                if (generation !== requestGeneration) return;
                const hasAnotherAttempt = attempt < RETRY_DELAYS_MS.length - 1;
                if (error.retryable && hasAnotherAttempt) continue;

                console.error(`${SCRIPT_NAME}:`, error);
                if (!await finishMinimumLoading(loadingStartedAt, generation)) return;
                const authenticationFailed = error.status === 401 || error.status === 403;
                setWidgetState(
                    'error',
                    authenticationFailed ? 'Invalid Jellyfin credentials' : 'Jellyfin check failed',
                    {
                        label: authenticationFailed ? 'Configure' : 'Retry',
                        onClick: authenticationFailed ? openSettings : () => initialize(true)
                    }
                );
                return;
            }
        }
    }

    function cancelActiveRequest() {
        requestGeneration += 1;
        if (activeRequest?.abort) activeRequest.abort();
        activeRequest = null;
    }

    function initialize(force = false) {
        const metadata = getMetadata();
        if (!metadata) return;

        const pageKey = `${location.pathname}|${metadata.title}|${metadata.year || ''}|${metadata.tmdbId || ''}`;
        const widgetExists = Boolean(document.getElementById(WIDGET_ID));
        if (!force && pageKey === activePageKey) {
            if (!widgetExists && currentView.state !== 'idle') renderWidgetState(currentView);
            return;
        }

        cancelActiveRequest();
        resetMovieDetails();
        activePageKey = pageKey;

        const configuration = readConfiguration();
        if (!configuration.serverUrl || !configuration.apiKey) {
            setWidgetState('configuration', 'Jellyfin is not configured', {
                label: 'Configure',
                onClick: openSettings
            });
            return;
        }

        if (/["\r\n]/.test(configuration.apiKey)) {
            setWidgetState('error', 'Invalid Jellyfin API key', {
                label: 'Configure',
                onClick: openSettings
            });
            return;
        }

        const loadingStartedAt = Date.now();
        setWidgetState('loading', 'Checking Jellyfin…');
        const generation = requestGeneration;
        void checkAvailability(metadata, configuration, generation, loadingStartedAt);
    }

    function scheduleInitialize(force = false) {
        initializeForced ||= force;
        window.clearTimeout(initializeTimer);
        initializeTimer = window.setTimeout(() => {
            const shouldForce = initializeForced;
            initializeForced = false;
            initialize(shouldForce);
        }, 120);
    }

    function openSettings() {
        document.getElementById(SETTINGS_ID)?.remove();
        const configuration = readConfiguration();

        const backdrop = document.createElement('div');
        backdrop.id = SETTINGS_ID;
        backdrop.innerHTML = `
            <form class="jellyboxd-dialog" role="dialog" aria-modal="true" aria-labelledby="jellyboxd-settings-title">
                <h2 id="jellyboxd-settings-title">Configure Jellyfin</h2>
                <p>Your server URL and API key stay in the userscript manager's local storage and are never added to the source code.</p>
                <label for="jellyboxd-server-url">Server address</label>
                <input id="jellyboxd-server-url" name="serverUrl" type="url" placeholder="https://jellyfin.example.com" required>
                <label for="jellyboxd-api-key">API key</label>
                <input id="jellyboxd-api-key" name="apiKey" type="password" autocomplete="off" required>
                <p class="jellyboxd-error" role="alert"></p>
                <div class="jellyboxd-actions">
                    <button type="button" data-action="clear">Clear data</button>
                    <button type="button" data-action="cancel">Cancel</button>
                    <button type="submit">Save and check</button>
                </div>
            </form>
        `;

        const form = backdrop.querySelector('form');
        const serverInput = form.elements.serverUrl;
        const apiKeyInput = form.elements.apiKey;
        const errorElement = backdrop.querySelector('.jellyboxd-error');
        serverInput.value = configuration.serverUrl;
        apiKeyInput.value = configuration.apiKey;

        function close() {
            backdrop.remove();
        }

        form.addEventListener('submit', (event) => {
            event.preventDefault();
            try {
                const serverUrl = normalizeServerUrl(serverInput.value);
                const apiKey = apiKeyInput.value.trim();
                if (!apiKey) throw new Error('Enter an API key.');
                if (/["\r\n]/.test(apiKey)) throw new Error('The API key contains invalid characters.');

                GM_setValue(STORAGE_KEYS.serverUrl, serverUrl);
                GM_setValue(STORAGE_KEYS.apiKey, apiKey);
                close();
                initialize(true);
            } catch (error) {
                errorElement.textContent = error.message;
            }
        });

        backdrop.querySelector('[data-action="cancel"]').addEventListener('click', close);
        backdrop.querySelector('[data-action="clear"]').addEventListener('click', () => {
            cancelActiveRequest();
            GM_deleteValue(STORAGE_KEYS.serverUrl);
            GM_deleteValue(STORAGE_KEYS.apiKey);
            serverInput.value = '';
            apiKeyInput.value = '';
            errorElement.textContent = 'Configuration cleared.';
            setWidgetState('configuration', 'Jellyfin is not configured', {
                label: 'Configure',
                onClick: openSettings
            });
        });
        backdrop.addEventListener('click', (event) => {
            if (event.target === backdrop) close();
        });
        backdrop.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') close();
        });

        document.body.append(backdrop);
        serverInput.focus();
    }

    GM_registerMenuCommand('Configure Jellyfin…', openSettings);
    GM_registerMenuCommand('Check again', () => initialize(true));

    const observer = new MutationObserver(() => scheduleInitialize(false));
    observer.observe(document.documentElement, { childList: true, subtree: true });

    window.addEventListener('pageshow', () => scheduleInitialize(false));
    window.addEventListener('popstate', () => scheduleInitialize(false));
    window.addEventListener('online', () => {
        if (lastState === 'error' || lastState === 'loading') scheduleInitialize(true);
    });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && lastState === 'error') scheduleInitialize(true);
    });

    initialize();
})();
