# Search Visuals

A lightweight Node.js server for visualizing search result data. It loads a CSV file containing metrics for two search variants (BK and DU) and shows the differences in click-through rate and result sets via an interactive web interface.

## Setup

Install dependencies and start the server:

```bash
npm install
node server.js
```

Uploaded CSV files are saved to a temporary directory (`/tmp/uploads`) so that
the server can run on platforms like Google Cloud Run where the container
filesystem is read-only except for `/tmp`.

Then open [http://localhost:8080](http://localhost:8080) in your browser.

## GitHub Pages

The `docs/` directory contains a static version of the interface that works
entirely in the browser. Open `docs/index.html` directly or host the contents of
`docs/` on GitHub Pages to use the tool without running the Node server. This
repository includes a workflow in `.github/workflows/pages.yml` that publishes
the `docs/` directory automatically whenever changes are pushed to `main`.

## CSV Format

The server expects a CSV with a header row. A sample file is included (`ctr_gap_analysis_overall_DU.csv`).
In addition to columns for queries, CTRs and result titles, optional columns may
provide an image URL (`*_img`) and a hyperlink (`*_id_hyperlink`) for each
result. When present, these are displayed in the table and the image links to the
provided URL.

## Deploying to Google Cloud Run

A `Dockerfile` is provided so the application can run in a container. After
installing the [Google Cloud CLI](https://cloud.google.com/sdk), build and deploy
with:

```bash
gcloud builds submit --tag gcr.io/PROJECT_ID/search-visuals
gcloud run deploy search-visuals --image gcr.io/PROJECT_ID/search-visuals --platform managed --region REGION --allow-unauthenticated
```

Replace `PROJECT_ID` with your Google Cloud project ID and `REGION` with the
region you want to deploy to. The server listens on the `PORT` environment
variable provided by Cloud Run.
