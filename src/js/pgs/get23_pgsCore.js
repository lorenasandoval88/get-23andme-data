/**
 * Core PGS (Polygenic Score) functions for the get-23andme-data SDK.
 * Fetches and caches trait summaries and score metadata from the PGS Catalog API.
 * https://www.pgscatalog.org/rest/
 */

const PGS_CATALOG_BASE = "https://www.pgscatalog.org/rest";
const WORKER_BASE = "https://lorena-api.lorenasandoval88.workers.dev/?url=";
const TRAIT_SUMMARY_CACHE_KEY = "pgs:trait-summary";
const SCORES_PER_TRAIT_CACHE_KEY = "pgs:scores-per-trait-summary";

// ─── Internal helpers ────────────────────────────────────────────────────────

async function getLocalForageItem(key) {
    if (typeof window === "undefined" || !window.localforage) return null;
    try {
        return await window.localforage.getItem(key);
    } catch (e) {
        console.warn(`Cache read error for ${key}:`, e);
        return null;
    }
}

async function setLocalForageItem(key, value) {
    if (typeof window === "undefined" || !window.localforage) return;
    try {
        await window.localforage.setItem(key, value);
    } catch (e) {
        console.warn(`Cache write error for ${key}:`, e);
    }
}

async function fetchFromPgsCatalog(path) {
    const target = `${PGS_CATALOG_BASE}${path}`;
    const candidates = [
        { name: "direct", url: target },
        { name: "cf-worker", url: `${WORKER_BASE}${encodeURIComponent(target)}` }
    ];

    const errors = [];
    for (const candidate of candidates) {
        try {
            const response = await fetch(candidate.url, {
                headers: { Accept: "application/json" }
            });
            if (response.ok) {
                return await response.json();
            }
            errors.push(`${candidate.name}: HTTP ${response.status}`);
        } catch (e) {
            errors.push(`${candidate.name}: ${e.message}`);
        }
    }

    throw new Error(`Failed to fetch from PGS Catalog (${path}): ${errors.join(" | ")}`);
}

// ─── Public functions ─────────────────────────────────────────────────────────

/**
 * Retrieve a cached summary dataset stored in LocalForage.
 * @param {string} cacheKey - LocalForage key to retrieve (e.g. "pgs:trait-summary")
 * @returns {Promise<any|null>} Cached value, or null if not found
 */
async function getStoredScoreSummary(cacheKey) {
    return await getLocalForageItem(cacheKey);
}

/**
 * Extract a trait → PGS IDs mapping from a trait summary object.
 * @param {Object} traitSummary - Trait summary as returned by loadTraitStats()
 * @returns {Object} Map of trait label → array of PGS IDs
 */
function getTraitToPgsIdsFromTraitSummary(traitSummary) {
    const mapping = {};
    if (!traitSummary || !Array.isArray(traitSummary.results)) return mapping;

    for (const trait of traitSummary.results) {
        const traitName = trait.label || trait.name || trait.id;
        if (!traitName) continue;

        const pgsIds = (trait.associated_pgs_ids || []).map(id =>
            typeof id === "string" ? id.toUpperCase() : id
        );
        if (pgsIds.length > 0) {
            mapping[traitName] = pgsIds;
        }
    }

    return mapping;
}

/**
 * Retrieve full metadata for one or more PGS IDs from the PGS Catalog.
 * Results are fetched in batches to respect API limits.
 * @param {string[]} pgsIds - Array of PGS IDs (e.g. ["PGS000001", "PGS000002"])
 * @returns {Promise<Object[]>} Array of score metadata objects
 */
async function loadScores(pgsIds) {
    if (!Array.isArray(pgsIds) || pgsIds.length === 0) return [];

    const results = [];
    const chunkSize = 50;

    for (let i = 0; i < pgsIds.length; i += chunkSize) {
        const chunk = pgsIds.slice(i, i + chunkSize);
        const ids = chunk.join(",");

        try {
            const data = await fetchFromPgsCatalog(
                `/score/search?pgs_ids=${encodeURIComponent(ids)}`
            );
            const scores = data.results || (Array.isArray(data) ? data : []);
            results.push(...scores);
        } catch (e) {
            console.warn(`Failed to load scores for chunk [${ids}]:`, e.message);
        }
    }

    return results;
}

