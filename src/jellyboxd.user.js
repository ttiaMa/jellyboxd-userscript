// ==UserScript==
// @name         Jellyboxd
// @namespace    https://github.com/ttiaMa/jellyboxd-userscript
// @version      2.0.0
// @description  Shows whether a Letterboxd movie is available in your Jellyfin library.
// @author       Mattia
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
    const SETTINGS_ID = 'jellyboxd-settings';
    const STORAGE_KEYS = Object.freeze({
        serverUrl: 'jellyfinServerUrl',
        apiKey: 'jellyfinApiKey'
    });
    const RETRY_DELAYS_MS = [0, 1500, 4000];
    const REQUEST_TIMEOUT_MS = 12000;
    const MIN_LOADING_DURATION_MS = 1000;

    let activePageKey = '';
    let activeRequest = null;
    let requestGeneration = 0;
    let initializeTimer = null;
    let initializeForced = false;
    let lastState = 'idle';
    let currentView = { state: 'idle', message: '', action: null };

    GM_addStyle(`
        #${WIDGET_ID} {
            --jellyboxd-accent: #f0b429;
            align-items: center;
            background: color-mix(in srgb, var(--jellyboxd-accent) 18%, #181818);
            border: 1px solid color-mix(in srgb, var(--jellyboxd-accent) 65%, transparent);
            border-radius: 5px;
            box-sizing: border-box;
            color: #fff;
            display: flex;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 12px;
            font-weight: 700;
            gap: 8px;
            letter-spacing: .2px;
            margin-bottom: 15px;
            padding: 7px 10px;
            width: fit-content;
        }

        #${WIDGET_ID}[data-state="available"] { --jellyboxd-accent: #00a4dc; }
        #${WIDGET_ID}[data-state="unavailable"] { --jellyboxd-accent: #667788; }
        #${WIDGET_ID}[data-state="error"] { --jellyboxd-accent: #e45b4f; }
        #${WIDGET_ID}[data-state="configuration"] { --jellyboxd-accent: #f0b429; }

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

        #${SETTINGS_ID} {
            align-items: center;
            background: rgba(0, 0, 0, .72);
            display: flex;
            inset: 0;
            justify-content: center;
            padding: 20px;
            position: fixed;
            z-index: 2147483647;
        }

        #${SETTINGS_ID} .jellyboxd-dialog {
            background: #202428;
            border: 1px solid #44505a;
            border-radius: 8px;
            box-shadow: 0 16px 50px rgba(0, 0, 0, .5);
            box-sizing: border-box;
            color: #fff;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            max-width: 460px;
            padding: 22px;
            width: 100%;
        }

        #${SETTINGS_ID} h2 { font-size: 20px; margin: 0 0 8px; }
        #${SETTINGS_ID} p { color: #b7c0c7; font-size: 13px; line-height: 1.45; margin: 0 0 18px; }
        #${SETTINGS_ID} label { display: block; font-size: 13px; font-weight: 700; margin: 14px 0 5px; }
        #${SETTINGS_ID} input {
            background: #111417;
            border: 1px solid #56616a;
            border-radius: 4px;
            box-sizing: border-box;
            color: #fff;
            font: inherit;
            padding: 9px 10px;
            width: 100%;
        }
        #${SETTINGS_ID} .jellyboxd-error { color: #ff8c84; margin: 10px 0 0; min-height: 18px; }
        #${SETTINGS_ID} .jellyboxd-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 18px; }
        #${SETTINGS_ID} button {
            background: #38434b;
            border: 0;
            border-radius: 4px;
            color: #fff;
            cursor: pointer;
            font: inherit;
            padding: 8px 12px;
        }
        #${SETTINGS_ID} button[type="submit"] { background: #00a4dc; font-weight: 700; }
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

    function findMatchingMovieByTitle(items, metadata) {
        const expectedTitle = normalizeTitle(metadata.title);

        return items.find((item) => {
            if (!item?.Name || normalizeTitle(item.Name) !== expectedTitle) return false;

            const productionYear = Number(item.ProductionYear);
            if (!metadata.year || !Number.isFinite(productionYear)) return true;
            return productionYear === metadata.year;
        }) || null;
    }

    function getProviderId(item, providerName) {
        const providerEntry = Object.entries(item?.ProviderIds || {})
            .find(([name]) => name.toLocaleLowerCase() === providerName.toLocaleLowerCase());
        return providerEntry ? String(providerEntry[1]) : null;
    }

    function findMatchingMovieByTmdbId(items, tmdbId) {
        return items.find((item) => getProviderId(item, 'tmdb') === String(tmdbId)) || null;
    }

    function getWidgetPlacement() {
        const synopsis = document.querySelector('.production-synopsis');
        if (synopsis) return { parent: synopsis, before: synopsis.firstChild };

        const titleHeader = document.querySelector('h1.headline-1');
        if (titleHeader?.parentNode) return { parent: titleHeader.parentNode, before: titleHeader.nextSibling };

        return null;
    }

    function ensureWidget() {
        const existing = document.getElementById(WIDGET_ID);
        if (existing) return existing;

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

        widget.append(spinner, message);
        placement.parent.insertBefore(widget, placement.before);
        return widget;
    }

    function renderWidgetState(view) {
        const widget = ensureWidget();
        if (!widget) return;

        widget.dataset.state = view.state;
        widget.querySelector('.jellyboxd-message').textContent = view.message;
        widget.querySelector('button')?.remove();

        if (view.action) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = view.action.label;
            button.addEventListener('click', view.action.onClick);
            widget.append(button);
        }
    }

    function setWidgetState(state, message, action = null) {
        lastState = state;
        currentView = { state, message, action };
        renderWidgetState(currentView);
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

    async function findMovie(metadata, configuration, generation) {
        const tmdbRequestUrl = buildTmdbRequestUrl(configuration.serverUrl, metadata);
        if (tmdbRequestUrl) {
            const tmdbData = await requestJson(tmdbRequestUrl, configuration.apiKey);
            const tmdbMatch = findMatchingMovieByTmdbId(getItemsFromResponse(tmdbData), metadata.tmdbId);
            if (tmdbMatch) return tmdbMatch;
            if (generation !== requestGeneration) return null;
        }

        if (generation !== requestGeneration) return null;
        const titleData = await requestJson(
            buildTitleRequestUrl(configuration.serverUrl, metadata),
            configuration.apiKey
        );
        return findMatchingMovieByTitle(getItemsFromResponse(titleData), metadata);
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
                const match = await findMovie(metadata, configuration, generation);
                if (generation !== requestGeneration) return;
                if (!await finishMinimumLoading(loadingStartedAt, generation)) return;

                if (match) {
                    setWidgetState('available', '✓ Available on Jellyfin');
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
