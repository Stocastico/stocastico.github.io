# Deployment Guide — Stefano Masneri Personal Website

This is a **pure static website** (HTML + CSS + JS, no build step, no server-side code).
Deployment is trivial and can be done for **free or near-zero cost** on several platforms.

---

## Quick Start — Preview Locally

Open a terminal in the project folder and run one of:

```bash
# Python 3 (most systems)
python3 -m http.server 8080

# Node.js (if installed)
npx serve .

# PHP (if installed)
php -S localhost:8080
```

Then open `http://localhost:8080` in your browser.


---

## Minification

Vite does it. `npm run build` minifies and hashes the JS and CSS into `dist/assets/`; there is
nothing to run by hand and nothing to commit.

This section used to describe `npm run minify`, which called `terser` via `npx` to produce a
committed `js/main.min.js` that the HTML then had to be pointed at. That script, that file and
that dependency are all gone — the build replaced them — but the instructions outlived them.

---

## Option 1 — GitHub Pages with GitHub Actions (Recommended)

Best for: automatic deployments, tests run on every push, free HTTPS, zero infrastructure.

### Step 1 — Create the workflow file

Create `.github/workflows/deploy.yml` in the repository (already included in this repo):

```yaml
name: Build and Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:        # allow manual trigger from GitHub UI

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Run tests
        run: npm test

      - name: Generate CV
        run: npm run generate-cv

      - name: Generate RSS feed
        run: npm run generate-rss -- --base-url https://<your-username>.github.io

      - name: Generate sitemap
        run: npm run generate-sitemap -- --base-url https://<your-username>.github.io

      - name: Generate globe locations
        run: npm run generate-locations

      - name: Minify JavaScript
        run: npm run minify

      - name: Setup Pages
        uses: actions/configure-pages@v4

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: .

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

Replace `<your-username>` with your actual GitHub username. If you use a custom domain, replace the `--base-url` value with your domain.

### Step 2 — Enable GitHub Pages

1. Push your repository to GitHub (or fork this repo).
2. Go to **Settings → Pages**.
3. Under *Source*, choose **GitHub Actions**.
4. Click **Save**.

The workflow runs automatically on every push to `main`. Your site will be live at:

```
https://<your-username>.github.io/<repo-name>/
```

If the repository is named `<username>.github.io` (i.e. a user/organisation page), the URL is simply:

```
https://<your-username>.github.io/
```

### Notes on the `generate-locations` step

The `generate-locations` script auto-geocodes city names via the OpenStreetMap Nominatim API. Results are cached in `.cache/locations-geocode-cache.json`. **Commit this cache file** so CI does not re-request coordinates on every run:

```bash
git add .cache/locations-geocode-cache.json
git commit -m "chore: add geocode cache"
```

---

## Option 2 — GitHub Pages (Manual, No Actions)

Best for: simplicity, no CI needed.

1. Push this repository to GitHub.
2. Go to **Settings → Pages**.
3. Under *Source*, choose **Deploy from a branch**.
4. Select `main` (or your branch) and folder `/` (root).
5. Click **Save**. Your site will be live at
   `https://<your-username>.github.io/<repo-name>/`

**Cost: $0** (only pay for the domain name, typically ~$10–15 / year)

---

## Option 3 — Netlify (Free tier)

Best for: drag-and-drop simplicity, continuous deployment from Git.

1. Create a free account at <https://netlify.com>.
2. Click **Add new site → Import an existing project** (connect GitHub).
   - Or drag-and-drop the project folder onto the Netlify dashboard.
3. Leave build settings empty (no build command, publish directory = `/`).
4. Click **Deploy site**.

Your site is live in ~30 seconds at a Netlify subdomain.
Add a custom domain under **Site settings → Domain management**.

**Cost: $0** on the free tier (100 GB bandwidth / month — more than enough for a personal site).

---

## Option 4 — Vercel (Free tier)

1. Create a free account at <https://vercel.com>.
2. Click **Add New Project → Import Git Repository**.
3. Leave all settings at defaults (framework = *Other*).
4. Click **Deploy**.

**Cost: $0** on the Hobby plan.

---

## Option 5 — Cloudflare Pages (Free tier)

Good choice if you already use Cloudflare for DNS (very fast CDN).

1. Go to **Cloudflare Dashboard → Pages → Create a project**.
2. Connect your GitHub repo.
3. Leave build command empty, set output directory to `/`.
4. Deploy.

**Cost: $0** (unlimited requests, unlimited bandwidth on free plan).

---

## Option 6 — Self-hosted VPS (Low cost)

For full control. Any tiny VPS will do.

```bash
# On your server (Ubuntu example)
sudo apt install nginx -y

# Copy site files
scp -r . user@your-server:/var/www/html/

# Nginx config at /etc/nginx/sites-available/default
server {
    listen 80;
    server_name stefano.com www.stefano.com;
    root /var/www/html;
    index index.html;
    location / { try_files $uri $uri/ =404; }
}

# Enable HTTPS with Let's Encrypt (free)
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d stefano.com -d www.stefano.com
```

**Cost: ~$4–6 / month** for the cheapest VPS (Hetzner, DigitalOcean, etc.) + domain.

---

## Custom Domain

This section explains how to deploy the site at your own domain (e.g. `stefano.com` or `www.stefano.com`) using GitHub Pages. The same DNS principles apply to Netlify, Vercel, and Cloudflare Pages — check those platforms' documentation for their specific IP addresses.

