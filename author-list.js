// Collapses the tail of long author lists (`.authors-more`) behind a "+N more" toggle.
// Without JavaScript the full list simply stays visible.
document.addEventListener('DOMContentLoaded', () =>
{
    document.querySelectorAll('.authors-more').forEach((tail, index) =>
    {
        const hiddenCount = tail.textContent.split(',').filter((name) => name.trim()).length;

        if (!hiddenCount)
        {
            return;
        }

        const toggle = document.createElement('button');
        const collapsedLabel = `+${hiddenCount} more`;

        tail.id = tail.id || `authors-more-${index + 1}`;
        tail.hidden = true;

        toggle.type = 'button';
        toggle.className = 'authors-toggle';
        toggle.textContent = collapsedLabel;
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-controls', tail.id);

        toggle.addEventListener('click', () =>
        {
            const isExpanding = tail.hidden;

            tail.hidden = !isExpanding;
            toggle.textContent = isExpanding ? 'less' : collapsedLabel;
            toggle.setAttribute('aria-expanded', String(isExpanding));
        });

        tail.after(' ', toggle);
    });
});
