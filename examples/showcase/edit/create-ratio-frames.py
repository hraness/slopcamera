"""Regenerate self-contained SVG frames with retained OFL glyph outlines.

Run from the repository root with Python 3 and fontTools. Rendering the checked
SVG files does not require Python, fonts, or network access.
"""
from pathlib import Path
from hashlib import sha256
import json
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = Path(__file__).resolve().parents[3]
FONT = ROOT / 'src/assets/fonts/nebula-sans/NebulaSans-Book.otf'
font = TTFont(FONT)
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
units = font['head'].unitsPerEm
OUT = Path(__file__).with_name('ratio-frames')
OUT.mkdir(exist_ok=True)


def lettering(text, x, y, size, color='#eee8da', tracking=0):
    pen = SVGPathPen(glyphs)
    scale = size / units
    cursor = x
    for character in text:
        name = cmap[ord(character)]
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, cursor, y)))
        cursor += glyphs[name].width * scale + tracking
    return f'<path fill="{color}" d="{pen.getCommands()}"/>'


def frame(name, width, height, title, top_solid, top_clear, bottom_clear, bottom_solid, margin):
    ink = '#101923'
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-label="Optical study, brass, glass and graphite">',
        f'<defs><linearGradient id="top" x2="0" y2="1"><stop offset="{top_solid/top_clear:.6f}" stop-color="{ink}"/><stop offset="1" stop-color="{ink}" stop-opacity="0"/></linearGradient>',
        f'<linearGradient id="bottom" x2="0" y2="1"><stop stop-color="{ink}" stop-opacity="0"/><stop offset="{(bottom_solid-bottom_clear)/(height-bottom_clear):.6f}" stop-color="{ink}"/></linearGradient></defs>',
        f'<path fill="url(#top)" d="M0 0h{width}v{top_clear}H0z"/>',
        f'<path fill="url(#bottom)" d="M0 {bottom_clear}h{width}v{height-bottom_clear}H0z"/>',
        f'<path stroke="#bd9c62" stroke-width="2" d="M{margin} 42h32"/>',
        lettering('SLOPCAMERA   /   OBJECT STUDIES', margin + 48, 48, 14, '#c6b28a', 1.2)]
    for text, x, y, size in title:
        parts.append(lettering(text, x, y, size))
    footer = height - (100 if name == 'landscape' else 146)
    parts += [lettering('BRASS  /  GLASS  /  GRAPHITE', margin, footer, 15, '#c6b28a', 1.35),
        lettering('Form in motion.', margin, footer + 39, 27),
        f'<path stroke="#b7a47b" stroke-opacity=".4" d="M{margin} {height-58}H{width-margin}"/>',
        lettering('01', margin, height - 28, 15, '#c6b28a'),
        lettering({'landscape':'16:9', 'portrait':'9:16', 'square':'1:1', 'feed-portrait':'4:5'}[name], width-margin-40, height-28, 15, '#c6b28a'),
        '</svg>']
    (OUT / f'{name}.svg').write_text('\n'.join(parts) + '\n')


frame('landscape', 1280, 720, [('Optical study', 64, 118, 56)], 28, 190, 566, 684, 64)
frame('portrait', 720, 1280, [('Optical', 54, 174, 112), ('study', 54, 278, 112)], 318, 405, 880, 960, 54)
frame('square', 960, 960, [('Optical study', 56, 142, 92)], 150, 248, 734, 812, 56)
frame('feed-portrait', 864, 1080, [('Optical study', 54, 151, 84)], 230, 320, 792, 850, 54)
(OUT / 'provenance.json').write_text(json.dumps({
    'font': str(FONT.relative_to(ROOT)), 'fontSha256': sha256(FONT.read_bytes()).hexdigest(),
    'fontLicense': 'src/assets/fonts/nebula-sans/LICENSE.txt',
    'method': 'FontTools glyph outlines at explicit positions; SVGs contain paths and gradients only.',
    'files': [{'path': p.name, 'sha256': sha256(p.read_bytes()).hexdigest(), 'bytes': p.stat().st_size} for p in sorted(OUT.glob('*.svg'))],
}, indent=2) + '\n')
