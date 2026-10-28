let runtime;
export function loadSPI() {
    runtime ??= import('./vendor/spi.mjs').then(({default: createSPI}) => createSPI());
    return runtime;
}

// Convert Emscripten C++ exceptions to ordinary JS Errors and free their storage.
export function callSPI(spi, action) {
    try { return action(); }
    catch (exception) {
        if (exception instanceof Error) throw exception;
        let message;
        try { message = spi.getExceptionMessage(exception)[1]; }
        finally { spi.decrementExceptionRefcount(exception); }
        throw new Error(message || 'SPI operation failed');
    }
}

// The caller owns the returned object and must call .delete() when finished.
export async function fromURL(url, {signal} = {}) {
    if (!['http:', 'https:'].includes(new URL(url, location.href).protocol)) {
        throw new Error('Use Open file… for a downloaded file. URLs must use HTTP or HTTPS.');
    }
    const spi = await loadSPI();
    const response = await fetch(url, {signal});
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    const text = await response.text();
    return callSPI(spi, () => spi.Object.fromString(text));
}

// Read a user-selected file locally; no upload or HTTP request is made.
export async function fromFile(file) {
    const spi = await loadSPI();
    const text = await file.text();
    return callSPI(spi, () => spi.Object.fromString(text));
}
