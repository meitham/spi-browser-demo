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
    const spi = await loadSPI();
    const response = await fetch(url, {signal});
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    const text = await response.text();
    return callSPI(spi, () => spi.Object.fromString(text));
}
