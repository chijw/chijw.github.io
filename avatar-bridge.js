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

    const blockSize = 5;
    const totalSteps = 72;
    const noiseDuration = 4500;
    const denoiseDuration = 2250;
    const denoiseDelay = 200;
    const noiseTimelineExponent = 0.9;
    const noiseAmplitudeExponent = 1.1;
    const exchangeSharpness = 14;
    const noisePeak = 0.9;
    const repickThreshold = 0.015;
    const bridgeSources = (avatarMedia.dataset.bridgeTargets || '')
        .split(',')
        .map((source) => source.trim())
        .filter(Boolean);

    const clamp01 = (value) => Math.min(1, Math.max(0, value));
    const lerp = (start, end, ratio) => start + (end - start) * ratio;
    const sigmoid = (value) => 1 / (1 + Math.exp(-value));
    const normalizedSigmoid = (value, sharpness) =>
    {
        const t = clamp01(value);
        const edge = sharpness * 0.5;
        const lowerBound = sigmoid(-edge);
        const upperBound = sigmoid(edge);
        return clamp01((sigmoid(sharpness * (t - 0.5)) - lowerBound) / (upperBound - lowerBound));
    };
    const toByte = (value) => Math.max(0, Math.min(255, Math.round((Math.max(-1, Math.min(1, value)) + 1) * 127.5)));

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

            const sourceCanvas = document.createElement('canvas');
            sourceCanvas.width = width;
            sourceCanvas.height = height;

            const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
            const renderContext = avatarCanvas.getContext('2d', { willReadFrequently: true });

            if (!sourceContext || !renderContext)
            {
                return;
            }

            avatarCanvas.width = width;
            avatarCanvas.height = height;
            renderContext.imageSmoothingEnabled = true;

            const extractPixels = (image) =>
            {
                sourceContext.clearRect(0, 0, width, height);
                sourceContext.drawImage(image, 0, 0, width, height);

                const sourceImageData = sourceContext.getImageData(0, 0, width, height);
                const sourcePixels = sourceImageData.data;
                const normalizedPixels = new Float32Array(width * height * 3);

                for (let sourceIndex = 0, pixelIndex = 0; sourceIndex < sourcePixels.length; sourceIndex += 4, pixelIndex += 3)
                {
                    normalizedPixels[pixelIndex] = sourcePixels[sourceIndex] / 127.5 - 1;
                    normalizedPixels[pixelIndex + 1] = sourcePixels[sourceIndex + 1] / 127.5 - 1;
                    normalizedPixels[pixelIndex + 2] = sourcePixels[sourceIndex + 2] / 127.5 - 1;
                }

                return normalizedPixels;
            };

            const cleanPixels = extractPixels(avatarImage);
            const renderImageData = renderContext.createImageData(width, height);
            const renderPixels = renderImageData.data;

            const loadedAlternatives = (await Promise.allSettled(bridgeSources.map((source) => loadImage(source))))
                .filter((result) => result.status === 'fulfilled')
                .map((result) => result.value);

            if (!loadedAlternatives.length)
            {
                return;
            }

            const alternativePixelSets = loadedAlternatives.map((image) => extractPixels(image));
            const blockColumns = Math.ceil(width / blockSize);
            const blockRows = Math.ceil(height / blockSize);
            const blockCount = blockColumns * blockRows;
            const noiseStates = new Array(totalSteps + 1);

            noiseStates[0] = new Float32Array(blockCount * 3);

            for (let step = 1; step <= totalSteps; step += 1)
            {
                const t = step / totalSteps;
                const beta = 0.01 + 0.16 * Math.pow(t, 2.1);
                const retain = Math.sqrt(1 - beta);
                const inject = Math.sqrt(beta);
                const previousState = noiseStates[step - 1];
                const currentState = new Float32Array(blockCount * 3);

                for (let channelIndex = 0; channelIndex < currentState.length; channelIndex += 1)
                {
                    currentState[channelIndex] = retain * previousState[channelIndex] + inject * sampleGaussian();
                }

                noiseStates[step] = currentState;
            }

            let currentProgress = 0;
            let targetProgress = 0;
            let animationFrame = 0;
            let previousTimestamp = 0;
            let denoiseDelayTimer = 0;
            let activeTargetIndex = -1;
            let activeTargetPixels = cleanPixels;
            let lastTargetIndex = -1;

            const pickTargetIndex = () =>
            {
                if (alternativePixelSets.length === 1)
                {
                    lastTargetIndex = 0;
                    return 0;
                }

                let nextIndex = lastTargetIndex;

                while (nextIndex === lastTargetIndex)
                {
                    nextIndex = Math.floor(Math.random() * alternativePixelSets.length);
                }

                lastTargetIndex = nextIndex;
                return nextIndex;
            };

            const selectTarget = () =>
            {
                activeTargetIndex = pickTargetIndex();
                activeTargetPixels = alternativePixelSets[activeTargetIndex] || cleanPixels;
            };

            const renderFromProgress = (progress) =>
            {
                const bridgeProgress = clamp01(progress);
                if (bridgeProgress <= 0.0005)
                {
                    renderContext.drawImage(avatarImage, 0, 0, width, height);
                    return;
                }

                const sineWindow = Math.max(0, Math.sin(Math.PI * bridgeProgress));
                const noisePhase = Math.pow(sineWindow, noiseTimelineExponent);
                const rawStep = noisePhase * totalSteps;
                const lowerStep = Math.min(totalSteps, Math.floor(rawStep));
                const upperStep = Math.min(totalSteps, lowerStep + 1);
                const stepMix = rawStep - lowerStep;
                const lowerNoise = noiseStates[lowerStep];
                const upperNoise = noiseStates[upperStep];
                const transfer = normalizedSigmoid(bridgeProgress, exchangeSharpness);
                const noiseScale = noisePeak * Math.pow(sineWindow, noiseAmplitudeExponent);
                const imageEnergy = Math.max(0, 1 - noiseScale * noiseScale);
                const sourceScale = Math.sqrt(imageEnergy * (1 - transfer));
                const targetScale = Math.sqrt(imageEnergy * transfer);
                const targetPixels = activeTargetPixels || cleanPixels;

                for (let blockRow = 0; blockRow < blockRows; blockRow += 1)
                {
                    const yStart = blockRow * blockSize;
                    const yEnd = Math.min(yStart + blockSize, height);

                    for (let blockColumn = 0; blockColumn < blockColumns; blockColumn += 1)
                    {
                        const xStart = blockColumn * blockSize;
                        const xEnd = Math.min(xStart + blockSize, width);
                        const blockOffset = (blockRow * blockColumns + blockColumn) * 3;
                        const noiseR = lerp(lowerNoise[blockOffset], upperNoise[blockOffset], stepMix);
                        const noiseG = lerp(lowerNoise[blockOffset + 1], upperNoise[blockOffset + 1], stepMix);
                        const noiseB = lerp(lowerNoise[blockOffset + 2], upperNoise[blockOffset + 2], stepMix);

                        for (let y = yStart; y < yEnd; y += 1)
                        {
                            let pixelIndex = (y * width + xStart) * 3;
                            let renderIndex = (y * width + xStart) * 4;

                            for (let x = xStart; x < xEnd; x += 1)
                            {
                                renderPixels[renderIndex] = toByte(sourceScale * cleanPixels[pixelIndex] + targetScale * targetPixels[pixelIndex] + noiseScale * noiseR);
                                renderPixels[renderIndex + 1] = toByte(sourceScale * cleanPixels[pixelIndex + 1] + targetScale * targetPixels[pixelIndex + 1] + noiseScale * noiseG);
                                renderPixels[renderIndex + 2] = toByte(sourceScale * cleanPixels[pixelIndex + 2] + targetScale * targetPixels[pixelIndex + 2] + noiseScale * noiseB);
                                renderPixels[renderIndex + 3] = 255;

                                pixelIndex += 3;
                                renderIndex += 4;
                            }
                        }
                    }
                }

                renderContext.putImageData(renderImageData, 0, 0);
            };

            const stepAnimation = (timestamp) =>
            {
                if (!previousTimestamp)
                {
                    previousTimestamp = timestamp;
                }

                const directionDuration = currentProgress < targetProgress ? noiseDuration : denoiseDuration;
                const delta = (timestamp - previousTimestamp) / directionDuration;
                previousTimestamp = timestamp;

                if (currentProgress < targetProgress)
                {
                    currentProgress = Math.min(targetProgress, currentProgress + delta);
                }
                else if (currentProgress > targetProgress)
                {
                    currentProgress = Math.max(targetProgress, currentProgress - delta);
                }

                renderFromProgress(currentProgress);
                avatarMedia.classList.toggle('is-hovering', currentProgress > 0.001);

                if (Math.abs(currentProgress - targetProgress) > 0.0005)
                {
                    animationFrame = window.requestAnimationFrame(stepAnimation);
                    return;
                }

                animationFrame = 0;
                previousTimestamp = 0;
            };

            const clearDenoiseDelay = () =>
            {
                if (!denoiseDelayTimer)
                {
                    return;
                }

                window.clearTimeout(denoiseDelayTimer);
                denoiseDelayTimer = 0;
            };

            const startAnimation = (nextTarget) =>
            {
                targetProgress = clamp01(nextTarget);

                if (!animationFrame)
                {
                    animationFrame = window.requestAnimationFrame(stepAnimation);
                }
            };

            const activateBridge = () =>
            {
                clearDenoiseDelay();

                if (currentProgress <= repickThreshold || activeTargetIndex === -1)
                {
                    selectTarget();
                }

                startAnimation(1);
            };

            const scheduleDenoise = () =>
            {
                clearDenoiseDelay();
                targetProgress = currentProgress;
                previousTimestamp = 0;

                denoiseDelayTimer = window.setTimeout(() =>
                {
                    denoiseDelayTimer = 0;
                    startAnimation(0);
                }, denoiseDelay);
            };

            avatarMedia.classList.add('is-noise-ready');
            renderFromProgress(0);

            avatarMedia.addEventListener('pointerenter', activateBridge);
            avatarMedia.addEventListener('pointerleave', scheduleDenoise);
            avatarMedia.addEventListener('focusin', activateBridge);
            avatarMedia.addEventListener('focusout', scheduleDenoise);
            avatarMedia.addEventListener('touchstart', activateBridge, { passive: true });
            avatarMedia.addEventListener('touchend', scheduleDenoise);
            avatarMedia.addEventListener('touchcancel', scheduleDenoise);
        }
        catch
        {
            avatarMedia.classList.remove('is-noise-ready');
        }
    };

    initializeBridge();
});
