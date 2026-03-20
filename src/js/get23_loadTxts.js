import localforage from "localforage";
const MAX_GET23_CACHE_BYTES = 300 * 1024 * 1024;
const GET23_KEY_PREFIX = "Genome:id-";

import JSZip from "jszip";

// evicts in this order:First: cached pgs:id-* entries whose IDs are not in current ids.
// Then (only if still over limit): entries whose IDs are in current ids.
async function limitStorage(ids = []){
    const entries = [];
    let totalBytes = 0;
    const requestedIds = new Set((ids || []).map(id => String(id)));

    await localforage.iterate((value, key) => {
        if (!key.startsWith(GET23_KEY_PREFIX)) {
            return;
        }
        const entryBytes = getByteSize({ key, value });
        const createdAt = Number(value?.cachedAt) || 0;
        const id = key.slice(GET23_KEY_PREFIX.length);

        entries.push({ key, id, entryBytes, createdAt });
        totalBytes += entryBytes;
        //console.log(`Cached pgs entries: ${key}, Size: ${(entryBytes / 1024 / 1024).toFixed(2)} MB`);
    });

    if (totalBytes < MAX_GET23_CACHE_BYTES) {
        console.log(`Cache limit: ${(MAX_GET23_CACHE_BYTES / 1024 / 1024).toFixed(0)} MB. Current usage: ${(totalBytes / 1024 / 1024).toFixed(2)} MB. No eviction needed.`);
        return;
    }

    const notRequestedEntries = entries
        .filter(entry => !requestedIds.has(entry.id))
        .sort((a, b) => a.createdAt - b.createdAt);

    const requestedEntries = entries
        .filter(entry => requestedIds.has(entry.id))
        .sort((a, b) => a.createdAt - b.createdAt);

    const evictionOrder = [...notRequestedEntries, ...requestedEntries];

    for (const entry of evictionOrder) {
        if (totalBytes < MAX_GET23_CACHE_BYTES) {
            break;
        }
        await localforage.removeItem(entry.key);
        totalBytes -= entry.entryBytes;
    }
    console.log(`GET23 Cache after eviction: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);

}

function getByteSize(value) {
    const encoded = JSON.stringify(value) ?? "";
    if (typeof TextEncoder !== "undefined") {
        return new TextEncoder().encode(encoded).length;
    }
    return encoded.length * 2;
}


/**
 * Parse a 23andMe genome text file into structured data.
 * @param {string} txt - Raw text content
 * @param {string} url - Source URL/path
 * @returns {Object} Parsed genome data with cols and dt arrays
 */
async function parse23Txt(txt, url) {
	const obj = {};
	const rows = String(txt ?? "").split(/[\r\n]+/g).filter(Boolean);
	obj.txt = txt;
	obj.url = url;

	const n = rows.filter(r => r && r[0] === '#').length;
	if (n === 0) {
		throw new Error(`Invalid 23andMe file format: missing header in ${url}`);
	}

	obj.meta = rows.slice(0, n - 1).join('\r\n');
	obj.cols = rows[n - 1].replace(/^#\s*/, '').split(/\t/);
	obj.dt = rows.slice(n).map((r, i) => {
		const parts = r.split('\t');
		parts[2] = parseInt(parts[2]); // position as integer
		parts[4] = i; // row index
		return parts;
	});
	return obj;
}


/**
 * Load and parse a local 23andMe file.
 * @param {string} path - Path to the file (local .txt or remote PGP URL)
 * @param {string} [id] - Optional ID for caching (extracted from path if not provided)
 * @returns {Promise<Object>} Parsed genome data
 */


async function load23andMeFile(path, id = null) {
  console.log(`get23_loadTxts.js: Starting to load ${path}...`);

  // Extract ID from path if not provided (e.g., from PGP URL)
  if (!id) {
    const idMatch = path.match(/hu[A-Z0-9]+/i) || path.match(/\/([^\/]+)\/?$/);
    id = idMatch ? idMatch[0] : path;
  }

  const cacheKey = GET23_KEY_PREFIX + id;

  // Check localforage for cached data
  try {
    const cached = await localforage.getItem(cacheKey);
    if (cached && cached.data) {
      console.log(`get23_loadTxts.js: Cache hit for ${cacheKey}`);
      return cached.data;
    }
  } catch (err) {
    console.warn(`get23_loadTxts.js: Cache read failed for ${cacheKey}:`, err);
  }

  console.log(`get23_loadTxts.js: Cache miss for ${cacheKey}, fetching...`);

  // Helper to cache and return parsed data
  async function cacheAndReturn(parsedData) {
    try {
      await localforage.setItem(cacheKey, {
        data: parsedData,
        cachedAt: Date.now()
      });
      console.log(`get23_loadTxts.js: Cached data for ${cacheKey}`);
      // Enforce storage limit
      await limitStorage([id]);
    } catch (err) {
      console.warn(`get23_loadTxts.js: Failed to cache ${cacheKey}:`, err);
    }
    return parsedData;
  }

  const isRemote = /^https?:\/\//.test(path);
  const isTxtFile = path.toLowerCase().endsWith(".txt");
  const isZipLike = path.toLowerCase().includes("pgp-hms.org") || path.toLowerCase().endsWith(".zip");
   path.toLowerCase().includes("pgp-hms.org") ||
    path.toLowerCase().endsWith(".zip");

  // Local or direct .txt files
  if (!isRemote || (isTxtFile && !isZipLike)) {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to load ${path}: ${response.status}`);
    }

    const txt = await response.text();
    return cacheAndReturn(await parse23Txt(txt, path));
  }

  // Remote PGP / ZIP URLs
  const WORKER_BASE = "https://lorena-api.lorenasandoval88.workers.dev/?url=";
  const target = path;

  const candidates = [
    { name: "cf-worker", url: `${WORKER_BASE}${encodeURIComponent(target)}` },
    { name: "local-proxy", url: "http://localhost:3000/pgp-stats" },
    { name: "allorigins", url: `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}` },
    { name: "corsproxy", url: `https://corsproxy.io/?${target}` },
    { name: "github-pages-proxy", url: "https://lorenasandoval88.github.io/get-23andme-data/pgp-stats" }
  ];

  let buffer = null;
  let finalResponse = null;
  let finalUrl = null;
  let successSource = null;
  let lastError = null;

  for (const candidate of candidates) {
    try {
      console.log(` Trying ${candidate.name}...from url ${candidate.url}`);
      const response = await fetch(candidate.url);

      console.log(
        `Received response from ${candidate.name}: HTTP ${response.status}`,
        response
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

    const contentType = response.headers.get("content-type") || "";
      const exposedFinalUrl =
        response.headers.get("x-final-url") ||
        response.headers.get("X-Final-URL") ||
        response.url;

    //   console.log(`content-type from ${candidate.name}: ${contentType}`);
      console.log(`finalUrl from ${candidate.name}: ${exposedFinalUrl}`);

      // 👇 get header FIRST
       finalResponse = response;
      finalUrl = exposedFinalUrl;
      successSource = candidate.name;
      break;
    } catch (err) {
      console.warn(` ${candidate.name} failed: ${err.message}`);
      lastError = err;
    }
  }

  if (!finalResponse) {
    throw new Error(`All proxy candidates failed for ${path}: ${lastError?.message}`);
  }

  if (!finalUrl) {
    finalUrl = finalResponse.url;
  }

  console.log(`get23_loadTxts.js: Success with ${successSource}`);
  console.log(`get23_loadTxts.js: Resolved final URL: ${finalUrl}`);

  // ------------------------------------------------------------
  // Route by final URL type
  // ------------------------------------------------------------

  // 1) Direct TXT
  if (finalUrl.endsWith(".txt")) {
    const txt = await finalResponse.text();

    if (!txt || !txt.trim()) {
      throw new Error(`TXT response from ${successSource} is empty`);
    }

    console.log(`get23_loadTxts.js: Loaded direct TXT from ${successSource}`);
    return cacheAndReturn(await parse23Txt(txt, finalUrl));
  }

  // 2) Direct ZIP
  else if (finalUrl.endsWith(".zip")) {
    const buffer = await finalResponse.arrayBuffer();

    if (!buffer || buffer.byteLength === 0) {
      throw new Error(`ZIP response from ${successSource} is empty`);
    }

    console.log(`get23_loadTxts.js: Loaded ZIP buffer from ${successSource}`, buffer);

    const bytes = new Uint8Array(buffer);
    const isZipBuffer = bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;

    if (!isZipBuffer) {
      const preview = new TextDecoder("utf-8").decode(bytes.slice(0, 300));
      console.error("get23_loadTxts.js: Response is not a ZIP file. Preview:", preview);
      throw new Error(`Response from ${successSource} is not a ZIP archive`);
    }

    console.log(`get23_loadTxts.js: About to call JSZip.loadAsync, buffer size: ${buffer.byteLength}`);
    const zip = await JSZip.loadAsync(buffer);

    const zipNames = Object.keys(zip.files);
    console.log("get23_loadTxts.js: ZIP entries:", zipNames);

    const targetFile = zipNames
      .map(name => zip.files[name])
      .find(file => !file.dir && file.name.toLowerCase().endsWith(".txt"));

    if (!targetFile) {
      throw new Error(`No .txt file found inside ZIP from ${path}`);
    }

    console.log(`get23_loadTxts.js: Extracting file from ZIP: ${targetFile.name}`);

    const txt = await targetFile.async("string");

    if (!txt || !txt.trim()) {
      throw new Error(`Extracted text file is empty: ${targetFile.name}`);
    }
    return cacheAndReturn(await parse23Txt(txt, targetFile.name));
  }

  // 3) Directory listing / collection root
  else if (finalUrl.endsWith("/_/")) {
    const html = await finalResponse.text();

    if (!html || !html.trim()) {
      throw new Error(`Directory listing from ${successSource} is empty`);
    }

    console.log(`get23_loadTxts.js: Got directory HTML from ${successSource}`);

    // Extract hrefs from HTML listing
    const hrefs = [...html.matchAll(/href="([^"]+)"/gi)].map(m => m[1]);
    console.log("get23_loadTxts.js: Directory hrefs:", hrefs);

    // Prefer .zip first, then .txt
    const preferredHref =
      hrefs.find(h => /\.zip$/i.test(h)) ||
      hrefs.find(h => /\.txt$/i.test(h));

    if (!preferredHref) {
      const preview = html.slice(0, 500);
      console.error("get23_loadTxts.js: No .zip or .txt found in directory listing. Preview:", preview);
      throw new Error(`No .zip or .txt file found in directory listing for ${path}`);
    }

    const resolvedFileUrl = new URL(preferredHref, finalUrl).href;
    console.log(`get23_loadTxts.js: Resolved file from directory: ${resolvedFileUrl}`);

    const nestedResponse = await fetch(resolvedFileUrl);

    if (!nestedResponse.ok) {
      throw new Error(`Failed to fetch file from directory: HTTP ${nestedResponse.status}`);
    }

    if (resolvedFileUrl.toLowerCase().endsWith(".txt")) {
      const txt = await nestedResponse.text();

      if (!txt || !txt.trim()) {
        throw new Error(`Directory TXT file is empty: ${resolvedFileUrl}`);
      }

      return cacheAndReturn(await parse23Txt(txt, resolvedFileUrl));
    }

    if (resolvedFileUrl.toLowerCase().endsWith(".zip")) {
      const buffer = await nestedResponse.arrayBuffer();

      if (!buffer || buffer.byteLength === 0) {
        throw new Error(`Directory ZIP file is empty: ${resolvedFileUrl}`);
      }

      const bytes = new Uint8Array(buffer);
      const isZipBuffer = bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;

      if (!isZipBuffer) {
        const preview = new TextDecoder("utf-8").decode(bytes.slice(0, 300));
        console.error("get23_loadTxts.js: Directory file is not a ZIP. Preview:", preview);
        throw new Error(`Directory file is not a ZIP archive: ${resolvedFileUrl}`);
      }

      const zip = await JSZip.loadAsync(buffer);
      const zipNames = Object.keys(zip.files);
      console.log("get23_loadTxts.js: Nested ZIP entries:", zipNames);

      const targetFile = zipNames
        .map(name => zip.files[name])
        .find(file => !file.dir && file.name.toLowerCase().endsWith(".txt"));

      if (!targetFile) {
        throw new Error(`No .txt file found inside nested ZIP: ${resolvedFileUrl}`);
      }
      const txt = await targetFile.async("string");

      if (!txt || !txt.trim()) {
        throw new Error(`Extracted nested ZIP text file is empty: ${targetFile.name}`);
      }
      return cacheAndReturn(await parse23Txt(txt, targetFile.name));
    }
    throw new Error(`Unsupported file type found in directory: ${resolvedFileUrl}`);
  }
  throw new Error(`Unsupported final URL type from ${successSource}: ${finalUrl}`);
}

export { JSZip, load23andMeFile, parse23Txt, limitStorage, GET23_KEY_PREFIX };