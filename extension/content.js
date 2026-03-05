// content.js — Runs ONLY on xylem.live pages
// Handles: (1) Auto-click NOTE tab, (2) After PDF open detected, double-press back
// COMPLETELY SEPARATE from background.js — does not interfere

(function () {
    // Check if extension is enabled first
    chrome.storage.local.get(['extensionEnabled'], (res) => {
        if (res.extensionEnabled === false) return; // Disabled — do nothing
        initContentScript();
    });

    function initContentScript() {
        // --- FEATURE 1: Auto-click the NOTE tab ---
        // Runs whenever we're on a batch/topic page
        function clickNoteTab() {
            // Match any tab/button with exact text "NOTE"
            const allTabs = Array.from(document.querySelectorAll('button, a, [role="tab"], .tab, li'));
            const noteTab = allTabs.find(el => el.innerText?.trim() === 'NOTE');
            if (noteTab && !noteTab.classList.contains('active') && !noteTab.classList.contains('selected')) {
                noteTab.click();
                console.log('[Snatcher] NOTE tab auto-clicked');
            }
        }

        // Try immediately on page load
        clickNoteTab();

        // Also try after a short delay (some pages render tabs after JS runs)
        setTimeout(clickNoteTab, 1200);
        setTimeout(clickNoteTab, 2500);

        // Watch for DOM changes (SPA navigation within Xylem)
        const observer = new MutationObserver(() => {
            clickNoteTab();
        });
        observer.observe(document.body, { childList: true, subtree: true });

        // --- FEATURE 2: After PDF is detected (background sends message), double-press Back ---
        chrome.runtime.onMessage.addListener((message) => {
            if (message.type === 'PDF_DETECTED_GO_BACK') {
                console.log('[Snatcher] PDF detected — going back in 5s');
                setTimeout(() => {
                    history.back();
                    // Second back press after a brief moment
                    setTimeout(() => history.back(), 500);
                    console.log('[Snatcher] Double-back executed');
                }, 5000);
            }
        });
    }
})();
