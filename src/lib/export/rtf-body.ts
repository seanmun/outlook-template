/**
 * HTML carried inside RTF ("encapsulated HTML", MS-OXRTFEX), stored the way Outlook stores a
 * message body it saved itself (PidTagRtfCompressed, MS-OXRTFCP).
 *
 * Experimental: an alternative to writing the raw HTML property. Templates saved by Outlook, and
 * the .oft files other tools export, carry the body this way; which of the two classic Outlook
 * opens more faithfully is what the manual test kit (scripts/outlook-test-kit.ts) is for.
 */

function escapeRtf(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x5c) out += "\\\\";
    else if (c === 0x7b) out += "\\{";
    else if (c === 0x7d) out += "\\}";
    else if (c === 0x09) out += "\\tab ";
    else if (c < 0x20) continue;
    // \uN takes a signed 16-bit number; the "?" is the fallback character readers skip (\uc1).
    else if (c > 0x7e) out += `\\u${c > 0x7fff ? c - 0x10000 : c}?`;
    else out += text[i];
  }
  return out;
}

/** Every line of the HTML becomes an \htmltag group, so de-encapsulating gives the HTML back unchanged. */
export function htmlToEncapsulatedRtf(html: string): string {
  const lines = html.split(/\r\n|\n|\r/);
  const body = lines.map((line) => (line ? `{\\*\\htmltag0 ${escapeRtf(line)}}` : "")).join("\r\n{\\*\\htmltag0 \\par }\r\n");
  return `{\\rtf1\\ansi\\ansicpg1252\\fromhtml1 \\deff0{\\fonttbl{\\f0\\fswiss Arial;}}\r\n{\\colortbl\\red0\\green0\\blue0;}\r\n\\uc1\\pard\\plain\\deftab360 \\f0\\fs24 \r\n${body}}`;
}

/**
 * The PidTagRtfCompressed stream in its uncompressed form ("MELA"): a 16-byte header, then the RTF.
 * Readers must accept it; skipping the LZ compression keeps the writer small.
 */
export function rtfStream(rtf: string): Uint8Array {
  const raw = new Uint8Array(rtf.length);
  for (let i = 0; i < rtf.length; i++) {
    const c = rtf.charCodeAt(i);
    if (c > 0x7f) throw new Error("RTF must be ASCII; escape other characters first.");
    raw[i] = c;
  }
  const out = new Uint8Array(16 + raw.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, raw.length + 12, true); // size of everything after this field
  view.setUint32(4, raw.length, true); // size of the RTF
  view.setUint32(8, 0x414c454d, true); // "MELA": not compressed
  view.setUint32(12, 0, true); // CRC is zero for uncompressed data
  out.set(raw, 16);
  return out;
}
