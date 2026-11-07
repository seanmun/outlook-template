/**
 * Minimal Compound File Binary (MS-CFB) writer, version 3 (512-byte sectors).
 *
 * Written in-house rather than using a generic library so we control the
 * details Outlook's structured-storage reader depends on:
 *  - sibling ordering uses the MS-CFB comparison (name length, then
 *    case-insensitive code-unit order),
 *  - each storage's children form a valid red-black tree,
 *  - the root entry can carry a CLSID (OFT vs MSG differ only by this).
 *
 * Limits: no DIFAT sectors, so output is capped at 109 FAT sectors
 * (~6.8 MB). That is far above a reasonable internal email.
 */

export interface CfbStream {
  type: "stream";
  name: string;
  data: Uint8Array;
}

export interface CfbStorage {
  type: "storage";
  name: string;
  clsid?: string;
  children: CfbNode[];
}

export type CfbNode = CfbStream | CfbStorage;

export class CfbTooLargeError extends Error {
  constructor(bytes: number) {
    super(
      `Compound file would exceed the supported size (~6.8 MB, got ~${Math.round(bytes / 1024)} KB of content). Reduce image sizes.`,
    );
    this.name = "CfbTooLargeError";
  }
}

const SECTOR = 512;
const MINI_SECTOR = 64;
const MINI_CUTOFF = 4096;
const ENDOFCHAIN = 0xfffffffe;
const FREESECT = 0xffffffff;
const FATSECT = 0xfffffffd;
const NOSTREAM = 0xffffffff;
const MAX_HEADER_FAT = 109;
const ENTRIES_PER_FAT_SECTOR = SECTOR / 4;

/** MS-CFB 2.6.4: shorter names sort first; equal lengths compare upper-cased code units. */
export function compareCfbNames(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length;
  const ua = a.toUpperCase();
  const ub = b.toUpperCase();
  for (let i = 0; i < ua.length; i++) {
    const d = ua.charCodeAt(i) - ub.charCodeAt(i);
    if (d !== 0) return d;
  }
  return 0;
}

/** Parse "{0006F046-0000-0000-C000-000000000046}" into the 16-byte on-disk GUID layout. */
export function clsidToBytes(clsid: string): Uint8Array {
  const hex = clsid.replace(/[{}-]/g, "");
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) throw new Error(`Invalid CLSID: ${clsid}`);
  const b = new Uint8Array(16);
  const byte = (i: number) => parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  // Data1 (LE uint32), Data2 (LE uint16), Data3 (LE uint16), Data4 (8 bytes as-is)
  b[0] = byte(3); b[1] = byte(2); b[2] = byte(1); b[3] = byte(0);
  b[4] = byte(5); b[5] = byte(4);
  b[6] = byte(7); b[7] = byte(6);
  for (let i = 8; i < 16; i++) b[i] = byte(i);
  return b;
}

interface DirEntry {
  name: string;
  objType: 1 | 2 | 5; // storage, stream, root
  clsid?: Uint8Array;
  left: number;
  right: number;
  child: number;
  red: boolean;
  start: number;
  size: number;
  data?: Uint8Array;
}

/** Build a balanced BST over sorted ids; colour the deepest level red so black-heights match. */
function buildTree(
  sortedIds: number[],
  entries: DirEntry[],
): number {
  if (sortedIds.length === 0) return NOSTREAM;
  const depthOf = new Map<number, number>();
  let maxDepth = 0;
  const build = (lo: number, hi: number, depth: number): number => {
    if (lo > hi) return NOSTREAM;
    const mid = (lo + hi) >> 1;
    const id = sortedIds[mid];
    depthOf.set(id, depth);
    if (depth > maxDepth) maxDepth = depth;
    entries[id].left = build(lo, mid - 1, depth + 1);
    entries[id].right = build(mid + 1, hi, depth + 1);
    return id;
  };
  const root = build(0, sortedIds.length - 1, 0);
  for (const id of sortedIds) {
    // With a size-balanced split all null links sit at depth maxDepth or maxDepth+1,
    // so making only the deepest level red keeps every path's black count equal.
    entries[id].red = maxDepth > 0 && depthOf.get(id) === maxDepth;
  }
  return root;
}

function validateName(name: string) {
  if (name.length === 0 || name.length > 31) throw new Error(`Invalid CFB entry name length: "${name}"`);
  if (/[/\\:!]/.test(name)) throw new Error(`Invalid character in CFB entry name: "${name}"`);
}

