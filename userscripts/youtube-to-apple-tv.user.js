// ==UserScript==
// @name         YouTube → Apple TV
// @namespace    https://ulnihnw.net/
// @version      1.4.0
// @description  Spela aktuell YouTube-video på Apple TV via apple-tv-proxy
// @match        https://www.youtube.com/*
// @grant        GM_xmlhttpRequest
// @connect      api.ulnihnw.net
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const API_BASE =
        'https://api.ulnihnw.net/api/apple-tv';

    const CONTAINER_ID =
        'apple-tv-cast-buttons';

    const TOAST_ID =
        'apple-tv-cast-toast';

    let cachedTargets = null;
    let retryTimer = null;


    /*
     * Anropa Apple TV API.
     */
    function apiRequest(method, path, body = null) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: method,

                url:
                    `${API_BASE}${path}`,

                headers:
                    body
                        ? {
                            'Content-Type':
                                'application/json'
                        }
                        : {},

                data:
                    body
                        ? JSON.stringify(body)
                        : undefined,

                timeout: 10000,

                onload(response) {
                    let data = null;

                    try {
                        data =
                            JSON.parse(
                                response.responseText
                            );
                    } catch {
                        // Ignorera om svaret inte är JSON.
                    }

                    if (
                        response.status >= 200 &&
                        response.status < 300
                    ) {
                        resolve(data);
                        return;
                    }

                    reject(
                        new Error(
                            data?.detail ??
                            `API svarade HTTP ${response.status}`
                        )
                    );
                },

                onerror() {
                    reject(
                        new Error(
                            'Kunde inte kontakta Apple TV API:t'
                        )
                    );
                },

                ontimeout() {
                    reject(
                        new Error(
                            'Timeout mot Apple TV API:t'
                        )
                    );
                }
            });
        });
    }


    /*
     * Liten statusruta nere till höger.
     */
    function showToast(message, isError = false) {
        let toast =
            document.getElementById(
                TOAST_ID
            );

        if (!toast) {
            toast =
                document.createElement(
                    'div'
                );

            toast.id =
                TOAST_ID;

            Object.assign(
                toast.style,
                {
                    position: 'fixed',
                    right: '24px',
                    bottom: '90px',
                    zIndex: '999999',

                    padding:
                        '11px 16px',

                    borderRadius:
                        '10px',

                    fontSize:
                        '14px',

                    fontFamily:
                        'Roboto, Arial, sans-serif',

                    fontWeight:
                        '500',

                    boxShadow:
                        '0 3px 14px rgba(0,0,0,0.35)',

                    transition:
                        'opacity 0.2s ease',

                    pointerEvents:
                        'none'
                }
            );

            document.body.appendChild(
                toast
            );
        }

        toast.textContent =
            message;

        toast.style.background =
            isError
                ? '#b3261e'
                : '#202124';

        toast.style.color =
            '#ffffff';

        toast.style.opacity =
            '1';

        clearTimeout(
            toast._timer
        );

        toast._timer =
            setTimeout(
                () => {
                    toast.style.opacity =
                        '0';
                },
                2500
            );
    }


    /*
     * Är vi på en vanlig YouTube-video?
     */
    function isVideoPage() {
        return (
            location.pathname === '/watch' ||
            location.pathname.startsWith(
                '/live/'
            )
        );
    }


    /*
     * Hitta högra delen av åtgärdsraden.
     *
     * Vi skriver INTE i
     * #top-level-buttons-computed eftersom det
     * tidigare gav Trusted Types/CSP-problem.
     */
    function findActionHost() {
        const selectors = [
            'ytd-watch-metadata #actions',
            '#above-the-fold #actions',
            '#actions'
        ];

        for (
            const selector
            of selectors
        ) {
            const node =
                document.querySelector(
                    selector
                );

            if (node) {
                return node;
            }
        }

        return null;
    }


    /*
     * Hämta targets från API:t.
     */
    async function getTargets() {
        if (cachedTargets) {
            return cachedTargets;
        }

        const data =
            await apiRequest(
                'GET',
                '/targets'
            );

        if (
            !data ||
            !Array.isArray(
                data.targets
            ) ||
            data.targets.length === 0
        ) {
            throw new Error(
                'API:t returnerade inga Apple TV-mål'
            );
        }

        cachedTargets =
            data;

        return data;
    }


    /*
     * Skicka aktuell URL till valt target.
     */
    async function playOnTarget(
        target,
        button
    ) {
        if (!isVideoPage()) {
            showToast(
                'Öppna först en YouTube-video.',
                true
            );

            return;
        }

        const oldText =
            button.textContent;

        button.disabled =
            true;

        button.textContent =
            'Skickar…';

        try {
            const result =
                await apiRequest(
                    'POST',
                    '/play',
                    {
                        target:
                            target,

                        url:
                            location.href
                    }
                );

            showToast(
                `▶ Startad på ${
                    result?.target ??
                    target
                }`
            );

        } catch (error) {
            console.error(
                'Apple TV:',
                error
            );

            showToast(
                error.message,
                true
            );

        } finally {
            button.disabled =
                false;

            button.textContent =
                oldText;
        }
    }


    /*
     * Skapa en YouTube-liknande knapp.
     */
    function createButton(target) {
        const button =
            document.createElement(
                'button'
            );

        button.type =
            'button';

        /*
         * Ingen innerHTML.
         * YouTube använder Trusted Types.
         */
        button.textContent =
            `TV  ${target}`;

        button.title =
            `Spela aktuell video på ${target}`;

        Object.assign(
            button.style,
            {
                height:
                    '36px',

                minHeight:
                    '36px',

                border:
                    'none',

                borderRadius:
                    '18px',

                padding:
                    '0 16px',

                background:
                    'var(--yt-spec-badge-chip-background, rgba(0,0,0,0.05))',

                color:
                    'var(--yt-spec-text-primary, #0f0f0f)',

                fontFamily:
                    'Roboto, Arial, sans-serif',

                fontSize:
                    '14px',

                fontWeight:
                    '500',

                lineHeight:
                    '36px',

                cursor:
                    'pointer',

                whiteSpace:
                    'nowrap',

                boxSizing:
                    'border-box',

                transition:
                    'background-color 0.15s ease, filter 0.15s ease'
            }
        );


        button.addEventListener(
            'mouseenter',
            () => {
                if (
                    !button.disabled
                ) {
                    button.style.filter =
                        'brightness(0.92)';
                }
            }
        );


        button.addEventListener(
            'mouseleave',
            () => {
                button.style.filter =
                    '';
            }
        );


        button.addEventListener(
            'click',
            () => {
                playOnTarget(
                    target,
                    button
                );
            }
        );

        return button;
    }


    /*
     * Lägg in våra knappar i YouTubes
     * åtgärdsrad.
     */
    async function installButtons() {
        if (!isVideoPage()) {
            document
                .getElementById(
                    CONTAINER_ID
                )
                ?.remove();

            return false;
        }


        /*
         * Redan installerade.
         */
        if (
            document.getElementById(
                CONTAINER_ID
            )
        ) {
            return true;
        }


        const host =
            findActionHost();

        if (!host) {
            return false;
        }


        try {
            const data =
                await getTargets();


            const container =
                document.createElement(
                    'div'
                );

            container.id =
                CONTAINER_ID;


            Object.assign(
                container.style,
                {
                    display:
                        'inline-flex',

                    alignItems:
                        'center',

                    gap:
                        '8px',

                    marginLeft:
                        '8px',

                    flexShrink:
                        '0'
                }
            );


            for (
                const target
                of data.targets
            ) {
                container.appendChild(
                    createButton(
                        target
                    )
                );
            }


            /*
             * Lägg vår container längst sist
             * i YouTubes action-area.
             */
            host.appendChild(
                container
            );


            console.log(
                'Apple TV-knappar installerade'
            );

            return true;

        } catch (error) {
            console.error(
                'Apple TV:',
                error
            );

            showToast(
                `Apple TV: ${error.message}`,
                true
            );

            return false;
        }
    }


    /*
     * YouTube bygger sidan asynkront.
     * Försök några gånger tills action-raden finns.
     */
    function scheduleInstall() {
        if (retryTimer) {
            clearInterval(
                retryTimer
            );
        }

        let attempts =
            0;

        retryTimer =
            setInterval(
                async () => {
                    attempts++;

                    const success =
                        await installButtons();

                    if (
                        success ||
                        attempts >= 40
                    ) {
                        clearInterval(
                            retryTimer
                        );

                        retryTimer =
                            null;
                    }
                },
                250
            );
    }


    /*
     * Första sidladdningen.
     */
    scheduleInstall();


    /*
     * YouTube är en SPA.
     *
     * När man klickar vidare till nästa video
     * laddas inte hela webbsidan om.
     */
    document.addEventListener(
        'yt-navigate-finish',
        () => {
            document
                .getElementById(
                    CONTAINER_ID
                )
                ?.remove();

            setTimeout(
                scheduleInstall,
                300
            );
        }
    );

})();
