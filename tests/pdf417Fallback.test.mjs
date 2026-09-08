/**
 * AN IPAD CAN READ THE BARCODE
 *
 * Safari on iOS and iPadOS implements no Barcode Detection API, so a tablet
 * could capture a licence cleanly and never read it: capture worked, the crop
 * was square, and the operator was told plainly that the barcode could not be
 * read. The gap is closed by a decoder REGISTERED by the consumer, so this
 * package stays dependency-free and the multi megabyte download is paid only
 * by a browser that needs it, at the moment it tries.
 *
 * These tests run where `window.BarcodeDetector` does not exist, which is
 * exactly the iPad case, so `unsupported` is the honest starting point.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    decodePdf417, decodePdf417FromCandidates, registerPdf417Fallback,
    hasPdf417Fallback, resetPdf417ForTests, createZxingPdf417Decoder,
} from '../src/lib/idscan/pdf417.mjs';

/** A real AAMVA payload: the header, then the elements a licence carries. */
const PAYLOAD = '@\n\rANSI 636014040002DL00410288ZC03290015DLDAQY1234567\nDCSSAMPLE\nDACJANE\nDBB01011990\nDAJNY\n\r';

test.beforeEach(() => resetPdf417ForTests());
test.after(() => resetPdf417ForTests());

test('with no native decoder and nothing registered, it says unsupported', async () => {
    assert.equal(hasPdf417Fallback(), false);
    assert.deepEqual(await decodePdf417({}), { ok: false, reason: 'unsupported' });
    assert.deepEqual(await decodePdf417FromCandidates([{ label: 'crop', source: {} }]), { ok: false, reason: 'unsupported' });
});

test('a registered decoder reads the licence, and says which decoder did', async () => {
    registerPdf417Fallback(async () => ({ ok: true, value: PAYLOAD }));
    assert.equal(hasPdf417Fallback(), true);
    const r = await decodePdf417({});
    assert.equal(r.ok, true);
    assert.equal(r.value, PAYLOAD);
    assert.equal(r.via, 'wasm');
});

test('candidates are tried in order and the first hit wins', async () => {
    const seen = [];
    registerPdf417Fallback(async (source) => {
        seen.push(source.label);
        return source.label === 'crop' ? { ok: true, value: PAYLOAD } : { ok: false, reason: 'not-found' };
    });
    const r = await decodePdf417FromCandidates([
        { label: 'raw', source: { label: 'raw' } },
        { label: 'crop', source: { label: 'crop' } },
        { label: 'never', source: { label: 'never' } },
    ]);
    assert.equal(r.ok, true);
    assert.equal(r.via, 'crop', 'the candidate label, not the decoder');
    assert.deepEqual(seen, ['raw', 'crop'], 'and it stops at the first hit');
});

test('a lazy loader is called ONCE however many candidates are tried', async () => {
    let loads = 0;
    registerPdf417Fallback(async () => { loads++; return async () => ({ ok: false, reason: 'not-found' }); }, { lazy: true });
    assert.equal(hasPdf417Fallback(), true, 'registered before it is loaded');
    const r = await decodePdf417FromCandidates([
        { label: 'a', source: {} }, { label: 'b', source: {} }, { label: 'c', source: {} },
    ]);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'not-found');
    assert.equal(loads, 1, 'one download, not one per candidate');
});

test('a loader that fails leaves the browser where it was, and never throws', async () => {
    registerPdf417Fallback(async () => { throw new Error('network'); }, { lazy: true });
    assert.deepEqual(await decodePdf417({}), { ok: false, reason: 'unsupported' });
    resetPdf417ForTests();
    registerPdf417Fallback(async () => { throw new Error('boom'); });
    const r = await decodePdf417({});
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'decode-failed');
});

test('a decoder that answers nonsense is not trusted', async () => {
    registerPdf417Fallback(async () => null);
    assert.equal((await decodePdf417({})).reason, 'decode-failed');
    resetPdf417ForTests();
    registerPdf417Fallback(async () => ({ ok: true }));
    assert.equal((await decodePdf417({})).ok, false, 'ok with no value is not a read');
});

test('registering nothing unregisters, so a caller can turn it off', async () => {
    registerPdf417Fallback(async () => ({ ok: true, value: PAYLOAD }));
    assert.equal(hasPdf417Fallback(), true);
    registerPdf417Fallback(null);
    assert.equal(hasPdf417Fallback(), false);
    assert.deepEqual(await decodePdf417({}), { ok: false, reason: 'unsupported' });
});

test('the zxing adapter takes the longest barcode and loads its module once', async () => {
    let loads = 0;
    const decode = createZxingPdf417Decoder(async () => {
        loads++;
        return {
            readBarcodes: async (_source, options) => {
                assert.deepEqual(options.formats, ['PDF417']);
                assert.equal(options.tryHarder, true);
                return [{ text: 'SHORT' }, { text: PAYLOAD }];
            },
        };
    });
    assert.deepEqual(await decode({}), { ok: true, value: PAYLOAD });
    await decode({});
    assert.equal(loads, 1);
});

test('the zxing adapter reports an empty read and a module that is not a reader', async () => {
    const empty = createZxingPdf417Decoder(async () => ({ readBarcodes: async () => [] }));
    assert.deepEqual(await empty({}), { ok: false, reason: 'not-found' });
    const wrong = createZxingPdf417Decoder(async () => ({}));
    assert.deepEqual(await wrong({}), { ok: false, reason: 'unsupported' });
    const viaDefault = createZxingPdf417Decoder(async () => ({ default: { readBarcodes: async () => [{ text: PAYLOAD }] } }));
    assert.deepEqual(await viaDefault({}), { ok: true, value: PAYLOAD });
});

test('what the decoder returns is what AAMVA parses, whichever decoder it was', async () => {
    const { parseAamva } = await import('../src/lib/idscan/aamva.mjs');
    registerPdf417Fallback(async () => ({ ok: true, value: PAYLOAD }));
    const decoded = await decodePdf417({});
    const parsed = parseAamva(decoded.value);
    assert.equal(parsed.ok, true, 'what the fallback returns is what aamva.mjs understands');
    assert.equal(parsed.fields.id_number, 'Y1234567');
    assert.equal(parsed.fields.last_name, 'Sample');
    assert.equal(parsed.fields.first_name, 'Jane');
    assert.equal(parsed.fields.date_of_birth, '1990-01-01');
    assert.equal(parsed.fields.id_state, 'NY');
});
