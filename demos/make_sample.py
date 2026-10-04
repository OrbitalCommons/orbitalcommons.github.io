"""Create a deterministic synthetic 16-bit FITS image for the browser workbench."""
from pathlib import Path
import math
import random
import struct

rng = random.Random(421)
size = 256
stars = [(rng.uniform(8, 248), rng.uniform(8, 248), rng.uniform(1000, 22000), rng.uniform(.65, 1.9)) for _ in range(65)]
cards = [
    "SIMPLE  =                    T / conforms to FITS standard",
    "BITPIX  =                   16 / signed 16-bit pixels",
    "NAXIS   =                    2 / two-dimensional image",
    "NAXIS1  =                  256 / image width",
    "NAXIS2  =                  256 / image height",
    "EXTEND  =                    T / extensions may follow",
    "OBJECT  = 'Synthetic star field' / generated example, not an observation",
    "ORIGIN  = 'OrbitalCommons'     / https://orbitalcommons.github.io",
    "BUNIT   = 'arbitrary'          / simulated signal",
    "COMMENT Deterministic Gaussian point sources with synthetic background.",
    "END",
]
header = b''.join(card.ljust(80).encode('ascii') for card in cards)
header += b' ' * (-len(header) % 2880)
pixels = bytearray()
for y in range(size):
    for x in range(size):
        value = 120 + rng.gauss(0, 9) + 280 * math.exp(-((x-135)**2/2500 + (y-145)**2/950))
        for sx, sy, brightness, sigma in stars:
            d2 = (x-sx)**2 + (y-sy)**2
            if d2 < 120:
                value += brightness * math.exp(-d2/(2*sigma*sigma))
        pixels.extend(struct.pack('>h', round(min(32767, max(-32768, value)))))
pixels += b'\0' * (-len(pixels) % 2880)
path = Path(__file__).resolve().parents[1] / 'projects/fitsio-pure/sample.fits'
path.write_bytes(header + pixels)
print(f'Wrote {path.name}: {path.stat().st_size:,} bytes')
