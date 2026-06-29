# -*- coding: utf-8 -*-
"""
Fetch + bake the pomodoro ambient loops.

Downloads a small set of free (CC0 / CC-BY / public-domain) field recordings,
then uses ffmpeg to: convert to mp3, loudness-normalize, trim to a stable
window, and stitch a SEAMLESS loop (overlap-add crossfade so the end flows
back into the start with no click). Output -> future.v2/assets/ambient/<key>.mp3

Re-runnable for the open-source repo: anyone can `python fetch-ambient.py` to
rebuild the loops from source. Swap a clip by editing SOURCES (or just drop your
own same-named mp3 into assets/ambient/ — the app plays whatever's there).

Requires: ffmpeg + ffprobe on PATH (or set FFMPEG/FFPROBE env vars), Python 3.
"""
import os, sys, json, subprocess, urllib.request, urllib.parse, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))   # future.v2/
# Vite 迁移后静态资源统一放 public/assets（构建时原样拷进 dist/assets）
OUT  = os.path.join(ROOT, "public", "assets", "ambient")
TMP  = os.path.join(HERE, "_ambient_src")
FFMPEG  = os.environ.get("FFMPEG", "ffmpeg")
FFPROBE = os.environ.get("FFPROBE", "ffprobe")

# Each entry: key -> source. `start` skips intros/fade-ins; `length` is the
# window we loop (output ends up ~length-cross seconds). `cross` = crossfade secs.
# `post` = extra ffmpeg filters applied to the looped clip BEFORE loudness-norm,
#   to tame hiss/noise floor (afftdn), sub rumble (highpass) and harsh highs
#   (lowpass). `lufs` = loudnorm target loudness (more negative = quieter); busy
#   scenes (cafe/fire) sit a few LU quieter so they feel less jarring.
SOURCES = {
    # rain & ocean were the favourites — only a *light* touch: drop inaudible
    # sub-rumble + a gentle denoise so the noise floor sits lower, nothing else.
    "rain": {
        "url": "https://upload.wikimedia.org/wikipedia/commons/4/41/Rain_against_the_window.ogg",
        "title": "Rain against the window", "license": "Public domain",
        "by": "Wikimedia Commons", "start": 2, "length": 40, "cross": 5,
        "post": "highpass=f=35,afftdn=nr=6:nf=-45", "lufs": -22,
    },
    # forest: previous clip literally had "room tone buzzing" → swapped to a clean
    # birdsong recording, plus strong denoise to kill any mic hiss, and a soft
    # low-pass so leftover hiss highs don't sizzle.
    "forest": {
        "url": "https://archive.org/download/Designers-Choice-Collection-Ambiences/"
               "AMBIENCES/BIRDSONG/AMBBird-Samsung Galaxy Smartphone, MCU_Northern Cardinal Sings, Amongst Other Bird_The Designer's Choice_GNRL2.mp3",
        "title": "Northern Cardinal & birdsong (The Designer's Choice UCS Collection)",
        "license": "CC0 1.0", "by": "The Designer's Choice", "start": 3, "length": 40, "cross": 5,
        "post": "highpass=f=90,afftdn=nr=24:nf=-28,lowpass=f=8500", "lufs": -23,
    },
    # cafe: chatter is inherently busy → denoise + low-pass into a distant murmur,
    # and keep it a few LU quieter so it's a backdrop, not a crowd in your ear.
    "cafe": {
        "url": "https://archive.org/download/Designers-Choice-Collection-Ambiences/"
               "AMBIENCES/RESTAURANT & BAR/AMBRest-Samsung Galaxy Smartphone, CU_Restaurant Or Bar Walla_The Designer's Choice_GNRL1.mp3",
        "title": "Restaurant / Bar Walla (The Designer's Choice UCS Collection)",
        "license": "CC0 1.0", "by": "The Designer's Choice", "start": 4, "length": 40, "cross": 5,
        "post": "afftdn=nr=14:nf=-30,lowpass=f=3000", "lufs": -27,
    },
    "ocean": {
        "url": "https://upload.wikimedia.org/wikipedia/commons/b/b0/Lake_Okeechobee_Surf_in_April_2016.ogg",
        "title": "Lake Okeechobee Surf, April 2016", "license": "CC BY-SA 4.0",
        "by": "Wikimedia Commons contributor", "start": 8, "length": 44, "cross": 6,
        "post": "highpass=f=30,afftdn=nr=6:nf=-45", "lufs": -22,
    },
    # fire: sharp crackle pops read as "noisy" → low-pass softens them into a warm
    # hearth, denoise lowers the bed, and it sits a touch quieter.
    "fire": {
        "url": "https://upload.wikimedia.org/wikipedia/commons/7/70/WWS_Bonfireburning.ogg",
        "title": "Bonfire burning (WWS)", "license": "CC BY 4.0",
        "by": "Wikimedia Commons contributor", "start": 4, "length": 40, "cross": 5,
        "post": "afftdn=nr=12:nf=-32,lowpass=f=4200", "lufs": -26,
    },
}


