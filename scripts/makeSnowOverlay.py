# Usage: python scripts/makeSnowOverlay.py frontend/public/assets/roadmap/snow-overlay.webp
# Pure image generation (Pillow), no network, no database.
"""Procedural snowfall overlay (transparent WebP) for the Season 3 banner.

Three depth layers so it reads as real snow, not a grid:
  far   many tiny sharp flakes, low alpha
  mid   fewer medium flakes, slight blur
  near  a handful of big out-of-focus flakes (bokeh), strong blur
Flakes thin out toward the left, where the banner text sits. Seeded, so reruns match.
"""
import random
import sys

from PIL import Image, ImageDraw, ImageFilter

W, H = 1600, 420
OUT = sys.argv[1]
rng = random.Random(20261204)


def layer(count, r_min, r_max, a_min, a_max, blur):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    placed = 0
    while placed < count:
        x = rng.uniform(0, W)
        # density ramps up from the text side (left) to the art side (right)
        if rng.random() > 0.25 + 0.75 * (x / W):
            continue
        y = rng.uniform(0, H)
        r = rng.uniform(r_min, r_max)
        a = int(rng.uniform(a_min, a_max))
        tint = rng.choice([(255, 255, 255), (232, 244, 255), (214, 236, 255)])
        d.ellipse((x - r, y - r, x + r, y + r), fill=(*tint, a))
        placed += 1
    return img.filter(ImageFilter.GaussianBlur(blur)) if blur else img


far = layer(480, 0.7, 1.5, 100, 190, 0.3)
mid = layer(170, 1.6, 3.0, 150, 235, 0.7)
near = layer(20, 5.0, 12.0, 60, 120, 4.0)

out = Image.alpha_composite(Image.alpha_composite(far, mid), near)
out.save(OUT, "WEBP", quality=88, method=6)
print("saved", OUT)