export function writeCfb(root: CfbStorage): Uint8Array {
  const entries: DirEntry[] = [];

  const add = (node: CfbNode, isRoot: boolean): number => {
    validateName(isRoot ? "Root Entry" : node.name);
    const id = entries.length;
    entries.push({
      name: isRoot ? "Root Entry" : node.name,
      objType: isRoot ? 5 : node.type === "storage" ? 1 : 2,
      clsid: node.type === "storage" && node.clsid ? clsidToBytes(node.clsid) : undefined,
      left: NOSTREAM,
      right: NOSTREAM,
      child: NOSTREAM,
      red: false,
      start: 0,
      size: node.type === "stream" ? node.data.length : 0,
      data: node.type === "stream" ? node.data : undefined,
    });
    if (node.type === "storage") {
      const names = new Set<string>();
      const childIds: number[] = [];
      for (const c of node.children) {
        const key = c.name.toUpperCase();
        if (names.has(key)) throw new Error(`Duplicate CFB entry name: ${c.name}`);
        names.add(key);
        childIds.push(add(c, false));
      }
      childIds.sort((a, b) => compareCfbNames(entries[a].name, entries[b].name));
      entries[id].child = buildTree(childIds, entries);
    }
    return id;
  };
  add(root, true);

  // --- Mini stream: concatenate small streams in 64-byte mini sectors.
  const miniFat: number[] = [];
  const miniChunks: Uint8Array[] = [];
  for (const e of entries) {
    if (e.objType !== 2) continue;
    if (e.size === 0) {
      e.start = ENDOFCHAIN;
      continue;
    }
    if (e.size >= MINI_CUTOFF) continue;
    const count = Math.ceil(e.size / MINI_SECTOR);
    e.start = miniFat.length;
    for (let i = 0; i < count; i++) miniFat.push(i === count - 1 ? ENDOFCHAIN : miniFat.length + 1);
    const padded = new Uint8Array(count * MINI_SECTOR);
    padded.set(e.data!);
    miniChunks.push(padded);
  }
  const miniStreamSize = miniFat.length * MINI_SECTOR;

  // --- Sector allocation. Order: big streams, mini stream, mini FAT, directory, FAT.
  const fat: number[] = [];
  const allocChain = (sectors: number): number => {
    if (sectors === 0) return ENDOFCHAIN;
    const start = fat.length;
    for (let i = 0; i < sectors; i++) fat.push(i === sectors - 1 ? ENDOFCHAIN : fat.length + 1);
    return start;
  };

  for (const e of entries) {
    if (e.objType === 2 && e.size >= MINI_CUTOFF) e.start = allocChain(Math.ceil(e.size / SECTOR));
  }
  const miniStreamStart = allocChain(Math.ceil(miniStreamSize / SECTOR));
  entries[0].start = miniStreamSize > 0 ? miniStreamStart : ENDOFCHAIN;
  entries[0].size = miniStreamSize;

  const miniFatSectors = Math.ceil((miniFat.length * 4) / SECTOR);
  const miniFatStart = allocChain(miniFatSectors);

  const dirSectors = Math.ceil((entries.length * 128) / SECTOR);
  const dirStart = allocChain(dirSectors);

  let fatSectors = 1;
  while (Math.ceil((fat.length + fatSectors) / ENTRIES_PER_FAT_SECTOR) > fatSectors) fatSectors++;
  if (fatSectors > MAX_HEADER_FAT) throw new CfbTooLargeError(fat.length * SECTOR);
  const fatStart = fat.length;
  for (let i = 0; i < fatSectors; i++) fat.push(FATSECT);
  while (fat.length < fatSectors * ENTRIES_PER_FAT_SECTOR) fat.push(FREESECT);

  const totalSectors = fatStart + fatSectors;
  const out = new Uint8Array(SECTOR * (1 + totalSectors));
  const view = new DataView(out.buffer);
  const sectorOffset = (n: number) => SECTOR * (n + 1);

  // --- Header
  out.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0);
  view.setUint16(24, 0x003e, true);
  view.setUint16(26, 0x0003, true);
  view.setUint16(28, 0xfffe, true);
  view.setUint16(30, 9, true);
  view.setUint16(32, 6, true);
  view.setUint32(40, 0, true);
  view.setUint32(44, fatSectors, true);
  view.setUint32(48, dirStart, true);
  view.setUint32(52, 0, true);
  view.setUint32(56, MINI_CUTOFF, true);
  view.setUint32(60, miniFatSectors ? miniFatStart : ENDOFCHAIN, true);
  view.setUint32(64, miniFatSectors, true);
  view.setUint32(68, ENDOFCHAIN, true);
  view.setUint32(72, 0, true);
  for (let i = 0; i < MAX_HEADER_FAT; i++) {
    view.setUint32(76 + i * 4, i < fatSectors ? fatStart + i : FREESECT, true);
  }

  // --- Big streams
  for (const e of entries) {
    if (e.objType === 2 && e.size >= MINI_CUTOFF) out.set(e.data!, sectorOffset(e.start));
  }
  // --- Mini stream
  if (miniStreamSize > 0) {
    let off = sectorOffset(miniStreamStart);
    for (const chunk of miniChunks) {
      out.set(chunk, off);
      off += chunk.length;
    }
  }
  // --- Mini FAT
  if (miniFatSectors) {
    const base = sectorOffset(miniFatStart);
    for (let i = 0; i < miniFatSectors * ENTRIES_PER_FAT_SECTOR; i++) {
      view.setUint32(base + i * 4, i < miniFat.length ? miniFat[i] : FREESECT, true);
    }
  }
  // --- Directory
  const dirBase = sectorOffset(dirStart);
  for (let i = 0; i < dirSectors * 4; i++) {
    const off = dirBase + i * 128;
    const e = entries[i];
    if (!e) {
      view.setUint32(off + 68, NOSTREAM, true);
      view.setUint32(off + 72, NOSTREAM, true);
      view.setUint32(off + 76, NOSTREAM, true);
      continue;
    }
    for (let c = 0; c < e.name.length; c++) view.setUint16(off + c * 2, e.name.charCodeAt(c), true);
    view.setUint16(off + 64, (e.name.length + 1) * 2, true);
    out[off + 66] = e.objType;
    out[off + 67] = e.red ? 0 : 1;
    view.setUint32(off + 68, e.left, true);
    view.setUint32(off + 72, e.right, true);
    view.setUint32(off + 76, e.child, true);
    if (e.clsid) out.set(e.clsid, off + 80);
    view.setUint32(off + 116, e.objType === 1 ? 0 : e.start, true);
    view.setUint32(off + 120, e.size, true);
    view.setUint32(off + 124, 0, true);
  }
  // --- FAT
  const fatBase = sectorOffset(fatStart);
  for (let i = 0; i < fat.length; i++) view.setUint32(fatBase + i * 4, fat[i], true);

  return out;
}