def run(cmd):
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        sys.stderr.write(p.stderr[-2000:] + "\n")
        raise RuntimeError("command failed: " + " ".join(cmd[:3]) + " ...")
    return p


def download(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 1024:
        return dest
    # quote only the path part (spaces/commas/apostrophes in archive.org names)
    sp = urllib.parse.urlsplit(url)
    safe = urllib.parse.urlunsplit((sp.scheme, sp.netloc, urllib.parse.quote(sp.path), sp.query, sp.fragment))
    req = urllib.request.Request(safe, headers={"User-Agent": "future-v2-ambient/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
        shutil.copyfileobj(r, f)
    return dest


def duration(path):
    # Prefer ffprobe; fall back to parsing ffmpeg -i stderr (no ffprobe needed).
    if shutil.which(FFPROBE):
        p = run([FFPROBE, "-v", "error", "-show_entries", "format=duration",
                 "-of", "default=nw=1:nk=1", path])
        return float(p.stdout.strip())
    pr = subprocess.run([FFMPEG, "-i", path], capture_output=True, text=True)
    import re
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.?\d*)", pr.stderr)
    if not m:
        raise RuntimeError("could not read duration of " + path)
    h, mn, s = m.groups()
    return int(h) * 3600 + int(mn) * 60 + float(s)


def bake_loop(src, dst, start, length, cross, post="", lufs=-23):
    """Seamless loop via the rotate-crossfade trick: take a window [start, start+L],
    split into head=C[0:D] and body=C[D:L], then acrossfade(body, head, D). The
    output starts and ends at content C[D], so loop=true wraps with no click —
    the original end→start discontinuity is hidden inside the crossfade.
    `post` filters (denoise / hi-/low-pass) run before loudnorm to clean the bed."""
    dur = duration(src)
    start = max(0, min(start, max(0, dur - 6)))
    length = min(length, dur - start)
    if length < 2 * cross + 2:                 # clip too short → shrink crossfade
        cross = max(1.0, (length - 2) / 2)
    L, D = length, cross
    post_chain = (post + ",") if post else ""
    fc = (
        "[0:a]aformat=channel_layouts=stereo,aresample=44100,"
        f"atrim=start={start}:end={start+L},asetpts=PTS-STARTPTS,asplit[a][b];"
        f"[a]atrim=0:{D},asetpts=PTS-STARTPTS[head];"
        f"[b]atrim={D},asetpts=PTS-STARTPTS[body];"
        f"[body][head]acrossfade=d={D}:c1=tri:c2=tri,"
        f"{post_chain}"
        f"loudnorm=I={lufs}:TP=-2:LRA=11[out]"
    )
    run([FFMPEG, "-y", "-i", src, "-filter_complex", fc, "-map", "[out]",
         "-c:a", "libmp3lame", "-b:a", "128k", "-ar", "44100", dst])


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(TMP, exist_ok=True)
    credits = []
    for key, s in SOURCES.items():
        ext = os.path.splitext(urllib.parse.urlsplit(s["url"]).path)[1] or ".bin"
        raw = os.path.join(TMP, key + ext)
        print(f"[{key}] downloading…")
        download(s["url"], raw)
        print(f"[{key}] baking seamless loop → assets/ambient/{key}.mp3")
        bake_loop(raw, os.path.join(OUT, key + ".mp3"), s["start"], s["length"],
                  s["cross"], s.get("post", ""), s.get("lufs", -23))
        credits.append((key, s))
    # attribution file (CC-BY clips legally need credit; CC0/PD don't, listed for clarity)
    lines = ["# Ambient soundscapes — sources & licenses\n",
             "Loops in `assets/ambient/` are baked from these free recordings by",
             "`claudio/tools/fetch-ambient.py`. Swap any clip by dropping your own",
             "same-named mp3 into `assets/ambient/`.\n"]
    for key, s in credits:
        lines.append(f"- **{key}.mp3** — “{s['title']}” · {s['license']} · {s['by']}\n  {s['url']}")
    with open(os.path.join(OUT, "CREDITS.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print("done. wrote assets/ambient/*.mp3 + CREDITS.md")


if __name__ == "__main__":
    main()
