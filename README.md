# chijw.github.io

Source files for `chijw.github.io`, including the main academic homepage and the `sakiko/` subpage.

## Contribution Notes

### Asset conventions

- Prefer compressed image assets with practical web dimensions.
- Prefer `.jpg` for photographic or illustration-style assets unless transparency is required.
- Reuse existing assets when possible; avoid introducing oversized originals directly into the repo.

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
- Use `<strong>...</strong>` only for the locally highlighted author, not for the entire author line.
- Put the venue or date on the next line via `<br>` followed by `<span class="publication-venue">...</span>`.
- In documentation examples, prefer neutral placeholder URLs such as `https://example.com/...` instead of repo-specific relative paths.

Preferred pattern:

```html
<p class="publication-authors">
    <strong>Author One</strong>,
    <a href="https://example.com/author-two" rel="noreferrer">Author Two</a><br>
    <span class="publication-venue">Conference or Venue, 2026</span>
</p>
```

### Sakiko page notes

- Keep the `sakiko/` page visually aligned with the main site.
- Prefer concise, academic-homepage-style project descriptions.
- Credit upstream projects clearly when the work is a customization or downstream adaptation.
