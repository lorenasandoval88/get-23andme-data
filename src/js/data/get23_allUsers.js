/**
 * Fetches 23andMe participant data from Personal Genome Project (PGP) and Openhumans with a cache-first strategy and multi-proxy fallback to bypass CORS restrictions.
 * 
 * Features:
 * - Cache-first loading: Checks local cache before making network requests, and caches successful responses for future use.
 * - Multi-proxy fallback: Tries multiple proxy endpoints (Cloudflare Worker, local proxy, AllOrigins, CORSProxy) to fetch data, increasing chances of success despite CORS issues.
 * - HTML parsing: Parses HTML responses from PGP to extract structured participant data, including IDs, profile URLs, published dates, data types, sources, names, and download links.
 * - Source tracking: Keeps track of where data was loaded from (cache or which proxy) for debugging and transparency.
 */

import localforage from "localforage";
import JSZip from "jszip";

// Helper to check for supported genome version labels (v3, v4, v5)
function hasSupportedGenomeVersionLabel(value = "") {
  return /(^|[^a-z0-9])v(?:3|4|5)(?=[^a-z0-9]|$)/i.test(String(value));
}

//PGP search results page (HTML) for 23andMe datasets—not an API endpoint
const dataType = "23andMe";
const PGP_23ANDME_URL = `https://my.pgp-hms.org/public_genetic_data?utf8=%E2%9C%93&data_type=${dataType}&commit=Search`;
const OPENHUMANS_23ANDME_URL = `https://www.openhumans.org/api/public-data/?data_type=${dataType}`; //TODO: add this 23andm data (not the original filename with chip version)

const WORKER_BASE = "https://lorena-api.lorenasandoval88.workers.dev/?url=";
const PARTICIPANT_CACHE_PREFIX = `Genome:${dataType}-participant-`; // per-participant cache (full metadata + resolved filename)
const PROFILE_CACHE_PREFIX = `Genome:${dataType}-profile-`;
const ALL_PARTICIPANT_CACHE_PREFIX = `Genome:${dataType}-allParticipants-`; // per-participant cache (full metadata + resolved filename)

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

// Per-participant cache helpers
async function getCachedParticipant(id) {
    if (!id) return null;
    const storage = getStorage();
    if (!storage) return null;
    try {
        const cached = await storage.getItem(PARTICIPANT_CACHE_PREFIX + id);
        return cached || null;
    } catch (error) {
        return null;
    }
}

async function setCachedParticipant(id, participant) {
    if (!id) return;
    const storage = getStorage();
    if (!storage) return;
    try {
        await storage.setItem(PARTICIPANT_CACHE_PREFIX + id, {
            ...participant,
            cachedAt: Date.now()
        });
    } catch (error) {
        console.warn(`Failed to cache participant ${id}:`, error);
    }
}

/**
 * Parse HTML to extract participant data with per-participant caching
 * @param {string} html - HTML content from PGP
 * @param {number} limit - Number of participants to return
 * @param {string} source - Source identifier
 * @param {Object} options - Options for callbacks
 * @param {number} options.batchSize - Log progress every N participants (default: 10)
 * @param {Function} options.onBatchComplete - Callback when a batch is processed
 * @returns {Promise<Array>} Array of participant objects
 */
