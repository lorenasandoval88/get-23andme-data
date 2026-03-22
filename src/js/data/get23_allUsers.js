/**
 * Fetches 23andMe participant data from Personal Genome Project (PGP)
 * Uses local proxy to bypass CORS restrictions
 */

import localforage from "localforage";

//PGP search results page (HTML) for 23andMe datasets—not an API endpoint
const dataType = "23andMe";
const PGP_23ANDME_URL = `https://my.pgp-hms.org/public_genetic_data?utf8=%E2%9C%93&data_type=${dataType}&commit=Search`;
const WORKER_BASE = "https://lorena-api.lorenasandoval88.workers.dev/?url=";
const ALL_PROFILES_CACHE_KEY = `Genome:${dataType}-allUsers`;
const PROFILE_CACHE_PREFIX = `Genome:${dataType}-profile-`;
let lastAllUsersSource = null;
const lastProfileSourceById = new Map();

function getStorage() {
    return localforage;
}

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
        console.log("checking cache before write-------------------")
    const storage = getStorage();
    if (!storage) return;
        // console.log("cacheParticipantsIfMissing: storage available-------------------")
    try {
        const existing = await storage.getItem(ALL_PROFILES_CACHE_KEY);
        console.log(`Cache read for ${ALL_PROFILES_CACHE_KEY} before write:`, existing ? `found ${existing.length} entries` : "no cache",existing);
        if (existing) return;

        await storage.setItem(ALL_PROFILES_CACHE_KEY, participants);
        console.log(`Saving participants cache in localforage: ${ALL_PROFILES_CACHE_KEY}`);
    } catch (error) {
        console.warn(`Failed to write participants cache (${ALL_PROFILES_CACHE_KEY}):`, error);
    }
}

// Helper functions for fetch23andMeParticipants() cache management
async function getCachedParticipants(limit = 1300) {
    console.log("getCachedParticipants-------------------")
    console.log("Checking local cache for participants...");
    const storage = getStorage();
    if (!storage) return null;

    try {
        const cached = await storage.getItem(ALL_PROFILES_CACHE_KEY);
        console.log(`Cache read for ${ALL_PROFILES_CACHE_KEY}:`, cached ? `found ${cached.length} entries` : "no cache",cached ? cached.slice(0, 5) : null);
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
 * Fetch a list of PGP 23andMe participants (IDs ~ 1,000 + metadata) with: cache-first loading,multi-proxy fallback, and HTML parsing → structured dataset
 * @param {number} limit - Number of participants to return (default: 1300)
 * @returns {Promise<Array>} Array of participant objects
 * checks Genome:23andme-allUsers before hitting fetch(candidate.url), and only falls back to network when cache is missing/empty.
 */

async function fetch23andMeParticipants(limit = 1300) {
    console.log("fetch23andMeParticipants-------------------")
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

// Fetch a PGP profile by ID using cache if available, otherwise try multiple proxy endpoints until successful, then cache and return the result.
// 1. Cache-first strategy 2. Multi-proxy fallback 3. Source tracking
// Example: fetchProfile("hu416394").then(console.log);
async function fetchProfile(id) {
    const resolvedId = typeof id === "string" && id.trim() ? id.trim() : "hu09B28E";

    const cachedProfile = await getCachedProfile(resolvedId);
    if (cachedProfile) {
        lastProfileSourceById.set(resolvedId, "cache");
        return cachedProfile;
    }

    const profileUrl = `https://my.pgp-hms.org/profile/${resolvedId}.json`;
    const candidates = [
        { name: "cf-worker", url: `${WORKER_BASE}${encodeURIComponent(profileUrl)}` },
        { name: "local-proxy", url: `http://localhost:3000/pgp-profile/${resolvedId}` },
        { name: "allorigins", url: `https://api.allorigins.win/raw?url=${encodeURIComponent(profileUrl)}` },
        { name: "corsproxy", url: `https://corsproxy.io/?${profileUrl}` }
    ];

    const errors = [];
    for (const candidate of candidates) {
        console.log(`Trying to fetch profile ${resolvedId} from ${candidate.name}...`);

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
            console.log(`Successfully fetched profile ${resolvedId} from ${candidate.name}`);
            const data = await res.json();
            lastProfileSourceById.set(resolvedId, candidate.name);
            await setCachedProfile(resolvedId, data);
            console.log(`Saving profile cache in localforage: ${resolvedId}`);

            return data;
        } catch (error) {
            errors.push(`${candidate.name}: ${error.message}`);
        }
    }

    throw new Error(`Failed to fetch profile ${resolvedId}: ${errors.join(", ")}`);
}

// Helper functions for fetchProfile(id) cache management
async function getCachedProfile(id) {
    const storage = getStorage();
    if (!storage) return null;

    try {
        const cached = await storage.getItem(PROFILE_CACHE_PREFIX + id);
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
    const storage = getStorage();
    if (!storage) return;
    await storage.setItem(PROFILE_CACHE_PREFIX + id, {
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

// Export for use as ES module
export {
    fetch23andMeParticipants,
    // parseParticipants,
    fetchProfile,
    getLastAllUsersSource,
    getLastProfileSource
};


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
