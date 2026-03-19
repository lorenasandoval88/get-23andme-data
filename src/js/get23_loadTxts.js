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
async function load23andMeFile(path) {
    console.log(`get23_loadTxts.js(load23andMeFile()): Loading 23andMe file from: ${path}`);
	const isRemote = /^https?:\/\//.test(path);
	const isZipUrl = path.includes('pgp-hms.org') || path.endsWith('.zip');
	
	// Local .txt files - just fetch and parse directly
	if (!isRemote || (!isZipUrl && path.endsWith('.txt'))) {
		const response = await fetch(path);
		if (!response.ok) {
			throw new Error(`Failed to load ${path}: ${response.status}`);
		}
		const txt = await response.text();
		return parse23Txt(txt, path);
	}
	
	// Remote PGP URLs that return ZIP files
	const WORKER_BASE = "https://pgp-proxy.your-worker.workers.dev/?url=";
	const target = path;
	const candidates = [
		// ✅ your Cloudflare Worker (put near the top)
		{ name: "cf-worker", url: `${WORKER_BASE}${encodeURIComponent(target)}` },
		{ name: "local-proxy", url: "http://localhost:3000/pgp-stats" },
		// { name: "powershell-proxy", url: "http://localhost:3000/pgp-stats" },
		{ name: "allorigins", url: `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}` },
		{ name: "corsproxy", url: `https://corsproxy.io/?${target}` },
		{ name: "github-pages-proxy", url: "https://lorenasandoval88.github.io/get-23andme-data/pgp-stats" }
	];

	let buffer = null;
	let lastError = null;

	for (const candidate of candidates) {
                    console.log("candidate.url",candidate.url)

		try {
			console.log(`get23_loadTxts.js: Trying ${candidate.name}...`);
			const response = await fetch(candidate.url);
            console.log(`get23_loadTxts.js: Received response from ${candidate.name}: HTTP ${response.status}`);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}
			buffer = await response.arrayBuffer();
			console.log(`get23_loadTxts.js: Success with ${candidate.name}`);
            console.log(`get23_loadTxts.js: Loaded ${buffer.byteLength} bytes from ${candidate.name}`, buffer);
			break;
		} catch (err) {
			console.warn(`get23_loadTxts.js: ${candidate.name} failed: ${err.message}`);
			lastError = err;
		}
	}
        console.log(`2 et23_loadTxts.js: Loaded buffer`, buffer);

	if (!buffer) {
		throw new Error(`All proxy candidates failed for ${path}: ${lastError?.message}`);
	}

	// Unzip and parse the 23andMe text file
	const zip = await JSZip.loadAsync(buffer);
console.log(`get23_loadTxts.js: ZIP file loaded with ${Object.keys(zip.files).length} entries`, Object.keys(zip.files));
	// Find genotype file
	let targetFile = null;
	for (const name of Object.keys(zip.files)) {
		const file = zip.files[name];
		if (!file.dir && (
			name.endsWith(".txt") ||
			name.includes("23andme") ||
			name.toLowerCase().includes("genome")
		)) {
			targetFile = file;
			break;
		}
	}

	if (!targetFile) {
		throw new Error("No genotype file found in ZIP");
	}

	// Extract text and parse
	const txt = await targetFile.async("string");
	return parse23Txt(txt, path);
}


export { JSZip,load23andMeFile, parse23Txt };