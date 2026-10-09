// A little editor chrome borrowed from nvim: the tabline lists the page's sections as buffers, the
// papers and friend links are numbered lines with a cursor line, the footer is a status line, and
// on desktop a scrollbar sits between the two bars. This script keeps them in sync and maps a few
// vim motions onto them:
//
//   j / k      move the cursor line (counts work: 3j); k from the first line returns to the top
//   Enter      open the line under the cursor
//   gg / G     top / bottom of the page, or {count}G for a given line
//   gt / gT    next / previous section, or {count}gt for a given one; the cursor goes along
//   d / u      half a page down / up
//   Esc        put the cursor away
document.addEventListener('DOMContentLoaded', () =>
{
    const statusline = document.querySelector('.statusline');
    const modeLabel = statusline?.querySelector('.statusline-mode');
    const sectionLabel = statusline?.querySelector('.statusline-section');
    const pendingLabel = statusline?.querySelector('.statusline-pending');
    const positionLabel = statusline?.querySelector('.statusline-position');
    const branchLabel = statusline?.querySelector('.statusline-branch');

    if (!statusline || !modeLabel || !sectionLabel || !pendingLabel || !positionLabel)
    {
        return;
    }

    const sections = Array.from(document.querySelectorAll('[data-path]'));
    const tabs = Array.from(document.querySelectorAll('.tabline-tab'));
    const entries = Array.from(document.querySelectorAll('.publication, .friend-link-name'));
    const entrySections = entries.map((entry) => sections.indexOf(entry.closest('[data-path]')));
    const top = -1;
    const homeBranch = branchLabel?.textContent ?? '';
    const pendingTimeout = 2000;
    const revealGrace = 900;
    const edgeMargin = 40;
    const minimumThumb = 28;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const jumpBehavior = prefersReducedMotion ? 'auto' : 'smooth';

    let updateFrame = 0;
    let activeSection = -1;

    // Where the cursor is: null (nowhere), `top` (above the first line, on the intro), or a line index.
    let cursor = null;
    let isCursorFromMouse = false;
    let revealDeadline = 0;
    let lastPointer = '';
    let pendingCount = '';
    let pendingOperator = '';
    let pendingTimer = 0;

    const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
    const scrollableHeight = () => document.documentElement.scrollHeight - window.innerHeight;
    const isOnScreen = (element) =>
    {
        const bounds = element.getBoundingClientRect();
        return bounds.bottom > edgeMargin && bounds.top < window.innerHeight - edgeMargin;
    };
    const isTopOnScreen = () => (sections[0] ? isOnScreen(sections[0]) : window.scrollY <= 0);
    const isOnLine = () => cursor !== null && cursor >= 0;

    // The branch in the status line is where the line under the cursor was merged: its venue,
    // written as a branch name ("CVPR 2026, Highlight Paper" -> cvpr-2026). A line can name its own
    // with data-branch; anywhere else the page is on its default branch.
    const branchOf = (entry) =>
    {
        const source = entry.dataset.branch || entry.querySelector('.publication-venue')?.textContent.split(',')[0] || '';

        return source.trim().toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '') || homeBranch;
    };

    // Scrollbar. The native one runs the full height of the window, across both bars, so where
    // there is a mouse it is replaced by one that lives between them, with marks for the
    // sections and the cursor in the spirit of nvim's scrollbar plugins. Touch screens keep theirs.
    const scrollbar = window.matchMedia('(hover: hover) and (pointer: fine)').matches ? document.createElement('div') : null;
    const scrollbarThumb = document.createElement('div');
    const scrollbarCursor = document.createElement('span');
    const scrollbarMarks = sections.slice(1).map(() => document.createElement('span'));

    if (scrollbar)
    {
        scrollbar.className = 'scrollbar';
        scrollbar.setAttribute('aria-hidden', 'true');
        scrollbarThumb.className = 'scrollbar-thumb';
        scrollbarCursor.className = 'scrollbar-cursor';
        scrollbarCursor.hidden = true;
        scrollbarMarks.forEach((mark) =>
        {
            mark.className = 'scrollbar-mark';
        });
        scrollbar.append(scrollbarThumb, ...scrollbarMarks, scrollbarCursor);
        document.body.append(scrollbar);
        document.documentElement.classList.add('has-scrollbar');
    }

    // Marks sit where their target is in the document, as a fraction of its full height.
    const placeMark = (mark, element) =>
    {
        const bounds = element.getBoundingClientRect();
        const middle = bounds.top + window.scrollY + (mark === scrollbarCursor ? bounds.height / 2 : 0);

        mark.style.top = `${clamp(middle / document.documentElement.scrollHeight, 0, 1) * 100}%`;
    };

    const placeMarks = () =>
    {
        if (!scrollbar)
        {
            return;
        }

        scrollbarMarks.forEach((mark, index) => placeMark(mark, sections[index + 1]));
        scrollbarCursor.hidden = !isOnLine();

        if (isOnLine())
        {
            placeMark(scrollbarCursor, entries[cursor]);
        }
    };

    // Status line, tabline and scrollbar follow the scroll position and the cursor.
    const update = () =>
    {
        updateFrame = 0;

        const scrollable = scrollableHeight();
        const offset = window.scrollY;
        const progress = scrollable <= 0 ? 1 : clamp(offset / scrollable, 0, 1);

        positionLabel.textContent = `${Math.round(progress * 100)}%`;

        if (scrollbar)
        {
            const trackHeight = scrollbar.clientHeight;
            const thumbHeight = Math.max(minimumThumb, trackHeight * window.innerHeight / document.documentElement.scrollHeight);

            scrollbar.classList.toggle('is-idle', scrollable <= 0);
            scrollbarThumb.style.height = `${thumbHeight}px`;
            scrollbarThumb.style.transform = `translateY(${progress * Math.max(0, trackHeight - thumbHeight)}px)`;
        }

        // The current section is the one holding the cursor, as long as the cursor is in view.
        // Otherwise it is the last one whose heading has passed the upper part of the window; a
        // short final section never gets that far up, so the bottom of the page counts as being in it.
        const isAtBottom = scrollable > 0 && offset >= scrollable - 1;
        const isCursorInView = cursor !== null && (cursor === top ? isTopOnScreen() : isOnScreen(entries[cursor]));
        const cursorSection = cursor === top ? 0 : entrySections[cursor] ?? -1;
        let current = sections.length ? 0 : -1;

        if (isCursorInView && sections[cursorSection])
        {
            current = cursorSection;
        }
        else
        {
            sections.forEach((section, index) =>
            {
                const isLast = index === sections.length - 1;

                if (section.getBoundingClientRect().top <= window.innerHeight * 0.35 || (isLast && isAtBottom))
                {
                    current = index;
                }
            });
        }

        if (current === activeSection)
        {
            return;
        }

        activeSection = current;
        sectionLabel.textContent = current < 0 ? '' : sections[current].dataset.path;

        tabs.forEach((tab, index) =>
        {
            tab.classList.toggle('is-active', index === current);

            if (index === current)
            {
                tab.setAttribute('aria-current', 'true');
            }
            else
            {
                tab.removeAttribute('aria-current');
            }
        });
    };

    const scheduleUpdate = () =>
    {
        if (!updateFrame)
        {
            updateFrame = window.requestAnimationFrame(update);
        }
    };

    // From the keyboard the cursor comes along, onto the section's first line (the intro has none,
    // so there it waits at the top). A click on a tab only scrolls and leaves no cursor behind.
    const goToSection = (index, { withCursor = false } = {}) =>
    {
        if (!sections[index])
        {
            return;
        }

        const firstLine = entrySections.indexOf(index);
        const landing = index === 0 ? top : (firstLine >= 0 ? firstLine : null);

        setCursor(withCursor ? landing : null, { reveal: false });

        if (cursor !== null)
        {
            revealDeadline = performance.now() + revealGrace;
        }

        if (index === 0)
        {
            window.scrollTo({ top: 0, behavior: jumpBehavior });
            return;
        }

        sections[index].scrollIntoView({ behavior: jumpBehavior, block: 'start' });
    };

    // Gutter: plain line numbers until the cursor is on a line, then numbers relative to it, with
    // the cursor's own line keeping its absolute number (nvim's `number` + `relativenumber`).
    const renderGutter = () =>
    {
        entries.forEach((entry, index) =>
        {
            const isCursorLine = index === cursor;

            entry.dataset.line = !isOnLine() || isCursorLine ? index + 1 : Math.abs(index - cursor);
            entry.classList.toggle('is-cursor', isCursorLine);
        });

        if (branchLabel)
        {
            branchLabel.textContent = isOnLine() ? branchOf(entries[cursor]) : homeBranch;
        }

        placeMarks();
        scheduleUpdate();
    };

    const setCursor = (position, { reveal = true, fromMouse = false, instant = false } = {}) =>
    {
        cursor = position === null ? null : clamp(position, top, entries.length - 1);
        isCursorFromMouse = fromMouse && isOnLine();
        revealDeadline = 0;
        renderGutter();

        if (!reveal || cursor === null)
        {
            return;
        }

        // The first and last stops bring the ends of the page with them.
        if (cursor === top)
        {
            window.scrollTo({ top: 0, behavior: jumpBehavior });
        }
        else if (cursor === entries.length - 1)
        {
            window.scrollTo({ top: scrollableHeight(), behavior: jumpBehavior });
        }
        else
        {
            entries[cursor].scrollIntoView({ behavior: instant ? 'auto' : jumpBehavior, block: 'nearest' });

            if (instant)
            {
                return;
            }
        }

        // While a smooth scroll is still bringing the cursor into view it counts as being there,
        // so keys typed in quick succession continue from it.
        revealDeadline = performance.now() + revealGrace;
    };

    const moveCursor = (delta) =>
    {
        if (!entries.length)
        {
            return;
        }

        const isRevealing = performance.now() < revealDeadline;
        const isCursorOnScreen = cursor !== null && (isRevealing || (cursor === top ? isTopOnScreen() : isOnScreen(entries[cursor])));
        let origin = cursor;

        // With no cursor, or one that has been scrolled out of view, start from what is on screen:
        // the intro if it is showing, otherwise just outside the visible lines on the side we come from.
        if (!isCursorOnScreen)
        {
            const visible = entries.map((entry, index) => (isOnScreen(entry) ? index : -1)).filter((index) => index >= 0);

            if (isTopOnScreen())
            {
                origin = top;
            }
            else if (visible.length)
            {
                origin = delta > 0 ? visible[0] - 1 : visible[visible.length - 1] + 1;
            }
            else
            {
                origin = entries[0].getBoundingClientRect().top > 0 ? top : entries.length;
            }
        }

        // One line at a time scrolls instantly, as the editor would; longer jumps glide.
        setCursor(origin + delta, { instant: Math.abs(delta) === 1 });
    };

    // Keys typed so far that are still waiting for the rest of a command, shown like `showcmd`.
    const showPending = () =>
    {
        const text = pendingCount + pendingOperator;

        pendingLabel.textContent = text;
        pendingLabel.hidden = !text;
        window.clearTimeout(pendingTimer);
        pendingTimer = text ? window.setTimeout(clearPending, pendingTimeout) : 0;
    };

    const clearPending = () =>
    {
        pendingCount = '';
        pendingOperator = '';
        showPending();
    };

    const refresh = () =>
    {
        placeMarks();
        scheduleUpdate();
    };

    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', refresh);
    window.addEventListener('load', refresh);
    document.fonts?.ready.then(refresh);
    update();
    renderGutter();

    if (scrollbar)
    {
        let grabOffset = null;

        const release = () =>
        {
            grabOffset = null;
            scrollbar.classList.remove('is-dragging');
        };

        scrollbar.addEventListener('pointerdown', (event) =>
        {
            if (event.button !== 0)
            {
                return;
            }

            const thumbBounds = scrollbarThumb.getBoundingClientRect();

            event.preventDefault();

            // On the thumb: drag it. Elsewhere on the track: page towards the click.
            if (event.clientY >= thumbBounds.top && event.clientY <= thumbBounds.bottom)
            {
                grabOffset = event.clientY - thumbBounds.top;
                scrollbar.setPointerCapture(event.pointerId);
                scrollbar.classList.add('is-dragging');
            }
            else
            {
                const direction = event.clientY < thumbBounds.top ? -1 : 1;
                window.scrollBy({ top: direction * window.innerHeight * 0.9, behavior: jumpBehavior });
            }
        });

        scrollbar.addEventListener('pointermove', (event) =>
        {
            if (grabOffset === null)
            {
                return;
            }

            const trackBounds = scrollbar.getBoundingClientRect();
            const travel = trackBounds.height - scrollbarThumb.offsetHeight;
            const ratio = travel > 0 ? clamp((event.clientY - trackBounds.top - grabOffset) / travel, 0, 1) : 0;

            window.scrollTo({ top: ratio * scrollableHeight(), behavior: 'auto' });
        });

        scrollbar.addEventListener('pointerup', release);
        scrollbar.addEventListener('pointercancel', release);
        scrollbar.addEventListener('lostpointercapture', release);
    }

    tabs.forEach((tab, index) =>
    {
        tab.addEventListener('click', (event) =>
        {
            event.preventDefault();
            goToSection(index);
        });
    });

    // Selecting text flips the mode, as it would in the editor.
    document.addEventListener('selectionchange', () =>
    {
        const selection = document.getSelection();
        const isSelecting = Boolean(selection && !selection.isCollapsed && selection.toString().trim());

        statusline.classList.toggle('is-visual', isSelecting);
        modeLabel.textContent = isSelecting ? 'Visual' : 'Normal';
    });

    // The pointer carries the cursor line with it. Only real movement counts: when the page
    // scrolls under a resting pointer (say, while moving with j/k) the cursor stays where it is.
    document.addEventListener('mousemove', (event) =>
    {
        const pointer = `${event.screenX},${event.screenY}`;

        if (pointer === lastPointer)
        {
            return;
        }

        lastPointer = pointer;

        const entry = event.target instanceof Element ? event.target.closest('.publication, .friend-link-name') : null;
        const index = entry ? entries.indexOf(entry) : -1;

        if (index >= 0)
        {
            if (index !== cursor)
            {
                setCursor(index, { reveal: false, fromMouse: true });
            }
        }
        else if (isCursorFromMouse)
        {
            // A cursor placed by hovering leaves with the pointer; one placed from the keyboard stays.
            setCursor(null);
        }
    });

    document.documentElement.addEventListener('mouseleave', () =>
    {
        if (isCursorFromMouse)
        {
            setCursor(null);
        }
    });

    document.addEventListener('keydown', (event) =>
    {
        const target = event.target;
        const key = event.key;

        if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey)
        {
            return;
        }

        if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))
        {
            return;
        }

        // Shift and friends arrive as their own key presses; they are not part of a command.
        if (key.length > 1 && key !== 'Enter' && key !== 'Escape')
        {
            return;
        }

        if (/^[0-9]$/.test(key) && !pendingOperator && (pendingCount || key !== '0'))
        {
            pendingCount = (pendingCount + key).slice(-3);
            showPending();
            return;
        }

        if (key === 'g' && !pendingOperator)
        {
            pendingOperator = 'g';
            showPending();
            return;
        }

        const count = Number(pendingCount);
        const command = pendingOperator + key;

        clearPending();

        if (command === 'j')
        {
            moveCursor(count || 1);
        }
        else if (command === 'k')
        {
            moveCursor(-(count || 1));
        }
        else if (command === 'd')
        {
            window.scrollBy({ top: window.innerHeight / 2, behavior: jumpBehavior });
        }
        else if (command === 'u')
        {
            window.scrollBy({ top: -window.innerHeight / 2, behavior: jumpBehavior });
        }
        else if ((command === 'G' || command === 'gg') && count)
        {
            setCursor(count - 1);
        }
        else if (command === 'G')
        {
            setCursor(entries.length - 1);
        }
        else if (command === 'gg')
        {
            setCursor(top);
        }
        else if (command === 'gt')
        {
            goToSection(count ? count - 1 : (Math.max(activeSection, 0) + 1) % sections.length, { withCursor: true });
        }
        else if (command === 'gT')
        {
            goToSection((Math.max(activeSection, 0) - 1 + sections.length) % sections.length, { withCursor: true });
        }
        else if (command === 'Escape')
        {
            setCursor(null);
        }
        else if (command === 'Enter' && isOnLine())
        {
            // Leave Enter alone when it is aimed at a link, a button or the avatar.
            const isOnControl = target instanceof Element && target.closest('a, button, [tabindex]');
            const line = entries[cursor];

            if (!isOnControl)
            {
                (line.matches('a') ? line : line.querySelector('.publication-links a'))?.click();
            }
        }
    });
});
