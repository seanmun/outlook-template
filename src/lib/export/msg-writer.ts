/**
 * Writes an Outlook message file (MS-OXMSG) on top of the CFB writer.
 *
 * OFT (Outlook template) and MSG share this structure; they differ by the
 * root storage CLSID. We write an unsent IPM.Note with an HTML body and
 * inline (hidden, Content-ID referenced) image attachments, no recipients.
 */
import { writeCfb, type CfbNode, type CfbStorage } from "./cfb-writer";
import { htmlToEncapsulatedRtf, rtfStream } from "./rtf-body";

export const CLSID_OFT_TEMPLATE = "{0006F046-0000-0000-C000-000000000046}";
export const CLSID_MSG = "{00020D0B-0000-0000-C000-000000000046}";

const PT_INT32 = 0x0003;
const PT_BOOLEAN = 0x000b;
const PT_SYSTIME = 0x0040;
const PT_UNICODE = 0x001f;
const PT_BINARY = 0x0102;

const PROPATTR_READ_WRITE = 0x00000006;

const MSGFLAG_UNSENT = 0x00000008;
const STORE_UNICODE_OK = 0x00040000;
const STORE_HTML_OK = 0x00010000;
const ATTACH_BY_VALUE = 1;
const ATT_MHTML_REF = 0x00000004;
const MAPI_ATTACH = 7;
const NATIVE_BODY_HTML = 3;
const CODEPAGE_UTF8 = 65001;

type PropValue =
  | { type: typeof PT_INT32; value: number }
  | { type: typeof PT_BOOLEAN; value: boolean }
  | { type: typeof PT_SYSTIME; value: Date }
  | { type: typeof PT_UNICODE; value: string }
  | { type: typeof PT_BINARY; value: Uint8Array };

type Prop = { id: number } & PropValue;

export interface MsgInlineImage {
  contentId: string;
  filename: string;
  mimeType: string;
  data: Uint8Array;
}

export interface MsgInput {
  subject: string;
  html: string;
  plainText: string;
  images: MsgInlineImage[];
  /**
   * How the HTML body is stored. "html" (the default) writes the raw HTML property.
   * "rtf" is experimental: the HTML wrapped in RTF, the way Outlook stores a body it saved itself.
   */
  body?: "html" | "rtf";
  /** Defaults to the OFT template CLSID. */
  rootClsid?: string;
  now?: Date;
}

const hex4 = (n: number) => n.toString(16).toUpperCase().padStart(4, "0");
const hex8 = (n: number) => n.toString(16).toUpperCase().padStart(8, "0");

function utf16le(s: string): Uint8Array {
  const out = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out[i * 2] = c & 0xff;
    out[i * 2 + 1] = c >> 8;
  }
  return out;
}

/** FILETIME: 100ns intervals since 1601-01-01. */
function fileTime(d: Date): bigint {
  return (BigInt(d.getTime()) + BigInt(11644473600000)) * BigInt(10000);
}

/**
 * Build the __properties_version1.0 stream and the __substg1.0_* streams.
 * headerSize: 32 for the top-level message, 8 for recipient/attachment objects.
 */
function propertyNodes(props: Prop[], header: Uint8Array): CfbNode[] {
  const nodes: CfbNode[] = [];
  const sorted = [...props].sort((a, b) => a.id - b.id);
  const table = new Uint8Array(header.length + sorted.length * 16);
  table.set(header, 0);
  const view = new DataView(table.buffer);
  sorted.forEach((p, i) => {
    const off = header.length + i * 16;
    const tag = ((p.id << 16) | p.type) >>> 0;
    view.setUint32(off, tag, true);
    view.setUint32(off + 4, PROPATTR_READ_WRITE, true);
    const streamName = `__substg1.0_${hex4(p.id)}${hex4(p.type)}`;
    switch (p.type) {
      case PT_INT32:
        view.setInt32(off + 8, p.value | 0, true);
        break;
      case PT_BOOLEAN:
        view.setUint32(off + 8, p.value ? 1 : 0, true);
        break;
      case PT_SYSTIME:
        view.setBigUint64(off + 8, fileTime(p.value), true);
        break;
      case PT_UNICODE: {
        // MS-OXMSG 2.4.2.2: stream holds the string without terminator; size = stream length + 2.
        const data = utf16le(p.value);
        view.setUint32(off + 8, data.length + 2, true);
        nodes.push({ type: "stream", name: streamName, data });
        break;
      }
      case PT_BINARY:
        view.setUint32(off + 8, p.value.length, true);
        nodes.push({ type: "stream", name: streamName, data: p.value });
        break;
    }
  });
  nodes.unshift({ type: "stream", name: "__properties_version1.0", data: table });
  return nodes;
}

function extensionOf(filename: string): string {
  const m = /\.[A-Za-z0-9]{1,8}$/.exec(filename);
  return m ? m[0].toLowerCase() : "";
}

