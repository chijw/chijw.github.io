// Sakiko has no machine of her own, so her page describes whichever one it is open on: the readout
// beside her portrait is filled in from what the browser can see of this device, and the portrait
// is only a scatter of dots until someone looks closer. Nothing that is read here leaves the page.
document.addEventListener('DOMContentLoaded', () =>
{
    const root = document.documentElement;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const userAgent = navigator.userAgent;
    const hints = navigator.userAgentData;

    // ---- The machine she is in ---------------------------------------------------------------

    const hostLabel = document.querySelector('.fetch-host');
    const rows = new Map(Array.from(document.querySelectorAll('.fetch-row')).map((row) => [row.dataset.key, row]));

    const setRow = (key, value) =>
    {
        const row = rows.get(key);

        if (!row || !value)
        {
            return;
        }

        row.querySelector('dd').textContent = value;
        row.hidden = false;
    };

    const hostNames = {
        macOS: 'your Mac',
        iOS: 'your iPhone',
        iPadOS: 'your iPad',
        Android: 'your Android device',
        Windows: 'your PC',
        ChromeOS: 'your Chromebook',
        Linux: 'your Linux machine',
    };

    const setHost = (name) =>
    {
        setRow('host', name);

        if (hostLabel)
        {
            hostLabel.textContent = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        }
    };

    const detectSystem = () =>
    {
        const hint = hints?.platform || '';

        if (/android/i.test(hint) || /Android/.test(userAgent))
        {
            return 'Android';
        }

        if (/iPhone|iPod/.test(userAgent))
        {
            return 'iOS';
        }

        // An iPad introduces itself as a Mac; a Mac with several touch points is one.
        if (/iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && navigator.maxTouchPoints > 1))
        {
            return 'iPadOS';
        }

        if (/mac/i.test(hint) || /Macintosh|Mac OS X/.test(userAgent))
        {
            return 'macOS';
        }

        if (/win/i.test(hint) || /Windows/.test(userAgent))
        {
            return 'Windows';
        }

        if (/chrom(e|ium) ?os/i.test(hint) || /CrOS/.test(userAgent))
        {
            return 'ChromeOS';
        }

        if (/linux/i.test(hint) || /Linux|X11/.test(userAgent))
        {
            return 'Linux';
        }

        return '';
    };

    const detectBrowser = () =>
    {
        const brand = hints?.brands?.find((entry) => !/not.?a.?brand|chromium/i.test(entry.brand));

        if (brand)
        {
            return `${brand.brand.replace(/^Google /, '')} ${brand.version}`;
        }

        const match = /(Firefox|FxiOS|Edg|OPR|CriOS|Chrome)\/(\d+)/.exec(userAgent) || /(Version)\/(\d+)[\d.]* .*Safari/.exec(userAgent);
        const names = { FxiOS: 'Firefox', Edg: 'Edge', OPR: 'Opera', CriOS: 'Chrome', Version: 'Safari' };

        return match ? `${names[match[1]] || match[1]} ${match[2]}` : '';
    };

    // WebGL names the graphics chip, wrapped in driver details that are trimmed away here.
    const detectGraphics = () =>
    {
        try
        {
            const gl = document.createElement('canvas').getContext('webgl');

            if (!gl)
            {
                return '';
            }

            const extension = gl.getExtension('WEBGL_debug_renderer_info');
            let name = String(gl.getParameter(extension ? extension.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
            const wrapped = /^ANGLE \((.*)\)$/.exec(name);

            gl.getExtension('WEBGL_lose_context')?.loseContext();

            if (wrapped)
            {
                // "vendor, renderer, driver": the renderer is the part worth showing.
                const parts = wrapped[1].split(', ');
                name = parts.length > 1 ? parts[1] : parts[0];
            }

            return name
                .replace(/^ANGLE Metal Renderer: /, '')
                .replace(/\s+(Direct3D|OpenGL)\b.*$/i, '')
                .replace(/\((R|TM)\)/gi, '')
                .replace(/,? or similar$/i, '')
                .replace(/\/PCIe\/SSE2/i, '')
                .replace(/\s+/g, ' ')
                .trim();
        }
        catch
        {
            return '';
        }
    };

    const describeDisplay = () =>
    {
        const ratio = Math.round((window.devicePixelRatio || 1) * 100) / 100;

        return `${window.screen.width} × ${window.screen.height}${ratio === 1 ? '' : ` @${ratio}x`}`;
    };

    const system = detectSystem();
    const threads = navigator.hardwareConcurrency;
    const memory = navigator.deviceMemory;
    const describeThreads = (architecture) => (threads ? `${threads} thread${threads === 1 ? '' : 's'}${architecture ? ` · ${architecture}` : ''}` : architecture);

    setHost(hostNames[system] || 'your machine');
    setRow('os', system);
    setRow('cpu', describeThreads(''));
    setRow('gpu', detectGraphics());
    // Browsers round this figure and stop counting at 8.
    setRow('memory', memory ? (memory >= 8 ? '8 GB or more' : `${memory} GB`) : '');
    setRow('display', describeDisplay());
    setRow('vessel', detectBrowser());

    window.addEventListener('resize', () => setRow('display', describeDisplay()));

    // Some browsers will say more when asked: the exact system version, the chip family, the model.
    hints?.getHighEntropyValues?.(['architecture', 'bitness', 'model', 'platformVersion']).then((detail) =>
    {
        const version = String(detail.platformVersion || '').split('.');
        const major = Number(version[0]) || 0;
        const architecture = detail.architecture ? `${detail.architecture}${detail.bitness === '64' ? '64' : ''}`.replace('x8664', 'x86-64') : '';

        if (system === 'Windows' && major)
        {
            setRow('os', `Windows ${major >= 13 ? 11 : 10}`);
        }
        else if (system && major)
        {
            setRow('os', `${system} ${major}${Number(version[1]) ? `.${version[1]}` : ''}`);
        }

        setRow('cpu', describeThreads(architecture));

        if (detail.model)
        {
            setHost(`your ${detail.model}`);
        }
    }).catch(() => {});

    // How long she has been here, counted from the moment the page arrived.
    const describeUptime = () =>
    {
        const total = Math.floor(performance.now() / 1000);
        const hours = Math.floor(total / 3600);
        const minutes = Math.floor(total % 3600 / 60);
        const seconds = total % 60;

        if (hours)
        {
            return `${hours} h ${String(minutes).padStart(2, '0')} min`;
        }

        return minutes ? `${minutes} min ${String(seconds).padStart(2, '0')} s` : `${seconds} s`;
    };

    setRow('uptime', describeUptime());
    window.setInterval(() => setRow('uptime', describeUptime()), 1000);

    // She is only here while the page is being looked at.
    const pageTitle = document.title;

    document.addEventListener('visibilitychange', () =>
    {
        document.title = document.hidden ? `${pageTitle} (elsewhere)` : pageTitle;
    });

    // ---- The portrait --------------------------------------------------------------------------
    //
    // She is drawn in dots: the picture is reduced to a coarse grid and dithered, every dot keeping
    // the colour underneath it, and she thins out towards the edges instead of ending in a frame.
    // Hovering, focusing or tapping her lets the picture itself through (see the stylesheet).

    const apparition = document.querySelector('.apparition');
    const portrait = apparition?.querySelector('img');
    const canvas = apparition?.querySelector('canvas');
    const context = canvas?.getContext('2d');

    // Without the dots the picture itself is shown, as it is without JavaScript.
    const showPicture = () => root.classList.remove('js', 'has-ghost');

    if (!apparition || !portrait || !canvas || !context)
    {
        showPicture();
        return;
    }

    const dotPitch = 3;
    const toneFloor = 0.2;
    const toneCeiling = 0.98;
    const toneGamma = 1.5;
    const saturation = 1.6;
    const condenseDuration = 1500;
    const dotFadeIn = 0.1;
    const atkinson = [[1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]];

    let dots = [];
    let dotSize = 0;
    let gridKey = '';
    let condensed = prefersReducedMotion ? 1 : 0;
    let redrawFrame = 0;

    const clamp01 = (value) => Math.min(1, Math.max(0, value));
    const smoothstep = (edgeLow, edgeHigh, value) =>
    {
        const t = clamp01((value - edgeLow) / (edgeHigh - edgeLow));
        return t * t * (3 - 2 * t);
    };

    // Works out which dots are lit for the current size of the portrait. Dots sit on whole device
    // pixels so that they stay crisp, which is why the canvas is sized from the grid and not from
    // the box it lives in.
    const layOut = () =>
    {
        const ratio = window.devicePixelRatio || 1;
        const width = apparition.clientWidth;
        const height = apparition.clientHeight;
        const pitch = Math.max(2, Math.round(dotPitch * ratio));
        const columns = Math.floor(width * ratio / pitch);
        const gridRows = Math.floor(height * ratio / pitch);
        const key = `${columns}x${gridRows}@${pitch}`;

        if (!columns || !gridRows || key === gridKey)
        {
            return;
        }

        const scratch = document.createElement('canvas');
        const scratchContext = scratch.getContext('2d', { willReadFrequently: true });

        scratch.width = columns;
        scratch.height = gridRows;
        scratchContext.imageSmoothingQuality = 'high';
        scratchContext.drawImage(portrait, 0, 0, columns, gridRows);

        const pixels = scratchContext.getImageData(0, 0, columns, gridRows).data;
        const tone = new Float32Array(columns * gridRows);
        const presence = new Float32Array(columns * gridRows);
        const reach = new Float32Array(columns * gridRows);

        for (let row = 0; row < gridRows; row += 1)
        {
            for (let column = 0; column < columns; column += 1)
            {
                const index = row * columns + column;
                const light = (0.2126 * pixels[index * 4] + 0.7152 * pixels[index * 4 + 1] + 0.0722 * pixels[index * 4 + 2]) / 255;

                // Distance from her face, 1 at the rim of the picture: she is fully there in the
                // middle and gone by the edge.
                reach[index] = Math.hypot(((column + 0.5) / columns - 0.5) / 0.5, ((row + 0.5) / gridRows - 0.45) / 0.56);
                presence[index] = 1 - smoothstep(0.6, 1, reach[index]);
                tone[index] = Math.pow(clamp01((light - toneFloor) / (toneCeiling - toneFloor)), toneGamma);
            }
        }

        gridKey = key;
        dots = [];
        dotSize = pitch - Math.max(1, Math.round(pitch * 0.14));
        canvas.width = columns * pitch;
        canvas.height = gridRows * pitch;
        canvas.style.width = `${canvas.width / ratio}px`;
        canvas.style.height = `${canvas.height / ratio}px`;
        canvas.style.left = `${(width - canvas.width / ratio) / 2}px`;
        canvas.style.top = `${(height - canvas.height / ratio) / 2}px`;

        // Atkinson dithering: a cell is lit or not, and most of what that decision got wrong is
        // handed on to the cells to its right and below.
        for (let row = 0; row < gridRows; row += 1)
        {
            for (let column = 0; column < columns; column += 1)
            {
                const index = row * columns + column;
                const wanted = tone[index] * presence[index];
                const isLit = wanted > 0.5;
                const error = (wanted - (isLit ? 1 : 0)) / 8;

                atkinson.forEach(([columnStep, rowStep]) =>
                {
                    const nextColumn = column + columnStep;
                    const nextRow = row + rowStep;

                    if (nextColumn >= 0 && nextColumn < columns && nextRow < gridRows)
                    {
                        tone[nextRow * columns + nextColumn] += error / (presence[nextRow * columns + nextColumn] || 1);
                    }
                });

                if (!isLit)
                {
                    continue;
                }

                const red = pixels[index * 4];
                const green = pixels[index * 4 + 1];
                const blue = pixels[index * 4 + 2];
                const grey = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
                const vivid = (channel) => Math.round(Math.min(255, Math.max(0, grey + (channel - grey) * saturation)));

                dots.push({
                    x: column * pitch,
                    y: row * pitch,
                    colour: `rgb(${vivid(red)}, ${vivid(green)}, ${vivid(blue)})`,
                    // She gathers from the face outwards, a little unevenly.
                    appearsAt: 0.7 * Math.min(1, reach[index]) + 0.3 * Math.random(),
                });
            }
        }
    };

    const draw = () =>
    {
        redrawFrame = 0;
        layOut();
        context.clearRect(0, 0, canvas.width, canvas.height);

        dots.forEach((dot) =>
        {
            const opacity = clamp01((condensed * (1 + dotFadeIn) - dot.appearsAt) / dotFadeIn);

            if (opacity <= 0)
            {
                return;
            }

            context.globalAlpha = opacity;
            context.fillStyle = dot.colour;
            context.fillRect(dot.x, dot.y, dotSize, dotSize);
        });

        context.globalAlpha = 1;
    };

    const scheduleDraw = () =>
    {
        if (!redrawFrame)
        {
            redrawFrame = window.requestAnimationFrame(draw);
        }
    };

    // She condenses out of the dark once, when the page arrives.
    const arrive = () =>
    {
        const start = performance.now();

        const step = (now) =>
        {
            condensed = clamp01((now - start) / condenseDuration);
            draw();

            if (condensed < 1)
            {
                window.requestAnimationFrame(step);
            }
        };

        try
        {
            draw();
        }
        catch
        {
            // The picture cannot be read (opened straight from disk, for one): leave it as it is.
            showPicture();
            return;
        }

        root.classList.add('has-ghost');

        if (condensed < 1)
        {
            window.requestAnimationFrame(step);
        }
    };

    if (portrait.complete && portrait.naturalWidth)
    {
        arrive();
    }
    else
    {
        portrait.addEventListener('load', arrive, { once: true });
        portrait.addEventListener('error', showPicture, { once: true });
    }

    window.addEventListener('resize', scheduleDraw);

    // A tap has no hover to end it, so on touch screens it toggles instead.
    apparition.addEventListener('click', () => apparition.classList.toggle('is-solid'));
    apparition.addEventListener('pointerleave', (event) =>
    {
        if (event.pointerType === 'mouse')
        {
            apparition.classList.remove('is-solid');
        }
    });
});
