"""Generates the app's own PWA icons (project artwork, no third-party assets).

Design: white "N5" on the app's dark red (#b91c1c). Run once: python3 scripts/icons/generateIcons.py
Needs Pillow and the DejaVu Sans Bold font (a free font); the PNGs are committed, so the build never needs Python.
The maskable icon keeps every glyph pixel inside the central safe circle (radius 40% of the size).
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

RED = (185, 28, 28, 255)
WHITE = (255, 255, 255, 255)
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
OUT = Path(__file__).resolve().parents[2] / 'public' / 'icons'


def draw_icon(size: int, text_width_ratio: float, rounded: bool) -> Image.Image:
    image = Image.new('RGBA', (size, size), (0, 0, 0, 0) if rounded else RED)
    draw = ImageDraw.Draw(image)
    if rounded:
        draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * 0.22), fill=RED)
    # largest font size whose text box fits the requested width
    font_size = size
    while True:
        font = ImageFont.truetype(FONT, font_size)
        left, top, right, bottom = draw.textbbox((0, 0), 'N5', font=font)
        if right - left <= size * text_width_ratio:
            break
        font_size -= 2
    width, height = right - left, bottom - top
    draw.text(((size - width) / 2 - left, (size - height) / 2 - top), 'N5', font=font, fill=WHITE)
    return image


def assert_inside_safe_circle(image: Image.Image) -> None:
    size = image.width
    centre, radius = size / 2, size * 0.40
    pixels = image.load()
    for y in range(size):
        for x in range(size):
            r, g, b, _ = pixels[x, y]
            if r > 200 and g > 200 and b > 200:  # glyph pixel
                assert (x + 0.5 - centre) ** 2 + (y + 0.5 - centre) ** 2 <= radius**2, (x, y)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    draw_icon(192, 0.62, rounded=True).save(OUT / 'icon-192.png')
    draw_icon(512, 0.62, rounded=True).save(OUT / 'icon-512.png')
    maskable = draw_icon(512, 0.50, rounded=False)  # full-bleed background; Android applies its own mask
    assert_inside_safe_circle(maskable)
    maskable.save(OUT / 'icon-maskable-512.png')
    draw_icon(180, 0.62, rounded=False).save(OUT / 'apple-touch-icon.png')
    print('icons written to', OUT)


if __name__ == '__main__':
    main()
