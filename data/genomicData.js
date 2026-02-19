/**
 * Fetches 23andMe participant data from Personal Genome Project (PGP)
 * Uses local proxy to bypass CORS restrictions
 */

const PGP_23ANDME_URL = "https://my.pgp-hms.org/public_genetic_data?utf8=%E2%9C%93&data_type=23andMe&commit=Search";

/**
 * Fetch 23andMe participants from PGP
 * @param {number} limit - Number of participants to return (default: 5)
 * @returns {Promise<Array>} Array of participant objects
 */
async function fetch23andMeParticipants(limit = 5) {
    const proxyUrls = [
        `http://localhost:3000/pgp-participants`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(PGP_23ANDME_URL)}`,
        `https://corsproxy.io/?${PGP_23ANDME_URL}`
    ];

    let html = null;
    let errors = [];

    for (const proxyUrl of proxyUrls) {
        try {
            const response = await fetch(proxyUrl);
            if (response.ok) {
                html = await response.text();
                break;
            }
            errors.push(`HTTP ${response.status}`);
        } catch (error) {
            errors.push(error.message);
        }
    }

    if (!html) {
        throw new Error(`Failed to fetch PGP data: ${errors.join(", ")}`);
    }

    return parseParticipants(html, limit);
}

/**
 * Parse HTML to extract participant data
 * @param {string} html - HTML content from PGP
 * @param {number} limit - Number of participants to return
 * @returns {Array} Array of participant objects
 */
function parseParticipants(html, limit) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const rows = [...doc.querySelectorAll("table tbody tr")];

    const participants = [];

    for (const row of rows) {
        if (participants.length >= limit) break;

        const cells = row.querySelectorAll("td");
        if (cells.length < 5) continue;

        const participantLink = cells[0].querySelector("a");
        const downloadLink = cells[4].querySelector("a");

        if (!participantLink) continue;

        const participant = {
            id: participantLink.textContent.trim(),
            profileUrl: participantLink.href || `https://my.pgp-hms.org${participantLink.getAttribute("href")}`,
            dataType: cells[1].textContent.trim(),
            uploadDate: cells[2].textContent.trim(),
            fileSize: cells[3].textContent.trim(),
            downloadUrl: downloadLink ? (downloadLink.href || `https://my.pgp-hms.org${downloadLink.getAttribute("href")}`) : null
        };

        participants.push(participant);
    }

    return participants;
}

/**
 * Display participants in a specified element
 * @param {string} elementId - ID of the element to display results
 * @param {number} limit - Number of participants to fetch
 */
async function displayParticipants(elementId, limit = 5) {
    const element = document.getElementById(elementId);
    if (!element) {
        console.error(`Element with id "${elementId}" not found`);
        return;
    }

    element.textContent = "Loading participants...";

    try {
        const participants = await fetch23andMeParticipants(limit);
        element.textContent = JSON.stringify(participants, null, 2);
        return participants;
    } catch (error) {
        element.textContent = `Error: ${error.message}`;
        throw error;
    }
}

// Export for use as ES module
export { fetch23andMeParticipants, parseParticipants, displayParticipants };
