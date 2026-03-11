const CACHE_KEY = "pgp:23andme-stats";

function isCacheWithinMonths$1(savedAt, months = 3) {
    if (!savedAt) return false;
    const savedDate = new Date(savedAt);
    if (Number.isNaN(savedDate.getTime())) return false;

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    return savedDate >= cutoff;
}

async function getCachedStats() {
    console.log("getCachedStats-------------------");
    console.log("Checking local cache for stats summary...");

    if (!window.localforage) return null;
    try {
        const cached = await window.localforage.getItem(CACHE_KEY);
        if (!cached) return null;

        const { savedAt, stats, source } = cached;

        if (isCacheWithinMonths$1(savedAt)) {
            const age = Date.now() - new Date(savedAt).getTime();
            console.log(`Using cached stats (${Math.round(age / (24 * 60 * 60 * 1000))} days old)`);
            return { stats, source: `${source} (cached)` };
        }
        console.log("Failed to read stats cache:expired or missing, fetching fresh data");
        return null;
    } catch (e) {
        console.warn("stats cache read error:", e);
        return null;
    }
}

async function setCachedStats(stats, source) {
    if (!window.localforage) return;
    await window.localforage.setItem(CACHE_KEY, {
        savedAt: new Date().toISOString(),
        stats,
        source
    });
}

