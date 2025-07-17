# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Start the server:**
```bash
npm install
node server.js
```

**Deploy to Google Cloud Run:**
```bash
gcloud builds submit --tag gcr.io/PROJECT_ID/search-visuals
gcloud run deploy search-visuals --image gcr.io/PROJECT_ID/search-visuals --platform managed --region REGION --allow-unauthenticated
```

## Architecture Overview

This is a Node.js application that visualizes search comparison data between two search variants (typically "BK" control vs "DU" experiment).

### Core Components

**Server (server.js):**
- Express server that serves the dynamic comparison interface
- Handles CSV file uploads via multer to `/tmp/uploads` directory
- Parses CSV data to extract CTR metrics, search results, and metadata
- Dynamically generates HTML tables showing side-by-side comparisons
- Uses `/public` for static assets

**Static Version (docs/):**
- Self-contained browser-only version in `docs/index.html`
- Uses `docs/script.js` for client-side CSV parsing and rendering
- Automatically deployed to GitHub Pages via workflow

**Public Assets:**
- `public/table-view.js` - Main client-side filtering and pagination logic
- `public/result-filters.js` - Lightweight filtering for results pages
- `public/styles.css` - Styling for the comparison interface

### Data Flow

1. CSV upload contains columns like `CTR_BK`, `CTR_DU`, `BK_set1_result1_title`, etc.
2. Server detects prefixes (BK/DU) automatically from column headers
3. Data is parsed into records with control/experiment CTR values and result sets
4. Each query generates a parent row (query + CTR comparison) and child rows (result sets)
5. Client-side filtering allows search by query text and numeric CTR thresholds

### CSV Structure

Expected columns include:
- `CTR_[PREFIX]` - Click-through rates for each variant
- `[PREFIX]_set1_result[N]_title` - Result titles for each variant and set
- `[PREFIX]_set1_result[N]_img` - Optional image URLs
- `[PREFIX]_set1_result[N]_id_hyperlink` - Optional result links
- `total_clicks`, `large_gap`, `meaningful_change`, `set1_p1_change` - Metadata

### Deployment Notes

- Uses `/tmp/uploads` for file storage to support read-only container filesystems
- Listens on `process.env.PORT` for cloud deployment compatibility
- Static version in `docs/` can be deployed independently to GitHub Pages