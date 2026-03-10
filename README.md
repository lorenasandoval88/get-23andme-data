# get-23andme-data


Live at: https://lorenasandoval88.github.io/get-23andme-data/


Simple demo that finds 23andMe files from the [Personal Genome Project](https://my.pgp-hms.org/public_genetic_data).



<h2>Overview</h2>
<p>
  <strong>get-23andme-data</strong> is a web-based demonstration application that programmatically retrieves, parses,
  and visualizes publicly available genotype data originating from 23andMe tests that have been shared through the
  Personal Genome Project (PGP). The project serves as a proof of concept for working with direct-to-consumer (DTC)
  genetic datasets, showing how raw genotype files can be accessed, processed, and presented in an interactive interface.
</p>

<h2>Purpose</h2>
<p>The repository is designed to illustrate:</p>
<ul>
  <li>Integration with open genomic data sources (specifically PGP participant datasets)</li>
  <li>Parsing of 23andMe raw genotype text files</li>
  <li>Extraction of selected SNP markers and associated metadata</li>
  <li>Presentation of participant summaries and statistics through a browser-based UI</li>
  <li>Educational exploration of consumer genomics workflows</li>
</ul>
<p>
  It is intended for demonstration, research, and educational use only and does not provide medical interpretation
  or diagnostic functionality.
</p>

<h2>Functionality</h2>
<p>Key features include:</p>
<ul>
  <li>Automated retrieval of publicly shared genotype datasets</li>
  <li>Client-side or server-side processing of genotype files</li>
  <li>Visualization of participant information and selected genetic markers</li>
  <li>Aggregated summary statistics derived from multiple participants</li>
  <li>Simple web interface for browsing available profiles</li>
</ul>

<h2>Data Source</h2>
<p>
  All genetic data displayed by the application originates from publicly consented participants in the
  <strong>Personal Genome Project</strong>, which provides open-access genomic and phenotype datasets for research
  and educational purposes.
</p>

<h2>Scope and Limitations</h2>
<p>
  The project is not intended to replicate the full functionality of commercial genetic testing services. Instead,
  it demonstrates data handling pipelines and visualization concepts using openly licensed datasets. No clinical
  claims are made, and users should not interpret results as medical advice.
</p>


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
