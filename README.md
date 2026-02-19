# get-23andme-data

Simple demo that reads PGP statistics and plots 23andMe values.
Live at: https://lorenasandoval88.github.io/get-23andme-data/

## Run locally (Node proxy)

1. Install Node.js 18+.
2. Install dependencies:

	npm install

3. Start the proxy + static server:

	npm start

4. Open:

	http://localhost:3000

The browser fetches `GET /pgp-stats` from the local proxy server to avoid CORS issues.

## If public proxies are blocked

Run a local PowerShell proxy in a terminal:

`./proxy-server.ps1`

Then open the app with Live Server as usual. The frontend automatically tries `http://localhost:3001/pgp-stats`.
