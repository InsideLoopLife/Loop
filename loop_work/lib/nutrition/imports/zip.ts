import { inflateRawSync } from "node:zlib";

export type ZipTextFile = {
  name: string;
  text: string;
};

function readUInt16(buffer: Buffer, offset: number) {
  return buffer.readUInt16LE(offset);
}

function readUInt32(buffer: Buffer, offset: number) {
  return buffer.readUInt32LE(offset);
}

function findEndOfCentralDirectory(buffer: Buffer) {
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 70000); i -= 1) {
    if (readUInt32(buffer, i) === 0x06054b50) return i;
  }
  return -1;
}

/**
 * Tiny ZIP reader for admin CSV packages.
 * Supports normal deflated/stored CSV files.
 * It deliberately ignores directories and binaries.
 */
export function readZipCsvFiles(input: ArrayBuffer | Buffer): ZipTextFile[] {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const eocd = findEndOfCentralDirectory(buffer);
  if (eocd < 0) throw new Error("Could not read ZIP central directory.");

  const entries = readUInt16(buffer, eocd + 10);
  const centralOffset = readUInt32(buffer, eocd + 16);
  const files: ZipTextFile[] = [];

  let ptr = centralOffset;

  for (let i = 0; i < entries; i += 1) {
    if (readUInt32(buffer, ptr) !== 0x02014b50) throw new Error("Invalid ZIP central directory entry.");

    const compressionMethod = readUInt16(buffer, ptr + 10);
    const compressedSize = readUInt32(buffer, ptr + 20);
    const fileNameLength = readUInt16(buffer, ptr + 28);
    const extraLength = readUInt16(buffer, ptr + 30);
    const commentLength = readUInt16(buffer, ptr + 32);
    const localHeaderOffset = readUInt32(buffer, ptr + 42);
    const name = buffer.subarray(ptr + 46, ptr + 46 + fileNameLength).toString("utf8");

    ptr += 46 + fileNameLength + extraLength + commentLength;

    if (!name.toLowerCase().endsWith(".csv")) continue;
    if (name.includes("__MACOSX/") || name.endsWith("/")) continue;

    if (readUInt32(buffer, localHeaderOffset) !== 0x04034b50) throw new Error(`Invalid ZIP local file header for ${name}.`);
    const localNameLength = readUInt16(buffer, localHeaderOffset + 26);
    const localExtraLength = readUInt16(buffer, localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

    let data: Buffer;
    if (compressionMethod === 0) data = compressed;
    else if (compressionMethod === 8) data = inflateRawSync(compressed);
    else throw new Error(`Unsupported ZIP compression method ${compressionMethod} for ${name}.`);

    files.push({ name, text: data.toString("utf8") });
  }

  return files;
}
