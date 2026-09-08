/**
 * ID CAPTURE: card detection and the no-persistence contract
 *
 * Two things are pinned here.
 *
 * First, that detection actually prefers a card. An ID-1 card is 1.586 to 1
 * whichever way up it is held, and without that hint the largest well-bounded
 * rectangle in a photograph of a licence lying on a counter is usually the
 * counter, the clipboard or the tabletop.
 *
 * Second, the promise made to members in the modal's own banner: ID images are
 * never saved to the device and never uploaded. That promise is kept by four
 * specific absences in the source, and an absence is exactly the kind of thing
 * that comes back silently, so each one is asserted.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    detectDocument, orderQuad, scoreQuad, polygonArea, dist, CARD_ASPECT,
} from '../src/lib/docscan/pipeline.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/**
 * Comments stripped. These files explain the promise by naming the exact APIs
 * they refuse to use, and a guard that cannot tell an explanation from a
 * recurrence would push the next author to delete the explanation.
 */
const code = (rel) => read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const CAPTURE = 'src/components/commander/members/IdCaptureModal.jsx';
const MODAL = 'src/components/commander/members/AddMemberModal.jsx';
const PDF417 = 'src/lib/idscan/pdf417.mjs';

// ---------------------------------------------------------------------------
// FIXTURES
// ---------------------------------------------------------------------------

function frame(width, height, fill) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0, p = 0; i < width * height; i++, p += 4) {
        const c = typeof fill === 'function' ? fill(i % width, (i / width) | 0) : fill;
        data[p] = c[0]; data[p + 1] = c[1]; data[p + 2] = c[2]; data[p + 3] = 255;
    }
    return { data, width, height };
}

function fillRect(f, x0, y0, w, h, colour) {
    for (let y = Math.max(0, y0); y < Math.min(f.height, y0 + h); y++) {
        for (let x = Math.max(0, x0); x < Math.min(f.width, x0 + w); x++) {
            const p = (y * f.width + x) * 4;
            f.data[p] = colour[0]; f.data[p + 1] = colour[1]; f.data[p + 2] = colour[2];
        }
    }
}

function centreOf(quad) {
    return {
        x: (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4,
        y: (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4,
    };
}

// ---------------------------------------------------------------------------
// THE SHAPE HINT
// ---------------------------------------------------------------------------

test('a card-shaped quad agrees with the card aspect and a long strip does not', () => {
    const ctx = {
        gx: new Float32Array(1), gy: new Float32Array(1), mag: new Float32Array(1),
        width: 400, height: 400, reference: 50,
        preferAspect: CARD_ASPECT, aspectWeight: 0.42,
    };
    const card = orderQuad([{ x: 0, y: 0 }, { x: 158.6, y: 0 }, { x: 158.6, y: 100 }, { x: 0, y: 100 }]);
    const strip = orderQuad([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 400 }, { x: 0, y: 400 }]);
    assert.ok(scoreQuad(card, ctx).aspectAgreement > 0.98, 'a card must agree with the card aspect');
    assert.ok(scoreQuad(strip, ctx).aspectAgreement < 0.1, 'a long strip must not');
});

test('the hint is orientation-blind: a card held portrait scores the same', () => {
    const ctx = {
        gx: new Float32Array(1), gy: new Float32Array(1), mag: new Float32Array(1),
        width: 400, height: 400, reference: 50,
        preferAspect: CARD_ASPECT, aspectWeight: 0.42,
    };
    const landscape = orderQuad([{ x: 0, y: 0 }, { x: 158.6, y: 0 }, { x: 158.6, y: 100 }, { x: 0, y: 100 }]);
    const portrait = orderQuad([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 158.6 }, { x: 0, y: 158.6 }]);
    const a = scoreQuad(landscape, ctx).aspectAgreement;
    const b = scoreQuad(portrait, ctx).aspectAgreement;
    assert.ok(Math.abs(a - b) < 1e-9, 'the same card rotated is the same card');
});

