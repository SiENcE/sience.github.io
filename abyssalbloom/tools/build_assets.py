"""Build the pixel-art atlas from the HD game's SDNQ-rendered assets.

Sources are the luminance-keyed sprites in ../abyssal-bloom/assets (see that
project's tools/postprocess.py).  Each sprite is shrunk to its pixel size with
an area average on premultiplied alpha, given a hard 1-bit edge, reduced to its
own small palette and wrapped in a 1px dark outline — a plain nearest-neighbour
shrink of a painting comes out noisy, and a shared palette flattened the gold.

Fonts are rasterised 1-bit at their native pixel sizes into the same atlas.
Output: assets/atlas.png, assets/bg.png, assets/atlas.js (a script, so the game
still runs from file:// without fetch).

    python tools/build_assets.py [--preview]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
HD = ROOT.parent / "abyssal-bloom" / "assets"
OUT = ROOT / "assets"
FONTS = OUT / "fonts"

OUTLINE = (4, 8, 18, 255)
ALPHA_CUT = 40  # premultiplied coverage above which a pixel is solid

# name -> (source file, longest side in pixels)
SPRITES = {
    "plankton": ("plankton.png", 11),
    "seahorse": ("seahorse.png", 26),
    "angler": ("angler.png", 40),
    "nautilus": ("nautilus.png", 28),
    "manta": ("manta.png", 52),
    "leviathan": ("leviathan.png", 110),
    "heart": ("heart.png", 68),
    "pearl": ("pearl.png", 12),
    "spore": ("spore.png", 14),
}
ICON = 16  # shop and mutation thumbnails
ICONS = ["plankton", "jelly", "seahorse", "angler", "nautilus", "manta", "leviathan",
         "heart", "pearl", "spore"]
JELLY = 28  # height of each jelly frame

# name -> (file, pixel size); sizes where these fonts render perfectly 1-bit
FONT_SPECS = {
    "small": ("Tiny5-Regular.ttf", 8),
    "caps": ("Silkscreen-Bold.ttf", 8),
    "big": ("Jersey10-Regular.ttf", 20),
}
CHARSET = [chr(c) for c in range(32, 127)]


def fit(size: tuple[int, int], longest: int) -> tuple[int, int]:
    s = longest / max(size)
    return max(1, round(size[0] * s)), max(1, round(size[1] * s))


def pixelize(im: Image.Image, w: int, h: int, colours: int = 16, outline: bool = True) -> Image.Image:
    im = im.convert("RGBA")
    # keep a little of the detail the area average is about to smear
    im = im.filter(ImageFilter.UnsharpMask(radius=max(1.0, im.width / w * 0.6), percent=80, threshold=2))
    small = im.convert("RGBa").resize((w, h), Image.BOX).convert("RGBA")
    arr = np.asarray(small).copy()
    solid = arr[..., 3] > ALPHA_CUT
    # drop single orphan pixels, they read as dirt at 1:1
    neigh = ndimage.convolve(solid.astype(int), np.ones((3, 3), int), mode="constant") - solid
    solid &= neigh > 0
    arr[..., 3] = np.where(solid, 255, 0)
    rgb = Image.fromarray(arr[..., :3]).quantize(colours, method=Image.Quantize.MEDIANCUT,
                                                 dither=Image.Dither.NONE).convert("RGB")
    out = np.dstack([np.asarray(rgb), arr[..., 3]]).astype(np.uint8)
    if outline:
        pad = np.zeros((h + 2, w + 2, 4), np.uint8)
        pad[1:-1, 1:-1] = out
        m = pad[..., 3] > 0
        ring = ndimage.binary_dilation(m, structure=[[0, 1, 0], [1, 1, 1], [0, 1, 0]]) & ~m
        pad[ring] = OUTLINE
        out = pad
    return Image.fromarray(out, "RGBA")


def flash(im: Image.Image) -> Image.Image:
    """Lightened copy for heartbeat / hit flashes (outline kept dark)."""
    arr = np.asarray(im).astype(np.float32)
    body = (arr[..., 3] > 0) & (arr[..., :3].sum(axis=2) > 60)
    arr[body, :3] = arr[body, :3] + (255 - arr[body, :3]) * 0.6
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def build_sprites() -> dict[str, Image.Image]:
    out: dict[str, Image.Image] = {}
    for name, (file, longest) in SPRITES.items():
        src = Image.open(HD / file)
        out[name] = pixelize(src, *fit(src.size, longest))
    # the manta is painted from above, head up; turned to head-right it can swim
    # sideways and be mirrored like the others, with no runtime rotation
    out["manta"] = out["manta"].rotate(-90, expand=True)

    sheet = Image.open(HD / "jelly_sheet.png")
    fw = sheet.width // 2
    w, h = fit((fw, sheet.height), JELLY)
    for i in range(2):
        out[f"jelly{i}"] = pixelize(sheet.crop((i * fw, 0, (i + 1) * fw, sheet.height)), w, h)

    for name in list(out):
        if not name.startswith(("pearl", "spore")):
            out[name + "_f"] = flash(out[name])

    for name in ICONS:
        src = Image.open(HD / (name + ".png"))
        out["i_" + name] = pixelize(src, *fit(src.size, ICON - 2))
    return out


def build_font(name: str, file: str, px: int) -> tuple[dict, dict[str, Image.Image]]:
    font = ImageFont.truetype(str(FONTS / file), px)
    ascent, descent = font.getmetrics()
    glyphs, images = {}, {}
    for ch in CHARSET:
        adv = round(font.getlength(ch))
        im = Image.new("L", (px * 3, px * 3), 0)
        d = ImageDraw.Draw(im)
        d.fontmode = "1"
        d.text((px, px), ch, font=font, fill=255)
        box = im.getbbox()
        if not box:
            glyphs[ch] = {"adv": adv}
            continue
        g = im.crop(box)
        rgba = Image.new("RGBA", g.size, (255, 255, 255, 0))
        rgba.putalpha(g.point(lambda v: 255 if v > 127 else 0))
        key = f"{name}:{ord(ch)}"
        images[key] = rgba
        glyphs[ch] = {"adv": adv, "ox": box[0] - px, "oy": box[1] - px, "key": key}
    return {"line": ascent + descent, "ascent": ascent, "glyphs": glyphs}, images


def pack(images: dict[str, Image.Image], width: int = 512) -> tuple[Image.Image, dict]:
    """Shelf packing, tallest first, 1px gutters so nothing bleeds when scaled."""
    order = sorted(images, key=lambda k: (-images[k].height, -images[k].width))
    x = y = shelf = 0
    rects = {}
    for k in order:
        im = images[k]
        if x + im.width + 1 > width:
            x, y, shelf = 0, y + shelf + 1, 0
        rects[k] = [x, y, im.width, im.height]
        x += im.width + 1
        shelf = max(shelf, im.height)
    atlas = Image.new("RGBA", (width, y + shelf), (0, 0, 0, 0))
    for k, (x, y, _, _) in rects.items():
        atlas.paste(images[k], (x, y))
    return atlas, rects


def build_background() -> Image.Image:
    """640x360 with a limited palette; the game draws it at whole-pixel scale."""
    im = Image.open(HD / "bg.jpg").convert("RGB")
    im = im.resize((640, round(640 * im.height / im.width)), Image.BOX)
    # palette from a plain median cut, then ordered (Bayer) dithering onto it:
    # error diffusion left hard bands in the light shafts, and ordered dither
    # is the texture pixel art expects anyway
    pal = np.asarray(im.quantize(32, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
                     .convert("RGB").getcolors(4096), dtype=object)
    palette = np.array([c for _, c in pal], dtype=np.float32)
    bayer = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], np.float32) / 16 - 0.47
    arr = np.asarray(im, dtype=np.float32)
    h, w = arr.shape[:2]
    arr = arr + np.tile(bayer, (h // 4 + 1, w // 4 + 1))[:h, :w, None] * 22
    d = ((arr[:, :, None, :] - palette[None, None]) ** 2).sum(-1)
    return Image.fromarray(palette[d.argmin(-1)].astype(np.uint8), "RGB")


def main() -> None:
    sprites = build_sprites()
    fonts, glyph_images = {}, {}
    for name, (file, px) in FONT_SPECS.items():
        fonts[name], imgs = build_font(name, file, px)
        glyph_images.update(imgs)

    atlas, rects = pack({**sprites, **glyph_images})
    atlas.save(OUT / "atlas.png", optimize=True)
    bg = build_background()
    bg.save(OUT / "bg.png", optimize=True)

    for f in fonts.values():
        for g in f["glyphs"].values():
            if "key" in g:
                g["r"] = rects[g.pop("key")]
    meta = {"sprites": {k: rects[k] for k in sprites}, "fonts": fonts, "bg": list(bg.size)}
    (OUT / "atlas.js").write_text("// generated by tools/build_assets.py\nwindow.ATLAS = "
                                  + json.dumps(meta, separators=(",", ":")) + ";\n", encoding="utf-8")
    print(f"atlas {atlas.width}x{atlas.height}, {len(sprites)} sprites, "
          f"{len(glyph_images)} glyphs; bg {bg.width}x{bg.height}")

    if "--preview" in sys.argv:
        p = Image.new("RGBA", atlas.size, (10, 24, 44, 255))
        p.alpha_composite(atlas)
        p.resize((p.width * 3, p.height * 3), Image.NEAREST).save(ROOT.parent / "_atlas_preview.png")


if __name__ == "__main__":
    main()
