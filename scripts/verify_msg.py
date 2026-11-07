"""
Independent structural check of an .oft/.msg file using olefile and extract_msg.

    python3 -m venv .venv && .venv/bin/pip install olefile extract_msg
    .venv/bin/python scripts/verify_msg.py export-samples/harbor-pine.oft

Checks: valid compound file (strict defect mode), root CLSID, red-black
directory tree invariants, and that subject/HTML/body/attachments parse.
This does NOT prove Outlook will open the file; see docs/OUTLOOK-TEST-CHECKLIST.md.
"""
import sys, olefile, extract_msg
p = sys.argv[1]
print("isOle:", olefile.isOleFile(p))
o = olefile.OleFileIO(p, raise_defects=olefile.DEFECT_INCORRECT)
print("root clsid:", o.root.clsid)
for e in o.listdir(streams=True, storages=True): print("  ", "/".join(e))
# red-black/colour sanity: walk directory
def bh(sid):
    if sid == olefile.NOSTREAM: return 1
    d = o.direntries[sid]
    l, r = bh(d.sid_left), bh(d.sid_right)
    assert l == r, f"black-height mismatch at {d.name}"
    if d.color == 0:
        for c in (d.sid_left, d.sid_right):
            assert c == olefile.NOSTREAM or o.direntries[c].color == 1, "red-red"
    return l + (1 if d.color == 1 else 0)
for d in o.direntries:
    if d and d.entry_type in (1,5) and d.sid_child != olefile.NOSTREAM: bh(d.sid_child)
print("rb-tree ok")
m = extract_msg.openMsg(p)
print("subject:", m.subject)
print("html:", m.htmlBody[:80])
print("body:", m.body)
for a in m.attachments: print("attach:", a.longFilename, a.cid, len(a.data), a.hidden if hasattr(a,'hidden') else '')
