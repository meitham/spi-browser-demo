import {createServer} from 'node:http';
import {readFile, realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = await realpath(fileURLToPath(new URL('../public', import.meta.url)));
const types = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.txt': 'text/plain'};
const port = Number(process.env.PORT || 4173);
const server = createServer(async (request, response) => {
    try {
        const url = new URL(request.url, 'http://localhost');
        const path = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
        const file = await realpath(resolve(root, '.' + path));
        if (!file.startsWith(root + sep)) throw new Error('Outside public directory');
        const body = await readFile(file);
        response.writeHead(200, {'Content-Type': `${types[extname(file)] || 'application/octet-stream'}`,
            'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
        response.end(body);
    } catch {
        response.writeHead(404, {'Content-Type': 'text/plain'});
        response.end('Not found');
    }
});
server.listen(port, '127.0.0.1', () => console.log(`SPI browser demo: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => { server.closeAllConnections(); server.close(); });
}
