'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Reading and writing text files.
 *
 * The editor works in one kind of text: UTF-8, with lines ending in a single
 * newline. What a file actually holds is worked out on the way in and put back
 * on the way out, so nothing above this file has to think about it - and a file
 * that arrived as UTF-16 with Windows line endings leaves the same way, having
 * been edited as though it were neither.
 *
 * How a file is encoded is only ever *shown* in Smart Mode. It is worked out
 * here regardless, because getting it wrong silently corrupts the file.
 */

const BOMS = [
  { bytes: [0xef, 0xbb, 0xbf], encoding: 'utf8', skip: 3 },
  { bytes: [0xff, 0xfe], encoding: 'utf16le', skip: 2 },
  { bytes: [0xfe, 0xff], encoding: 'utf16be', skip: 2 }
];

/**
 * What this file appears to be.
 *
 * A byte-order mark settles it. Failing that, a run of zero bytes in the even
 * positions is UTF-16 that forgot to say so, and anything that survives being
 * read as UTF-8 is UTF-8. Only if that fails is Latin-1 assumed, since it can
 * never fail and so proves nothing.
 */
function sniff(buffer) {
  for (const bom of BOMS) {
    if (bom.bytes.every((b, i) => buffer[i] === b)) {
      return { encoding: bom.encoding, skip: bom.skip, bom: true };
    }
  }

  const look = buffer.subarray(0, 512);
  let zerosOdd = 0;
  for (let i = 1; i < look.length; i += 2) if (look[i] === 0) zerosOdd += 1;
  if (look.length > 8 && zerosOdd > look.length / 4) {
    return { encoding: 'utf16le', skip: 0, bom: false };
  }

  const text = buffer.toString('utf8');
  // U+FFFD is what Node substitutes for a byte sequence that is not UTF-8.
  if (!text.includes('�')) return { encoding: 'utf8', skip: 0, bom: false };
  return { encoding: 'latin1', skip: 0, bom: false };
}

/** Which line ending the file mostly uses. */
function sniffEol(text) {
  const crlf = (text.match(/\r\n/g) || []).length;
  const lf = (text.match(/\n/g) || []).length - crlf;
  return crlf > lf ? 'crlf' : 'lf';
}

/** Read a file into the one kind of text the editor works in. */
function read(file) {
  const buffer = fs.readFileSync(file);
  const { encoding, skip } = sniff(buffer);

  let text;
  if (encoding === 'utf16be') {
    // Node cannot read big-endian directly; swapping the pairs makes it little.
    const swapped = Buffer.from(buffer.subarray(skip));
    swapped.swap16();
    text = swapped.toString('utf16le');
  } else {
    text = buffer.subarray(skip).toString(encoding === 'latin1' ? 'latin1' : encoding);
  }

  const eol = sniffEol(text);
  return {
    ok: true,
    path: file,
    name: path.basename(file),
    text: text.replace(/\r\n/g, '\n').replace(/\r/g, '\n'),
    encoding: encoding === 'utf16be' ? 'utf16le' : encoding,
    eol,
    modified: fs.statSync(file).mtimeMs
  };
}

/** Write it back the way it came. */
function write(file, text, { encoding = 'utf8', eol = 'lf' } = {}) {
  const body = eol === 'crlf' ? text.replace(/\n/g, '\r\n') : text;

  let buffer;
  if (encoding === 'utf16le') {
    // A UTF-16 file without a mark is read as gibberish by half the world, so
    // one is always written.
    buffer = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(body, 'utf16le')]);
  } else if (encoding === 'latin1') {
    buffer = Buffer.from(body, 'latin1');
  } else {
    buffer = Buffer.from(body, 'utf8');
  }

  fs.writeFileSync(file, buffer);
  return { ok: true, path: file, name: path.basename(file), modified: fs.statSync(file).mtimeMs };
}

module.exports = { read, write, sniff, sniffEol };
