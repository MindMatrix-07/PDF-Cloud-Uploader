// content.js — Runs on xylem.live, pw.live, and khazana.in pages
// SEPARATE from background.js — 3 independent features

// ── Browser compatibility shim ────────────────────────────────────────────
const _browser = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;

(function () {

    // ── CHECK ENABLED ────────────────────────────────────────────────
    _browser.storage.local.get(['extensionEnabled'], (res) => {
        if (res.extensionEnabled === false) return;
        init();
    });

    function init() {
        // Run all features
        autoClickNoteTab();
        captureChapterName();
        interceptPdfLinks();
    }


    // ─────────────────────────────────────────────────────────────────
    // FEATURE 1: Auto-click NOTE tab
    // Xylem is a React SPA — tabs render async, so we poll aggressively
    // ─────────────────────────────────────────────────────────────────
    function autoClickNoteTab() {
        let attempts = 0;
        const maxAttempts = 30; // 15 seconds max

        function tryClick() {
            if (attempts >= maxAttempts) return;
            attempts++;

            // Find any button/link whose visible text is exactly "NOTE"
            const allClickable = document.querySelectorAll('button, a, [role="tab"], li, span, div');
            for (const el of allClickable) {
                if (el.innerText?.trim() === 'NOTE') {
                    // Make sure it's visible and not already selected
                    const isActive = el.classList.contains('active') ||
                        el.getAttribute('aria-selected') === 'true' ||
                        el.classList.contains('selected') ||
                        el.style.color === 'rgb(0, 150, 255)';
                    if (!isActive) {
                        el.click();
                        console.log('[Snatcher] NOTE tab clicked');
                    }
                    return; // Found it, stop polling
                }
            }
            // Not found yet, try again in 500ms
            setTimeout(tryClick, 500);
        }

        tryClick();

        // Also re-run on SPA route changes (Xylem uses client-side routing)
        let lastUrl = location.href;
        setInterval(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                attempts = 0; // Reset and try again on page change
                setTimeout(tryClick, 800); // Give React time to render
            }
        }, 500);
    }


    // ─────────────────────────────────────────────────────────────────
    // FEATURE 2: Capture Chapter name from page heading
    // Xylem shows the chapter as a big h1/h2 — we read it and save it
    // ─────────────────────────────────────────────────────────────────
    function captureChapterName() {
        function tryCapture() {
            // Matches "UNITS AND MEASUREMENTS (2026)" — strip the year
            const heading = document.querySelector('h1, h2, .batch-name, [class*="title"], [class*="heading"]');
            if (heading) {
                const text = heading.innerText.replace(/\(\d{4}\)/g, '').trim().toUpperCase();
                if (text && text.length > 3 && text !== 'GENERAL') {
                    _browser.storage.local.set({ savedChapter: text });
                    _browser.runtime.sendMessage({ type: 'SET_CHAPTER', chapter: text }).catch(() => { });
                    console.log('[Snatcher] Chapter set:', text);
                }
            }
        }

        tryCapture();
        setTimeout(tryCapture, 1500);
        setTimeout(tryCapture, 3000);

        // Re-capture on SPA navigation
        let lastUrl = location.href;
        setInterval(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                setTimeout(tryCapture, 1200);
            }
        }, 500);
    }


    // ─────────────────────────────────────────────────────────────────
    // FEATURE 3: Intercept PDF link clicks → go back after 5 seconds
    // We attach to links BEFORE they navigate, so we can still fire back
    // ─────────────────────────────────────────────────────────────────
    function interceptPdfLinks() {
        let backScheduled = false;

        function attachListeners() {
            const links = document.querySelectorAll('a[href*=".pdf"], a[href*="pdf-viewer"], a[href*="pdf_viewer"], a[href*="pdf_url"]');
            links.forEach(link => {
                if (link._snatched) return;
                link._snatched = true;
                link.addEventListener('click', () => {
                    if (backScheduled) return;
                    backScheduled = true;
                    console.log('[Snatcher] PDF link clicked — back in 5s');
                    setTimeout(() => {
                        history.back();
                        setTimeout(() => {
                            history.back();
                            backScheduled = false;
                        }, 600);
                    }, 2000); // Reduced from 5s — PDF is fetched client-side immediately, no need to stay longer
                });
            });
        }

        // Run now, and keep scanning as React renders new links
        attachListeners();
        setInterval(attachListeners, 1500);
    }

})();
