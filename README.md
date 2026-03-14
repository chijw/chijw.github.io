# chijw.github.io

Personal academic homepage sources for `chijw.github.io`, including the main site and the `sakiko/` subpage.

## Contribution Notes

### Asset conventions

- Prefer compressed image assets with practical web dimensions.
- Prefer `.jpg` for photographic / illustration-style assets unless transparency is actually needed.
- Reuse existing assets when possible; avoid introducing oversized originals directly into the repo.

### Button style order

When a block contains multiple action buttons, keep the semantic color order aligned with the current site convention used in the `Spatial-TTT` card:

1. `btn-outline-blue`
2. `btn-outline-emerald`
3. `btn-outline-red`
4. `btn-outline-violet`
5. `btn-outline-amber`

Not every card needs all five buttons, but if multiple button types appear together, preserve this ordering unless there is a strong local reason not to.

### Author list format

Follow the existing `PUBLICATIONS` markup style in `index.html`.

- Write authors as plain inline text separated by commas.
- Link authors who have a homepage or profile link.
- Use `<strong>...</strong>` only for the local highlighted author, not for the entire author line.
- Put the venue / date on the next line via `<br>` followed by `<span class="publication-venue">...</span>`.

Preferred pattern:

```html
<p class="publication-authors">
    <strong>Sakiko</strong>,
    <a href="../index.html" rel="noreferrer">Jiawei Chi</a><br>
    <span class="publication-venue">March 2026</span>
</p>
```

### Sakiko page notes

- Keep the `sakiko/` page visually aligned with the main site.
- Prefer concise, academic-homepage-style project descriptions.
- Credit upstream projects clearly when the work is a customization or downstream adaptation.