async function parseParticipants(html, limit, source = "unknown", options = {}) {
    const { batchSize = 10, onBatchComplete = null } = options;
    
    console.log("***************Parsing participants from HTML source:", source);
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    let rows = [...doc.querySelectorAll("tr[data-file-row]")];
    if (rows.length === 0) {
        rows = [...doc.querySelectorAll("table tr")];
    }

    console.log("Found rows:", rows.length, rows.slice(0, 5));

    const participants = [];
    let resolvedFromCache = 0;
    let resolvedFromNetwork = 0;

    for (const row of rows) {
        if (participants.length >= limit) break;

        const cells = row.querySelectorAll("td");
        if (cells.length < 7) continue;

        const participantLink = cells[1].querySelector("a");
        const downloadLink = cells[6].querySelector("a");

        if (!participantLink) continue;

        const id = participantLink.textContent.trim();
        const downloadUrl = downloadLink ? `https://my.pgp-hms.org${downloadLink.getAttribute("href")}` : null;
        
        // Check per-participant cache first
        const cachedParticipant = await getCachedParticipant(id);
        
        if (cachedParticipant) {
            participants.push(cachedParticipant);
            resolvedFromCache++;
            console.log(`parseParticipants [CACHE HIT] id: ${id}, filename: ${cachedParticipant.fileName}`);
        } else {
            // Resolve actual filename from download URL
            const resolved = await resolveDownloadFilename(downloadUrl);
            resolvedFromNetwork++;
            
            const participant = {
                id,
                profileUrl: `https://my.pgp-hms.org${participantLink.getAttribute("href")}`,
                publishedDate: cells[2].textContent.trim(),
                dataType: cells[3].textContent.trim(),
                dataSource: source,
                name: cells[5].textContent.trim(),
                fileName: resolved.fileName,
                fileExtension: resolved.fileExtension,
                finalUrl: resolved.finalUrl,
                downloadUrl
            };
            
            // Cache the participant
            await setCachedParticipant(id, participant);
            participants.push(participant);
            console.log(`parseParticipants [NETWORK] id: ${id}, filename: ${resolved.fileName}`);
        }
        
        // Progress callback every batchSize participants
        if (participants.length % batchSize === 0) {
            console.log(`parseParticipants: Progress ${participants.length}/${limit} (cache: ${resolvedFromCache}, network: ${resolvedFromNetwork})`);
            if (onBatchComplete) {
                await onBatchComplete([...participants]);
            }
        }
    }
    
    console.log(`Parsed ${participants.length} participants (cache: ${resolvedFromCache}, network: ${resolvedFromNetwork}):`, participants[0]);
    return participants;
}

/**
 * Parse HTML to extract participant data (fast version - no network calls per participant)
 * @param {string} html - HTML content from PGP
 * @param {number} limit - Number of participants to return
 * @returns {Array} Array of participant objects
 */
