/**
 * Builds the kit a helper with Outlook for Windows uses to check our .oft output.
 *
 *   pnpm test:kit      ->  ./outlook-test-kit/  and  ./outlook-test-kit.zip
 *
 * Two templates carrying the same email, differing only in how the body is stored:
 *   Test A.oft  raw HTML property (what the app exports today)
 *   Test B.oft  HTML wrapped in RTF (how Outlook itself, and other tools, store it)
 * The email is the "Outage update" starter template plus a row of three buttons, one per rounding method
 * (CSS, VML, picture), so one pass answers both open questions. The helper's steps are in
 * READ ME FIRST.txt; what the answers mean for us is at the bottom of this file.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { EXAMPLES } from "../src/lib/email/examples";
import { sampleBytes } from "../src/lib/email/samples";
import { writeMsg } from "../src/lib/export/msg-writer";
import { prepareExportInput, type ImageLoader } from "../src/lib/export/pipeline";

const out = path.resolve("outlook-test-kit");
const BUTTON_CID = "button3@outlook-test-kit";
const BLUE = "#1D4ED8";
const FONT = "Arial, Helvetica, sans-serif";

const label = (n: number, method: string) =>
  `<tr><td style="padding:18px 0 6px 0;font-family:${FONT};font-size:14px;line-height:20px;color:#171717;mso-line-height-rule:exactly;">Button ${n} <span style="color:#737373;">(${method})</span></td></tr>`;

/** One row appended to the email: the same button made three ways. */
const BUTTON_TEST = `<tr><td style="padding:28px 40px 36px 40px;border-top:4px solid #E7000B;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
<tr><td style="font-family:${FONT};font-size:20px;line-height:26px;font-weight:bold;color:#171717;mso-line-height-rule:exactly;">Button test</td></tr>
${label(1, "style only")}
<tr><td><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr><td align="center" bgcolor="${BLUE}" style="padding:12px 28px;background-color:${BLUE};border-radius:8px;"><a href="https://example.com/1" target="_blank" style="font-family:${FONT};font-size:16px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;display:inline-block;mso-line-height-rule:exactly;">Button 1</a></td></tr></table></td></tr>
${label(2, "drawn shape")}
<tr><td><!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="https://example.com/2" style="height:44px;v-text-anchor:middle;width:200px;" arcsize="18%" stroke="f" fillcolor="${BLUE}"><w:anchorlock/><center style="color:#ffffff;font-family:${FONT};font-size:16px;font-weight:bold;">Button 2</center></v:roundrect><![endif]--><!--[if !mso]><!-- --><a href="https://example.com/2" target="_blank" style="background-color:${BLUE};border-radius:8px;color:#ffffff;display:inline-block;font-family:${FONT};font-size:16px;font-weight:bold;line-height:44px;text-align:center;text-decoration:none;width:200px;">Button 2</a><!--<![endif]--></td></tr>
${label(3, "picture")}
<tr><td><a href="https://example.com/3" target="_blank"><img src="cid:${BUTTON_CID}" width="200" height="44" alt="Button 3" border="0" style="display:block;border:0;width:200px;height:44px;"></a></td></tr>
</table>
</td></tr>`;

