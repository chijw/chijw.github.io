// A small nod to living in the terminal: the footer behaves like an editor status line
// (mode, current section, scroll position) and the page answers to a few vim-style keys.
document.addEventListener('DOMContentLoaded', () =>
{
    const statusline = document.querySelector('.statusline');
    const modeLabel = statusline?.querySelector('.statusline-mode');
    const sectionLabel = statusline?.querySelector('.statusline-section');
    const positionLabel = statusline?.querySelector('.statusline-position');

    if (!statusline || !modeLabel || !sectionLabel || !positionLabel)
    {
        return;
    }

    const sections = Array.from(document.querySelectorAll('[data-path]'));
    const lineStep = 64;
    const chordTimeout = 600;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const jumpBehavior = prefersReducedMotion ? 'auto' : 'smooth';

    let updateFrame = 0;
    let lastGPress = 0;

    const scrollableHeight = () => document.documentElement.scrollHeight - window.innerHeight;

    const update = () =>
    {
        updateFrame = 0;

        const scrollable = scrollableHeight();
        const offset = window.scrollY;

        const progress = scrollable <= 0 ? 1 : Math.min(1, Math.max(0, offset / scrollable));

        positionLabel.textContent = `${Math.round(progress * 100)}%`;

        // The current section is the last one whose heading has passed the upper part of the window.
        // A short final section never gets that far up, so the bottom of the page counts as being in it.
        const isAtBottom = scrollable > 0 && offset >= scrollable - 1;
        let path = '';

        sections.forEach((section, index) =>
        {
            const isLast = index === sections.length - 1;

            if (section.getBoundingClientRect().top <= window.innerHeight * 0.35 || (isLast && isAtBottom))
            {
                path = section.dataset.path;
            }
        });

        sectionLabel.textContent = path;
    };

    const scheduleUpdate = () =>
    {
        if (!updateFrame)
        {
            updateFrame = window.requestAnimationFrame(update);
        }
    };

    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('load', scheduleUpdate);
    update();

    // Selecting text flips the mode, as it would in the editor.
    document.addEventListener('selectionchange', () =>
    {
        const selection = document.getSelection();
        const isSelecting = Boolean(selection && !selection.isCollapsed && selection.toString().trim());

        statusline.classList.toggle('is-visual', isSelecting);
        modeLabel.textContent = isSelecting ? 'Visual' : 'Normal';
    });

    document.addEventListener('keydown', (event) =>
    {
        const target = event.target;

        if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey)
        {
            return;
        }

        if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))
        {
            return;
        }

        const isChordedG = event.key === 'g' && event.timeStamp - lastGPress < chordTimeout;
        lastGPress = event.key === 'g' && !isChordedG ? event.timeStamp : 0;

        if (event.key === 'j')
        {
            window.scrollBy({ top: lineStep });
        }
        else if (event.key === 'k')
        {
            window.scrollBy({ top: -lineStep });
        }
        else if (event.key === 'd')
        {
            window.scrollBy({ top: window.innerHeight / 2, behavior: jumpBehavior });
        }
        else if (event.key === 'u')
        {
            window.scrollBy({ top: -window.innerHeight / 2, behavior: jumpBehavior });
        }
        else if (event.key === 'G')
        {
            window.scrollTo({ top: scrollableHeight(), behavior: jumpBehavior });
        }
        else if (isChordedG)
        {
            window.scrollTo({ top: 0, behavior: jumpBehavior });
        }
        else if (/^[1-9]$/.test(event.key) && sections[Number(event.key) - 1])
        {
            sections[Number(event.key) - 1].scrollIntoView({ behavior: jumpBehavior, block: 'start' });
        }
    });
});
