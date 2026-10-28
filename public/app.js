import {loadSPI, callSPI, fromURL, fromFile} from './spi-client.js';

const $ = id => document.getElementById(id);
let spi, object, format = 'TEXT';
function showError(error) {
    $('error').textContent = error.message || String(error);
    $('error').hidden = false;
}
function render() {
    if (!object) return;
    $('output').textContent = callSPI(spi, () => object.toString(format));
    $('total').textContent = (Number($('quantity').value) * Number($('price').value))
        .toLocaleString('en-GB', {minimumFractionDigits: 2, maximumFractionDigits: 2});
}
async function load(read = () => fromURL($('url').value.trim()), source = 'HTTP') {
    $('load').disabled = true;
    $('open-file').disabled = true;
    $('file').disabled = true;
    $('error').hidden = true;
    $('status').textContent = source === 'HTTP' ? 'Fetching serialized object…' : 'Reading local file…';
    let incoming;
    try {
        incoming = await read();
        const values = callSPI(spi, () => ({name: incoming.getString('name'),
            quantity: incoming.getDouble('quantity'), price: incoming.getDouble('price'),
            enabled: incoming.getBool('enabled'), type: incoming.typeName()}));
        object?.delete();
        object = incoming;
        incoming = null;
        $('name').value = values.name;
        $('quantity').value = values.quantity;
        $('price').value = values.price;
        $('enabled').checked = values.enabled;
        $('type').textContent = values.type;
        $('fields').disabled = false;
        $('download').disabled = false;
        render();
        $('status').textContent = source === 'HTTP' ? 'Loaded over HTTP · parsed by SPI' : `Opened ${source} · parsed by SPI`;
    } catch (error) {
        $('status').textContent = object ? 'Previous object retained.' : 'No object loaded.';
        showError(error);
    } finally {
        incoming?.delete();
        $('load').disabled = false;
        $('open-file').disabled = false;
        $('file').disabled = false;
    }
}
$('fetch-form').addEventListener('submit', event => { event.preventDefault(); load(); });
$('open-file').addEventListener('click', () => {
    $('file').value = '';
    $('file').click();
});
$('file').addEventListener('change', () => {
    const file = $('file').files[0];
    if (file) load(() => fromFile(file), file.name);
});
for (const name of ['name', 'quantity', 'price', 'enabled']) {
    $(name).addEventListener('input', () => {
        if (!object || !$(name).checkValidity()) return;
        if (name !== 'name' && name !== 'enabled' && !Number.isFinite($(name).valueAsNumber)) return;
        try {
            callSPI(spi, () => {
                if (name === 'name') object.setString(name, $(name).value);
                else if (name === 'enabled') object.setBool(name, $(name).checked);
                else object.setDouble(name, $(name).valueAsNumber);
            });
            $('error').hidden = true;
            render();
        } catch (error) { showError(error); }
    });
}
for (const button of document.querySelectorAll('[data-format]')) {
    button.addEventListener('click', () => {
        format = button.dataset.format;
        for (const item of document.querySelectorAll('[data-format]')) {
            item.setAttribute('aria-pressed', String(item === button));
        }
        try { render(); } catch (error) { showError(error); }
    });
}
$('download').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([$('output').textContent], {type: 'text/plain;charset=utf-8'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = format === 'JSON' ? 'scenario.json' : 'scenario.spi';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.addEventListener('pagehide', event => {
    if (!event.persisted) { object?.delete(); object = null; }
});
try {
    spi = await loadSPI();
    $('runtime').textContent = `SPI ${spi.version()} · WASM ready`;
    await load();
} catch (error) {
    $('runtime').textContent = 'Runtime unavailable';
    $('status').textContent = 'Run npm run build, then refresh this page.';
    showError(error);
}
