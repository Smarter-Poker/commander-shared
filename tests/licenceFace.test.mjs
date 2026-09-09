/**
 * READING THE FRONT WHEN THE BARCODE WILL NOT SCAN
 *
 * pdf417.mjs reads the barcode on the back, which is the right answer when it
 * works. It stops working on a worn card, and a worn card is the normal case
 * at a poker room desk: a licence lives in a wallet for eight years, the
 * laminate scuffs, and the barcode is the first thing to go.
 *
 * There was no fallback at all. The desk typed everything, with a member
 * standing there.
 *
 * The front is also a standard. AAMVA numbers the fields printed on the face
 * of every compliant US card and they are the same numbers in every state, so
 * this is a grammar rather than a guess. These tests hold it to the two things
 * that matter: it reads real layouts, and it NEVER invents a field, because a
 * wrong date of birth on an ID check is worse in every direction than an empty
 * box somebody fills in.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    parseLicenceFace, looksLikeLicenceFace, faceDate, findState, findIdNumber, toLines,
    registerFaceReader, hasFaceReader, resetFaceReaderForTests, readLicenceFace,
} from '../src/lib/idscan/licenceFace.mjs';
import { parseAamva } from '../src/lib/idscan/aamva.mjs';
import fs from 'node:fs';

/** Nevada, printing the AAMVA numerals, which most modern cards do. */
const NEVADA = `NEVADA
DRIVER LICENSE
4d DLN 1234567890
1 SMITH
2 DANIEL JAMES
3 DOB 08/15/1985
4b EXP 08/15/2029
4a ISS 08/15/2021
8 742 EVERGREEN TER
LAS VEGAS, NV 89109
15 SEX M`;

/** California, printing the spelled-out labels instead, on an ID card. */
const CALIFORNIA = `CALIFORNIA
IDENTIFICATION CARD
DL D1234567
LN GARCIA
FN MARIA ELENA
DOB 03/02/1990
EXP 03/02/2028
9 END NONE`;

const JUNK = `blurry card
zz 4`;

// ---------------------------------------------------------------------------
// IT READS A REAL CARD
// ---------------------------------------------------------------------------

test('a Nevada licence gives up every field the desk would type', () => {
    const out = parseLicenceFace(NEVADA);
    assert.equal(out.ok, true);
    assert.deepEqual(out.fields, {
        first_name: 'Daniel',
        last_name: 'Smith',
        middle_name: 'James',
        date_of_birth: '1985-08-15',
        id_number: '1234567890',
        id_state: 'NV',
        id_expiry: '2029-08-15',
        id_type: 'drivers_license',
    });
    assert.equal(out.meta.issueDate, '2021-08-15');
    assert.equal(out.confidence, 100);
});

test('a California ID card is read from the spelled-out labels', () => {
    const out = parseLicenceFace(CALIFORNIA);
    assert.equal(out.ok, true);
    assert.equal(out.fields.last_name, 'Garcia');
    assert.equal(out.fields.first_name, 'Maria');
    assert.equal(out.fields.middle_name, 'Elena', 'given names arrive as one field');
    assert.equal(out.fields.date_of_birth, '1990-03-02');
    assert.equal(out.fields.id_number, 'D1234567');
    assert.equal(out.fields.id_type, 'state_id', 'an identification card is not a licence');
});

test('the field shape is the one parseAamva returns, so nothing downstream cares which read it', () => {
    const face = parseLicenceFace(NEVADA).fields;
    const barcode = parseAamva(
        '@\n\rANSI 636014040002DL00410288ZC03290015DLDAQ1234567890\n'
        + 'DCSSMITH\nDACDANIEL\nDADJAMES\nDBB08151985\nDBA08152029\nDBC1\n'
        + 'DAG742 EVERGREEN TER\nDAILAS VEGAS\nDAJNV\nDAK89109\nDCGUSA\n',
    ).fields;
    for (const key of Object.keys(face)) {
        assert.ok(key in barcode || key === 'id_state', `${key} is not a field the barcode path produces`);
    }
    assert.equal(face.first_name, barcode.first_name);
    assert.equal(face.last_name, barcode.last_name);
    assert.equal(face.date_of_birth, barcode.date_of_birth);
    assert.equal(face.id_number, barcode.id_number);
    assert.equal(face.id_expiry, barcode.id_expiry);
});

// ---------------------------------------------------------------------------
// IT NEVER INVENTS ONE
// ---------------------------------------------------------------------------