const README = `OUTLOOK TEST - about 10 minutes
==============================

Thank you for helping. You need a Windows computer with Outlook.
Nothing here can harm your computer or your mailbox. The two test
emails are only ever sent to yourself.

You will send back: 5 screenshots and a few short answers.
To take a screenshot: hold the Windows key and Shift, press S,
drag a box around the area, then paste it into your reply (Ctrl+V).


BEFORE YOU START
----------------
1. Save this whole folder somewhere easy, like your Desktop.
   If it arrived as a .zip file, right-click it and choose
   "Extract All" first.

2. Open Outlook. Look at the very top left of the window.
   Do you see the word "File"?
     - Yes: good, carry on.
     - No:  you have the "new" Outlook. Please still try the
            steps, and tell us you have the new one.

3. Click File, then "Office Account", then "About Outlook".
   Screenshot the top of the box that opens (the lines with the
   version number).                               -> Screenshot 1
   Close the box and go back to your inbox.


TEST A
------
4. In the folder, double-click the file called "Test A".
   A new email should open, ready to send, with pictures and
   text already in it.

   If you get an error message instead, or nothing happens:
   screenshot what you see, skip to TEST B, and tell us.

5. Make the email window big. Screenshot the top half of the
   email, down to the three round red icons.      -> Screenshot 2

6. Scroll to the bottom, to the part headed "Button test".
   There are three blue buttons. Screenshot them. -> Screenshot 3

7. In the "To" box, type your own email address. Click Send.

8. Wait for it to arrive in your inbox, and open it.
   Scroll to "Button test" and screenshot the three buttons
   again.                                         -> Screenshot 4


TEST B
------
9. Do steps 4 to 8 again with the file called "Test B".
   This time you only need ONE screenshot: the three buttons
   in the email you receive (step 8).             -> Screenshot 5


SEND US
-------
Reply with the 5 screenshots and these answers:

 a) Did Test A open as a new email?            Yes / No
 b) Did Test B open as a new email?            Yes / No
 c) Was there any warning or error at any point? What did it say?
 d) Did the pictures show in both (the big one at the top and
    the three round red icons)?                Yes / No
 e) Looking at the email you RECEIVED from Test A, which buttons
    have rounded corners?      Button 1 / Button 2 / Button 3
 f) Did Test A and Test B look the same as each other?
    If not, what was different?
 g) Anything that looked broken, squashed or out of place?

That's everything. Thank you!
`;

async function main() {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  const loader: ImageLoader = async (src) => (src.kind === "sample" ? { data: sampleBytes(src.sampleId)! } : null);
  // The "Outage update" starter template: a banner, three columns with icons, text and a button.
  const input = await prepareExportInput(EXAMPLES.find((e) => e.id === "outage-update")!.build(), loader);

  // Append the button row to the end of the 600px content table (the last table but one).
  const tail = "</table>\n</td></tr>\n</table>\n</body>";
  if (input.htmlCid.split(tail).length !== 2) throw new Error("The email's closing markup changed; update where the button test is inserted.");
  const html = input.htmlCid.replace(tail, `${BUTTON_TEST}\n${tail}`);
  const images = [
    ...input.images.map((i) => ({ contentId: i.contentId, filename: i.filename, mimeType: i.mimeType, data: i.data })),
    { contentId: BUTTON_CID, filename: "button-3.png", mimeType: "image/png", data: new Uint8Array(readFileSync(path.resolve("scripts/assets/outlook-test-button.png"))) },
  ];

  const files: Record<string, Uint8Array | string> = {
    "Test A.oft": writeMsg({ subject: "Outlook test A", html, plainText: input.plainText, images, body: "html" }),
    "Test B.oft": writeMsg({ subject: "Outlook test B", html, plainText: input.plainText, images, body: "rtf" }),
    "READ ME FIRST.txt": README.replace(/\n/g, "\r\n"),
  };
  const zip = new JSZip();
  for (const [name, data] of Object.entries(files)) {
    writeFileSync(path.join(out, name), data);
    zip.file(`Outlook test/${name}`, data);
  }
  writeFileSync(`${out}.zip`, await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
  // For looking at the email in a browser; not part of what the helper gets.
  writeFileSync(path.join(out, "_preview.html"), html.replace(`cid:${BUTTON_CID}`, path.resolve("scripts/assets/outlook-test-button.png")));
  console.log(`wrote ${Object.keys(files).join(", ")} to ${out} and ${out}.zip`);
}
main();

/*
 * Reading the answers:
 *  a/b  Whichever file opens as a compose window proves that body storage works. If only B opens,
 *       switch the exporter to body: "rtf". If both do, keep "html" unless f) shows B is more faithful.
 *  d    The top picture showing proves embedded (Content-ID) images work.
 *  e    Tells us which rounding method survives opening the template AND sending it:
 *       1 = CSS border-radius, 2 = VML roundrect, 3 = an image. Square buttons stay the default
 *       until one of 1 or 2 is confirmed here.
 *  Then record the result in docs/OUTLOOK-TEST-CHECKLIST.md and exporters.ts (outlookManual).
 */
