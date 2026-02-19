async function loadStats() {
    const sourceStatusEl = document.getElementById("sourceStatus");
    if (sourceStatusEl) sourceStatusEl.textContent = "Source: checking...";

    try {
        const target = "https://my.pgp-hms.org/public_genetic_data/statistics";
        const candidates = [
            { name: "local-proxy", url: "/pgp-stats" },
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
                console.log(`Trying ${candidate.name}: HTTP ${response.status}`);
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
                positions: parseInt(cols[3].innerText.replace(/,/g, ""), 10)
            };
            break;
        }

        if (!stats) {
            if (sourceStatusEl) sourceStatusEl.textContent = `Source: ${source}`;
            document.getElementById("output").textContent = "No data found";
            return;
        }

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
    }
}