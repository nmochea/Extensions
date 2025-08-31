const EXCLUDE_DOMAINS = [
    "www.googletagmanager.com", "www.google-analytics.com", "connect.facebook.net",
    "www.facebook.com", "static.xx.fbcdn.net", "www.gstatic.com", "static.ads-twitter.com",
    "snap.licdn.com", "static.hotjar.com", "cdn-cookieyes.com", "www.google.com",
    "script.hotjar.com", "cdn.jsdelivr.net", "googleads.g.doubleclick.net", "analytics.tiktok.com",
    "sslwidget.criteo.com", "scripts.clarity.ms", "avd.innity.net", "heatmaps.monsido.com",
    "sf16-va.tiktokcdn.com", "static.addtoany.com", "app-script.monsido.com", "www.clarity.ms",
    "d.turn.com", "dsp-media.eskimi.com", "dynamic.criteo.com", "cdna.pokkt.com", "track.omguk.com",
    "cdn.cookielaw.org", "assets.adobedtm.com", "ce.mf.marsflag.com", "fast.fonts.net"
];

const browserApi = typeof browser !== 'undefined' ? browser : chrome;

const out = document.getElementById('out');
const statusEl = document.getElementById('status');
const searchBox = document.getElementById('search');
const btnPrev = document.getElementById('prev');
const btnNext = document.getElementById('next');
const patternMode = document.getElementById('patternMode');

let currentMatch = -1;
let matches = [];
let patternsCache = {};

function updateStatus(s) {
    statusEl.textContent = s;
}

async function getActiveTab() {
    const [tab] = await browserApi.tabs.query({
        active: true,
        currentWindow: true
    });
    return tab;
}

function saveLastScan(results, mode) {
    browserApi.storage.local.set({
        lastScanResults: results,
        lastScanMode: mode
    });
}

async function loadLastScan() {
    const data = await browserApi.storage.local.get(["lastScanResults", "lastScanMode"]);
    if (data.lastScanResults) {
        renderResults(data.lastScanResults);
        if (data.lastScanMode) patternMode.value = data.lastScanMode;
        updateStatus(`🔄 Restored previous scan (${data.lastScanMode || 'normal'})`);
    }
}

function resetSearch() {
    matches = [];
    currentMatch = -1;
}

function focusMatch() {
    matches.forEach(m => m.classList.remove("active-match"));
    if (matches[currentMatch]) {
        matches[currentMatch].classList.add("active-match");
        matches[currentMatch].scrollIntoView({
            block: "center",
            behavior: "smooth"
        });
    }
}

function cacheOriginalContent() {
    [...out.querySelectorAll(".links-list")].forEach(list => {
        if (!list.dataset.original) list.dataset.original = list.innerHTML;
    });
}

function restoreOriginalContent() {
    [...out.querySelectorAll(".links-list")].forEach(list => {
        if (list.dataset.original) list.innerHTML = list.dataset.original;
    });
}

