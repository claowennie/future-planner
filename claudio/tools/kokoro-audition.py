# -*- coding: utf-8 -*-
"""
Kokoro TTS 英式青年男声试听生成器。
跑：D:\Anaconda3\python.exe claudio/tools/kokoro-audition.py
输出到 future.v2/API/kokoro-试听/
"""
import os
import sys
import soundfile as sf
from kokoro_onnx import Kokoro

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))            # future.v2
MODELS = os.path.join(ROOT, "claudio", "kokoro-models")
OUTDIR = os.path.join(ROOT, "API", "kokoro-试听")
os.makedirs(OUTDIR, exist_ok=True)

# 一段真实的 Claudio DJ 串场口吻：青年、温润、朋友递耳机
TEXT = (
    "Hey, you made it. Let's slow things down for a second. "
    "This next one is by Laufey, it's got that warm, late-night feeling, "
    "like the city has finally gone quiet. "
    "Close your eyes for this one, okay?"
)

print("loading kokoro model ...")
kokoro = Kokoro(
    os.path.join(MODELS, "kokoro-v1.0.onnx"),
    os.path.join(MODELS, "voices-v1.0.bin"),
)

# 英式男声候选 + 语速（用户偏好慢而柔，所以 0.9 为主，附一个常速参照）
JOBS = [
    ("bm_george", 0.9, "英男1-George英式-慢柔"),
    ("bm_lewis",  0.9, "英男2-Lewis英式-慢柔"),
    ("bm_daniel", 0.9, "英男3-Daniel英式-慢柔"),
    ("bm_fable",  0.9, "英男4-Fable英式-慢柔"),
    ("bm_george", 1.0, "英男5-George英式-常速"),
    ("bm_fable",  1.0, "英男6-Fable英式-常速"),
]

for voice, speed, name in JOBS:
    try:
        samples, sr = kokoro.create(TEXT, voice=voice, speed=speed, lang="en-gb")
        out = os.path.join(OUTDIR, name + ".wav")
        sf.write(out, samples, sr)
        print(f"  ok  {name}.wav  ({len(samples)/sr:.1f}s, {sr}Hz)")
    except Exception as e:
        print(f"  FAIL {name}: {e}")

print("done ->", OUTDIR)
