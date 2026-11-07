# Manual Outlook test checklist

Nothing in this checklist has been done yet. Record results in the table at the
bottom. Then update `verification.outlookManual` in `src/lib/export/exporters.ts`
for each exporter that passes, and note the app versions it passed on.

## Setup

1. Run `pnpm export:samples`. This writes `export-samples/` with one `.oft` per
   sample brand plus a `-long-copy` stress variant, the matching
   `*.UNVERIFIED.emltpl` files, and the HTML for reference.
2. Also export one email from the running app that uses an **uploaded** image
   (JPEG and PNG), a CTA with a real link, a footer `mailto:` link, and a bullet
   list.
3. Use two test mailboxes, A (sender) and B (recipient), in the same tenant as
   your real internal audience. Add an external mailbox if any audience is
   external.

Apps to cover:

| ID | App |
|---|---|
| W | Outlook for Windows (classic, Microsoft 365 build) |
| N | New Outlook for Windows |
| O | Outlook on the web |
| M | Outlook for Mac (note new vs legacy) |
| P | Outlook for iOS/Android (recipient side only) |

## 1. Opening

- [ ] **W** Double-click the `.oft`. A compose window opens with the subject
  filled in, the body rendered, and no visible image attachments.
- [ ] **W** Open it with *New Items → More Items → Choose Form → User Templates
  in File System*.
- [ ] **N / O** Import the `.oft` into Templates (My templates) and insert it
  into a new message. Note whether images survive.
- [ ] **M** Double-click the `.emltpl` (once enabled). A compose window opens,
  not a read-only message.
- [ ] No security or "file is corrupt" prompts. Note any "this file may be
  unsafe" warnings.

## 2. Editing in the compose window

- [ ] Edit the headline and body text. Formatting stays (font, size, colour,
  line height).
- [ ] Type a long new paragraph. Wrapping and spacing look consistent with
  existing paragraphs.
- [ ] **Pasted text:** paste plain text from Notepad/TextEdit, then rich text
  from Word and from a web page. Note whether pasted text takes on the
  surrounding styles or brings its own, and whether spacing breaks.
- [ ] **Image replacement:** delete the hero image and insert a different one.
  The new image sits in the same cell and the layout holds at 600px.
- [ ] Change the CTA link (right-click → Edit Link). The button keeps its colour
  and padding.
- [ ] Delete a whole module (for example the CTA). The remaining layout is
  intact.
- [ ] **Added signature:** insert the user's default signature (and a
  company-wide disclaimer if the tenant adds one). Note where it lands (inside
  or below the 600px table) and whether it inherits styles.
- [ ] Undo and redo inside Outlook work normally.

## 3. Sending

- [ ] Send from A to B. No "this message contains an attachment" prompt for
  inline images (note if one appears).
- [ ] Sent Items copy looks the same as compose.
- [ ] Message size is reasonable (note the KB).

## 4. Receiving (check every app: W, N, O, M, P)

- [ ] Images display without "download pictures" prompts (they are embedded).
  Note any app that lists them as attachments.
- [ ] Background colours: the page background, the footer block, and the
  button fill.
- [ ] Padding: compare to the design comp at 100% zoom. Classic Windows Outlook
  is the most likely to differ.
- [ ] Paragraph spacing, and that headline-to-body spacing is not doubled.
- [ ] Bullet list indentation and spacing (Word engine risk).
- [ ] Button: square corners are expected in Windows Outlook. The label is
  centred and the whole cell is coloured.
- [ ] Links open the correct URL. `mailto:` opens a new message.
- [ ] **Long copy** variant: no clipping, no overflowing table, and line height
  holds.
- [ ] **Mobile reading (P, and O on a phone browser):** the 600px layout scales
  down or scrolls. Text is readable after any scaling, and nothing is cut off.
  The layout is not responsive by design; record how it looks.
- [ ] Dark mode on W, M and P: note any colour inversion that makes text
  unreadable. Body-only styling and no media queries means the client decides
  this.
- [ ] Reply and forward: the original stays readable in the quoted section and
  images survive a forward.

## 5. Regression notes to capture

For each failure, record the app and version, a screenshot, and whether it is a
template-format problem (file will not open, images missing) or an HTML
rendering problem (spacing, colours).

## Results

| Date | Tester | App + version | File | Open | Edit | Send | Receive | Notes |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |
