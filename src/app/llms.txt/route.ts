import { SITE_URL } from "@/lib/site";
import { TEMPLATE_PAGES } from "@/lib/marketing/template-pages";
import { CANIEMAIL_LAST_UPDATE, OUTLOOK_WINDOWS_NOS } from "@/lib/marketing/outlook-nos.generated";

// A plain-text summary for AI assistants and other automated readers (https://llmstxt.org).
const body = `# OUTLOOKSUCKS.email

> A free web app for building good-looking internal company emails and downloading them as Outlook templates (.oft files). No account is needed, and nothing has to be installed.

OUTLOOKSUCKS.email is for people who send announcements, newsletters, event invitations and notices to colleagues from Microsoft Outlook. You build the email in the browser by dragging blocks (header, picture, text, button, columns, divider, social links, footer) and typing straight onto it. The app writes the table-based HTML that classic Outlook for Windows needs and gives you an .oft file. Opening that file in Outlook starts a new email, ready to address and send.

Key facts:
- Price: free. No account or sign-up is required.
- Output: an Outlook template (.oft) for Outlook for Windows, with pictures embedded in the file.
- Without an account, drafts and pictures are stored only in the visitor's own browser.
- It is an independent project, not affiliated with or endorsed by Microsoft. It is maintained by Sean Munley (https://seanmun.com), who also makes kinetic.email.

## Pages

- [Home](${SITE_URL}/): what the app does, with example emails
- [Start an email](${SITE_URL}/new): open an example or a blank email in the editor
- [Guides](${SITE_URL}/guides): every guide on the site
- [How to create an Outlook email template](${SITE_URL}/guides/outlook-email-template): exact steps for classic Outlook for Windows, the new Outlook, Outlook on the web and Outlook for Mac, and how to share a template
- [Rounded buttons in Outlook](${SITE_URL}/guides/outlook-rounded-buttons): why border-radius fails in classic Outlook for Windows and the three alternatives, with code
- [.oft vs .msg vs .emltpl](${SITE_URL}/guides/oft-vs-msg-vs-emltpl): what each Outlook email file type is and which app opens it
- [Outlook email templates](${SITE_URL}/templates): free templates for internal emails
${TEMPLATE_PAGES.map((t) => `- [${t.heading}](${SITE_URL}/templates/${t.slug}): ${t.description}`).join("\n")}
- [Outlook rendering facts](${SITE_URL}/guides/outlook-rendering): what .oft and .emltpl template files are and how to open them, which engine each version of Outlook uses, and ${OUTLOOK_WINDOWS_NOS.length} HTML and CSS features classic Outlook for Windows does not support (data from Can I email, updated ${CANIEMAIL_LAST_UPDATE})

## Optional

- [Privacy](${SITE_URL}/privacy)
- [Terms](${SITE_URL}/terms)
`;

export function GET() {
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