/**
 * Build (or retrieve from cache) the trait summary from the PGS Catalog.
 * Stores the result in LocalForage under "pgs:trait-summary".
 * Automatically paginates to retrieve all available traits.
 * @param {Object} [options]
 * @param {boolean} [options.forceRefresh=false] - Bypass the cache and refetch
 * @returns {Promise<Object>} Trait summary with { savedAt, count, results[] }
 */
async function loadTraitStats(options = {}) {
    const forceRefresh = options.forceRefresh === true;

    const cached = forceRefresh ? null : await getLocalForageItem(TRAIT_SUMMARY_CACHE_KEY);
    if (cached) {
        return cached;
    }

    const PAGE_SIZE = 100;
    let allResults = [];
    let totalCount = 0;
    let next = `/trait/all?limit=${PAGE_SIZE}`;

    while (next) {
        const data = await fetchFromPgsCatalog(next);
        const results = data.results || [];
        allResults = allResults.concat(results);
        totalCount = data.count || allResults.length;

        if (data.next) {
            // Extract the path+query portion from the absolute URL returned by the API
            try {
                const nextUrl = new URL(data.next);
                next = nextUrl.pathname + nextUrl.search;
            } catch (_) {
                next = null;
            }
        } else {
            next = null;
        }
    }

    const traitSummary = {
        savedAt: new Date().toISOString(),
        count: totalCount,
        results: allResults
    };

    await setLocalForageItem(TRAIT_SUMMARY_CACHE_KEY, traitSummary);
    return traitSummary;
}

/**
 * Retrieve polygenic scores grouped by trait using cached trait summaries
 * and score metadata.
 *
 * This function links traits → associated PGS IDs → full score metadata,
 * allowing applications to explore polygenic scores by phenotype.
 *
 * Results are cached in LocalForage under "pgs:scores-per-trait-summary".
 *
 * @param {Object} [options]
 * @param {boolean} [options.forceRefresh=false] - Ignore cached results and rebuild the dataset
 * @param {number}  [options.maxTraits=Infinity]  - Limit the number of traits processed
 * @returns {Promise<{
 *   savedAt: string,
 *   processedTraits: number,
 *   totalTraitEntries: number,
 *   scoresPerTrait: Object
 * }>}
 */
async function getScoresPerTrait(options = {}) {
    const forceRefresh = options.forceRefresh === true;
    const maxTraits = options.maxTraits !== undefined ? options.maxTraits : Infinity;

    // 1. Check cache
    const cached = forceRefresh ? null : await getLocalForageItem(SCORES_PER_TRAIT_CACHE_KEY);

    // 2. Return cache if available
    if (cached) {
        return cached;
    }

    // 3. Load trait summary
    const traitSummary = await loadTraitStats();

    // 4. Extract trait → PGS ID mapping
    const traitToPgsIds = getTraitToPgsIdsFromTraitSummary(traitSummary);

    const allTraitNames = Object.keys(traitToPgsIds);
    const totalTraitEntries = allTraitNames.length;
    const traitNames =
        maxTraits === Infinity ? allTraitNames : allTraitNames.slice(0, maxTraits);

    // 5 & 6. Retrieve scores per trait and build trait-linked dataset
    const scoresPerTrait = {};

    for (const traitName of traitNames) {
        const pgsIds = traitToPgsIds[traitName];
        const scores = await loadScores(pgsIds);

        const uniqueTraitLabels = new Set(
            scores.flatMap(s =>
                s.trait_reported ? [s.trait_reported] : []
            )
        );

        scoresPerTrait[traitName] = {
            pgs_ids: pgsIds,
            scores,
            summary: {
                totalScores: scores.length,
                uniqueTraits: uniqueTraitLabels.size || 1
            }
        };
    }

    // 7. Store results
    const result = {
        savedAt: new Date().toISOString(),
        processedTraits: traitNames.length,
        totalTraitEntries,
        scoresPerTrait
    };

    await setLocalForageItem(SCORES_PER_TRAIT_CACHE_KEY, result);

    // 8. Return results
    return result;
}

export {
    getStoredScoreSummary,
    getTraitToPgsIdsFromTraitSummary,
    loadScores,
    loadTraitStats,
    getScoresPerTrait
};
