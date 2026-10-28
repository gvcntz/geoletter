#!/usr/bin/env python3
"""Edits the frames recorded by scripts/record-demo.mjs into the demo video.

Usage: python3 scripts/build-video.py desktop|vertical <recDir> <out.mp4>

Cuts are defined relative to the marks the recorder writes, so a new take keeps the
same edit. Long waits for Gemma are sped up and say so in the caption. Captions are
burned in with libass, in EB Garamond from public/fonts.
Prints the final timeline (used for docs/narracao.md).
"""
import json, os, subprocess, sys

mode, rec, out = sys.argv[1], sys.argv[2], sys.argv[3]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(ROOT, 'public', 'fonts')

# (from, to, speed or ('fit', seconds), caption, caption position)
# from/to are (mark, offset in seconds). Caption None = no caption.
TOP, BOTTOM, LEFT = 8, 2, 1  # LEFT: in the empty margin beside the letter sheet
EDL = [
    (('world', 0.4), ('world', 7.4), 1, None, BOTTOM),
    (('fly', 0.0), ('place', 0.0), ('fit', 4.0), 'Touch the map where it happened', BOTTOM),
    (('place', 0.0), ('read-click', 1.3), ('fit', 5.0), 'Oaxaca: a letter for Abuela Chayo (an example)', BOTTOM),
    (('letter', 0.3), ('letter', 6.3), 1, 'Every letter is\\Na sheet of paper', LEFT),
    (('flower', 0.0), ('flower-done', -1.0), ('fit', 5.0), 'Or leave a marigold', BOTTOM),
    (('flower-done', 0.2), ('compose', 0.0), ('fit', 4.5), 'Find any place', BOTTOM),
    (('compose', 0.0), ('letter-submit', 0.4), ('fit', 6.5), 'Write to someone. This one is a made-up example', BOTTOM),
    (('queued', -1.0), ('queued', 3.0), 1, 'Gemma reads it first, on our own server', BOTTOM),
    (('queued', 3.0), ('approved', -0.3), ('fit', 3.0), 'Gemma reads it first, on our own server (sped up)', BOTTOM),
    (('approved', -0.3), ('approved', 3.0), 1, 'It stays', BOTTOM),
    (('newletter', 0.2), ('translate-click', 0.6), 1, 'Letters keep\\Ntheir language', LEFT),
    (('translate-click', 0.6), ('translated', -0.2), ('fit', 3.0), 'Gemma translates it\\Non our server\\N(sped up)', LEFT),
    (('translated', -0.2), ('translated', 4.5), 1, 'Gemma translates it\\Non our server', LEFT),
    (('lagos', 0.5), ('lagos', 3.3), 1, 'Bar Beach, Lagos: a sealed letter', BOTTOM),
    (('sealed', 0.2), ('distance', 0.0), 1, 'It only opens\\Nwithin 200 m\\Nof the place', LEFT),
    (('distance', 0.0), ('opened', -0.6), 1, 'From São Paulo,\\Nit stays sealed', LEFT),
    (('opened', -0.6), ('opened', 3.4), 1, 'Demo mode: as if\\NI were standing there', LEFT),
    (('help', 0.0), ('draft-click', 0.5), ('fit', 3.5), 'Help me find the words', BOTTOM),
    (('draft-click', 0.5), ('drafted', -0.2), ('fit', 1.5), 'Gemma drafts from your notes only (sped up)', BOTTOM),
    (('drafted', -0.2), ('drafted', 3.0), 1, 'Gemma drafts from your notes only', BOTTOM),
    (('end', -3.0), ('end', 2.5), 1, 'GeoLetter  ·  Gemma 4 on Ollama  ·  open source  ·  geoletter.tech', BOTTOM),
]
EXTRA = [s for s in os.environ.get('GL_EXTRA_CAPTION', '').split('|') if s]  # e.g. narration credit

frames = json.load(open(os.path.join(rec, 'frames.json')))
meta = json.load(open(os.path.join(rec, 'marks.json')))
T0 = frames[0]['t']
marks = {}
for m in meta['marks']:
    marks.setdefault(m['name'], m['t'] - T0)
W, H = meta['out']['width'], meta['out']['height']
raw = os.path.join(rec, 'raw.mp4')
if not os.path.exists(raw):
    # The screencast only sends a frame when something changes: hold each frame until the next.
    stop = marks['stop']
    with open(os.path.join(rec, 'list.txt'), 'w') as f:
        f.write('ffconcat version 1.0\n')
        for i, fr in enumerate(frames):
            nxt = frames[i + 1]['t'] - T0 if i + 1 < len(frames) else stop
            f.write(f"file 'frames/{fr['file']}'\nduration {max(nxt - (fr['t'] - T0), 0.001):.4f}\n")
        f.write(f"file 'frames/{frames[-1]['file']}'\n")
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', os.path.join(rec, 'list.txt'),
                    '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '14', '-preset', 'fast', raw], check=True)

def at(ref):
    return marks[ref[0]] + ref[1]

