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

## Option 1 — GitHub Pages (Free, Recommended)

Best for: open-source portfolio, zero cost, automatic HTTPS.

1. Push this repository to GitHub.
2. Go to **Settings → Pages**.
3. Under *Source*, choose **Deploy from a branch**.
4. Select `main` (or your branch) and folder `/` (root).
5. Click **Save**. Your site will be live at
   `https://<your-username>.github.io/<repo-name>/`

**Custom domain (optional)**

```bash
# 1. Add a CNAME file to the repo root
echo "www.stefanomasneri.com" > CNAME

# 2. Set up a CNAME record in your DNS provider:
#    www  →  <your-username>.github.io
```

GitHub Pages handles HTTPS automatically once the domain resolves.

**Cost: $0** (only pay for the domain name, typically ~$10–15 / year)

---

## Option 2 — Netlify (Free tier)

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

## Option 3 — Vercel (Free tier)

1. Create a free account at <https://vercel.com>.
2. Click **Add New Project → Import Git Repository**.
3. Leave all settings at defaults (framework = *Other*).
4. Click **Deploy**.

**Cost: $0** on the Hobby plan.

---

## Option 4 — Cloudflare Pages (Free tier)

Good choice if you already use Cloudflare for DNS (very fast CDN).

1. Go to **Cloudflare Dashboard → Pages → Create a project**.
2. Connect your GitHub repo.
3. Leave build command empty, set output directory to `/`.
4. Deploy.

**Cost: $0** (unlimited requests, unlimited bandwidth on free plan).

---

## Option 5 — Self-hosted VPS (Low cost)

For full control. Any tiny VPS will do.

```bash
# On your server (Ubuntu example)
sudo apt install nginx -y

# Copy site files
scp -r . user@your-server:/var/www/html/

# Nginx config at /etc/nginx/sites-available/default
server {
    listen 80;
    server_name stefanomasneri.com www.stefanomasneri.com;
    root /var/www/html;
    index index.html;
    location / { try_files $uri $uri/ =404; }
}

# Enable HTTPS with Let's Encrypt (free)
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d stefanomasneri.com -d www.stefanomasneri.com
```

**Cost: ~$4–6 / month** for the cheapest VPS (Hetzner, DigitalOcean, etc.) + domain.

---

## Customising Your Email

In `js/main.js`, find the `DATA.contact` array and replace:
```js
value: 'your.email@example.com',
href:  'mailto:your.email@example.com',
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

## Adding a Blog Post

Open `js/main.js` and add an entry to `DATA.blogPosts`:

```js
blogPosts: [
  {
    title:   "My first post",
    date:    "2024-12-01",          // ISO date
    excerpt: "A short teaser...",
    url:     "blog/my-first-post.html",
  },
],
```

Create the corresponding HTML file at `blog/my-first-post.html`.
A starter template for blog posts can be added later — just keep the same
`css/styles.css` link and font imports in the `<head>`.

---

## Performance Notes

- No build step, no bundler — the site loads very quickly.
- Three.js is loaded from a CDN; it is ~580 KB minified but cached on first load.
- Fonts are loaded from Google Fonts; if you want offline-only, download them
  and self-host inside a `fonts/` folder.
- The site respects `prefers-reduced-motion`: the neural network animation
  is automatically disabled for users who prefer reduced motion.

---

## File Structure

```
/
├── index.html          Main page
├── css/
│   └── styles.css      All styles (CSS variables for easy theming)
├── js/
│   └── main.js         Content data + Three.js animation + UI logic
├── img/                (create this folder) — put your photo here
├── blog/               (create this folder) — put blog post HTML files here
├── CNAME               (optional) — custom domain for GitHub Pages
└── DEPLOYMENT.md       This file
```
