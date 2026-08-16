#!/usr/bin/env python3
"""Generate the PWA icon set with no third-party dependencies.

Writes minimal, valid PNGs (RGB, 8-bit, non-interlaced) using only zlib + struct, so the
project needs no build step and no Pillow install. Run from the project root:

    python3 tools/make_icons.py
"""

import os
import struct
import zlib

INK = (26, 26, 46)
PAPER = (247, 246, 243)
ACCENT = (194, 112, 63)

# 7x7 bitmap of a house; scaled up per icon size. Rows 0-3 are the roof (accent),
# rows 4-6 the body (light) with a doorway notched out of the bottom.
GLYPH = [
    "...X...",
    "..XXX..",
    ".XXXXX.",
    "XXXXXXX",
    "XXXXXXX",
    "XXX.XXX",
    "XXX.XXX",
]


def write_png(path, width, height, pixel_fn):
    """Write a PNG where pixel_fn(x, y) returns an (r, g, b) tuple."""
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter type 0 (None) for each scanline
        for x in range(width):
            raw.extend(pixel_fn(x, y))

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    header = struct.pack(">2I5B", width, height, 8, 2, 0, 0, 0)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as fh:
        fh.write(png)


def make_icon(path, size, maskable=False):
    # Maskable icons must keep their content inside a safe circle, so shrink the glyph.
    glyph_scale = 0.42 if maskable else 0.56
    radius = 0 if maskable else size * 0.22
    glyph_px = size * glyph_scale
    cell = glyph_px / 7.0
    left = (size - glyph_px) / 2.0
    top = (size - glyph_px) / 2.0

    def pixel(x, y):
        # Rounded-corner mask for the normal icon; maskable stays a full square so the
        # launcher can crop it to whatever shape the platform uses.
        if radius:
            # Clamp to the nearest corner circle centre, then test only that one.
            cx = radius if x < radius else (size - radius if x > size - radius else x)
            cy = radius if y < radius else (size - radius if y > size - radius else y)
            if (x - cx) ** 2 + (y - cy) ** 2 > radius * radius:
                return PAPER

        gx = int((x - left) / cell)
        gy = int((y - top) / cell)
        if 0 <= gx < 7 and 0 <= gy < 7 and GLYPH[gy][gx] == "X":
            # Warm accent on the roof, light body below.
            return ACCENT if gy <= 2 else PAPER
        return INK

    write_png(path, size, size, pixel)
    print(f"  wrote {path} ({size}x{size})")


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(root, "icons")
    os.makedirs(out, exist_ok=True)
    print("Generating icons…")
    for size in (180, 192, 512):
        make_icon(os.path.join(out, f"icon-{size}.png"), size)
    make_icon(os.path.join(out, "icon-maskable-512.png"), 512, maskable=True)
    print("Done.")


if __name__ == "__main__":
    main()
