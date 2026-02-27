'use strict';

/**
 * Fetches 23andMe participant data from Personal Genome Project (PGP)
 * Uses local proxy to bypass CORS restrictions
 */


/**
 * Fetch 23andMe participants from PGP
 * @param {number} limit - Number of participants to return (default: 1300)
 * @returns {Promise<Array>} Array of participant objects
 */



async function fetch23andMeParticipants(limit = 1300) {
    const proxyUrls = [
        `http://localhost:3000/pgp-participants` //,
        //   `https://api.allorigins.win/raw?url=${encodeURIComponent(PGP_23ANDME_URL)}`,
        //  `https://corsproxy.io/?${PGP_23ANDME_URL}`
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
// Example
//const participants = await fetch23andMeParticipants();//console.log("23andMe participants:", participants);
// const participants_ids = [...new Set(participants.map(p => p.id))];

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
 * Display participants in a specified element
 * @param {string} elementId - ID of the element to display results
 * @param {number} limit - Number of participants to fetch
 */
async function displayParticipants(elementId, limit = 1300) {
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



async function fetchProfile(id) {
    const url = `http://localhost:3000/pgp-profile/${id}`;

    const res = await fetch(url);

    if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    return data;
}


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

exports.displayParticipants = displayParticipants;
exports.fetch23andMeParticipants = fetch23andMeParticipants;
exports.fetchProfile = fetchProfile;
exports.parseParticipants = parseParticipants;
//# sourceMappingURL=sdk.cjs.map
