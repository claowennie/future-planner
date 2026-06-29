# -*- coding: utf-8 -*-
"""Kokoro TTS 常驻工作进程。

由 node 的 tts.js spawn 一次，加载 onnx 模型常驻内存，之后逐条从 stdin 收
单行 JSON 请求 {text,voice,speed,lang} → 合成 → 以二进制帧写回 stdout：
    [status:1B][len:4B big-endian][payload]
status=1 时 payload 是 mp3 字节；status=0 时 payload 是 utf-8 错误信息。
node 端串行发请求（一次一条、收到一帧再发下一条），所以无需多路复用。

依赖：pip install kokoro-onnx soundfile（onnxruntime 1.26 在部分 Win 机 DLL 失败，
用 1.19.2 稳）。模型文件路径由 argv 传入。
"""
import sys, os, io, json, struct

# Windows：把 stdin/stdout 设成二进制，避免 \n 被翻译成 \r\n 损坏 mp3 帧。
if os.name == 'nt':
    import msvcrt
    msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
    msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)

def log(*a):
    print('[kokoro-worker]', *a, file=sys.stderr, flush=True)

if len(sys.argv) < 3:
    log('用法: kokoro_worker.py <onnx> <voices.bin>')
    sys.exit(2)
onnx_path, voices_path = sys.argv[1], sys.argv[2]

try:
    import soundfile as sf
    from kokoro_onnx import Kokoro
    log('loading model ...')
    kokoro = Kokoro(onnx_path, voices_path)
    log('READY')
except Exception as e:
    log('模型加载失败:', e)
    sys.exit(1)

def write_frame(status, payload):
    sys.stdout.buffer.write(struct.pack('>BI', status, len(payload)))
    sys.stdout.buffer.write(payload)
    sys.stdout.buffer.flush()

while True:
    line = sys.stdin.buffer.readline()
    if not line:
        break  # stdin 关闭（node 退出）→ 结束
    line = line.strip()
    if not line:
        continue
    try:
        req = json.loads(line.decode('utf-8'))
        text = req.get('text', '')
        voice = req.get('voice', 'bm_fable')
        speed = float(req.get('speed', 0.9))
        lang = req.get('lang', 'en-gb')
        samples, sr = kokoro.create(text, voice=voice, speed=speed, lang=lang)
        out = io.BytesIO()
        sf.write(out, samples, sr, format='MP3')
        write_frame(1, out.getvalue())
    except Exception as e:
        write_frame(0, str(e).encode('utf-8'))
