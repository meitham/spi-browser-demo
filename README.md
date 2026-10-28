# SPI browser demo

A small JavaScript application that fetches a serialized SPI object over HTTP, parses it
with the real C++ SPI runtime compiled to WebAssembly, edits its fields, and
serializes it back to SPI text or JSON. No framework, libcurl or application
backend is needed. The included server only serves static files.

## Run

Requirements: Node.js 20+, Git, Make and
[Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html) 6.0.13.

```sh
git clone https://github.com/meitham/spi-browser-demo.git
cd spi-browser-demo
source /path/to/emsdk/emsdk_env.sh
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:4173**. The example loads automatically. Change its fields,
switch between SPI text and JSON, or download the serialized result. Use **Open file…**
to reopen a downloaded `.spi` or `.json` file directly. It is read locally and never
uploaded. **Load from URL** is for files served over HTTP(S).

To reload a download over HTTP, copy it into this demo's `public/data/` directory
and enter `./data/scenario.spi` (or `./data/scenario.json`) in **Load from URL**.
This serves the app and file from the same origin.

A separate `python -m http.server` does not enable CORS. If the app is on port
4173 and the files are on port 8000, the browser blocks the app from reading them,
even when the file URL opens directly and Python logs a successful request.
Different ports or hostnames (including `localhost` versus `127.0.0.1`) are
different origins. Serve both from the same origin, configure the file server
to allow the app's origin with `Access-Control-Allow-Origin`, or use **Open file…**.

The build fetches SPI at commit
[`c611c13`](https://github.com/meitham/spi/commit/c611c131828197cf86f2563ebda798ee25d957c3),
which contains the Emscripten integration. It builds the module into `public/vendor/`;
generated binaries are not committed. To reuse a local checkout at that commit:

```sh
SPI_SOURCE=../spi npm run build
```

After building, `public/` can be served by any static web server. Keep `spi.mjs`
and `spi.wasm` together and serve `.mjs` as `text/javascript` and `.wasm` as
`application/wasm`. This repository does not automatically publish a website.

## The useful part

[`public/spi-client.js`](public/spi-client.js) contains a reusable asynchronous
`fromURL()` helper and a local `fromFile(file)` helper. It checks HTTP failures, passes response text directly to
SPI, and converts C++ exceptions into ordinary JavaScript errors while releasing
their native storage.

```js
import {loadSPI, callSPI, fromURL} from './spi-client.js';

const spi = await loadSPI();
const object = await fromURL('./data/example.json');
try {
    console.log(callSPI(spi, () => object.getString('name')));
    callSPI(spi, () => object.setDouble('price', 110.5));
    console.log(callSPI(spi, () => object.toString('TEXT')));
} finally {
    object.delete();
}
```

The browser handles HTTP, HTTPS and certificates. Cross-origin URLs must allow
CORS; browser credential and mixed-content rules still apply. `fromURL` also
accepts `{signal}` for cancellation. It downloads the serialized object into memory.

The demo form expects `name` (string), `quantity` and `price` (numbers), and
`enabled` (boolean), as shown in `public/data/example.json`. The loader itself
accepts SPI text or JSON supported by the linked runtime. JSON numbers are SPI
doubles, so the form uses `getDouble`/`setDouble`. Every returned SPI object must
be released with `.delete()`. Editing does not send data back to the server.

## Test

```sh
npx playwright install chromium
npm test
```

On Linux, use `npx playwright install --with-deps chromium`. The browser tests
cover actual HTTP loading, edits and serialization, downloads and reloading,
HTTP/parse/network errors, cancellation, mobile layout and a missing WASM module.
GitHub Actions builds the pinned SPI dependency and runs the same tests.

## License

The demo code is MIT licensed. SPI is a separate LGPL-2.1-or-later dependency;
its license and source revision are copied alongside the generated module.
SPI also includes third-party components with their own notices; their sources
are available in the pinned SPI checkout. Rebuild instructions are above.
