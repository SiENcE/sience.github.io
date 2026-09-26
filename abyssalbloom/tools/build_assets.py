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

import base64
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy import ndimage
from scipy.cluster.vq import kmeans2

ROOT = Path(__file__).resolve().parent.parent
HD = ROOT.parent / "abyssal-bloom" / "assets"
# the HD game's keying (luminance key, stray removal) is the art pipeline's own
sys.path.insert(0, str(ROOT.parent / "abyssal-bloom" / "tools"))
from postprocess import content_box, luminance_key  # noqa: E402
RAW = HD / "raw"
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
# zone natives and the gulper, keyed here straight from raw renders on black
# (render.py NATIVES): name -> longest side in pixels
NATIVES = {"shrimp": 17, "ventworm": 22, "sponge": 22, "tripod": 30, "gulper": 84}
# relics for the Depth Log (render.py RELICS): r_* small, rb_* for the relic list
RELICS = ["bell", "lantern", "tooth", "scale"]
# creatures that also get a dark body (_d) and a glow-only mask (_e) for deep water
CREATURES = ["plankton", "jelly0", "jelly1", "seahorse", "angler", "nautilus", "manta", "leviathan",
             *NATIVES]

# scenery props, rendered on white (render.py PROPS): name -> (raw file, height in pixels)
PROPS = {
    # mid layer: silhouettes
    "p_spire": ("prop_spire.png", 110),
    "p_kelp": ("prop_kelp.png", 120),
    "p_arch": ("prop_arch.png", 90),
    "p_chimney": ("prop_chimney.png", 100),
    "p_ribs": ("prop_ribs.png", 110),
    "p_column": ("prop_column.png", 110),
    # near layer: props with glowing parts
    "p_coral": ("prop_coral.png", 64),
    "p_tubes": ("prop_tubes.png", 40),
    "p_seapen": ("prop_seapen.png", 44),
    "p_sponge": ("prop_sponge.png", 40),
    "p_fan": ("prop_fan.png", 56),
    "p_anemone": ("prop_anemone.png", 34),
    "p_crystal": ("prop_crystal.png", 40),
    "p_roots": ("prop_roots.png", 48),
    "p_shroom": ("prop_shroom.png", 40),
}
GLOW_FRAMES = 4  # the glow flows up a prop through these frames

# zone backdrops: output name -> source; the first is the reef's, from the HD
# game's processed backdrop, the rest are raw renders (see render.py ZONE_BGS)
BACKGROUNDS = {
    "bg": HD / "bg.jpg",
    "bg_trench": RAW / "bg_trench.png",
    "bg_plain": RAW / "bg_plain.png",
    "bg_hadal": RAW / "bg_hadal.png",
    "bg_choir": RAW / "bg_choir.png",
    "bg_heart": RAW / "bg_heart.png",
}

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


def dark_body(im: Image.Image) -> Image.Image:
    """The creature as seen with no light on it: a dim, blue-shifted body."""
    arr = np.asarray(im).astype(np.float32)
    body = (arr[..., 3] > 0) & (arr[..., :3].sum(axis=2) > 60)
    arr[body, :3] = arr[body, :3] * 0.22 + np.array([8, 14, 30], np.float32)
    return Image.fromarray(arr.clip(0, 255).astype(np.uint8), "RGBA")


def emissive(im: Image.Image) -> Image.Image:
    """Only the parts that make their own light: the brightest quarter of the
    body (lures, spots, rims), a little brighter still. No outline."""
    arr = np.asarray(im).astype(np.float32)
    body = (arr[..., 3] > 0) & (arr[..., :3].sum(axis=2) > 60)
    v = arr[..., :3].max(axis=2)
    thr = max(150.0, float(np.percentile(v[body], 72))) if body.any() else 255.0
    lit = body & (v >= thr)
    out = np.zeros_like(arr)
    out[lit, :3] = arr[lit, :3] + (255 - arr[lit, :3]) * 0.2
    out[lit, 3] = 255
    return Image.fromarray(out.astype(np.uint8), "RGBA")


