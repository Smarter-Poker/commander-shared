/**
 * AAMVA DL/ID PARSER
 *
 * The parser behind both ID capture paths in the member form: a licence
 * photographed with a tablet and decoded in the browser, and a keyboard-wedge
 * ID scanner that types the same payload into a focused field. If this is
 * wrong, staff silently register a member under a mangled name or the wrong
 * date of birth, which in a card room is the one field that matters.
 *
 * Payloads below are shaped like the real thing, including the ways real
 * scanners mangle them: a missing header, CRLF instead of LF, a wedge prefix,
 * and the two mutually incompatible date orders in the standard.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
    parseAamva,
    parseElements,
    parseHeader,
    parseAamvaDate,
    looksLikeAamva,
    ageOn,
    isExpired,
} from '../src/lib/idscan/aamva.mjs';

const LF = '\n';
const CR = '\r';
const RS = '\x1e';

/** Build a compliant payload the way an issuer would. */
function build({ iin = '636014', version = '08', jurisdiction = '00', subfile = 'DL', elements }) {
    const body = subfile + elements.join(LF) + CR;
    const designator = `${subfile}0041${String(body.length).padStart(4, '0')}`;
    return `@${LF}${RS}${CR}ANSI ${iin}${version}${jurisdiction}01${designator}${body}`;
}

const CALIFORNIA = build({
    elements: [
        'DAQI1234562',
        'DCSPUBLIC',
        'DDEN',
        'DACJOHN',
        'DDFN',
        'DADQUINCY',
        'DDGN',
        'DBD01012020',
        'DBB03151985',
        'DBA03152030',
        'DBC1',
        'DAU070 IN',
        'DAYBRO',
        'DAG1234 MAIN ST',
        'DAIANYTOWN',
        'DAJCA',
        'DAK902100000  ',
        'DCFABCD1234',
        'DCGUSA',
    ],
});

// ---------------------------------------------------------------------------
// HEADER AND ELEMENTS
// ---------------------------------------------------------------------------

test('reads the fixed-width header', () => {
    const h = parseHeader(CALIFORNIA);
    assert.ok(h, 'header must parse');
    assert.equal(h.iin, '636014');
    assert.equal(h.version, 8);
});

test('an absent header is not an error', () => {
    assert.equal(parseHeader('DAQI1234562\nDCSPUBLIC'), null);
});

test('elements are only read at the start of a line, so values cannot fake a code', () => {
    // "DAG" appears inside the street value; it must not become an element.
    const payload = build({
        elements: ['DAQX999', 'DCSSMITH', 'DACANNE', 'DAG12 DAGGER LANE', 'DAIDAYTON', 'DAJOH'],
    });
    const el = parseElements(payload);
    assert.equal(el.DAG, '12 DAGGER LANE');
    assert.equal(el.DAI, 'DAYTON');
    assert.equal(el.DAJ, 'OH');
});

test('the subfile designator sharing a line with the first element is stripped', () => {
    const el = parseElements(CALIFORNIA);
    assert.equal(el.DAQ, 'I1234562', 'the leading DL designator must not end up in the licence number');
    assert.equal(el.DCS, 'PUBLIC');
});

// ---------------------------------------------------------------------------
// DATES: the standard contains two incompatible orders
// ---------------------------------------------------------------------------

test('US dates read as MMDDCCYY', () => {
    assert.equal(parseAamvaDate('03151985', 'USA'), '1985-03-15');
    assert.equal(parseAamvaDate('12312001', 'USA'), '2001-12-31');
});

test('Canadian dates read as CCYYMMDD', () => {
    assert.equal(parseAamvaDate('19850315', 'CAN'), '1985-03-15');
});

test('an unambiguous date is read correctly with no country hint', () => {
    // 19850315 cannot be MMDDCCYY: month 19 does not exist.
    assert.equal(parseAamvaDate('19850315', null), '1985-03-15');
    // 03151985 cannot be CCYYMMDD: year 0315 is not plausible.
    assert.equal(parseAamvaDate('03151985', null), '1985-03-15');
});

test('junk dates return null rather than a wrong date', () => {
    assert.equal(parseAamvaDate('', 'USA'), null);
    assert.equal(parseAamvaDate('9999', 'USA'), null);
    assert.equal(parseAamvaDate('00000000', 'USA'), null);
    assert.equal(parseAamvaDate('99999999', 'USA'), null);
});

// ---------------------------------------------------------------------------
// FULL PARSE
// ---------------------------------------------------------------------------

test('a modern licence fills every field the form needs', () => {
    const r = parseAamva(CALIFORNIA);
    assert.equal(r.ok, true);
    assert.deepEqual(r.fields, {
        first_name: 'John',
        last_name: 'Public',
        middle_name: 'Quincy',
        date_of_birth: '1985-03-15',
        id_number: 'I1234562',
        id_state: 'CA',
        id_expiry: '2030-03-15',
        id_type: 'drivers_license',
        address_street: '1234 Main St',
        address_city: 'Anytown',
        address_state: 'CA',
        address_zip: '90210',
    });
    assert.equal(r.meta.sex, 'M');
    assert.equal(r.meta.country, 'USA');
    assert.equal(r.meta.aamvaVersion, 8);
});

test('names come back as names, not as the upper case on the card', () => {
    const r = parseAamva(build({
        elements: ['DAQ1', "DCSO'BRIEN-SMITH", 'DACMARY JO', 'DAJNY', 'DBB01011990'],
    }));
    assert.equal(r.fields.last_name, "O'Brien-Smith");
    assert.equal(r.fields.first_name, 'Mary Jo');
});

