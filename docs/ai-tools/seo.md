# AI Workbench: search, sharing, and languages

Part of [#681](https://github.com/AliSafari-IT/asafarim-platform/issues/681).

## What gets indexed

| Route | Indexed | In sitemap | Why |
| --- | --- | --- | --- |
| `/tools` | Once it lists a public tool | Same | An empty catalogue isn't worth indexing. |
| `/tools/<slug>`, `beta` / `stable` / `paused` | Yes | Yes (`lastModified` = review date) | Charter §4. Paused pages stay up and explain the pause. |
| `/tools/<slug>`, `experiment` / `retired` | No (`noindex, follow`) | No | Reachable by URL, never promoted. |
| Internal tools (`shell-reference`) | Never routed in production | No | — |
| Results, handoff files | — | — | Results live only in the browser; handoffs are downloaded files. There are no result URLs to index. |
| `/api/…` | Disallowed in `robots.txt` | No | Runs and errors, never content pages. |

Every tool page's canonical is its bare path, so query strings and the locale cookie
never create a second indexable URL. All of this is derived from the catalogue
(`lifecycle`, `indexable`, `internal`), and `lib/tools/seo.test.tsx` covers each case.

## Page content

Each tool page renders, from its catalogue entry and whether or not live generation is on:
the job as the H1 and title, what to paste, what you get, the AI-use and privacy
notices next to the input, a worked (synthetic) example, **How it works**
(`howItWorks`: validation, grounding, and checks, each true of the shipped code),
limitations, links to privacy and terms, the author, and the last review date. The
case-study link appears once `caseStudyPath` is set (#683).

## Social and structured data

- Open Graph and Twitter cards per tool (`app/tools/[slug]/opengraph-image.tsx`) and for
  the catalogue, generated from the catalogue.
- `WebApplication` JSON-LD **only on indexable tool pages**, built from catalogue data
  the page also shows: name, description, "Free to use · No sign-in needed" (free
  `Offer`), author, review date. No ratings, reviews, or download counts, ever.

## Languages (decision)

The site resolves its locale from a cookie on the same URLs (en, nl, fr, de, lb); there
are no per-locale paths. For the MVP:

- Tool pages are **English only**. The article is marked `lang="en"` so assistive tech
  reads it correctly under any site locale, and the metadata has **no
  `alternates.languages`**: there are no equivalent reviewed translations to point to.
- `/tools` shows translated chrome under a non-English cookie, but its canonical is the
  same URL and crawlers (no cookie) get English.
- A translated tool page ships only with reviewed copy, and only with a real per-locale URL
  plus matching `hreflang` alternates. Never a half-translated page.

## Launch and inspection runbook

When a tool moves to `beta` (and after any change to its title, description, or
lifecycle):

1. Deploy, then open `https://asafarim.com/sitemap.xml` and check the tool's URL is listed
   (and experiments are not).
2. Check `https://asafarim.com/robots.txt` still allows `/` and disallows `/api/`.
3. Run the page through Google's Rich Results Test and the Schema.org validator: the
   `WebApplication` should validate with no warnings about missing ratings (we don't
   claim any).
4. Check the social card with a link preview (for example, paste the URL in a private
   chat) and confirm the title and image.
5. In Search Console for `asafarim.com`: resubmit the sitemap, then use **URL
   inspection → Request indexing** for the tool page.
6. A week later, inspect the URL again: confirm "URL is on Google" and the selected
   canonical matches ours. Note impressions and clicks as the baseline in the analytics
   review (#682).