test('with no hint supplied, scoring is unchanged', () => {
    const ctx = {
        gx: new Float32Array(1), gy: new Float32Array(1), mag: new Float32Array(1),
        width: 400, height: 400, reference: 50,
    };
    const card = orderQuad([{ x: 0, y: 0 }, { x: 158.6, y: 0 }, { x: 158.6, y: 100 }, { x: 0, y: 100 }]);
    const scored = scoreQuad(card, ctx);
    assert.ok(!('aspectAgreement' in scored), 'the hint must be opt-in');
    assert.ok(scored.score >= 0 && scored.score <= 1);
});

test('the card wins over a larger rectangle in the same frame', () => {
    // A licence lying on a clipboard: the clipboard is bigger and just as well
    // bounded, so size alone picks the wrong thing.
    const W = 480, H = 360;
    const f = frame(W, H, [30, 32, 36]);
    fillRect(f, 40, 30, 380, 300, [120, 122, 126]);   // clipboard, 380x300
    fillRect(f, 150, 130, 190, 120, [235, 233, 228]); // card, 190x120 = 1.583

    const withoutHint = detectDocument(f.data, W, H);
    const withHint = detectDocument(f.data, W, H, { preferAspect: CARD_ASPECT });

    assert.ok(withHint, 'the card must be found');
    const c = centreOf(withHint.quad);
    assert.ok(
        c.x > 150 && c.x < 340 && c.y > 130 && c.y < 250,
        `hinted detection should sit on the card, landed at ${c.x.toFixed(0)},${c.y.toFixed(0)}`,
    );

    const w = (dist(withHint.quad[0], withHint.quad[1]) + dist(withHint.quad[2], withHint.quad[3])) / 2;
    const h = (dist(withHint.quad[3], withHint.quad[0]) + dist(withHint.quad[1], withHint.quad[2])) / 2;
    const aspect = Math.max(w, h) / Math.min(w, h);
    assert.ok(Math.abs(aspect - CARD_ASPECT) < 0.25, `detected aspect ${aspect.toFixed(2)} should be card-like`);

    // Recorded, not asserted as a requirement: the unhinted pass is allowed to
    // pick either rectangle. The point is only that the hint makes it reliable.
    assert.ok(withoutHint === null || withoutHint.quad.length === 4);
});

// ---------------------------------------------------------------------------
// THE PROMISE ON THE BANNER
// ---------------------------------------------------------------------------

