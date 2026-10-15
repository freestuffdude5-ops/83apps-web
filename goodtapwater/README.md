# Good Tap Water website

The site for [goodtapwater.com](https://goodtapwater.com). It replaces the old WordPress theme with plain static files: no WordPress, no plugins, no database and nothing to update.

```
goodtapwater/
├── index.html          the whole homepage (HTML, CSS and JS in one file)
├── privacy/index.html  privacy policy (keeps the old /privacy/ URL working)
├── assets/             logo, mascot, product photos, icons, social share image
├── favicon.ico
├── site.webmanifest
├── robots.txt
└── sitemap.xml
```

Old links like `/#packages`, `/#why`, `/#reviews`, `/#faq` and `/#appointment` still go to the right sections.

## Preview locally

```sh
cd goodtapwater
python3 -m http.server 8000
# open http://localhost:8000
```

## Before going live

1. **Connect the contact form.** At the bottom of `index.html`, set `FORM_ENDPOINT`. A free [Formspree](https://formspree.io) form works as is: create a form, then paste its URL (`https://formspree.io/f/xxxxxxx`). Requests arrive by email.
   Until it's set, the form doesn't lose anyone. It checks their details, then gives them a one-tap button to send everything to (386) 387-8505 as a text, plus a Call button.
2. **Double-check the claims.** Prices, package contents, "Fast installation" and "Priority service support" were carried over from the old site. Change anything that isn't final.
3. **Review the privacy policy** (`privacy/index.html`). It's a plain-English starter, not legal advice. Add a mailing address and mention any analytics or ad pixels you add.
4. **Add real reviews** to the "Our promise" section once customers agree to be quoted.

## Hosting

Any static host works. The simplest options:

- **Netlify or Cloudflare Pages**: drag the `goodtapwater` folder in (or connect this repo with `goodtapwater` as the publish directory), then point the domain's DNS at it.
- **Current web host**: back up the WordPress site, then upload the contents of `goodtapwater/` to the site root (`public_html`).

## Editing

- Phone number: search `index.html` for `3863878505` and `387-8505`.
- Booking link: search for `calendly.com`.
- Colors and fonts are tokens at the top of the `<style>` block (`--pine`, `--clay`, `--paper`). Dark mode follows the visitor's device setting.
- The hard-water check's logic is the `updateCheck` function in the script.
