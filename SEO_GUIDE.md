# FinatriX — Free SEO Playbook (rank #1 for "Finatrix")

Ranking #1 for your own brand name **"Finatrix"** is very achievable for free — it's a
distinctive coined word with almost no competition. The code-side SEO is already done
(see "What's already in the code"). The rest is a handful of free, mostly one-time setup
steps below. Expect to rank #1 for "Finatrix" within a few days to ~2 weeks of submitting
to Google Search Console.

---

## 0. First: pick ONE canonical domain (important)

Right now the meta tags, `sitemap.xml` and `robots.txt` use
`https://finatrix-kimi-agent.netlify.app` as a safe default. If you have a custom domain,
do this so you don't split your ranking signals:

1. Decide your single real domain (e.g. `finatrix.online`). **Double-check the spelling** —
   the old project notes referenced "fiantrix.online" (fia… vs fina…); make sure the
   registered domain is actually **fina**trix.
2. Find-and-replace `https://finatrix-kimi-agent.netlify.app` with your real domain in:
   `index.html`, `public/sitemap.xml`, `public/robots.txt`.
3. In Netlify, set that domain as **Primary domain** and enable "redirect netlify.app →
   primary" so the other URL 301-redirects to it.

A single canonical domain = all link/authority signals point to one place.

---

## 1. Google Search Console (the single most important step — free)

1. Go to https://search.google.com/search-console and add your domain.
2. Verify (DNS TXT record, or the HTML-tag method).
3. **Submit your sitemap:** Sitemaps → enter `sitemap.xml` → Submit.
4. Use **URL Inspection** on your homepage → "Request indexing".

Once Google indexes you, a search for "Finatrix" will show your site #1 (brand terms with
no competitor rank immediately). Search Console also shows what queries you appear for.

## 2. Bing Webmaster Tools (free — covers Bing + DuckDuckGo + ChatGPT search)

https://www.bing.com/webmasters → add site → you can **import directly from Google Search
Console** in one click → submit the same `sitemap.xml`.

## 3. Strengthen brand signals (helps Google trust "Finatrix" = you)

- **Social profiles** (free), then list them so Google links them to your brand:
  - You already have Twitter/X `@finatrix_`. Add LinkedIn, Instagram, a public GitHub, etc.
  - Add each profile URL to the `sameAs` array in the JSON-LD in `index.html` (Twitter is
    already there). Example: `"sameAs": ["https://twitter.com/finatrix_", "https://www.linkedin.com/company/finatrix"]`.
- **Consistent name + email** everywhere (FinatriX, finatrix.hub@gmail.com) — already in
  your Organization schema.
- Optional: a free **Google Business Profile** if you ever want a brand knowledge panel.

## 4. Get a few free backlinks (speeds up authority for non-brand queries)

Pick a handful — quality over quantity:

- **Product Hunt** launch (free) — great for a tools product.
- **GitHub**: keep the repo public with a clear README and your live URL in the "About".
- **Reddit** (follow each sub's self-promo rules): r/IndiaInvestments, r/personalfinanceindia,
  r/IndianStreetBets — share a genuinely useful tool, not spam.
- **Free directories / launch sites**: BetaList, SaaSHub, AlternativeTo, Indie Hackers.
- **Write 1–2 posts** on dev.to / Medium / Hashnode (free) about "free budgeting tools for
  India" linking back to FinatriX.
- Indian personal-finance **listicles / blogs** — email the author to be added.

## 5. Make the content crawlable for NON-brand queries (e.g. "free budget tool India")

Your app is a client-rendered SPA — the homepage HTML is mostly an empty shell that React
fills in. Google *can* render JavaScript, but to compete for competitive (non-brand)
keywords you'll rank better if crawlers get real HTML. Free options, in order of effort:

1. **Easiest:** keep strong `<title>` + meta description + JSON-LD (already done) — enough
   for the brand term and long-tail.
2. **Better (free):** add static pre-rendering of the landing page so the HTML ships with
   real content. With this Vite/React setup you can use `vite-plugin-prerender` or
   `react-snap`, or turn on **Netlify's prerendering**. This is the highest-leverage upgrade
   for non-brand SEO.
3. Consider a lightweight **/blog** with a few articles targeting real queries ("50/30/20
   rule India", "where to park idle cash India") — content is what ranks for non-brand terms.

## 6. Quick technical checklist (already handled in code ✅)

- ✅ Unique, descriptive `<title>` and meta description
- ✅ Canonical tag, Open Graph + Twitter cards (nice social previews)
- ✅ `robots.txt` (allows crawling, points to sitemap) + `sitemap.xml`
- ✅ Organization + WebApplication structured data (JSON-LD) with `sameAs`
- ✅ Favicon + theme-color
- ✅ HTTPS, mobile-responsive, fast (code-split, cached, lighter CSS) — Core Web Vitals
- ✅ Security headers (Google considers HTTPS/security a positive signal)
- ⬜ Submit to Search Console + Bing (you do this — step 1 & 2)
- ⬜ Set canonical domain (step 0)
- ⬜ A few backlinks (step 4)

---

### TL;DR
For **"Finatrix"** specifically: do **step 0, 1, and 2** today and you'll be #1 within days —
it's your unique brand name with no competition. Steps 3–5 build authority so you also start
ranking for the competitive, non-brand searches over the following weeks.