test('there is no file input, because a capture input writes to the camera roll', () => {
    const src = code(CAPTURE);
    assert.doesNotMatch(src, /type=["']file["']/, 'a file input would route through the native camera app');
    assert.doesNotMatch(src, /\bcapture=/, 'the capture attribute is the specific thing that saves to the device');
    assert.match(src, /getUserMedia/, 'frames must come from a MediaStream');
});

test('no savable handle to the image is ever created', () => {
    const src = code(CAPTURE);
    assert.doesNotMatch(src, /createObjectURL/, 'a blob URL outlives the component and can be saved');
    assert.doesNotMatch(src, /toDataURL/, 'a data URL is a savable copy of the image');
    assert.doesNotMatch(src, /\.toBlob\(/, 'a blob is a file in waiting');
    assert.doesNotMatch(src, /<a[^>]*download/, 'nothing may offer the image as a download');
});

test('no storage API is touched and no pixels leave the browser', () => {
    const src = code(CAPTURE);
    for (const api of ['localStorage', 'sessionStorage', 'indexedDB', 'caches']) {
        assert.ok(!src.includes(api), `${api} must not appear in ID capture`);
    }
    assert.doesNotMatch(src, /fetch\(|axios|XMLHttpRequest/, 'ID capture must not upload anything');
});

test('buffers are overwritten on every exit path', () => {
    const src = read(CAPTURE);
    assert.match(src, /function wipe\(/, 'there must be an explicit wipe');
    assert.match(src, /buffer\.fill\(0\)/, 'wiping means overwriting, not just dropping the reference');
    assert.match(src, /const destroyImages = useCallback/, 'one teardown all exits share');

    // Unmount, close, retake, moving to the second side and finishing all
    // destroy the pixels. Miss one and an image survives the flow.
    for (const caller of ['handleClose', 'retake', 'goToBack', 'finish']) {
        const idx = src.indexOf(`const ${caller} = useCallback`);
        assert.ok(idx > 0, `${caller} must exist`);
        const body = src.slice(idx, idx + 700);
        assert.ok(
            /destroyImages\(\)|wipe\(cropRef\.current\.data\)/.test(body),
            `${caller} must destroy the captured pixels`,
        );
    }
    assert.match(src, /mountedRef\.current = false;[\s\S]{0,200}destroyImages\(\)/, 'unmount must destroy them too');
});

test('the caller is handed fields, never pixels', () => {
    const src = code(CAPTURE);
    const idx = src.indexOf('const finish = useCallback');
    const body = src.slice(idx, idx + 800);
    assert.match(body, /onComplete\(payload\)/, 'the completion payload is what leaves the modal');
    // The payload is built from parsed fields and nothing else.
    assert.match(body, /const payload = parsed[\s\S]{0,160}fields: parsed\.fields/, 'the payload is fields');
    assert.doesNotMatch(body, /cropRef|previewRef|\bdata:|toDataURL|createObjectURL/, 'no pixels may ride along with it');
    // Destruction happens before the handoff, so no parent can grab them.
    assert.ok(
        body.indexOf('destroyImages()') < body.indexOf('onComplete('),
        'images must be destroyed before the caller is called, not after',
    );
});

test('the banner states the promise the code keeps', () => {
    const src = read(CAPTURE);
    assert.match(src, /Never Saved To This Device/i);
    assert.match(src, /Never Uploaded/i);
});

// ---------------------------------------------------------------------------
// WIRING
// ---------------------------------------------------------------------------

test('the member form offers both a camera scan and a hardware scanner', () => {
    const src = read(MODAL);
    assert.match(src, /IdCaptureModal/, 'the camera path must be mounted');
    assert.match(src, />Scan ID</, 'the camera path needs a button');
    assert.match(src, />ID Scanner</, 'the hardware path needs a button');
    assert.match(src, /looksLikeAamva/, 'the wedge field must recognise a real scan');
    assert.match(src, /parseAamva/, 'both paths must go through the one parser');
});

test('a scan fills empty fields and never overwrites what staff typed', () => {
    const src = read(MODAL);
    const idx = src.indexOf('const applyIdFields');
    assert.ok(idx > 0);
    const body = src.slice(idx, idx + 900);
    assert.match(
        body,
        /if \(key in next && !String\(next\[key\] \|\| ''\)\.trim\(\)\) next\[key\] = value;/,
        'only blank fields may be filled',
    );
});

test('the raw barcode payload is cleared from the DOM once parsed', () => {
    const src = read(MODAL);
    // The wedge payload is the entire machine-readable record; leaving it in a
    // textarea is the same mistake as saving the image.
    assert.match(src, /wedgeRef\.current\.value = '';/, 'the field must be cleared after a scan');
    assert.match(src, /onBlur=\{\(\) => \{ if \(wedgeRef\.current\) wedgeRef\.current\.value = ''; \}\}/,
        'and cleared again if focus leaves mid-scan');
});

test('an unreadable barcode is reported honestly, and unsupported differently', () => {
    const src = read(CAPTURE);
    assert.match(src, /Barcode Not Read/, 'a failed read must say so');
    assert.match(src, /Cannot Read ID Barcodes/, 'a browser that cannot decode must say that instead');
    assert.match(src, /Safari On iPhone And iPad/, 'and name the platform, because that is the actual cause');

    const facade = read(PDF417);
    assert.match(facade, /getSupportedFormats/, 'presence of the API is not proof PDF417 is supported');
    assert.match(facade, /reason: 'unsupported'/, 'unsupported must be distinguishable from not-found');
});

test('scanner surfaces carry no emoji, per the commander rule', () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
    for (const rel of [CAPTURE, MODAL, PDF417, 'src/lib/idscan/aamva.mjs']) {
        assert.ok(!emoji.test(read(rel)), `${rel} contains an emoji`);
    }
});