async function loadStats(options = {}) {
    const forceRefresh = options.forceRefresh === true;
    const sourceStatusEl = document.getElementById("sourceStatus");
    const forceRefreshBtn = document.getElementById("forceRefreshStatsBtn");
    if (sourceStatusEl) sourceStatusEl.textContent = "Source: checking...";
    if (forceRefreshBtn) forceRefreshBtn.disabled = true;

    const WORKER_BASE = "https://lorena-api.lorenasandoval88.workers.dev/?url=";
    // If you added a token:
    // const WORKER_BASE = "https://YOUR-WORKER.workers.dev/?token=MYSECRET123&url=";

    try {
        // Check cache first
        const cached = forceRefresh ? null : await getCachedStats();
        if (cached) {
            //console.log("Using cached stats:", cached);
            if (sourceStatusEl) sourceStatusEl.textContent = `Source: ${cached.source}`;
            document.getElementById("output").textContent = `${JSON.stringify(cached.stats, null, 2)}\n\nSource: ${cached.source}`;
            
            const data = [{
                x: ["Datasets", "Participants", "Positions"],
                y: [cached.stats.datasets, cached.stats.participants, cached.stats.positions],
                type: "bar"
            }];
            Plotly.newPlot("chart", data, { title: "PGP 23andMe Data Statistics" });
            return;
        }
        if (forceRefresh) {
            console.log("Force refresh requested: bypassing cache");
        }
        // If no valid cache, try fetching from multiple sources with fallbacks
        const target = "https://my.pgp-hms.org/public_genetic_data/statistics";
        const candidates = [
             // ✅ your Cloudflare Worker (put near the top)
            { name: "cf-worker", url: `${WORKER_BASE}${encodeURIComponent(target)}` },
            { name: "local-proxy", url: "http://localhost:3000/pgp-stats" },
            // { name: "powershell-proxy", url: "http://localhost:3000/pgp-stats" },
            { name: "allorigins", url: `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}` },
            { name: "corsproxy", url: `https://corsproxy.io/?${target}` },
            { name: "github-pages-proxy", url: "https://lorenasandoval88.github.io/get-23andme-data/pgp-stats" }
        ];

        let html = null;
        let source = null;
        const failures = [];

        for (const candidate of candidates) {
            try {
                const response = await fetch(candidate.url);
                //console.log(`Trying ${candidate.name}: HTTP ${response.status}`);
                if (!response.ok) {
                    failures.push(`${candidate.name}: HTTP ${response.status}`);
                    continue;
                }

                html = await response.text();
                source = candidate.name;
                break;
            } catch (error) {
                failures.push(`${candidate.name}: ${error.message}`);
            }
        }

        if (!html) {
            throw new Error(`Unable to fetch stats (${failures.join(" | ")}).`);
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        //23andme data is in a table, so we look for rows
        const rows = [...doc.querySelectorAll("table tbody tr")];
        let stats = null;

        for (const row of rows) {
            const cols = row.querySelectorAll("td");
            if (cols.length === 0) continue;

            const type = cols[0].innerText.toLowerCase();
            if (!type.includes("23and")) continue;

            stats = {
                dataType: cols[0].innerText.trim(),
                datasets: parseInt(cols[1].innerText.replace(/,/g, ""), 10),
                participants: parseInt(cols[2].innerText.replace(/,/g, ""), 10),
                positions: parseInt(cols[3].innerText.replace(/,/g, ""), 10)+"k"
            };
            //console.log("Extracted stats:", stats);
            break;
        }

        if (!stats) {
            if (sourceStatusEl) sourceStatusEl.textContent = `Source: ${source}`;
            document.getElementById("output").textContent = "No data found";
            return;
        }

        // Cache the fresh data
        await setCachedStats(stats, source);

        if (sourceStatusEl) sourceStatusEl.textContent = `Source: ${source}`;
        document.getElementById("output").textContent = `${JSON.stringify(stats, null, 2)}\n\nSource: ${source}`;

        const data = [{
            x: ["Datasets", "Participants", "Positions"],
            y: [stats.datasets, stats.participants, stats.positions],
            type: "bar"
        }];

        const layout = {
            title: "PGP 23andMe Data Statistics"
        };

        Plotly.newPlot("chart", data, layout);
    } catch (error) {
        if (sourceStatusEl) sourceStatusEl.textContent = "Source: unavailable";
        document.getElementById("output").textContent = `Error: ${error.message}`;
    } finally {
        if (forceRefreshBtn) forceRefreshBtn.disabled = false;
    }
}

const forceRefreshBtn = document.getElementById("forceRefreshStatsBtn");
if (forceRefreshBtn) {
    forceRefreshBtn.addEventListener("click", () => loadStats({ forceRefresh: true }));
}

/**
 * Fetches 23andMe participant data from Personal Genome Project (PGP)
 * Uses local proxy to bypass CORS restrictions
 */

const PGP_23ANDME_URL = "https://my.pgp-hms.org/public_genetic_data?utf8=%E2%9C%93&data_type=23andMe&commit=Search";
const WORKER_BASE = "https://lorena-api.lorenasandoval88.workers.dev/?url=";
const ALL_PROFILES_CACHE_KEY = "pgp:23andme-allUsers";
const PROFILE_CACHE_PREFIX = "pgp:profile:";
let lastAllUsersSource = null;
const lastProfileSourceById = new Map();

function isCacheWithinMonths(savedAt, months = 3) {
    if (!savedAt) return false;
    const savedDate = new Date(savedAt);
    if (Number.isNaN(savedDate.getTime())) return false;

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    return savedDate >= cutoff;
}

// Helper functions for fetch23andMeParticipants() cache management
async function cacheParticipantsIfMissing(participants) {
        console.log("cacheParticipantsIfMissing-------------------");

    if (!window.localforage) return;

    try {
        const existing = await window.localforage.getItem(ALL_PROFILES_CACHE_KEY);
        if (existing) return;

        await window.localforage.setItem(ALL_PROFILES_CACHE_KEY, participants);
        console.log(`Saved participants cache: ${ALL_PROFILES_CACHE_KEY}`);
    } catch (error) {
        console.warn(`Failed to write participants cache (${ALL_PROFILES_CACHE_KEY}):`, error);
    }
}

// Helper functions for fetch23andMeParticipants() cache management
async function getCachedParticipants(limit = 1300) {
    console.log("getCachedParticipants-------------------");
    console.log("Checking local cache for participants...");
    if (!window.localforage) return null;

    try {
        const cached = await window.localforage.getItem(ALL_PROFILES_CACHE_KEY);
        console.log(`Cache read for ${ALL_PROFILES_CACHE_KEY}:`, cached ? `found ${cached.length} entries` : "no cache",cached);
        if (!Array.isArray(cached) || cached.length === 0) return null;
        return cached.slice(0, limit);
    } catch (error) {
        console.warn(`Failed to read participants cache (${ALL_PROFILES_CACHE_KEY}):`, error);
        return null;
    }
}


/**
 * Parse HTML to extract participant data
 * @param {string} html - HTML content from PGP
 * @param {number} limit - Number of participants to return
 * @returns {Array} Array of participant objects
 */
function parseParticipants(html, limit) {
    // console.log("html: ",html)
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // Rows have data-file-row attribute, or fallback to all tr elements
    let rows = [...doc.querySelectorAll("tr[data-file-row]")];
    if (rows.length === 0) {
        rows = [...doc.querySelectorAll("table tr")];
    }

    console.log("Found rows:", rows.length);

    const participants = [];

    for (const row of rows) {
        if (participants.length >= limit) break;

        const cells = row.querySelectorAll("td");
        // console.log("Row cells:", cells.length);
        // console.log("row",row)
        // Table has 8 columns: checkbox, participant, published, datatype, source, name, download, report
        if (cells.length < 7) continue;

        // Participant link is in column 1 (index 1), download link in column 6
        const participantLink = cells[1].querySelector("a");
        const downloadLink = cells[6].querySelector("a");

        if (!participantLink) continue;

        const participant = {
            id: participantLink.textContent.trim(),
            profileUrl: `https://my.pgp-hms.org${participantLink.getAttribute("href")}`,
            publishedDate: cells[2].textContent.trim(),
            dataType: cells[3].textContent.trim(),
            source: cells[4].textContent.trim(),
            name: cells[5].textContent.trim(),
            downloadUrl: downloadLink ? `https://my.pgp-hms.org${downloadLink.getAttribute("href")}` : null
        };
        participants.push(participant);
    }
    // console.log(`Parsed ${participants.length} participants:`, participants);
    return participants;
}

/**
 * Fetch 23andMe participants from PGP ~ 1,000
 * @param {number} limit - Number of participants to return (default: 1300)
 * @returns {Promise<Array>} Array of participant objects
 * checks pgp:23andme-allUsers before hitting fetch(candidate.url), and only falls back to network when cache is missing/empty.
 */

async function fetch23andMeParticipants(limit = 1300) {
    console.log("fetch23andMeParticipants-------------------");
    // console.log("Fetching 23andMe participants with limit:", limit);
    // console.log("PGP_23ANDME_URL:",PGP_23ANDME_URL)

    // begin if fetch flow if cache is available
    const cachedParticipants = await getCachedParticipants(limit);
    if (cachedParticipants) {
        lastAllUsersSource = "cache";
        // console.log(`Loaded participants from cache: ${cachedParticipants.length}`);
        return cachedParticipants;
    }
    // begin else fetch flow if cache is missing or empty
    const candidates = [
        { name: "cf-worker", url: `${WORKER_BASE}${encodeURIComponent(PGP_23ANDME_URL)}` },
        { name: "local-proxy", url: "http://localhost:3000/pgp-participants" },
        { name: "allorigins", url: `https://api.allorigins.win/raw?url=${encodeURIComponent(PGP_23ANDME_URL)}` },
        { name: "corsproxy", url: `https://corsproxy.io/?${PGP_23ANDME_URL}` }
    ];
    let html = null;
    let usedSource = null;
    const errors = [];

    for (const candidate of candidates) {
        try {
            console.log(`Trying to fetch participants from ${candidate.name}...`);
            const response = await fetch(candidate.url);
            if (response.ok) {
                console.log(`Successfully fetched from ${candidate.name}`);
                html = await response.text();
                usedSource = candidate.name;
                break;
            }
            errors.push(`${candidate.name}: HTTP ${response.status}`);
        } catch (error) {
            errors.push(`${candidate.name}: ${error.message}`);
        }
    }

    if (!html) {
        throw new Error(`Failed to fetch PGP data: ${errors.join(", ")}`);
    }

    lastAllUsersSource = usedSource;
    // console.log("lastAllUsersSource",lastAllUsersSource)
    const participants = parseParticipants(html, limit);
    // console.log("parseParticipants(html, limit):", usedSource, participants);
    await cacheParticipantsIfMissing(participants);
    return participants;
}

// Fetch individual profile by ID with cache fallback
// Example: fetchProfile("hu416394").then(console.log);
async function fetchProfile(id) {
    const cachedProfile = await getCachedProfile(id);
    if (cachedProfile) {
        lastProfileSourceById.set(id, "cache");
        return cachedProfile;
    }

    const profileUrl = `https://my.pgp-hms.org/profile/${id}.json`;
    const candidates = [
        { name: "cf-worker", url: `${WORKER_BASE}${encodeURIComponent(profileUrl)}` },
        { name: "local-proxy", url: `http://localhost:3000/pgp-profile/${id}` },
        { name: "allorigins", url: `https://api.allorigins.win/raw?url=${encodeURIComponent(profileUrl)}` },
        { name: "corsproxy", url: `https://corsproxy.io/?${profileUrl}` }
    ];

    const errors = [];
    for (const candidate of candidates) {
        try {
            const res = await fetch(candidate.url, {
                headers: {
                    "Accept": "application/json"
                }
            });

            if (!res.ok) {
                errors.push(`${candidate.name}: HTTP ${res.status}`);
                continue;
            }

            const data = await res.json();
            lastProfileSourceById.set(id, candidate.name);
            await setCachedProfile(id, data);
            return data;
        } catch (error) {
            errors.push(`${candidate.name}: ${error.message}`);
        }
    }

    throw new Error(`Failed to fetch profile ${id}: ${errors.join(", ")}`);
}

// Helper functions for fetchProfile(id) cache management
async function getCachedProfile(id) {
    if (!window.localforage) return null;

    try {
        const cached = await window.localforage.getItem(PROFILE_CACHE_PREFIX + id);
        if (!cached) return null;

        const { savedAt, profile } = cached;
        if (isCacheWithinMonths(savedAt)) {
            return profile;
        }
        return null;
    } catch (error) {
        return null;
    }
}

// Helper functions for fetchProfile(id) cache management
async function setCachedProfile(id, profile) {
    if (!window.localforage) return;
    await window.localforage.setItem(PROFILE_CACHE_PREFIX + id, {
        savedAt: new Date().toISOString(),
        profile
    });
}
function getLastAllUsersSource() {
    // console.log("getLastAllUsersSource:", lastAllUsersSource);
    return lastAllUsersSource;
}

function getLastProfileSource(id) {
    // console.log("getLastProfileSource:", lastProfileSourceById.get(id));
    return lastProfileSourceById.get(id) || null;
}


// ALL USERS ENDPOINT (VCF 23ANDME ETC METADATA, WITHOUT FILES) - PAGINATED JSON (NO HTML PARSING, MORE STABLE)
// without web crawling, so we dont rely on the HTML structure of the page, which can change 
// and break our code. Instead, we can use the JSON endpoint that provides structured data about 
// users. This endpoint is paginated, so we can fetch all pages to get the complete list of 
// participants.
// Get all 6214 users: paginate the JSON endpoint
// https://my.pgp-hms.org/users.json?page=1
// https://my.pgp-hms.org/users.json?page=2
// https://my.pgp-hms.org/users.json?page=3
// ...

// async function fetchAllUsersJson() {
//   const all = [];
//   let page = 1;
//   let total = Infinity;

//   while (all.length < total) {
//     const url = `https://my.pgp-hms.org/users.json?page=${page}`;
//     const res = await fetch(url);
//     const json = await res.json();

//     const chunk = json.aaData || [];

//     if (total === Infinity) {
//       total = json.iTotalRecords || Infinity;
//       console.log("Total records:", total);
//     }

//     if (!chunk.length) break;

//     all.push(...chunk);

//     page++;
//     await new Promise(r => setTimeout(r, 150));
//   }

//   return all;
// }

export { fetch23andMeParticipants, fetchProfile, getLastAllUsersSource, getLastProfileSource, loadStats };
//# sourceMappingURL=sdk.mjs.map
