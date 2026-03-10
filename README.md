# get-23andme-data
Retrieve **23andMe files** from the **The [Personal Genome Project** directly in the browser.

This lightweight JavaScript SDK programmatically retrieves, parses,  caches in browser storage, and visualizes publicly available genotype data originating from 23andMe tests that have been shared through the [Personal Genome Project](https://my.pgp-hms.org/public_genetic_data). 

---

## Live Demo

https://lorenasandoval88.github.io/get-23andme-data/
---

## Documentation
Available in the [wiki](https://github.com/lorenasandoval88/get-23andme-data/wiki). 

## Quick Test (Dev Console)

You can test the SDK directly in your browser console.

```javascript
const sdk = await import("https://lorenasandoval88.github.io/get-23andme-data/dist/sdk.mjs");

const participants = await sdk.fetch23andMeParticipants(10);
const firstProfile = participants.length ? await sdk.fetchProfile(participants[0].id) : null;

console.log({ participants, firstProfile });
```

<h2>Functionality</h2>
<p>Key features include:</p>
<ul>
  <li>Automated retrieval of publicly shared genotype datasets</li>
  <li>Client-side or server-side processing of genotype files</li>
  <li>Visualization of participant information and selected genetic markers</li>
  <li>Aggregated summary statistics derived from multiple participants</li>
  <li>Simple web interface for browsing available profiles</li>
</ul>



[<img width="755" height="599" alt="image" src="https://github.com/user-attachments/assets/b67e2a78-9f2f-420f-bd8b-f17945fbcbba" />](https://lorenasandoval88.github.io/get-23andme-data/)

## Architecture

- `src/js/`: browser app modules (`get23_main.js`, `get23_loadProfiles.js`, `get23_loadStats.js`).
- `src/js/data/`: reusable data-fetching module (`get23_allUsers.js`).
- `sdk.js`: public SDK entrypoint (exports the API used by consumers).
- `src/css/`: app styles (`styles.css`).
- `server/`: local proxy server (`proxy-server.js`) used to bypass CORS and serve PGP-backed endpoints.
- `dist/`: Rollup build outputs:
  - `dist/bundle.js` for the bundled browser app.
  - `dist/sdk.mjs` for ESM SDK output.
  - `dist/sdk.cjs` for CommonJS SDK output.

## Build

Run `npm run build` to generate:

- `dist/bundle.js`
- `dist/sdk.mjs`
- `dist/sdk.cjs`

## Run

- Run `npm run start` to start the local proxy/static server on `http://localhost:3000`.
- Open `http://localhost:3000` in your browser.
- If you use a separate static server (for example VS Code Live Server), keep the proxy running for API calls to `http://localhost:3000`.

## SDK API

Public exports from `sdk.js`:

- `loadProfiles`
- `loadStats`