segs, t = [], 0.0
for a, b, speed, cap, pos in EDL:
    s, e = at(a), at(b)
    if e <= s:
        sys.exit(f'empty segment {a} {b}')
    sp = (e - s) / speed[1] if isinstance(speed, tuple) else speed
    d = (e - s) / sp
    segs.append(dict(s=s, e=e, speed=sp, start=t, end=t + d, cap=cap, pos=pos))
    t += d
total = t

def ts(x):
    h, r = divmod(x, 3600); m, r = divmod(r, 60)
    return f'{int(h)}:{int(m):02d}:{r:05.2f}'

vertical = mode == 'vertical'
size = 62 if vertical else 40
margin_v = 150 if vertical else 54
ass = [
    '[Script Info]', 'ScriptType: v4.00+', f'PlayResX: {W}', f'PlayResY: {H}', 'WrapStyle: 0', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    # Cream ink on a translucent dark sepia box. Colours are &HAABBGGRR.
    f'Style: Cap,EB Garamond,{size},&H00E3EFF5,&H00E3EFF5,&H141C242E,&H00000000,0,1,0,0,100,100,0.5,0,3,{round(size*0.32)},0,2,80,80,{margin_v},1',
    f'Style: Small,EB Garamond,{round(size*0.72)},&H00E3EFF5,&H00E3EFF5,&H141C242E,&H00000000,0,1,0,0,100,100,0.5,0,3,{round(size*0.26)},0,8,80,80,{margin_v},1',
    '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
]
# Merge consecutive segments with the same caption text (ignoring the "(sped up)" note).
cues = []
for sg in segs:
    if not sg['cap']:
        continue
    if cues and cues[-1]['text'] == sg['cap'] and abs(cues[-1]['end'] - sg['start']) < 0.01:
        cues[-1]['end'] = sg['end']
    else:
        cues.append(dict(text=sg['cap'], start=sg['start'], end=sg['end'], pos=sg['pos']))
for c in cues:
    pos = c['pos']
    if vertical:
        pos = TOP  # on a phone the sheet fills the bottom half; the top is map or header
    an = {BOTTOM: '', TOP: '{\\an8}', LEFT: '{\\an1}'}[pos]
    margins = f'{round(W * 0.036)},0,{round(H * 0.11)}' if pos == LEFT else '0,0,0'
    text = c['text'] if pos == LEFT else c['text'].replace('\\N', ' ')
    if vertical:
        text = text.replace('Ollama  ·  open', 'Ollama\\Nopen')  # the closing line, in two lines on a phone
    st, en = c['start'] + 0.25, c['end'] - 0.15
    ass.append(f"Dialogue: 0,{ts(st)},{ts(en)},Cap,,{margins},,{an}{{\\fad(250,200)}}{text}")
for i, txt in enumerate(EXTRA):
    # Sits just above (desktop) or below (vertical) the closing caption.
    an = '\\an8' if vertical else '\\an2'
    ass.append(f"Dialogue: 0,{ts(total - 4.5)},{ts(total - 0.3)},Small,,0,0,{margin_v + round(size * (3.1 if vertical else 1.75))},,{{{an}\\fad(300,300)}}{txt}")
ass_path = os.path.join(rec, f'captions-{mode}.ass')
open(ass_path, 'w').write('\n'.join(ass) + '\n')

# One intermediate file per segment keeps memory low; then concat, captions and fades.
segdir = os.path.join(rec, f'seg-{mode}')
os.makedirs(segdir, exist_ok=True)
lst = []
for i, sg in enumerate(segs):
    f = os.path.join(segdir, f's{i:02d}.mp4')
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-ss', f"{sg['s']:.3f}", '-to', f"{sg['e']:.3f}", '-i', raw,
                    '-vf', f"setpts=(PTS-STARTPTS)/{sg['speed']:.4f},fps=30", '-frames:v', str(round((sg['e'] - sg['s']) / sg['speed'] * 30)),
                    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '10', '-an', f], check=True)
    lst.append(f"file '{f}'")
open(os.path.join(segdir, 'list.txt'), 'w').write('\n'.join(lst) + '\n')
vf = f"subtitles=filename={ass_path}:fontsdir={FONTS},fade=t=in:st=0:d=0.6,fade=t=out:st={total-0.9:.2f}:d=0.9,format=yuv420p"
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', os.path.join(segdir, 'list.txt'),
                '-vf', vf, '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-tune', 'stillimage', '-r', '30',
                '-movflags', '+faststart', '-an', out], check=True)

print(f'{out}: {total:.1f} s')
for sg, (a, b, *_rest) in zip(segs, EDL):
    print(f"{ts(sg['start'])[2:]}-{ts(sg['end'])[2:]}  x{sg['speed']:.1f}  {a[0]}  {sg['cap'] or ''}")
json.dump(dict(total=total, segments=[{k: v for k, v in s.items()} | {'from': e[0][0]} for s, e in zip(segs, EDL)]),
          open(os.path.join(rec, f'timeline-{mode}.json'), 'w'), indent=1)