test('a two-digit year is refused rather than guessed', () => {
    // On a licence the same two digits could be a birth year or an expiry year
    // a century apart. Being wrong about either is worse than being absent.
    assert.equal(faceDate('DOB 08/15/85'), null);
    assert.equal(faceDate('DOB 08/15/1985'), '1985-08-15');
    assert.equal(faceDate('EXP 13/45/2029'), null, 'an impossible date is not a date');
    assert.equal(faceDate('DOB 08/15/1885'), null, 'nor one from before licences existed');
    for (const junk of ['', null, undefined, 'DOB', 'SEX M']) assert.equal(faceDate(junk), null);
});

test('a licence number is read off its label and nowhere else', () => {
    assert.equal(findIdNumber(toLines(NEVADA)), '1234567890');
    assert.equal(findIdNumber(toLines(CALIFORNIA)), 'D1234567');
    // A discriminator or an audit number floating on the card is not it.
    assert.equal(findIdNumber(toLines('NEVADA\nDRIVER LICENSE\n0123456789ABC\n15 SEX M')), '');
    // Neither is a date that happened to sit next to the label.
    assert.equal(findIdNumber(toLines('DLN 08/15/2029')), '');
});

test('an unreadable card says so instead of returning half a person', () => {
    const out = parseLicenceFace(JUNK);
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'not-enough-identity');
    assert.equal(out.confidence, 0);
    assert.equal(out.fields.first_name, undefined);
    assert.equal(out.fields.date_of_birth, undefined);
});

test('a card that yielded only an expiry date has not been read', () => {
    const out = parseLicenceFace('NEVADA\nDRIVER LICENSE\n4b EXP 08/15/2029');
    assert.equal(out.ok, false, 'an expiry alone is not an identification');
    assert.equal(out.fields.date_of_birth, undefined);
});

test('an empty field is dropped, never blanked', () => {
    // The same rule parseAamva follows. Applying a partial read must not wipe
    // something a member of staff has already typed in.
    const out = parseLicenceFace('NEVADA\nDRIVER LICENSE\n1 SMITH\n3 DOB 08/15/1985');
    assert.ok(!('first_name' in out.fields), 'an unread name must be absent, not empty');
    assert.equal(out.fields.last_name, 'Smith');
    assert.equal(out.fields.date_of_birth, '1985-08-15');
    for (const value of Object.values(out.fields)) {
        assert.notEqual(value, '', 'no empty string may survive');
        assert.notEqual(value, null);
    }
});

test('empty and hostile input never throws', () => {
    for (const input of ['', '   ', '\n\n', null, undefined, 0, {}, []]) {
        const out = parseLicenceFace(input);
        assert.equal(out.ok, false);
        assert.equal(out.confidence, 0);
    }
});

// ---------------------------------------------------------------------------
// AND IT KNOWS WHEN IT IS NOT LOOKING AT A CARD
// ---------------------------------------------------------------------------

test('a licence is recognised, and a receipt is not', () => {
    assert.equal(looksLikeLicenceFace(NEVADA), true);
    assert.equal(looksLikeLicenceFace(CALIFORNIA), true);
    assert.equal(looksLikeLicenceFace(JUNK), false);
    assert.equal(looksLikeLicenceFace('BELLAGIO POKER ROOM\nBUY-IN 300.00\nTOTAL 340.00'), false);
    assert.equal(looksLikeLicenceFace(''), false);
});

test('the state comes from its printed name or from the address line', () => {
    assert.equal(findState(toLines(NEVADA)), 'NV');
    assert.equal(findState(toLines(CALIFORNIA)), 'CA');
    assert.equal(findState(toLines('SOMEWHERE\nAUSTIN, TX 78701')), 'TX');
    // "IN" and "OR" are words as well as states; a bare token is never enough.
    assert.equal(findState(toLines('PAID IN FULL OR RETURN')), null);
});

test('the reader is pure: no network, no model, same answer twice', () => {
    assert.deepEqual(parseLicenceFace(NEVADA), parseLicenceFace(NEVADA));
});

// ---------------------------------------------------------------------------
// THE SEAM: THIS PACKAGE CARRIES NO ENGINE
// ---------------------------------------------------------------------------

test('with nothing registered, it says so rather than failing', () => {
    resetFaceReaderForTests();
    assert.equal(hasFaceReader(), false);
});

test('no reader is told apart from a reader that failed', async () => {
    // The difference decides whether anybody should be paged. Nothing
    // registered is a configuration fact; a reader that threw is an incident.
    resetFaceReaderForTests();
    const none = await readLicenceFace({});
    assert.equal(none.ok, false);
    assert.equal(none.reason, 'no-reader');

    registerFaceReader(() => { throw new Error('wasm exploded'); });
    const broken = await readLicenceFace({});
    assert.equal(broken.reason, 'reader-failed');
    assert.ok(broken.error instanceof Error);
    resetFaceReaderForTests();
});