function parseParticipantsFast(html, limit, source = "unknown") {
    console.log("***************Parsing participants (fast) from HTML source:", source);
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    let rows = [...doc.querySelectorAll("tr[data-file-row]")];
    if (rows.length === 0) {
        rows = [...doc.querySelectorAll("table tr")];
    }

    console.log("Found rows:", rows.length);

    const participants = [];

    for (const row of rows) {
        if (participants.length >= limit) break;

        const cells = row.querySelectorAll("td");
        if (cells.length < 7) continue;

        const participantLink = cells[1].querySelector("a");
        const downloadLink = cells[6].querySelector("a");

        if (!participantLink) continue;

        const fileName = cells[5].textContent.trim();
        const fileExtension = fileName.match(/\.(txt|zip)$/i)?.[1]?.toLowerCase() || null;
        console.log(`parseParticipantsFast  filename: ${fileName} (download URL: ${downloadLink ? `https://my.pgp-hms.org${downloadLink.getAttribute("href")}` : "no download link"})`);
        const participant = {
            id: participantLink.textContent.trim(),
            profileUrl: `https://my.pgp-hms.org${participantLink.getAttribute("href")}`,
            publishedDate: cells[2].textContent.trim(),
            dataType: cells[3].textContent.trim(),
            dataSource: source,
            name: fileName,
            fileName,
            fileExtension,
            finalUrl: null, // Not resolved in fast version
            downloadUrl: downloadLink ? `https://my.pgp-hms.org${downloadLink.getAttribute("href")}` : null
        };
        participants.push(participant);
    }
    console.log(`Parsed ${participants.length} participants (fast):`, participants[0]);
    return participants;
}

/**
 * Fetch a list of PGP 23andMe participants (fast version - no filename resolution)
 * Does not use cache - always fetches fresh HTML and parses without resolving filenames
 * @param {number} limit - Number of participants to return (default: 1300)
 * @returns {Promise<Array>} Array of participant objects
 */
async function fetch23andMeParticipants_fast(limit = 1100) {
    console.log("fetch23andMeParticipants_fast-------------------")

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
    return parseParticipantsFast(html, limit, lastAllUsersSource);
}

/**
 * Fetch a list of PGP 23andMe participants with per-participant caching.
 * Always fetches HTML to get participant list, but uses cache for filename resolution.
 * Each participant is cached individually - "Load more" naturally works.
 * @param {number} limit - Number of participants to return (default: 10)
 * @param {Object} options - Options
 * @param {number} options.batchSize - Log progress every N participants (default: 10)
 * @returns {Promise<Array>} Array of participant objects
 */
async function fetch23andMeParticipants(limit = 10, options = {}) {
    const { batchSize = 10 } = options;
    
    console.log("fetch23andMeParticipants-------------------")

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
    
    // Parse - each participant is cached individually
    return parseParticipants(html, limit, lastAllUsersSource, { batchSize });
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

/**
 * Resolve the actual filename from a PGP download URL by following redirects.
 * Uses multi-proxy fallback to bypass CORS, similar to loadTxts.js.
 * @param {string} downloadUrl - The download URL (e.g., https://my.pgp-hms.org/user_file/download/4187)
 * @returns {Promise<{finalUrl: string, fileName: string, fileExtension: string|null}>}
 */
async function resolveDownloadFilename(downloadUrl) {
    if (!downloadUrl) {
        return { finalUrl: null, fileName: null, fileExtension: null };
    }

    const candidates = [
        { name: "cf-worker", url: `${WORKER_BASE}${encodeURIComponent(downloadUrl)}` },
        { name: "local-proxy", url: `http://localhost:3000/pgp-resolve?url=${encodeURIComponent(downloadUrl)}` },
        { name: "allorigins", url: `https://api.allorigins.win/raw?url=${encodeURIComponent(downloadUrl)}` },
        { name: "corsproxy", url: `https://corsproxy.io/?${downloadUrl}` }
    ];

    let finalUrl = null;
    let finalResponse = null;
    let successSource = null;
    let lastError = null;

    for (const candidate of candidates) {
        try {
            console.log(`resolveDownloadFilename(): Trying ${candidate.name}...from url ${candidate.url}`);
            const response = await fetch(candidate.url);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            // Get final URL from header or response.url
            finalUrl =
                response.headers.get("x-final-url") ||
                response.headers.get("X-Final-URL") ||
                response.url;

            finalResponse = response;
            successSource = candidate.name;
            console.log(`resolveDownloadFilename(): Success with ${candidate.name}. Final URL: ${finalUrl}`);
            break;
        } catch (err) {
            console.warn(`resolveDownloadFilename(): ${candidate.name} failed: ${err.message}`);
            lastError = err;
        }
    }

    if (!finalUrl || !finalResponse) {
        console.warn(`resolveDownloadFilename(): All proxies failed for ${downloadUrl}: ${lastError?.message}`);
        return { finalUrl: null, fileName: null, fileExtension: null };
    }

    // ------------------------------------------------------------
    // Route by final URL type
    // ------------------------------------------------------------

    // 1) Direct TXT
    if (finalUrl.endsWith(".txt")) {
        const fileName = finalUrl.split("/").pop()?.split("?")[0] || null;
        const fileExtension = "txt";
        console.log(`resolveDownloadFilename(): Direct TXT - filename: ${fileName}`);
        return { finalUrl, fileName, fileExtension };
    }

    // 2) Direct ZIP - extract inner TXT filename
    else if (finalUrl.endsWith(".zip")) {
        try {
            const buffer = await finalResponse.arrayBuffer();

            if (!buffer || buffer.byteLength === 0) {
                throw new Error(`ZIP response from ${successSource} is empty`);
            }

            const bytes = new Uint8Array(buffer);
            const isZipBuffer = bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;

            if (!isZipBuffer) {
                const preview = new TextDecoder("utf-8").decode(bytes.slice(0, 300));
                console.error("resolveDownloadFilename(): Response is not a ZIP file. Preview:", preview);
                throw new Error(`Response from ${successSource} is not a ZIP archive`);
            }

            const zip = await JSZip.loadAsync(buffer);
            const zipNames = Object.keys(zip.files);
            console.log("resolveDownloadFilename(): ZIP entries:", zipNames);

            const targetFile = zipNames
                .map(name => zip.files[name])
                .find(file => !file.dir && file.name.toLowerCase().endsWith(".txt") && hasSupportedGenomeVersionLabel(file.name));

            if (!targetFile) {
                // Fallback to ZIP filename itself
                const zipFileName = finalUrl.split("/").pop()?.split("?")[0] || null;
                console.log(`resolveDownloadFilename(): No v3/v4/v5 .txt found in ZIP, using ZIP filename: ${zipFileName}`);
                return { finalUrl, fileName: zipFileName, fileExtension: "zip" };
            }

            console.log(`resolveDownloadFilename(): Found TXT inside ZIP: ${targetFile.name}`);
            return { finalUrl, fileName: targetFile.name, fileExtension: "txt" };
        } catch (err) {
            console.warn(`resolveDownloadFilename(): Failed to parse ZIP: ${err.message}`);
            const zipFileName = finalUrl.split("/").pop()?.split("?")[0] || null;
            return { finalUrl, fileName: zipFileName, fileExtension: "zip" };
        }
    }

    // 3) Directory listing / collection root
    else if (finalUrl.endsWith("/_/")) {
        try {
            const html = await finalResponse.text();

            if (!html || !html.trim()) {
                throw new Error(`Directory listing from ${successSource} is empty`);
            }

            // Extract hrefs from HTML listing
            const hrefs = [...html.matchAll(/href="([^"]+)"/gi)].map(m => m[1]);

            // Prefer .zip first, then .txt
            const preferredHref =
                hrefs.find(h => /\.zip$/i.test(h) && hasSupportedGenomeVersionLabel(h)) ||
                hrefs.find(h => /\.txt$/i.test(h) && hasSupportedGenomeVersionLabel(h));

            if (!preferredHref) {
                console.warn("resolveDownloadFilename(): No v3/v4/v5 .zip or .txt found in directory listing");
                return { finalUrl, fileName: null, fileExtension: null };
            }

            const resolvedFileUrl = new URL(preferredHref, finalUrl).href;
            const fileName = resolvedFileUrl.split("/").pop()?.split("?")[0] || null;
            const fileExtension = fileName?.match(/\.(txt|zip)$/i)?.[1]?.toLowerCase() || null;

            console.log(`resolveDownloadFilename(): Directory listing resolved to: ${fileName}`);
            return { finalUrl: resolvedFileUrl, fileName, fileExtension };
        } catch (err) {
            console.warn(`resolveDownloadFilename(): Failed to parse directory listing: ${err.message}`);
            return { finalUrl, fileName: null, fileExtension: null };
        }
    }

    // 4) Fallback - extract filename from URL
    const fileName = finalUrl.split("/").pop()?.split("?")[0] || null;
    const fileExtension = fileName?.match(/\.(txt|zip)$/i)?.[1]?.toLowerCase() || null;

    console.log(`resolveDownloadFilename(): Fallback - extracted filename: ${fileName}, extension: ${fileExtension}`);
    return { finalUrl, fileName, fileExtension };
}



// Export for use as ES module
export {
    fetch23andMeParticipants,
    fetch23andMeParticipants_fast,
    // parseParticipants,
    fetchProfile,
    getLastAllUsersSource,
    getLastProfileSource,
    resolveDownloadFilename
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
