import JSZip from "jszip";

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
 * @returns {Promise<Object>} Parsed genome data
 */
// async function load23andMeFile(path) {
//     console.log(`get23_loadTxts.js(load23andMeFile()): Loading 23andMe file from: ${path}`);
// 	const isRemote = /^https?:\/\//.test(path);
// 	const isZipUrl = path.includes('pgp-hms.org') || path.endsWith('.zip');
	
// 	// Local .txt files - just fetch and parse directly
// 	if (!isRemote || (!isZipUrl && path.endsWith('.txt'))) {
// 		const response = await fetch(path);
// 		if (!response.ok) {
// 			throw new Error(`Failed to load ${path}: ${response.status}`);
// 		}
// 		const txt = await response.text();
// 		return parse23Txt(txt, path);
// 	}
	
// 	// Remote PGP URLs that return ZIP files
// 	const WORKER_BASE = "https://lorena-api.lorenasandoval88.workers.dev/?url=";
// 	const target = path;
// 	const candidates = [
// 		// ✅ your Cloudflare Worker (put near the top)
// 		{ name: "cf-worker", url: `${WORKER_BASE}${encodeURIComponent(target)}` },
// 		{ name: "local-proxy", url: "http://localhost:3000/pgp-stats" },
// 		// { name: "powershell-proxy", url: "http://localhost:3000/pgp-stats" },
// 		{ name: "allorigins", url: `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}` },
// 		{ name: "corsproxy", url: `https://corsproxy.io/?${target}` },
// 		{ name: "github-pages-proxy", url: "https://lorenasandoval88.github.io/get-23andme-data/pgp-stats" }
// 	];

// 	let buffer = null;
// 	let lastError = null;

// 	for (const candidate of candidates) {
//                     console.log("candidate.url",candidate.url)

// 		try {
// 			console.log(`get23_loadTxts.js: Trying ${candidate.name}...`);
// 			const response = await fetch(candidate.url);
//             console.log(`get23_loadTxts.js: Received response from ${candidate.name}: HTTP ${response.status}`,response);
// 			if (!response.ok) {
// 				throw new Error(`HTTP ${response.status}`);
// 			}
// 			buffer = await response.arrayBuffer();
// 			console.log(`get23_loadTxts.js: Success with ${candidate.name}`);
//             console.log(`get23_loadTxts.js: Loaded ${buffer.byteLength} bytes from ${candidate.name}`, buffer);
// 			break;
// 		} catch (err) {
// 			console.warn(`get23_loadTxts.js: ${candidate.name} failed: ${err.message}`);
// 			lastError = err;
// 		}
// 	}
//         console.log(`2 et23_loadTxts.js: Loaded buffer`, buffer);

// 	if (!buffer) {
// 		throw new Error(`All proxy candidates failed for ${path}: ${lastError?.message}`);
// 	}
//         console.log(`3 et23_loadTxts.js: Loaded buffer`, buffer);

// 	// Unzip and parse the 23andMe text file
// 	console.log(`get23_loadTxts.js: About to call JSZip.loadAsync, buffer size: ${buffer.byteLength}`);
	
// 	// Check if buffer is actually a ZIP file (starts with PK)
// 	const peek = new Uint8Array(buffer.slice(0, 4));
// 	console.log("First 4 bytes:", peek, "Expected ZIP signature: [80, 75, 3, 4]");
// 	if (peek[0] !== 80 || peek[1] !== 75) {
// 		// Not a ZIP - might be HTML error or text
// 		const text = new TextDecoder().decode(buffer.slice(0, 500));
// 		console.error("Buffer is not a ZIP file. First 500 chars:", text);
// 		throw new Error("Response is not a ZIP file");
// 	}
	
// 	let zip;
// 	try {
// 		zip = await JSZip.loadAsync(buffer);
// 	} catch (zipErr) {
// 		console.error(`get23_loadTxts.js: JSZip.loadAsync failed:`, zipErr);
// 		throw new Error(`Failed to unzip: ${zipErr.message}`);
// 	}
// console.log(`get23_loadTxts.js: ZIP file loaded with ${Object.keys(zip.files).length} entries`, Object.keys(zip.files));
// 	// Find genotype file
// 	let targetFile = null;
// 	for (const name of Object.keys(zip.files)) {
// 		const file = zip.files[name];
// 		if (!file.dir && (
// 			name.endsWith(".txt") ||
// 			name.includes("23andme") ||
// 			name.toLowerCase().includes("genome")
// 		)) {
// 			targetFile = file;
// 			break;
// 		}
// 	}

// 	if (!targetFile) {
// 		throw new Error("No genotype file found in ZIP");
// 	}

// 	// Extract text and parse
// 	const txt = await targetFile.async("string");
// 	return parse23Txt(txt, path);
// }

async function load23andMeFile(path) {
  console.log(`get23_loadTxts.js(load23andMeFile()): Loading 23andMe file from: ${path}`);

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
    return parse23Txt(txt, path);
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
    console.log("candidate.url", candidate.url);

    try {
      console.log(`get23_loadTxts.js: Trying ${candidate.name}...`);
      const response = await fetch(candidate.url);

      console.log(
        `get23_loadTxts.js: Received response from ${candidate.name}: HTTP ${response.status}`,
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

      console.log(`get23_loadTxts.js: content-type from ${candidate.name}: ${contentType}`);
      console.log(`get23_loadTxts.js: finalUrl from ${candidate.name}: ${exposedFinalUrl}`);

      // 👇 get header FIRST
       finalResponse = response;
      finalUrl = exposedFinalUrl;
      successSource = candidate.name;
      break;
    } catch (err) {
      console.warn(`get23_loadTxts.js: ${candidate.name} failed: ${err.message}`);
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
    return parse23Txt(txt, finalUrl);
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
console.log("paruser txt:",txt.slice(0,200))
    return parse23Txt(txt, targetFile.name);
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

      return parse23Txt(txt, resolvedFileUrl);
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
      return parse23Txt(txt, targetFile.name);
    }
    throw new Error(`Unsupported file type found in directory: ${resolvedFileUrl}`);
  }
  throw new Error(`Unsupported final URL type from ${successSource}: ${finalUrl}`);
}

export { JSZip,load23andMeFile, parse23Txt };