def shiny(im: Image.Image) -> Image.Image:
    """The rare colour morph: body hues turned almost halfway round the wheel
    and a little more saturated; the outline stays dark."""
    arr = np.asarray(im).copy()
    body = (arr[..., 3] > 0) & (arr[..., :3].astype(int).sum(axis=2) > 60)
    hsv = np.asarray(Image.fromarray(arr[..., :3]).convert("HSV")).astype(np.int32)
    hsv[..., 0] = (hsv[..., 0] + 115) % 256
    hsv[..., 1] = np.minimum(255, hsv[..., 1] * 5 // 4 + 20)
    rgb = np.asarray(Image.fromarray(hsv.astype(np.uint8), "HSV").convert("RGB"))
    arr[body, :3] = rgb[body]
    return Image.fromarray(arr, "RGBA")


def black_pearl(im: Image.Image) -> Image.Image:
    """The pearl, in black: a dark body that keeps a violet sheen on its highlights."""
    arr = np.asarray(im).astype(np.float32)
    body = (arr[..., 3] > 0) & (arr[..., :3].sum(axis=2) > 60)
    v = arr[..., :3].max(axis=2) / 255
    shade = np.stack([40 + 150 * v ** 3, 16 + 60 * v ** 3, 60 + 190 * v ** 3], axis=-1)
    arr[body, :3] = shade[body]
    return Image.fromarray(arr.clip(0, 255).astype(np.uint8), "RGBA")


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

    keyed = {}
    for name, longest in NATIVES.items():
        src = RAW / f"{name}.png"
        if not src.exists():
            print(f"no {src.name} yet, native {name} skipped")
            continue
        k = luminance_key(Image.open(src))
        keyed[name] = k.crop(content_box(k))
        out[name] = pixelize(keyed[name], *fit(keyed[name].size, longest))

    for name in list(out):
        if not name.startswith(("pearl", "spore")):
            out[name + "_f"] = flash(out[name])
    for name in CREATURES:
        if name in out:
            out[name + "_d"] = dark_body(out[name])
            out[name + "_e"] = emissive(out[name])
            if name != "gulper":
                out[name + "_s"] = shiny(out[name])
    out["bpearl"] = black_pearl(out["pearl"])

    for name in RELICS:
        src = RAW / f"relic_{name}.png"
        if not src.exists():
            print(f"no {src.name} yet, relic {name} skipped")
            continue
        k = luminance_key(Image.open(src))
        k = k.crop(content_box(k))
        out["r_" + name] = pixelize(k, *fit(k.size, 12))
        out["rb_" + name] = pixelize(k, *fit(k.size, 26))

    for name in ICONS:
        src = Image.open(HD / (name + ".png"))
        out["i_" + name] = pixelize(src, *fit(src.size, ICON - 2))
    for name, k in keyed.items():
        if name == "gulper":  # a long thin eel: its icon is the head alone
            k = k.crop((int(k.width * 0.62), 0, k.width, k.height))
            k = k.crop(content_box(k))
        out["i_" + name] = pixelize(k, *fit(k.size, ICON - 2))
    return out


def key_white(im: Image.Image) -> Image.Image:
    """Cut a prop out of a pure white render: anything dark or coloured is
    solid, near-white is transparent; colour is un-premultiplied against white.
    Only the largest shapes are kept (SDNQ leaves specks and streaks)."""
    a = np.asarray(im.convert("RGB"), np.float32)
    dist = 255 - a.min(axis=2)
    alpha = ((dist - 20) / 45).clip(0, 1)
    rgb = (a - (1 - alpha[..., None]) * 255) / np.maximum(alpha[..., None], 1e-3)
    solid = alpha > 0.5
    lab, n = ndimage.label(solid)
    if n:
        sizes = ndimage.sum(solid, lab, range(1, n + 1))
        keep = np.isin(lab, 1 + np.flatnonzero(sizes >= sizes.max() * 0.05))
        alpha = alpha * ndimage.binary_dilation(keep, iterations=2)
    out = np.dstack([rgb.clip(0, 255), alpha * 255]).astype(np.uint8)
    im = Image.fromarray(out, "RGBA")
    return im.crop(im.getbbox())


def glow_parts(im: Image.Image) -> np.ndarray:
    """The pixels of a prop that give off light: bright and strongly coloured."""
    a = np.asarray(im).astype(np.float32)
    v, sat = a[..., :3].max(axis=2), a[..., :3].max(axis=2) - a[..., :3].min(axis=2)
    # very bright pixels glow even when pale (a glass sponge's rim)
    return (a[..., 3] > 0) & (((v > 140) & (sat > 60)) | ((v > 185) & (sat > 30)))


def glow_frames(im: Image.Image, lit: np.ndarray) -> list[Image.Image]:
    """The glowing parts only, in GLOW_FRAMES steps of a ramp that climbs the
    prop: frame k is brightest a quarter further up than frame k-1. Played in
    order it reads as light flowing upward, palette-cycling style."""
    a = np.asarray(im).astype(np.float32)
    h = a.shape[0]
    phase = 1 - np.arange(h, dtype=np.float32)[:, None] / h  # 0 at the base, 1 at the top
    frames = []
    for k in range(GLOW_FRAMES):
        wave = np.cos(2 * np.pi * (phase * 1.5 - k / GLOW_FRAMES))
        # three brightness steps, not a smooth ramp: it has to stay pixel art
        step = np.where(wave > 0.5, 1.0, np.where(wave > -0.3, 0.72, 0.5))
        out = np.zeros_like(a)
        rgb = a[..., :3] * step[..., None]
        top = step[..., None] >= 1.0
        rgb = np.where(top, rgb + (255 - rgb) * 0.3, rgb)
        out[lit, :3] = rgb[lit]
        out[lit, 3] = 255
        frames.append(Image.fromarray(out.clip(0, 255).astype(np.uint8), "RGBA"))
    return frames


def glow_points(lit: np.ndarray, most: int = 6) -> list[list[int]]:
    """Up to `most` light sources for the light map, spread over the glowing
    pixels (k-means on their positions), as [x, y, radius] in sprite pixels."""
    ys, xs = np.nonzero(lit)
    if len(xs) < 3:
        return []
    pts = np.stack([xs, ys], 1).astype(np.float64)
    k = int(min(most, max(1, len(xs) // 12)))
    cent, lab = kmeans2(pts, k, minit="++", seed=2)
    out = []
    for i in range(k):
        m = pts[lab == i]
        if len(m):
            r = max(2.0, float(np.sqrt(((m - cent[i]) ** 2).sum(1)).mean()) * 1.3)
            out.append([int(round(cent[i][0])), int(round(cent[i][1])), int(round(r))])
    return out


def build_props() -> tuple[dict[str, Image.Image], dict]:
    out, meta = {}, {}
    for name, (file, height) in PROPS.items():
        src = RAW / file
        if not src.exists():
            print(f"no {file} yet, prop {name} skipped")
            continue
        keyed = key_white(Image.open(src))
        w, h = round(keyed.width * height / keyed.height), height  # props are sized by height
        out[name] = pixelize(keyed, w, h, colours=12)
        lit = glow_parts(out[name])
        if lit.sum() >= 3:
            for k, f in enumerate(glow_frames(out[name], lit)):
                out[f"{name}_e{k}"] = f
        meta[name] = {"pts": glow_points(lit) if lit.sum() >= 3 else []}
    return out, meta


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


def destreak(im: Image.Image) -> Image.Image:
    """Remove the faint vertical streaks SDNQ leaves in large renders.

    A streak is a few pixels wide and runs a long way down, so: take what a
    narrow horizontal median removes, keep only the part of it that is coherent
    over a tall vertical window, and subtract that. Light shafts are too wide to
    be touched by the first step."""
    arr = np.asarray(im, dtype=np.float32)
    resid = arr - ndimage.median_filter(arr, size=(1, 21, 1))
    streak = ndimage.median_filter(resid, size=(41, 1, 1))
    return Image.fromarray((arr - streak).clip(0, 255).astype(np.uint8), "RGB")


def backdrop_palette(im: Image.Image, n: int = 32) -> np.ndarray:
    a = np.asarray(im, np.float32).reshape(-1, 3)
    v, sat = a.max(1), a.max(1) - a.min(1)
    wt = 1 + v / 255 * 6 + sat / 255 * 6
    rng = np.random.default_rng(0)
    sample = a[rng.choice(len(a), 60000, p=wt / wt.sum())]
    # clustered on sqrt values, so the dark end gets its share of steps too
    cent, _ = kmeans2(np.sqrt(sample) * 16, n, minit="++", seed=1)
    return ((cent / 16) ** 2).clip(0, 255).astype(np.float32)


def build_background(src: Path) -> Image.Image:
    """640x360 with a limited palette; the game draws it at whole-pixel scale."""
    im = destreak(Image.open(src).convert("RGB"))
    im = im.resize((640, round(640 * im.height / im.width)), Image.BOX)
    # palette by k-means with bright and saturated pixels weighted up (a plain
    # median cut spends every colour on the dark water, and the few pixels of a
    # light shaft or a vent came out olive), then ordered (Bayer) dithering onto
    # it: error diffusion left hard bands in the light shafts, and ordered
    # dither is the texture pixel art expects anyway
    palette = backdrop_palette(im)
    bayer = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], np.float32) / 16 - 0.47
    arr = np.asarray(im, dtype=np.float32)
    h, w = arr.shape[:2]
    arr = arr + np.tile(bayer, (h // 4 + 1, w // 4 + 1))[:h, :w, None] * 22
    d = ((arr[:, :, None, :] - palette[None, None]) ** 2).sum(-1)
    return Image.fromarray(palette[d.argmin(-1)].astype(np.uint8), "RGB")


LIGHT_CELL = 4  # backdrop pixels per light-mask cell


def light_mask(bg: Image.Image) -> dict:
    """Where the painting itself glows (vents, coral tips, a far shaft), as a
    coarse 8-bit grid. The game adds it to its light map so those keep glowing
    in dark water; it ships inside atlas.js because a page on file:// may not
    read pixels back from an image."""
    a = np.asarray(bg, np.float32)
    v, sat = a.max(axis=2), a.max(axis=2) - a.min(axis=2)
    # glow is bright *and* coloured; pale silt and bleached bone are only bright,
    # unless they are nearly white-hot
    lit = ((v - 90) / 70).clip(0, 1.2) * ((sat - 25) / 50).clip(0, 1) + ((v - 215) / 40).clip(0, 1)
    lit = lit.clip(0, 1.2) / 1.2
    h, w = (lit.shape[0] // LIGHT_CELL) * LIGHT_CELL, (lit.shape[1] // LIGHT_CELL) * LIGHT_CELL
    cells = lit[:h, :w].reshape(h // LIGHT_CELL, LIGHT_CELL, w // LIGHT_CELL, LIGHT_CELL).mean(axis=(1, 3))
    data = (cells * 255).round().astype(np.uint8)
    return {"w": data.shape[1], "h": data.shape[0], "d": base64.b64encode(data.tobytes()).decode()}


def main() -> None:
    sprites = build_sprites()
    props, prop_meta = build_props()
    sprites.update(props)
    fonts, glyph_images = {}, {}
    for name, (file, px) in FONT_SPECS.items():
        fonts[name], imgs = build_font(name, file, px)
        glyph_images.update(imgs)

    atlas, rects = pack({**sprites, **glyph_images})
    atlas.save(OUT / "atlas.png", optimize=True)
    bgs, lights = [], {}
    for name, src in BACKGROUNDS.items():
        if not src.exists():
            print(f"no {src.name} yet, {name} falls back to the reef's backdrop")
            continue
        bg = build_background(src)
        bg.save(OUT / f"{name}.png", optimize=True)
        bgs.append(name)
        lights[name] = light_mask(bg)

    for f in fonts.values():
        for g in f["glyphs"].values():
            if "key" in g:
                g["r"] = rects[g.pop("key")]
    meta = {"sprites": {k: rects[k] for k in sprites}, "fonts": fonts, "bg": list(bg.size), "bgs": bgs, "bglight": lights,
            "props": prop_meta}
    (OUT / "atlas.js").write_text("// generated by tools/build_assets.py\nwindow.ATLAS = "
                                  + json.dumps(meta, separators=(",", ":")) + ";\n", encoding="utf-8")
    print(f"atlas {atlas.width}x{atlas.height}, {len(sprites)} sprites, "
          f"{len(glyph_images)} glyphs; {len(bgs)} backdrops {bg.width}x{bg.height}")

    if "--preview" in sys.argv:
        p = Image.new("RGBA", atlas.size, (10, 24, 44, 255))
        p.alpha_composite(atlas)
        p.resize((p.width * 3, p.height * 3), Image.NEAREST).save(ROOT.parent / "_atlas_preview.png")


if __name__ == "__main__":
    main()