test('an ID card is not reported as a driver licence', () => {
    const r = parseAamva(build({
        subfile: 'ID',
        elements: ['DAQZ55', 'DCSRIVERA', 'DACLUIS', 'DAJTX', 'DBB07041992'],
    }));
    assert.equal(r.fields.id_type, 'state_id');
});

test('a legacy payload with one combined name field still parses', () => {
    const r = parseAamva(`@${LF}${RS}${CR}ANSI 6360000100DL${LF}DAAPUBLIC,JOHN,QUINCY${LF}DAQ99887766${LF}DBB03151985${LF}DAJFL${CR}`);
    assert.equal(r.ok, true);
    assert.equal(r.fields.last_name, 'Public');
    assert.equal(r.fields.first_name, 'John');
    assert.equal(r.fields.middle_name, 'Quincy');
});

test('given names arriving in one field are split into first and middle', () => {
    const r = parseAamva(build({
        elements: ['DAQ42', 'DCSCHEN', 'DCTWEI MING', 'DAJWA', 'DBB08081988'],
    }));
    assert.equal(r.fields.first_name, 'Wei');
    assert.equal(r.fields.middle_name, 'Ming');
});

test('nine digit ZIPs are formatted and filler zeros dropped', () => {
    const zip = (v) => parseAamva(build({ elements: ['DAQ1', 'DCSA', 'DACB', 'DAJKY', `DAK${v}`] })).fields.address_zip;
    assert.equal(zip('402020000  '), '40202');
    assert.equal(zip('402021234'), '40202-1234');
    assert.equal(zip('40202'), '40202');
});

test('truncated names are reported so staff know to check the card', () => {
    const r = parseAamva(build({
        elements: ['DAQ1', 'DCSVANDERBILT-HUTCHINSO', 'DDET', 'DACCHRISTOPHER', 'DDFN', 'DAJNY', 'DBB01011990'],
    }));
    assert.deepEqual(r.meta.truncatedNames, ['last']);
});

// ---------------------------------------------------------------------------
// HOW REAL SCANNERS MANGLE IT
// ---------------------------------------------------------------------------

test('a payload with CRLF separators parses the same', () => {
    const crlf = CALIFORNIA.split(LF).join('\r\n');
    const r = parseAamva(crlf);
    assert.equal(r.fields.last_name, 'Public');
    assert.equal(r.fields.date_of_birth, '1985-03-15');
});

test('a wedge prefix before the compliance indicator is discarded', () => {
    const r = parseAamva(`  ${CALIFORNIA}`);
    assert.equal(r.ok, true);
    assert.equal(r.fields.id_number, 'I1234562');
});

test('a payload whose header the scanner ate still parses', () => {
    const headerless = ['DAQI1234562', 'DCSPUBLIC', 'DACJOHN', 'DBB03151985', 'DAJCA', 'DAG1234 MAIN ST', 'DAIANYTOWN'].join(LF);
    const r = parseAamva(headerless);
    assert.equal(r.ok, true);
    assert.equal(r.fields.first_name, 'John');
    assert.equal(r.fields.date_of_birth, '1985-03-15');
    assert.equal(r.meta.aamvaVersion, null, 'no header means no version, and that is fine');
});

test('the first occurrence of a code wins, so jurisdiction subfiles cannot overwrite the licence', () => {
    const payload = CALIFORNIA + `ZCZCAOVERWRITTEN${LF}DAQTAMPERED${CR}`;
    assert.equal(parseAamva(payload).fields.id_number, 'I1234562');
});

// ---------------------------------------------------------------------------
// REFUSING WHAT IS NOT AN ID
// ---------------------------------------------------------------------------

test('non-AAMVA input is refused rather than half-parsed', () => {
    for (const junk of ['', null, undefined, 'hello', 'CMD-1996-abc12345', '{"json":true}']) {
        const r = parseAamva(junk);
        assert.equal(r.ok, false, `${JSON.stringify(junk)} must not parse`);
        assert.deepEqual(r.fields, {});
    }
});

test('looksLikeAamva separates a licence from a member QR code', () => {
    assert.equal(looksLikeAamva(CALIFORNIA), true);
    assert.equal(looksLikeAamva('CMD-1996-abc12345'), false);
    assert.equal(looksLikeAamva('https://smarter.poker/hub'), false);
    assert.equal(looksLikeAamva(''), false);
    // Header eaten, but enough element codes to be sure.
    assert.equal(looksLikeAamva(['DAQX1', 'DCSSMITH', 'DBB01011990'].join(LF)), true);
});

test('empty fields are dropped so applying a scan never blanks typed input', () => {
    const r = parseAamva(build({ elements: ['DAQ1', 'DCSSMITH', 'DACJANE', 'DAJKY'] }));
    assert.ok(!('address_city' in r.fields), 'a missing city must be absent, not an empty string');
    assert.ok(!('date_of_birth' in r.fields), 'a missing DOB must be absent, not null');
    assert.equal(r.fields.last_name, 'Smith');
});

// ---------------------------------------------------------------------------
// WHAT THE DOOR ACTUALLY NEEDS
// ---------------------------------------------------------------------------

test('age is computed on the day, including the birthday edge', () => {
    assert.equal(ageOn('1985-03-15', new Date('2026-03-14T12:00:00')), 40);
    assert.equal(ageOn('1985-03-15', new Date('2026-03-15T00:01:00')), 41);
    assert.equal(ageOn(null), null);
});

test('an expired document is detected', () => {
    assert.equal(isExpired('2020-01-01', new Date('2026-09-08T12:00:00')), true);
    assert.equal(isExpired('2030-01-01', new Date('2026-09-08T12:00:00')), false);
    assert.equal(isExpired(null), false, 'no expiry on the card is not an expired card');
});
