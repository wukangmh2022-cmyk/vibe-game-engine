// Minimal ZIP (store only, no compression) generator for browser
// createZip({ 'path/to/file.txt': 'content' }) => Blob (application/zip)

function crc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c >>> 0;
  }
  return table;
}
const CRC_TABLE = crc32Table();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function writeUint32LE(v: number, arr: number[]) {
  arr.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
}
function writeUint16LE(v: number, arr: number[]) { arr.push(v & 0xff, (v >>> 8) & 0xff); }

export function createZip(files: Record<string, string | Uint8Array | ArrayBuffer>): Blob {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const dirRecs: { nameBytes: Uint8Array; crc: number; size: number; offset: number }[] = [];
  let offset = 0;

  const writeChunk = (nums: number[]) => {
    const u8 = new Uint8Array(nums);
    chunks.push(u8);
    offset += u8.length;
  };
  const writeBytes = (u8: Uint8Array) => { chunks.push(u8); offset += u8.length; };

  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (Math.floor(now.getSeconds() / 2))) & 0xffff;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;

  const names = Object.keys(files);
  for (const name of names) {
    const nameBytes = enc.encode(name.replace(/^\/+/, ''));
    let dataU8: Uint8Array;
    const v = files[name];
    if (typeof v === 'string') dataU8 = enc.encode(v);
    else if (v instanceof Uint8Array) dataU8 = v;
    else dataU8 = new Uint8Array(v);
    const crc = crc32(dataU8);
    const size = dataU8.length >>> 0;

    // Local file header
    const hdr: number[] = [];
    writeUint32LE(0x04034b50, hdr); // signature
    writeUint16LE(20, hdr); // version needed
    writeUint16LE(0, hdr); // flags
    writeUint16LE(0, hdr); // compression 0 = store
    writeUint16LE(dosTime, hdr);
    writeUint16LE(dosDate, hdr);
    writeUint32LE(crc, hdr);
    writeUint32LE(size, hdr);
    writeUint32LE(size, hdr);
    writeUint16LE(nameBytes.length, hdr);
    writeUint16LE(0, hdr); // extra len
    writeChunk(hdr);
    writeBytes(nameBytes);
    writeBytes(dataU8);

    dirRecs.push({ nameBytes, crc, size, offset: offset - (30 + nameBytes.length + size) });
  }

  const startOfCD = offset;
  // Central directory
  for (const r of dirRecs) {
    const cd: number[] = [];
    writeUint32LE(0x02014b50, cd); // signature
    writeUint16LE(20, cd); // version made by
    writeUint16LE(20, cd); // version needed
    writeUint16LE(0, cd); // flags
    writeUint16LE(0, cd); // compression
    writeUint16LE(dosTime, cd);
    writeUint16LE(dosDate, cd);
    writeUint32LE(r.crc, cd);
    writeUint32LE(r.size, cd);
    writeUint32LE(r.size, cd);
    writeUint16LE(r.nameBytes.length, cd);
    writeUint16LE(0, cd); // extra
    writeUint16LE(0, cd); // comment
    writeUint16LE(0, cd); // disk start
    writeUint16LE(0, cd); // int attrs
    writeUint32LE(0, cd); // ext attrs
    writeUint32LE(r.offset, cd);
    writeChunk(cd);
    writeBytes(r.nameBytes);
  }
  const sizeOfCD = offset - startOfCD;

  // End of central directory
  const end: number[] = [];
  writeUint32LE(0x06054b50, end);
  writeUint16LE(0, end); // disk
  writeUint16LE(0, end); // disk
  writeUint16LE(dirRecs.length, end);
  writeUint16LE(dirRecs.length, end);
  writeUint32LE(sizeOfCD, end);
  writeUint32LE(startOfCD, end);
  writeUint16LE(0, end); // comment len
  writeChunk(end);

  const total = chunks.reduce((n, u) => n + u.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const u of chunks) { out.set(u, p); p += u.length; }
  return new Blob([out], { type: 'application/zip' });
}

