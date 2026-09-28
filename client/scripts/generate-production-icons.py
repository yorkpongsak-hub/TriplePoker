"""Generate deterministic Expo and native Android launcher assets from the approved gold mark."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "assets" / "branding" / "triplepoker-rise-gold-mark-master.png"
NAVY = (3, 7, 17, 255)
GOLD = (220, 166, 45, 255)


def contain_mark(size: int, fraction: float) -> Image.Image:
    source = Image.open(MASTER).convert("RGBA")
    alpha = source.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        raise RuntimeError("Gold mark has no visible pixels")
    source = source.crop(bbox)
    target = round(size * fraction)
    source.thumbnail((target, target), Image.Resampling.LANCZOS)
    layer = Image.new("RGBA", (size, size))
    layer.alpha_composite(source, ((size - source.width) // 2, (size - source.height) // 2))
    return layer


def full_icon(size: int, mark_fraction: float = 0.62) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), NAVY)
    draw = ImageDraw.Draw(canvas)
    inset = round(size * 0.055)
    width = max(1, round(size * 0.012))
    draw.rounded_rectangle((inset, inset, size - inset, size - inset), radius=round(size * 0.19), outline=GOLD, width=width)
    glow = contain_mark(size, mark_fraction).getchannel("A").filter(ImageFilter.GaussianBlur(max(1, size / 90)))
    glow_layer = Image.new("RGBA", (size, size), (190, 118, 15, 0)); glow_layer.putalpha(glow.point(lambda a: a * 70 // 255))
    canvas.alpha_composite(glow_layer)
    canvas.alpha_composite(contain_mark(size, mark_fraction))
    return canvas.convert("RGB")


def monochrome(size: int, fraction: float = 0.58) -> Image.Image:
    alpha = contain_mark(size, fraction).getchannel("A")
    result = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    result.putalpha(alpha)
    return result


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True)


def assert_adaptive_safe_zone(image: Image.Image) -> None:
    bbox = image.getchannel("A").getbbox()
    if not bbox:
        raise RuntimeError("Adaptive foreground is empty")
    width, height = image.size
    safe = 0.66
    if bbox[2] - bbox[0] > width * safe or bbox[3] - bbox[1] > height * safe:
        raise RuntimeError(f"Adaptive foreground exceeds the central 66% safe zone: {bbox}")


adaptive = contain_mark(1024, 0.58)
mono = monochrome(1024)
assert_adaptive_safe_zone(adaptive)
assert_adaptive_safe_zone(mono)
save_png(full_icon(1024), ROOT / "assets" / "icon.png")
save_png(adaptive, ROOT / "assets" / "adaptive-icon.png")
save_png(mono, ROOT / "assets" / "adaptive-icon-monochrome.png")
save_png(full_icon(512), ROOT / "assets" / "branding" / "triplepoker-rise-play-store-512.png")

densities = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
foreground_sizes = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
for density, size in densities.items():
    folder = ROOT / "android" / "app" / "src" / "main" / "res" / f"mipmap-{density}"
    full_icon(size).save(folder / "ic_launcher.webp", "WEBP", quality=100, method=6)
    full_icon(size).save(folder / "ic_launcher_round.webp", "WEBP", quality=100, method=6)
    adaptive_size = foreground_sizes[density]
    contain_mark(adaptive_size, 0.58).save(folder / "ic_launcher_foreground.webp", "WEBP", lossless=True, method=6)
    monochrome(adaptive_size).save(folder / "ic_launcher_monochrome.webp", "WEBP", lossless=True, method=6)