test('a registered reader turns an image into fields', async () => {
    resetFaceReaderForTests();
    registerFaceReader(async () => ({ text: NEVADA, confidence: 91 }));
    assert.equal(hasFaceReader(), true);
    const out = await readLicenceFace({ fake: 'canvas' });
    assert.equal(out.ok, true);
    assert.equal(out.fields.last_name, 'Smith');
    assert.equal(out.fields.date_of_birth, '1985-08-15');
    assert.equal(out.meta.engineConfidence, 91, 'how legible the photo was, kept apart from how sure the parse is');
    assert.equal(out.confidence, 100, 'and the parse confidence is its own number');
    resetFaceReaderForTests();
});

test('a lazy loader is called once and its failure does not poison later tries', async () => {
    resetFaceReaderForTests();
    let calls = 0;
    registerFaceReader(async () => { calls += 1; throw new Error('download failed'); }, { lazy: true });
    assert.equal(hasFaceReader(), true, 'registered counts, loaded or not');
    assert.equal((await readLicenceFace({})).reason, 'no-reader');
    assert.equal(calls, 1);
    // The next card gets a fresh attempt rather than inheriting the failure.
    assert.equal((await readLicenceFace({})).reason, 'no-reader');
    assert.equal(calls, 2, 'a failed load must not be cached forever');

    resetFaceReaderForTests();
    let loads = 0;
    registerFaceReader(async () => { loads += 1; return async () => ({ text: NEVADA }); }, { lazy: true });
    assert.equal((await readLicenceFace({})).fields.last_name, 'Smith');
    assert.equal((await readLicenceFace({})).fields.last_name, 'Smith');
    assert.equal(loads, 1, 'a successful load is paid for once');
    resetFaceReaderForTests();
});

test('an empty read is not a card that could not be parsed', async () => {
    resetFaceReaderForTests();
    registerFaceReader(async () => ({ text: '   ' }));
    const out = await readLicenceFace({});
    assert.equal(out.reason, 'no-text');
    resetFaceReaderForTests();
});

test('no image at all is refused before an engine is even loaded', async () => {
    resetFaceReaderForTests();
    let loaded = false;
    registerFaceReader(async () => { loaded = true; return async () => ({ text: NEVADA }); }, { lazy: true });
    assert.equal((await readLicenceFace(null)).reason, 'no-image');
    assert.equal(loaded, false, 'megabytes must not be downloaded for a missing image');
    resetFaceReaderForTests();
});

// ---------------------------------------------------------------------------
// AND THE CAPTURE FLOW ACTUALLY USES IT
// ---------------------------------------------------------------------------

const MODAL = 'src/components/commander/members/IdCaptureModal.jsx';
const modalSource = () => fs.readFileSync(new URL(`../${MODAL}`, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

test('a barcode that will not scan falls back to the front, on both failure paths', () => {
    const src = modalSource();
    // decodePdf417 failing, AND decoding to something parseAamva refuses.
    // A card can fail either way and the desk should not care which.
    assert.equal((src.match(/const read = await readFrontFace\(\);/g) || []).length, 2,
        'both failure paths must try the front');
    assert.match(src, /setDecodeState\('face'\)/);
});

test('the front is kept for exactly as long as it is needed', () => {
    const src = modalSource();
    assert.match(src, /frontCropRef\.current = \{/, 'the front must survive the move to the back');
    // And obeys the rule the file states about itself.
    const destroy = src.slice(src.indexOf('const destroyImages'), src.indexOf('const startCamera'));
    assert.match(destroy, /wipe\(frontCropRef\.current\.data\)/, 'no path out may leave a licence in memory');
    // Retaking the front must drop it, or a stale copy is read against a card
    // the operator has already replaced.
    const retake = src.slice(src.indexOf('const retake = useCallback'), src.indexOf('const goToBack'));
    assert.match(retake, /side === 'front' && frontCropRef\.current/);
});

test('nothing is offered that is not an identification', () => {
    const src = modalSource();
    assert.match(src, /return read && read\.ok \? read : null/,
        'a read with no identity in it must not be shown as one');
    assert.match(src, /if \(!front \|\| !hasFaceReader\(\)\) return null/,
        'and no engine means no fallback, not a broken one');
});

test('the operator is told the fields came from the printed side', () => {
    const src = fs.readFileSync(new URL(`../${MODAL}`, import.meta.url), 'utf8');
    assert.match(src, /Read From The Front Of The Card/);
    assert.match(src, /Check Them Against The Card Before You Continue/);
    // The button must not claim barcode certainty for a face read.
    assert.match(src, /Use These Details After Checking/);
});