### Option A — Subdomain (`www.stefano.com`)

This is the easiest setup. A `CNAME` record points `www` to GitHub Pages.

**1. Add a `CNAME` file to the repository root:**

```
www.stefano.com
```

```bash
echo "www.stefano.com" > CNAME
git add CNAME && git commit -m "chore: add custom domain CNAME"
```

**2. Add a DNS record at your registrar:**

| Type  | Host | Value                        | TTL |
|-------|------|------------------------------|-----|
| CNAME | www  | `<your-username>.github.io.` | Auto |

**3. Configure GitHub Pages:**

1. Go to **Settings → Pages → Custom domain**.
2. Enter `www.stefano.com` and click **Save**.
3. Once DNS propagates, enable **Enforce HTTPS**.

---

### Option B — Apex domain (`stefano.com`, no `www`)

An apex domain (also called a root domain or naked domain) requires `A` records because DNS does not allow a `CNAME` at the apex.

**1. Add a `CNAME` file to the repository root:**

```
stefano.com
```

```bash
echo "stefano.com" > CNAME
git add CNAME && git commit -m "chore: add custom domain CNAME"
```

**2. Add `A` records at your registrar (GitHub Pages IPs):**

| Type | Host | Value           | TTL |
|------|------|-----------------|-----|
| A    | @    | 185.199.108.153 | Auto |
| A    | @    | 185.199.109.153 | Auto |
| A    | @    | 185.199.110.153 | Auto |
| A    | @    | 185.199.111.153 | Auto |

**3. Optionally add `AAAA` records for IPv6:**

| Type | Host | Value                   | TTL |
|------|------|-------------------------|-----|
| AAAA | @    | 2606:50c0:8000::153     | Auto |
| AAAA | @    | 2606:50c0:8001::153     | Auto |
| AAAA | @    | 2606:50c0:8002::153     | Auto |
| AAAA | @    | 2606:50c0:8003::153     | Auto |

**4. Redirect `www` to the apex (optional but recommended):**

Add a CNAME record so visitors using `www.stefano.com` are redirected:

| Type  | Host | Value         | TTL |
|-------|------|---------------|-----|
| CNAME | www  | `stefano.com` | Auto |

Some DNS providers do not support CNAME flattening at the apex; in that case, use a URL redirect rule in your registrar's control panel.

**5. Configure GitHub Pages:**

1. Go to **Settings → Pages → Custom domain**.
2. Enter `stefano.com` and click **Save**.
3. Wait for GitHub to verify DNS (usually a few minutes; up to 24–48 hours).
4. Enable **Enforce HTTPS** once verification passes.

---

### Updating the base URL in generated files

After setting a custom domain, re-run the generators with your new base URL so that RSS and sitemap entries use the correct absolute URLs:

```bash
npm run generate-rss -- --base-url https://stefano.com
npm run generate-sitemap -- --base-url https://stefano.com
```

Update the JSON-LD structured data and Open Graph `<meta>` tags in `index.html` to reflect the new domain as well.

---

## Customising Your Email

In `index.html`, find the contact card in the **Contact** section and replace:

```html
<a href="mailto:your.email@example.com" ...>
...
<span class="contact-value">your.email@example.com</span>
```

with your actual email address.

---

## Adding Your Photo

1. Put your photo file inside an `img/` folder, e.g. `img/photo.jpg`.
2. Open `index.html` and find the comment block inside `<div class="photo-card">`.
3. Replace the `<div class="photo-placeholder">...</div>` block with:

```html
<img src="img/photo.jpg" alt="Stefano Masneri" class="photo-img" />
```

---

## Performance Notes

- No build step, no bundler — the site loads very quickly.
- Three.js is loaded from a CDN; it is ~580 KB minified but cached on first load.
- Fonts are loaded from Google Fonts; if you want offline-only, download them
  and self-host inside a `fonts/` folder.
- The site respects `prefers-reduced-motion`: the neural network animation
  is automatically disabled for users who prefer reduced motion.
- Run `npm run minify` before deploying for a smaller `js/main.min.js`.

---

## File Structure

```
/
├── index.html          Main page
├── css/
│   └── styles.css      All styles (CSS variables for easy theming)
├── data/
│   ├── cv.yaml         CV source (edit this, then run generate-cv)
│   ├── cv.js           Generated CV data
│   ├── blog.js         Blog card data
│   ├── locations.yaml  Source data for globe content
│   ├── publications.js Publication list data
│   └── locations.js    Generated globe pins/trips/regions
├── js/
│   ├── main.js         Three.js animation + UI logic
│   └── main.min.js     Minified (generated by npm run minify)
├── scripts/
│   ├── generate-cv.js         CV generator
│   ├── generate-locations.js  YAML → locations.js generator
│   ├── generate-rss.js        RSS feed generator
│   ├── generate-sitemap.js    Sitemap generator
│   ├── new-post.js            Blog post generator
│   └── update-locations.sh    Shortcut command
├── .github/
│   └── workflows/
│       └── deploy.yml  GitHub Actions deployment workflow
├── img/                (create this folder) — put your photo here
├── blog/               Blog post HTML files
├── CNAME               (optional) — custom domain for GitHub Pages
├── docs/
│   ├── DATA-FORMATS.md YAML format reference for cv.yaml and locations.yaml
│   └── DEPLOYMENT.md   This file
└── README.md           Developer documentation
```
