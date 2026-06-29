# -*- coding: utf-8 -*-
"""画一张「色相 hue × 情绪」对照图（与 Claudio 电台的上色规则一致），存到桌面。"""
import colorsys, math, os
from PIL import Image, ImageDraw, ImageFont

SS = 2                         # 超采样倍数（画大再缩小 → 抗锯齿）
W, H = 1700, 1700
cx, cy = 850, 940              # 色环中心
R_OUT, R_IN = 440, 280         # 圆环外/内半径
R_TICK = 458                   # 角度刻度文字半径
R_LABEL = 560                  # 情绪标签所在半径
BG = (247, 244, 234)           # 与 app 暖米色一致
INK = (58, 74, 62)
INK_SOFT = (132, 138, 124)

# app 用 hsl(h, 70%, 58%) 上色 → 这里用同样的饱和度/明度，让色环颜色和电台卡片一致
S, L = 0.70, 0.58
def hue_rgb(h, s=S, l=L):
    r, g, b = colorsys.hls_to_rgb((h % 360) / 360.0, l, s)
    return (int(r*255), int(g*255), int(b*255))

# 情绪分段（与 context.js 的 hue 指引一致）：名称 / 描述 / 起 / 止
BANDS = [
    ("暖热",     "热烈 · 躁动",   0,   45),
    ("阳光",     "明快 · 元气",   45,  90),
    ("清新绿",   "治愈 · 自然",   90,  160),
    ("海洋·夜晚","安静 · 深邃",   180, 240),
    ("忧郁深蓝", "低落 · 内省",   220, 260),
    ("梦幻紫",   "朦胧 · 梦感",   270, 320),
    ("玫瑰粉",   "温柔 · 甜",     320, 350),
]

FONT = r"C:\Windows\Fonts\msyh.ttc"
FONTB = r"C:\Windows\Fonts\msyhbd.ttc"
def f(path, size): return ImageFont.truetype(path, size*SS)
ft_title = f(FONTB, 46)
ft_sub   = f(FONT, 22)
ft_name  = f(FONTB, 26)
ft_rng   = f(FONT, 21)
ft_desc  = f(FONT, 20)
ft_tick  = f(FONT, 16)
ft_center= f(FONTB, 30)
ft_centsub=f(FONT, 18)
ft_foot  = f(FONT, 18)

img = Image.new("RGB", (W*SS, H*SS), BG)
d = ImageDraw.Draw(img)
def S_(v): return v*SS

# 角度：hue 0(红) 放在正上方，顺时针增大（与文字讲解一致）。PIL 角度从 3 点钟顺时针。
def pil_angle(h): return h - 90
def point(h, r):
    a = math.radians(pil_angle(h))
    return (cx + r*math.cos(a), cy + r*math.sin(a))

# —— 画连续色环（720 片细扇形，端点略重叠避免缝）——
box = [S_(cx-R_OUT), S_(cy-R_OUT), S_(cx+R_OUT), S_(cy+R_OUT)]
for i in range(720):
    h = i/2.0
    d.pieslice(box, pil_angle(h), pil_angle(h)+0.9, fill=hue_rgb(h))
# 内圈挖空成 donut
d.ellipse([S_(cx-R_IN), S_(cy-R_IN), S_(cx+R_IN), S_(cy+R_IN)], fill=BG)

# —— 角度刻度（每 30°）——
for deg in range(0, 360, 30):
    px, py = point(deg, R_TICK)
    d.text((S_(px), S_(py)), f"{deg}°", font=ft_tick, fill=INK_SOFT, anchor="mm")

# —— 情绪标签（放在各段中点角度的外圈，连一条引线）——
def band_mid(a, b): return (a + b) / 2.0
for name, desc, a, b in BANDS:
    mid = band_mid(a, b)
    midhue = mid
    col = hue_rgb(midhue, s=0.72, l=0.50)
    # 引线：从环外缘到标签
    p1 = point(mid, R_OUT+6)
    p2 = point(mid, R_LABEL-26)
    d.line([S_(p1[0]), S_(p1[1]), S_(p2[0]), S_(p2[1])], fill=col, width=2*SS)
    # 标签锚点
    lx, ly = point(mid, R_LABEL)
    right = math.cos(math.radians(pil_angle(mid))) >= 0
    anchor_h = "l" if right else "r"
    # 色点
    dotx = lx + (14 if right else -14)
    d.ellipse([S_(dotx-9), S_(ly-46), S_(dotx+9), S_(ly-28)], fill=col)
    tx = dotx + (28 if right else -28)
    ax = "lm" if right else "rm"
    d.text((S_(tx), S_(ly-37)), f"{name}", font=ft_name, fill=INK, anchor=ax)
    d.text((S_(tx), S_(ly-6)),  f"{a}–{b}°", font=ft_rng, fill=col, anchor=ax)
    d.text((S_(tx), S_(ly+22)), desc, font=ft_desc, fill=INK_SOFT, anchor=ax)

# —— 中心文字 ——
d.text((S_(cx), S_(cy-18)), "色相 Hue", font=ft_center, fill=INK, anchor="mm")
d.text((S_(cx), S_(cy+20)), "0–360° 色环角度", font=ft_centsub, fill=INK_SOFT, anchor="mm")

# —— 标题 ——
d.text((S_(cx), S_(70)),  "Claudio · 色相 × 情绪对照", font=ft_title, fill=INK, anchor="mm")
d.text((S_(cx), S_(120)), "每首歌按气质给一个 hue 值，电台卡片就用这个色调上色", font=ft_sub, fill=INK_SOFT, anchor="mm")
# —— 脚注 ——
d.text((S_(cx), S_(H-46)), "hue = 色环上的角度：0/360°红 · 60°黄 · 120°绿 · 180°青 · 240°蓝 · 300°紫 ｜ 饱和度/明度固定，只有色调随情绪变",
       font=ft_foot, fill=INK_SOFT, anchor="mm")

img = img.resize((W, H), Image.LANCZOS)
out = os.path.join(os.path.expanduser("~"), "Desktop", "Claudio色相情绪对照.png")
img.save(out, "PNG")
print("saved:", out)