export function writeMsg(input: MsgInput): Uint8Array {
  const now = input.now ?? new Date();
  const encoder = new TextEncoder();

  const messageProps: Prop[] = [
    { id: 0x001a, type: PT_UNICODE, value: "IPM.Note" }, // PidTagMessageClass
    { id: 0x0037, type: PT_UNICODE, value: input.subject }, // PidTagSubject
    { id: 0x0e1d, type: PT_UNICODE, value: input.subject }, // PidTagNormalizedSubject
    { id: 0x1000, type: PT_UNICODE, value: input.plainText }, // PidTagBody
    ...(input.body === "rtf"
      ? ([
          { id: 0x1009, type: PT_BINARY, value: rtfStream(htmlToEncapsulatedRtf(input.html)) }, // PidTagRtfCompressed
          { id: 0x0e1f, type: PT_BOOLEAN, value: true }, // PidTagRtfInSync
        ] satisfies Prop[])
      : ([{ id: 0x1013, type: PT_BINARY, value: encoder.encode(input.html) }] satisfies Prop[])), // PidTagHtml
    { id: 0x1016, type: PT_INT32, value: NATIVE_BODY_HTML }, // PidTagNativeBody
    { id: 0x3fde, type: PT_INT32, value: CODEPAGE_UTF8 }, // PidTagInternetCodepage
    { id: 0x0e07, type: PT_INT32, value: MSGFLAG_UNSENT }, // PidTagMessageFlags
    { id: 0x340d, type: PT_INT32, value: STORE_UNICODE_OK | STORE_HTML_OK }, // PidTagStoreSupportMask
    { id: 0x0e1b, type: PT_BOOLEAN, value: input.images.length > 0 }, // PidTagHasAttachments
    { id: 0x0017, type: PT_INT32, value: 1 }, // PidTagImportance (normal)
    { id: 0x3007, type: PT_SYSTIME, value: now }, // PidTagCreationTime
    { id: 0x3008, type: PT_SYSTIME, value: now }, // PidTagLastModificationTime
  ];

  // Top-level header: reserved(8), next recipient id, next attachment id, recipient count, attachment count, reserved(8)
  const header = new Uint8Array(32);
  const hv = new DataView(header.buffer);
  hv.setUint32(8, 0, true);
  hv.setUint32(12, input.images.length, true);
  hv.setUint32(16, 0, true);
  hv.setUint32(20, input.images.length, true);

  const children: CfbNode[] = [
    {
      type: "storage",
      name: "__nameid_version1.0",
      children: [
        { type: "stream", name: "__substg1.0_00020102", data: new Uint8Array(0) },
        { type: "stream", name: "__substg1.0_00030102", data: new Uint8Array(0) },
        { type: "stream", name: "__substg1.0_00040102", data: new Uint8Array(0) },
      ],
    },
    ...propertyNodes(messageProps, header),
  ];

  input.images.forEach((img, index) => {
    const ext = extensionOf(img.filename);
    const attachProps: Prop[] = [
      { id: 0x3705, type: PT_INT32, value: ATTACH_BY_VALUE }, // PidTagAttachMethod
      { id: 0x3701, type: PT_BINARY, value: img.data }, // PidTagAttachDataBinary
      { id: 0x3704, type: PT_UNICODE, value: img.filename }, // PidTagAttachFilename
      { id: 0x3707, type: PT_UNICODE, value: img.filename }, // PidTagAttachLongFilename
      { id: 0x3001, type: PT_UNICODE, value: img.filename }, // PidTagDisplayName
      { id: 0x3703, type: PT_UNICODE, value: ext }, // PidTagAttachExtension
      { id: 0x370e, type: PT_UNICODE, value: img.mimeType }, // PidTagAttachMimeTag
      { id: 0x3712, type: PT_UNICODE, value: img.contentId }, // PidTagAttachContentId
      { id: 0x3714, type: PT_INT32, value: ATT_MHTML_REF }, // PidTagAttachFlags
      { id: 0x7ffe, type: PT_BOOLEAN, value: true }, // PidTagAttachmentHidden
      { id: 0x370b, type: PT_INT32, value: -1 }, // PidTagRenderingPosition
      { id: 0x0e21, type: PT_INT32, value: index }, // PidTagAttachNumber
      { id: 0x0e20, type: PT_INT32, value: img.data.length }, // PidTagAttachSize
      { id: 0x0ffe, type: PT_INT32, value: MAPI_ATTACH }, // PidTagObjectType
    ];
    const attachStorage: CfbStorage = {
      type: "storage",
      name: `__attach_version1.0_#${hex8(index)}`,
      children: propertyNodes(attachProps, new Uint8Array(8)),
    };
    children.push(attachStorage);
  });

  return writeCfb({
    type: "storage",
    name: "Root Entry",
    clsid: input.rootClsid ?? CLSID_OFT_TEMPLATE,
    children,
  });
}
