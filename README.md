# chijw.github.io

Source files for `chijw.github.io`, including the main academic homepage and the `sakiko/` subpage.

## Contribution Notes

### Asset conventions

- Prefer compressed image assets with practical web dimensions.
- Prefer `.jpg` for photographic or illustration-style assets unless transparency is required.
- Reuse existing assets when possible; avoid introducing oversized originals directly into the repo.
- Card images are shown in a 16:9 frame and cropped to fill it. For diagram-style teasers that would lose content, add `class="project-cover-contain"` to the `<img>` so the whole figure is shown.

### Button style order

When a block contains multiple action buttons, keep a stable semantic color order so cards remain visually consistent across the site:

1. `btn-outline-blue`
2. `btn-outline-emerald`
3. `btn-outline-red`
4. `btn-outline-violet`
5. `btn-outline-amber`

Not every card needs all five button types, but if multiple button styles appear together, preserve this ordering unless there is a strong local reason not to.

### Author list format

Follow the site's existing publication-card markup conventions.

- Write authors as plain inline text separated by commas.
- Link authors only when a homepage, profile, or project page is available.
- A name should never wrap across lines. Linked and bold names are kept whole by CSS; in a plain name, join the parts with `&nbsp;` (and put `&#8288;` after a hyphen), e.g. `Yi-&#8288;Hsin&nbsp;Hung`.
- Use `<strong>...</strong>` only for the locally highlighted author, not for the entire author line.
- Put the venue or date on the next line via `<br>` followed by `<span class="publication-venue">...</span>`.
- For very long author lists, keep the leading authors through the highlighted one, then `et al.`, then the last four.
- In documentation examples, prefer neutral placeholder URLs such as `https://example.com/...` instead of repo-specific relative paths.

Preferred pattern:

```html
<p class="publication-authors">
    <strong>Author One</strong>,
    <a href="https://example.com/author-two" rel="noreferrer">Author Two</a><br>
    <span class="publication-venue">Conference or Venue, 2026</span>
</p>
```

### Editor chrome (main page)

`index.html` borrows three pieces of nvim and `nvim.js` keeps them in sync:

- **Tabline** (`<header class="tabline">`): one `.tabline-tab` per section, in page order. A section is any element with a `data-path` (its "file name", e.g. `/preprints.bib`) and a matching `id`; when adding or removing a section, add or remove its tab too.
- **Gutter and cursor line**: every `.publication` and `.friend-link-name` is a numbered line (relative to the cursor once it is on one) with a highlight band. No extra markup is needed per line.
- **Status line** (`<footer class="statusline">`): mode, branch, current section path, last-updated date and scroll percentage. Update the date in `#lastUpdated` by hand.
- **Scrollbar**: where there is a mouse, `nvim.js` hides the native scrollbar and builds a slim one between the two bars, with ticks for the section starts and the cursor. Touch devices keep the native one.

Keys: `j`/`k` (with counts) move the cursor through the lines, and `k` from the first line goes back to the top of the page; `Enter` opens the line under the cursor; `gg`/`G` go to the top/bottom (`{n}G` to line n); `gt`/`gT`/`{n}gt` switch sections; `d`/`u` scroll half a page; `Esc` clears the cursor.

Both bars are `position: fixed`, not sticky, so they do not move when the page rubber-bands.

### Stylesheet version

`index.html` loads `stylesheet.css?v=YYYYMMDD`. Bump that date whenever the HTML starts relying on new CSS, so browsers holding an older cached stylesheet fetch the new one instead of rendering the new markup unstyled.

### Sakiko page notes

- Keep the `sakiko/` page visually aligned with the main site.
- Prefer concise, academic-homepage-style project descriptions.
- Credit upstream projects clearly when the work is a customization or downstream adaptation.
