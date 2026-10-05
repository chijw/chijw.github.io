document.addEventListener('DOMContentLoaded', () =>
{
    const avatarMedia = document.querySelector('.avatar-media');
    const avatarImage = avatarMedia?.querySelector('img');
    const avatarCanvas = avatarMedia?.querySelector('.avatar-noise-canvas');
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!avatarMedia || !avatarImage || !avatarCanvas || prefersReducedMotion)
    {
        return;
    }

    // Every transition is a Brownian bridge between two portraits x0 and x1:
    //
    //     x_t = a_t * ((1 - m_t) * x0 + m_t * x1) + s * B_t,    t in [0, 1]
    //
    // B_t is pinned to zero at both ends, so a sample always leaves from and lands on a clean image.
    // Fine detail is the first thing lost on the way in and the last thing recovered on the way out,
    // the way a denoiser resolves coarse structure before texture.
    const bridgeDuration = 3400;
    const returnDuration = 2400;
    const tapHoldDuration = 2600;
    const noiseCellSize = 6;
    const noiseModes = 3;
    const noisePeak = 0.75;
    const exchangeStart = 0.3;
    const exchangeEnd = 0.7;
    const detailHalvings = [0, 2, 4];
    const bridgeSources = (avatarMedia.dataset.bridgeTargets || '')
        .split(',')
        .map((source) => source.trim())
        .filter(Boolean);

    const clamp01 = (value) => Math.min(1, Math.max(0, value));
    const smoothstep = (value) =>
    {
        const t = clamp01(value);
        return t * t * (3 - 2 * t);
    };

    const waitForImage = (image) =>
    {
        if (image.complete && image.naturalWidth && image.naturalHeight)
        {
            return Promise.resolve(image);
        }

        return new Promise((resolve, reject) =>
        {
            const cleanup = () =>
            {
                image.removeEventListener('load', handleLoad);
                image.removeEventListener('error', handleError);
            };

            const handleLoad = () =>
            {
                cleanup();
                resolve(image);
            };

            const handleError = () =>
            {
                cleanup();
                reject(new Error(`Failed to load image: ${image.currentSrc || image.src || 'unknown'}`));
            };

            image.addEventListener('load', handleLoad, { once: true });
            image.addEventListener('error', handleError, { once: true });
        });
    };

    const loadImage = (source) =>
        new Promise((resolve, reject) =>
        {
            const image = new Image();
            image.decoding = 'async';

            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error(`Failed to load image: ${source}`));
            image.src = source;

            if (image.complete && image.naturalWidth && image.naturalHeight)
            {
                resolve(image);
            }
        });

    let spareGaussian = null;

    const sampleGaussian = () =>
    {
        if (spareGaussian !== null)
        {
            const nextValue = spareGaussian;
            spareGaussian = null;
            return nextValue;
        }

        let u = 0;
        let v = 0;

        while (u === 0)
        {
            u = Math.random();
        }

        while (v === 0)
        {
            v = Math.random();
        }

        const magnitude = Math.sqrt(-2 * Math.log(u));
        const angle = 2 * Math.PI * v;

        spareGaussian = magnitude * Math.sin(angle);
        return magnitude * Math.cos(angle);
    };

    const initializeBridge = async () =>
    {
        try
        {
            await waitForImage(avatarImage);

            const width = avatarImage.naturalWidth || parseInt(avatarImage.getAttribute('width'), 10);
            const height = avatarImage.naturalHeight || parseInt(avatarImage.getAttribute('height'), 10);

            if (!width || !height)
            {
                return;
            }

            avatarMedia.style.setProperty('--avatar-media-aspect', `${width} / ${height}`);

            const createScratch = () =>
            {
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                return { canvas, context: canvas.getContext('2d', { willReadFrequently: true }) };
            };

            const scratchA = createScratch();
            const scratchB = createScratch();
            const renderContext = avatarCanvas.getContext('2d', { willReadFrequently: true });

            if (!scratchA.context || !scratchB.context || !renderContext)
            {
                return;
            }

            avatarCanvas.width = width;
            avatarCanvas.height = height;
            renderContext.imageSmoothingEnabled = true;

            const loadedAlternatives = (await Promise.allSettled(bridgeSources.map((source) => loadImage(source))))
                .filter((result) => result.status === 'fulfilled')
                .map((result) => result.value);

            if (!loadedAlternatives.length)
            {
                return;
            }

            // Blurs by halving the image `halvings` times and doubling it back, ping-ponging between
            // two canvases so that every resize is a clean 2x step.
            const readDetailLevel = (image, halvings) =>
            {
                let from = scratchA;
                let to = scratchB;
                let levelWidth = width;
                let levelHeight = height;

                from.context.clearRect(0, 0, width, height);
                from.context.drawImage(image, 0, 0, width, height);

                const resample = (nextWidth, nextHeight) =>
                {
                    to.context.clearRect(0, 0, width, height);
                    to.context.drawImage(from.canvas, 0, 0, levelWidth, levelHeight, 0, 0, nextWidth, nextHeight);
                    [from, to] = [to, from];
                    levelWidth = nextWidth;
                    levelHeight = nextHeight;
                };

                const sizes = [];

                for (let step = 0; step < halvings; step += 1)
                {
                    sizes.push([levelWidth, levelHeight]);
                    resample(Math.max(1, Math.round(levelWidth / 2)), Math.max(1, Math.round(levelHeight / 2)));
                }

                while (sizes.length)
                {
                    resample(...sizes.pop());
                }

                return from.context.getImageData(0, 0, width, height).data;
            };

            // Detail levels are full-size RGBA buffers, built on demand and dropped once a portrait
            // is neither on screen nor the next target.
            const createPortrait = (image) => ({ image, levels: null });
            const ensureLevels = (portrait) =>
            {
                if (!portrait.levels)
                {
                    portrait.levels = detailHalvings.map((halvings) => readDetailLevel(portrait.image, halvings));
                }

                return portrait.levels;
            };

            const home = createPortrait(avatarImage);
            const alternatives = loadedAlternatives.map(createPortrait);

            // B_t is drawn through its Karhunen-Loeve expansion,
            //     B_t = sum_k Z_k * sqrt(2) * sin(k * pi * t) / (k * pi),
            // so a few fixed Gaussian fields Z_k give noise that evolves continuously in t and
            // vanishes exactly at t = 0 and t = 1. Every mode adds the same amount of frame-to-frame
            // change, so keeping only the first few is what keeps the grain calm instead of flickering.
            const cellColumns = Math.ceil(width / noiseCellSize);
            const cellRows = Math.ceil(height / noiseCellSize);
            const fieldLength = cellColumns * cellRows * 3;
            const noiseFields = [];
            const noiseOffsets = new Int32Array(noiseModes);
            const noiseBuffer = new Float32Array(fieldLength);

            for (let mode = 0; mode < noiseModes; mode += 1)
            {
                const field = new Float32Array(fieldLength);

                for (let index = 0; index < fieldLength; index += 1)
                {
                    field[index] = sampleGaussian();
                }

                noiseFields.push(field);
            }

            const renderImageData = renderContext.createImageData(width, height);
            const renderPixels = renderImageData.data;
            renderPixels.fill(255);

            const layerPixels = new Array(4);
            const layerWeights = new Float32Array(4);
            let layerCount = 0;

            // `detail` runs from 0 (sharp) to 1 (coarsest level); neighbouring levels are cross-faded.
            const pushLayers = (levels, detail, weight) =>
            {
                if (weight <= 0.002)
                {
                    return;
                }

                const coarsest = levels.length - 1;
                const position = clamp01(detail) * coarsest;
                const lower = Math.min(coarsest, Math.floor(position));
                const mix = position - lower;

                if (lower === coarsest || mix < 0.002)
                {
                    layerPixels[layerCount] = levels[lower];
                    layerWeights[layerCount] = weight;
                    layerCount += 1;
                    return;
                }

                layerPixels[layerCount] = levels[lower];
                layerWeights[layerCount] = weight * (1 - mix);
                layerPixels[layerCount + 1] = levels[lower + 1];
                layerWeights[layerCount + 1] = weight * mix;
                layerCount += 2;
            };

            let resting = home;
            let bridge = null;
            let animationFrame = 0;
            let homeTimer = 0;
            let isHovered = false;
            let isKeyboardFocused = false;
            let deck = [];

            const renderBridge = (t) =>
            {
                // Noise: accumulate the bridge modes per cell, in byte units.
                const amplitude = 2 * noisePeak * 127.5;
                let variance = 0;

                noiseBuffer.fill(0);

                for (let mode = 1; mode <= noiseModes; mode += 1)
                {
                    const coefficient = amplitude * Math.SQRT2 * Math.sin(mode * Math.PI * t) / (mode * Math.PI);
                    const field = noiseFields[mode - 1];

                    variance += coefficient * coefficient;

                    for (let index = 0, fieldIndex = noiseOffsets[mode - 1]; index < fieldLength; index += 1, fieldIndex += 1)
                    {
                        if (fieldIndex === fieldLength)
                        {
                            fieldIndex = 0;
                        }

                        noiseBuffer[index] += coefficient * field[fieldIndex];
                    }
                }

                // Keep overall variance roughly constant: the image fades as the noise grows.
                const imageScale = Math.sqrt(Math.max(0, 1 - variance / (127.5 * 127.5)));
                const bias = 127.5 * (1 - imageScale);
                const transfer = smoothstep((t - exchangeStart) / (exchangeEnd - exchangeStart));

                layerCount = 0;
                pushLayers(bridge.source, smoothstep(t * 2), imageScale * (1 - transfer));
                pushLayers(ensureLevels(bridge.target), 1 - smoothstep(t * 2 - 1), imageScale * transfer);

                for (let index = layerCount; index < 4; index += 1)
                {
                    layerPixels[index] = layerPixels[0];
                    layerWeights[index] = 0;
                }

                const [pixelsA, pixelsB, pixelsC, pixelsD] = layerPixels;
                const [weightA, weightB, weightC, weightD] = layerWeights;
                const useFourLayers = layerCount > 2;

                for (let cellRow = 0; cellRow < cellRows; cellRow += 1)
                {
                    const yStart = cellRow * noiseCellSize;
                    const yEnd = Math.min(yStart + noiseCellSize, height);

                    for (let cellColumn = 0; cellColumn < cellColumns; cellColumn += 1)
                    {
                        const xStart = cellColumn * noiseCellSize;
                        const xEnd = Math.min(xStart + noiseCellSize, width);
                        const cellOffset = (cellRow * cellColumns + cellColumn) * 3;
                        const offsetR = noiseBuffer[cellOffset] + bias;
                        const offsetG = noiseBuffer[cellOffset + 1] + bias;
                        const offsetB = noiseBuffer[cellOffset + 2] + bias;

                        for (let y = yStart; y < yEnd; y += 1)
                        {
                            let index = (y * width + xStart) * 4;

                            // The clamped byte array rounds and clips the sums for us.
                            if (useFourLayers)
                            {
                                for (let x = xStart; x < xEnd; x += 1, index += 4)
                                {
                                    renderPixels[index] = weightA * pixelsA[index] + weightB * pixelsB[index] + weightC * pixelsC[index] + weightD * pixelsD[index] + offsetR;
                                    renderPixels[index + 1] = weightA * pixelsA[index + 1] + weightB * pixelsB[index + 1] + weightC * pixelsC[index + 1] + weightD * pixelsD[index + 1] + offsetG;
                                    renderPixels[index + 2] = weightA * pixelsA[index + 2] + weightB * pixelsB[index + 2] + weightC * pixelsC[index + 2] + weightD * pixelsD[index + 2] + offsetB;
                                }
                            }
                            else
                            {
                                for (let x = xStart; x < xEnd; x += 1, index += 4)
                                {
                                    renderPixels[index] = weightA * pixelsA[index] + weightB * pixelsB[index] + offsetR;
                                    renderPixels[index + 1] = weightA * pixelsA[index + 1] + weightB * pixelsB[index + 1] + offsetG;
                                    renderPixels[index + 2] = weightA * pixelsA[index + 2] + weightB * pixelsB[index + 2] + offsetB;
                                }
                            }
                        }
                    }
                }

                renderContext.putImageData(renderImageData, 0, 0);
            };

            const destination = () => (bridge ? bridge.target : resting);
            const isEngaged = () => isHovered || isKeyboardFocused;

            const clearHomeTimer = () =>
            {
                window.clearTimeout(homeTimer);
                homeTimer = 0;
            };

            const settle = () =>
            {
                resting = bridge.target;
                bridge = null;
                renderContext.drawImage(resting.image, 0, 0, width, height);

                // Nothing is holding the sample in place (a tap, or the pointer left meanwhile).
                if (!isEngaged() && resting !== home)
                {
                    homeTimer = window.setTimeout(release, tapHoldDuration);
                }
            };

            const stepAnimation = (timestamp) =>
            {
                animationFrame = 0;

                if (!bridge)
                {
                    return;
                }

                if (bridge.startTime === null)
                {
                    bridge.startTime = timestamp;
                }

                const elapsed = (timestamp - bridge.startTime) / bridge.duration;

                if (elapsed >= 1)
                {
                    settle();
                    return;
                }

                renderBridge(smoothstep(elapsed));
                animationFrame = window.requestAnimationFrame(stepAnimation);
            };

            const startBridge = (target, duration) =>
            {
                // A bridge can leave from anywhere, so one that interrupts another simply departs
                // from the frame currently on screen, noise included.
                // (If that one has not drawn a frame yet, its own starting point is still what is showing.)
                const isMidFlight = bridge && bridge.startTime !== null;
                const source = isMidFlight ? [new Uint8ClampedArray(renderPixels)] : (bridge ? bridge.source : ensureLevels(resting));

                alternatives.forEach((portrait) =>
                {
                    if (portrait !== target && (bridge || portrait !== resting))
                    {
                        portrait.levels = null;
                    }
                });

                for (let mode = 0; mode < noiseModes; mode += 1)
                {
                    noiseOffsets[mode] = Math.floor(Math.random() * fieldLength);
                }

                ensureLevels(target);
                bridge = { source, target, duration, startTime: null };

                if (!animationFrame)
                {
                    animationFrame = window.requestAnimationFrame(stepAnimation);
                }
            };

            // Deals the alternatives from a shuffled deck so every portrait shows up before any repeats.
            const drawAlternative = () =>
            {
                if (!deck.length)
                {
                    deck = alternatives.slice();

                    for (let index = deck.length - 1; index > 0; index -= 1)
                    {
                        const swapIndex = Math.floor(Math.random() * (index + 1));
                        [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
                    }
                }

                const current = destination();
                const nextIndex = Math.max(0, deck.findIndex((portrait) => portrait !== current));

                return deck.splice(nextIndex, 1)[0];
            };

            const sample = () =>
            {
                clearHomeTimer();
                startBridge(drawAlternative(), bridgeDuration);
            };

            const release = () =>
            {
                clearHomeTimer();

                if (!isEngaged() && destination() !== home)
                {
                    startBridge(home, returnDuration);
                }
            };

            const engage = () =>
            {
                clearHomeTimer();

                if (destination() === home)
                {
                    sample();
                }
            };

            avatarMedia.classList.add('is-noise-ready');
            renderContext.drawImage(avatarImage, 0, 0, width, height);

            // Mouse: hovering samples a portrait and holds it, leaving walks back home.
            avatarMedia.addEventListener('pointerenter', (event) =>
            {
                if (event.pointerType === 'touch')
                {
                    return;
                }

                isHovered = true;
                engage();
            });
            avatarMedia.addEventListener('pointerleave', (event) =>
            {
                if (event.pointerType === 'touch')
                {
                    return;
                }

                isHovered = false;
                release();
            });

            // Keyboard: focus behaves like hover, Enter or Space draws another sample.
            avatarMedia.addEventListener('focusin', () =>
            {
                if (!avatarMedia.matches(':focus-visible'))
                {
                    return;
                }

                isKeyboardFocused = true;
                engage();
            });
            avatarMedia.addEventListener('focusout', () =>
            {
                isKeyboardFocused = false;
                release();
            });
            avatarMedia.addEventListener('keydown', (event) =>
            {
                if (event.key !== 'Enter' && event.key !== ' ')
                {
                    return;
                }

                event.preventDefault();
                sample();
            });

            // Click or tap: draw a fresh sample. A tap has no hover to hold it, so it drifts home after a pause.
            avatarMedia.addEventListener('click', sample);
        }
        catch
        {
            avatarMedia.classList.remove('is-noise-ready');
        }
    };

    initializeBridge();
});
