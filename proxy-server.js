import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;
const PGP_STATS_URL = "https://my.pgp-hms.org/public_genetic_data/statistics";
const PGP_23ANDME_URL = "https://my.pgp-hms.org/public_genetic_data?utf8=%E2%9C%93&data_type=23andMe&commit=Search";

app.use(express.static("."));

app.get("/pgp-stats", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    console.log("Received request for /pgp-stats");
    try {
        const upstream = await fetch(PGP_STATS_URL);

        if (!upstream.ok) {
            res.status(upstream.status).send(`Upstream request failed (${upstream.status})`);
            return;
        }

        const html = await upstream.text();
        res.type("text/html").send(html);
    } catch (error) {
        res.status(502).send(`Proxy error: ${error.message}`);
    }
});

app.get("/pgp-participants", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    console.log("Received request for /pgp-participants");
    try {
        const upstream = await fetch(PGP_23ANDME_URL);

        if (!upstream.ok) {
            res.status(upstream.status).send(`Upstream request failed (${upstream.status})`);
            return;
        }

        const html = await upstream.text();
        res.type("text/html").send(html);
    } catch (error) {
        res.status(502).send(`Proxy error: ${error.message}`);
    }
});

app.listen(PORT, () => {
    console.log(`Proxy server running at http://localhost:${PORT}`);
});
