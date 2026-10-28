#!/usr/bin/env python3
"""Narration for the demo video with ElevenLabs, line by line, from the table in docs/narracao.md.

Usage:
  ELEVENLABS_KEY_FILE=/path/to/key python3 scripts/narrate.py tts <workDir> [voice_id]
  python3 scripts/narrate.py mix <workDir> <video.mp4> <out.mp4>

`tts` writes one mp3 per line (skips lines already generated). `mix` places each line at its
start time, normalises to -16 LUFS and muxes it with the video. The key is read from the file
and only sent to the ElevenLabs API.
"""
import json, os, re, subprocess, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEORGE = 'JBFqnCBsd6RMkjVDRZzb'  # premade "George": warm, mature storyteller


def secs(s):
    m, r = s.split(':')
    return int(m) * 60 + float(r)


def lines():
    out = []
    for row in open(os.path.join(ROOT, 'docs', 'narracao.md'), encoding='utf8'):
        m = re.match(r'^\| (\d+) \| (\d:\d\d\.\d) \| (\d:\d\d\.\d) \| [^|]*\| (.+?) \|$', row.strip())
        if m:
            out.append(dict(n=int(m[1]), start=secs(m[2]), end=secs(m[3]), text=m[4].strip()))
    return out


def dur(path):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                       capture_output=True, text=True, check=True)
    return float(r.stdout)


def tts(work, voice):
    key = open(os.environ['ELEVENLABS_KEY_FILE']).read().strip()
    os.makedirs(work, exist_ok=True)
    ls, used = lines(), 0
    for i, l in enumerate(ls):
        f = os.path.join(work, f"line{l['n']:02d}.mp3")
        if os.path.exists(f):
            continue
        body = {
            'text': l['text'],
            'model_id': 'eleven_multilingual_v2',
            'voice_settings': {'stability': 0.8, 'similarity_boost': 0.75, 'style': 0.0, 'use_speaker_boost': True, 'speed': 0.95},
            # Neighbouring lines keep the intonation continuous across separate requests.
            'previous_text': ls[i - 1]['text'] if i else None,
            'next_text': ls[i + 1]['text'] if i + 1 < len(ls) else None,
        }
        req = urllib.request.Request(
            f'https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_128',
            data=json.dumps(body).encode(), headers={'xi-api-key': key, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg'})
        with urllib.request.urlopen(req, timeout=120) as r:
            open(f, 'wb').write(r.read())
        used += len(l['text'])
        print(f"line {l['n']:2d}: {dur(f):5.2f} s of {l['end'] - l['start']:5.2f} s")
    print('characters sent:', used)


def mix(work, video, out):
    ls = lines()
    total = dur(video)
    inputs, filters, labels = [], [], []
    prev_end = 0.0
    for i, l in enumerate(ls):
        f = os.path.join(work, f"line{l['n']:02d}.mp3")
        d = dur(f)
        window = l['end'] - l['start']
        start, tempo = l['start'], 1.0
        if d > window:
            # Start a little earlier if there is room, then speed up slightly (at most 7%).
            start = max(prev_end + 0.25, l['start'] - (d - window))
            room = l['end'] - start
            if d > room:
                tempo = min(1.07, d / room)
        prev_end = start + d / tempo
        print(f"line {l['n']:2d}: {start:6.2f} -> {prev_end:6.2f}  (window {l['start']:.1f}-{l['end']:.1f}, tempo {tempo:.2f})")
        inputs += ['-i', f]
        filters.append(f"[{i + 1}:a]aresample=48000,atempo={tempo:.3f},adelay={int(start * 1000)}:all=1[a{i}]")
        labels.append(f'[a{i}]')
    graph = ';'.join(filters) + f";{''.join(labels)}amix=inputs={len(ls)}:normalize=0,apad,atrim=0:{total:.3f}[mix]"
    # Two-pass loudnorm to about -16 LUFS integrated.
    tmp = os.path.join(work, 'mix.wav')
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', *inputs,
                    '-filter_complex', graph, '-map', '[mix]', '-ac', '1', tmp], check=True)
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', tmp, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'],
                       capture_output=True, text=True)
    m = json.loads(r.stderr[r.stderr.rindex('{'):])
    ln = (f"loudnorm=I=-16:TP=-1.5:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
          f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', video, '-i', tmp, '-filter_complex', f'[1:a]{ln},aresample=48000[a]',
                    '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-ac', '1',
                    '-shortest', '-movflags', '+faststart', out], check=True)
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', out, '-map', '0:a', '-af', 'ebur128', '-f', 'null', '-'],
                       capture_output=True, text=True)
    print(out, 'integrated loudness:', re.findall(r'I:\s+(-?[\d.]+) LUFS', r.stderr)[-1], 'LUFS')


if __name__ == '__main__':
    if sys.argv[1] == 'tts':
        tts(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else GEORGE)
    else:
        mix(sys.argv[2], sys.argv[3], sys.argv[4])
