# Export: research, implementation and status

## Status at a glance

| Format | Target | File generation | Structural checks | Opened/edited/sent in Outlook | Default |
|---|---|---|---|---|---|
| `.oft` | Outlook for Windows (classic); new Outlook / Outlook on the web via template import | Implemented | Passed | **Not verified** | Enabled |
| `.emltpl` | Outlook for Mac | Implemented (experimental) | Passed (MIME parses) | **Not verified**; format itself unconfirmed | **Disabled** |
| `.html` | Browser inspection only | Implemented | n/a | Not a template | Enabled, labelled "development fallback" |

The status shown in the export dialog and the ZIP's `README.txt` comes from
`src/lib/export/exporters.ts`. Change `outlookManual` to `"verified"` only after
someone completes [OUTLOOK-TEST-CHECKLIST.md](./OUTLOOK-TEST-CHECKLIST.md) in that app.

## Exporter interface

`src/lib/export/types.ts` defines `Exporter { info, availability(), export(input) }`.
The editor only knows about the interface and the status metadata, so an
implementation can be swapped (for example, for an Aspose-backed service)
without editor changes. Every exporter receives the same `ExportInput`, built by
`prepareExportInput()` from the shared renderer: HTML with `cid:` image
references, plain text, and the image bytes.

## OFT

**What it is.** An Outlook template is an MS-OXMSG message stored in a Compound
File Binary (MS-CFB) container. It differs from `.msg` by the root storage
CLSID: `{0006F046-0000-0000-C000-000000000046}` (template) vs
`{00020D0B-0000-0000-C000-000000000046}` (message). Renaming an `.msg` or `.html`
file is not equivalent, and this app does not do it.

**Options considered.**

- **Aspose.Email for .NET**, through a small .NET service. It can save OFT. But:
  - It is commercial. Evaluation mode modifies output: it adds an evaluation
    watermark, puts an "Evaluation" marker in the subject when saving MSG/EML/CFB
    formats, and attaches a `License.txt` to saved messages
    ([licensing](https://docs.aspose.com/email/net/licensing/),
    [evaluate](https://docs.aspose.com/email/net/evaluate-aspose-email)). That makes
    evaluation output unusable for clients.
  - It needs a separate .NET deployment (not Vercel functions) and a paid licence.
- **In-house TypeScript writer (chosen).** About 400 lines. It runs in the
  Vercel function, needs no licence and no extra service, and is fully under our
  control. The risk is that Outlook may reject something the spec allows; manual
  testing settles that.

**Implementation.**

- `src/lib/export/cfb-writer.ts`: MS-CFB v3 writer. It sorts siblings with the
  MS-CFB comparison (length, then upper-case), builds a valid red-black tree for
  each storage, uses the mini stream for streams under 4 KB, and sets the root
  CLSID. Generic libraries such as SheetJS `cfb` chain siblings as an all-black
  linked list and sort case-sensitively, so we did not rely on them for writing.
- `src/lib/export/msg-writer.ts`: an unsent (`MSGFLAG_UNSENT`) `IPM.Note` with:
  - `PidTagHtml` as UTF-8 (`PidTagInternetCodepage` = 65001), `PidTagBody` as
    plain text, `PidTagNativeBody` = HTML, `STORE_UNICODE_OK`;
  - empty named-property storage;
  - no recipients;
  - one hidden attachment per image (`ATTACH_BY_VALUE`, `PidTagAttachContentId`,
    `ATT_MHTML_REF`, `PidTagAttachmentHidden`).
- Size cap: about 6.8 MB, because there are no DIFAT sectors. Exceeding it
  returns HTTP 413 with a clear message.

**Structural checks performed** (automated, `src/lib/export/export.test.ts`, plus the spike):

- SheetJS `cfb` reads every stream back byte for byte, including the
  mini-stream, regular-sector and nested-storage paths.
- `@kenjiuno/msgreader` parses subject (Unicode), message class, body, HTML and
  attachments with Content-IDs and the hidden flag.
- Python `olefile` in strict defect mode, plus a red-black invariant walk, and
  `extract_msg` (run with `scripts/verify_msg.py`). These passed on every file
  in `export-samples/` and on files downloaded through the running app.

**Not yet done:** opening the file in any Outlook build.

## EMLTPL

**What we know.** Outlook for Mac saves templates with *File → Save as
Template* as `.emltpl`. Microsoft publishes no specification. Community evidence
(for example this
[Microsoft Q&A thread](https://learn.microsoft.com/en-us/answers/questions/6013657/emltpl-new-outlook-ver-16-113-2-mail-missing-attac))
shows hand-built `.emltpl` files as RFC 5322/MIME messages with an
`X-Unsent: 1` header. That thread also reports attachment problems with
hand-built files. The OFT library options say nothing about EMLTPL, and we do not
assume one covers the other.

**Implementation.** `src/lib/export/mime-writer.ts` writes `X-Unsent: 1`, an
RFC 2047 subject, and this structure:

- `multipart/alternative`
  - `text/plain`
  - `multipart/related`
    - `text/html`
    - inline images with `Content-ID`

All parts are base64 and lines use CRLF. Header injection is rejected.

**Blocker: please send a real sample.** We need one or two templates created
by Outlook for Mac:

1. In Outlook for Mac, compose a message with an inline image, a link, and some
   bold text.
2. Choose *File → Save as Template* and send us the `.emltpl` file. Note the
   Outlook version (*Outlook → About*), and whether it is "new Outlook" or legacy.

With that sample we will diff headers, part structure, encodings and any
Mac-specific headers, adjust the writer, and then run the manual checklist.

Until then the exporter is **disabled** and the UI shows the reason. For local
testing only, `EXPORT_EMLTPL_EXPERIMENTAL=true` enables it; `pnpm export:samples`
always writes `*.UNVERIFIED.emltpl` files.

## Image strategy

- **Working images are private.** Uploads go to the private Supabase bucket
  `email-assets` under `<clerk user id>/…`. Storage and table RLS restrict access
  to the owner. The preview loads them through `/api/assets/:id`, which checks
  the session.
- **Exported images are embedded,** never linked. The exporter fetches the bytes
  with the user's own credentials and embeds them as hidden inline attachments
  referenced by `cid:`. No signed URL, expiring URL, or app-authenticated URL
  appears in any exported file. Recipients load nothing from this app.
- **The `.html` development export** writes images as relative files next to the
  HTML.
- **Limitations:**
  - Embedding increases message size. Uploads are capped at 5 MB each and the
    OFT at about 6.8 MB.
  - Some clients show embedded images as attachments in certain flows (for
    example forwarding, or plain-text replies).
  - Whether Outlook keeps inline images when an `.oft` is imported into the
    new Outlook / web "My templates" feature is **unverified**. That feature may
    store templates differently. If it drops images, the fallback is a public
    "published assets" bucket with durable URLs. That would be a deliberate
    change, because remote images are also blocked by default in many Outlook
    configurations.
  - Only PNG, JPEG and GIF are accepted. File type is detected from bytes, not
    the declared type, and SVG and WebP are rejected because Outlook does not
    support them.

## Not doing

- Running desktop Outlook as a backend (automation or COM) to produce files.
- Claiming any Outlook compatibility before a person has tested it.