async function collectUltimateJS(tabId, baseUrl) {
    const [{ result }] = await browserApi.scripting.executeScript({
        target: { tabId },
        func: (base) => {
            const urls = new Set();
            const abs = (u) => {
                try { return new URL(u, base).href; } catch { return null; }
            };

            const pageUrl = location.href;

            document.querySelectorAll("script[src]").forEach(s => {
                const u = abs(s.src);
                if (u) urls.add(u);
            });

            document.querySelectorAll("link[rel][as][href]").forEach(l => {
                const rel = l.rel.toLowerCase(),
                    as = l.as.toLowerCase();
                if ((rel === "preload" || rel === "prefetch") && as === "script") {
                    const u = abs(l.href);
                    if (u) urls.add(u);
                }
            });

            document.querySelectorAll("*").forEach(el => {
                [...el.attributes].forEach(attr => {
                    if (!attr.value) return;
                    const val = attr.value.trim();
                    if (val.match(/\.(js|mjs|cjs|ts)(\?|#|$)/i)) {
                        const u = abs(val);
                        if (u) urls.add(u);
                    }
                    if (attr.name.startsWith("data-") && val.match(/\.(js|mjs|cjs|ts)/i)) {
                        const u = abs(val);
                        if (u) urls.add(u);
                    }
                });
            });

            const jsAttrs = [
                "component-url", "renderer-url", "data-src", "data-href",
                "data-main", "entry", "lazy-src", "async-src", "data-client"
            ];
            jsAttrs.forEach(attrName => {
                document.querySelectorAll(`[${attrName}]`).forEach(el => {
                    const val = el.getAttribute(attrName);
                    if (val) {
                        const u = abs(val);
                        if (u) urls.add(u);
                    }
                });
            });

            const html = document.documentElement.innerHTML;
            const relativeRegex = /(?:\/|\.\/|\.\.\/)?[\w\-_\/]+?\.(js|mjs|cjs|ts)(?:[?#][^"'<>]*)?/gi;
            let m;
            while ((m = relativeRegex.exec(html)) !== null) {
                const u = abs(m[0]);
                if (u) urls.add(u);
            }

            const inlineRegex = /["'`](\/[\w\-./]+?\.(js|mjs|cjs|ts)(\?[^\s"'`<>]*)?)["'`]/gi;
            while ((m = inlineRegex.exec(html)) !== null) {
                const u = abs(m[1]);
                if (u) urls.add(u);
            }

            return Array.from(urls).filter(Boolean);
        },
        args: [baseUrl]
    });

    return result || [];
}


async function loadPatterns(mode) {
    if (mode === "normal") return null;
    if (patternsCache[mode]) return patternsCache[mode];
    try {
        const res = await fetch(browserApi.runtime.getURL(`${mode}.json`));
        const list = await res.json();
        patternsCache[mode] = list;
        return list;
    } catch {
        updateStatus(`Pattern file ${mode}.json not found`);
        return [];
    }
}

function renderResults(results) {
    out.innerHTML = "";
    results.forEach(item => {
        const container = document.createElement("div");
        const header = document.createElement("div");
        header.className = "url-item";

        const icon = document.createElement("img");
        icon.className = "url-icon";
        icon.src = "icons/Down.svg";
        icon.width = 16;
        icon.height = 16;

        const title = document.createElement("span");
        title.textContent = item.url;
        header.appendChild(icon);
        header.appendChild(title);

        const linksList = document.createElement("div");
        linksList.className = "links-list";
        linksList.style.display = "none";
        item.links.forEach(link => {
            const div = document.createElement("div");
            div.textContent = link;
            linksList.appendChild(div);
        });

        header.addEventListener("click", () => {
            const isOpen = linksList.style.display === "block";
            if (isOpen) {
                linksList.querySelectorAll("mark").forEach(mark => {
                    mark.replaceWith(mark.textContent);
                });
                linksList.style.display = "none";
                icon.src = "icons/Down.svg";
            } else {
                linksList.style.display = "block";
                icon.src = "icons/Up.svg";
                if (searchBox.value.trim()) doSearch();
            }
        });

        container.appendChild(header);
        container.appendChild(linksList);
        out.appendChild(container);
    });
}

async function scan() {
    out.innerHTML = "";
    const mode = patternMode.value;
    const patterns = await loadPatterns(mode);
    const regexPatterns = (patterns || []).map(p => {
        try { return new RegExp(p); } catch { return new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); }
    });

    const scanBtn = document.getElementById('scan');
    scanBtn.disabled = true;
    updateStatus('Gathering scripts...');

    const tab = await getActiveTab();
    const scriptURLs = await collectUltimateJS(tab.id, tab.url);
    if (!scriptURLs.length) {
        updateStatus('No scripts found.');
        scanBtn.disabled = false;
        return;
    }

    updateStatus(`Found ${scriptURLs.length} script(s). Fetching...`);
    let allResults = [],
        processedCount = 0;

    for (const url of scriptURLs) {
        let hostname = "";
        try { hostname = new URL(url).hostname; } catch {}
        if (EXCLUDE_DOMAINS.includes(hostname)) continue;

        try {
            updateStatus(`Scanning: ${url}`);
            const res = await fetch(url, { cache: 'no-store', credentials: 'omit' });
            if (!res.ok) continue;

            const text = await res.text();
            const matchesSet = new Set();

            // credits to the wonderful regex by: https://github.com/GerbenJavado/LinkFinder
            const LINKFINDER_REGEX = /(?:"|')(((?:[a-zA-Z]{1,10}:\/\/|\/\/)[^"'/]{1,}\.[a-zA-Z]{2,}[^"']{0,})|((?:\/|\.\.\/|\.\/)[^"'><,;| *()(%%$^\/\\\[\]][^"'><,;|()]{1,})|([a-zA-Z0-9_\-\/]{1,}\/[a-zA-Z0-9_\-\/.]{1,}\.(?:[a-zA-Z]{1,4}|action)(?:[\?|#][^"|']{0,}|))|([a-zA-Z0-9_\-\/]{1,}\/[a-zA-Z0-9_\-\/]{3,}(?:[\?|#][^"|']{0,}|))|([a-zA-Z0-9_\-]{1,}\.(?:php|asp|aspx|jsp|json|action|html|js|txt|xml)(?:[\?|#][^"|']{0,}|)))(?:"|')/g;

            let m;
            while ((m = LINKFINDER_REGEX.exec(text)) !== null) {
                const hit = m[1];
                if (!hit) continue;
                if (mode === "normal") matchesSet.add(hit);
                else {
                    for (const r of regexPatterns) {
                        if (r.test(hit)) { matchesSet.add(hit); break; }
                    }
                }
            }

            if (matchesSet.size > 0) allResults.push({ url, links: [...matchesSet] });
        } catch (e) {
            console.error(`Failed ${url}:`, e);
        } finally {
            processedCount++;
            updateStatus(`Completed ${processedCount} of ${scriptURLs.length}`);
        }
    }

    renderResults(allResults);
    saveLastScan(allResults, mode);
    updateStatus(`✅ Done. ${allResults.length} result(s) found in ${scriptURLs.length} script(s).`);
    resetSearch();
    scanBtn.disabled = false;
}

function doSearch() {
    const q = searchBox.value.trim();
    resetSearch();
    cacheOriginalContent();
    restoreOriginalContent();
    if (!q) return;
    const regex = new RegExp(q.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"), "gi");
    [...out.querySelectorAll(".links-list")].forEach(list => {
        const walker = document.createTreeWalker(list, NodeFilter.SHOW_TEXT, null, false);
        const textNodes = [];
        while (walker.nextNode()) textNodes.push(walker.currentNode);
        textNodes.forEach(node => {
            const text = node.textContent;
            let match, lastIndex = 0;
            const frag = document.createDocumentFragment();
            regex.lastIndex = 0;
            while ((match = regex.exec(text)) !== null) {
                if (match.index > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
                const mark = document.createElement("mark");
                mark.textContent = match[0];
                frag.appendChild(mark);
                lastIndex = match.index + match[0].length;
                if (match.index === regex.lastIndex) regex.lastIndex++;
            }
            if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));
            if (frag.childNodes.length > 0) node.replaceWith(frag);
        });
    });
    matches = [...out.querySelectorAll(".links-list[style*='block'] mark")];
    if (matches.length) {
        currentMatch = 0;
        focusMatch();
    }
}

// ------------------- Event Listeners -------------------
searchBox.addEventListener('input', doSearch);
btnNext.addEventListener('click', () => {
    if (!matches.length) return;
    currentMatch = (currentMatch + 1) % matches.length;
    focusMatch();
});
btnPrev.addEventListener('click', () => {
    if (!matches.length) return;
    currentMatch = (currentMatch - 1 + matches.length) % matches.length;
    focusMatch();
});
document.getElementById('scan').addEventListener('click', scan);
document.getElementById('save').addEventListener('click', async() => {
    const tab = await getActiveTab();
    let name = 'results.txt';
    try {
        const u = new URL(tab.url);
        name = `${u.hostname}-results.txt`;
    } catch {}
    const data = await browserApi.storage.local.get("lastScanResults");
    const results = data.lastScanResults || [];
    let text = "";
    results.forEach(item => {
        text += `[+] ${item.url}\n`;
        item.links.forEach(link => text += `${link}\n`);
        text += `\n`;
    });
    const blob = new Blob([text], {
        type: 'text/plain;charset=utf-8'
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
    updateStatus(`💾 Saved ${name}`);
});

loadLastScan();