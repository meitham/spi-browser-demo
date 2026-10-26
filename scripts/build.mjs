import {spawnSync} from 'node:child_process';
import {mkdir, copyFile, writeFile, access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve, join} from 'node:path';
import {availableParallelism} from 'node:os';

const root = fileURLToPath(new URL('../', import.meta.url));
const repository = 'https://github.com/meitham/spi.git';
const revision = 'c611c131828197cf86f2563ebda798ee25d957c3';
const source = process.env.SPI_SOURCE ? resolve(process.env.SPI_SOURCE) : join(root, '.cache/spi');
function run(command, args, cwd = root) {
    const result = spawnSync(command, args, {cwd, stdio: 'inherit'});
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
}
if (!process.env.SPI_SOURCE) {
    await mkdir(source, {recursive: true});
    try { await access(join(source, '.git')); }
    catch { run('git', ['init'], source); }
    run('git', ['fetch', '--depth=1', repository, revision], source);
    run('git', ['checkout', '--detach', revision], source);
}
const actual = spawnSync('git', ['rev-parse', 'HEAD'], {cwd: source, encoding: 'utf8'});
if (actual.status !== 0 || actual.stdout.trim() !== revision) {
    throw new Error(`SPI_SOURCE must be checked out at ${revision}`);
}
run('em++', ['--version']);
run('make', ['-C', 'wasm', `-j${Math.min(availableParallelism(), 8)}`], source);
const destination = join(root, 'public/vendor');
await mkdir(destination, {recursive: true});
for (const name of ['spi.mjs', 'spi.wasm']) {
    await copyFile(join(source, 'wasm/build', name), join(destination, name));
}
await copyFile(join(source, 'LICENSE'), join(destination, 'SPI-LICENSE.txt'));
await writeFile(join(destination, 'SOURCE.txt'), `${repository}\nRevision: ${revision}\nBuild: Emscripten 6.0.13; make -C wasm\n`);
console.log('Browser module ready. Run npm start.');
