# chijw.github.io

Source files for `chijw.github.io`, including the main academic homepage and the `sakiko/` subpage.

## Contribution Notes

### Asset conventions

- Prefer compressed image assets with practical web dimensions.
- Prefer `.jpg` for photographic or illustration-style assets unless transparency is required.
- Reuse existing assets when possible; avoid introducing oversized originals directly into the repo.

### Typography and buttons

The site uses two typefaces with fixed roles: Newsreader (serif) for human-written content — the hero name, prose, paper titles, author lists — and Fira Code (mono) for metadata and labels — venues, dates, section headings, buttons, captions. One accent color (Tsinghua purple, `--accent` in `stylesheet.css`) is reserved for metadata and hover states.

All action buttons share the single `btn` class; there are no per-button color variants. Keep a stable order when multiple buttons appear together: Project, Paper, Code, Model, Data (or Repo, Upstream on project cards).

### Author list format

Follow the site's existing publication-card markup conventions.

- Put the venue above the title as an eyebrow: `<p class="publication-eyebrow"><span class="publication-venue">...</span></p>`, optionally followed by `<strong class="highlight-paper">...</strong>` for awards. (Exception: project cards on `sakiko/` keep the date inline inside `.publication-authors` via `<br>` + `<span class="publication-venue">`.)
- Write authors as plain inline text separated by commas.
- Link authors only when a homepage, profile, or project page is available.
- Use `<strong>...</strong>` only for the locally highlighted author, not for the entire author line.
- In documentation examples, prefer neutral placeholder URLs such as `https://example.com/...` instead of repo-specific relative paths.

Preferred pattern:

```html
<p class="publication-eyebrow"><span class="publication-venue">Conference 2026</span></p>
<h3>Paper Title</h3>
<p class="publication-authors">
    <strong>Author One</strong>,
    <a href="https://example.com/author-two" rel="noreferrer">Author Two</a>
</p>
```

### Sakiko page notes

- Keep the `sakiko/` page visually aligned with the main site.
- Prefer concise, academic-homepage-style project descriptions.
- Credit upstream projects clearly when the work is a customization or downstream adaptation.
