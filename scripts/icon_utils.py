#!/usr/bin/env python3
import math
import struct
import zlib
import os
import subprocess

def create_svg():
    """Generate high-contrast, scalable SVG favicon with vector paths."""
    # We will build clean SVG paths for the crossed swords
    # A single vertical sword template centered around (0, 0)
    # y goes from -180 (tip) to +150 (pommel)
    # Crossing point is at y = -25 (so when crossed at (256, 256), the blades cross cleanly)
    
    svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <defs>
    <!-- Background Gradient -->
    <radialGradient id="bgGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#0f1923" />
      <stop offset="70%" stop-color="#0a0a0f" />
      <stop offset="100%" stop-color="#050508" />
    </radialGradient>

    <!-- Ring & Accent Gradient -->
    <linearGradient id="brandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00ff87" />
      <stop offset="50%" stop-color="#00e5ff" />
      <stop offset="100%" stop-color="#0077ff" />
    </linearGradient>

    <!-- Blade Highlight Gradient (Left / Lit Side) -->
    <linearGradient id="bladeLit" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="60%" stop-color="#e0fff5" />
      <stop offset="100%" stop-color="#99ffee" />
    </linearGradient>

    <!-- Blade Shadow Gradient (Right / Shaded Side) -->
    <linearGradient id="bladeShaded" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#73d9c7" />
      <stop offset="50%" stop-color="#4aa89c" />
      <stop offset="100%" stop-color="#21635b" />
    </linearGradient>

    <!-- Guard & Hilt Gradient -->
    <linearGradient id="hiltGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00ff87" />
      <stop offset="100%" stop-color="#0099ff" />
    </linearGradient>

    <!-- Glow Filter -->
    <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Badge Background -->
  <rect width="512" height="512" rx="110" fill="url(#bgGlow)" />
  <rect x="12" y="12" width="488" height="488" rx="100" fill="none" stroke="url(#brandGrad)" stroke-width="6" opacity="0.8" />
  <circle cx="256" cy="256" r="215" fill="none" stroke="url(#brandGrad)" stroke-width="2" stroke-dasharray="8 12" opacity="0.3" />

  <!-- Ambient Glow Behind Swords -->
  <circle cx="256" cy="256" r="120" fill="#00ff87" opacity="0.12" filter="url(#neonGlow)" />

  <!-- Single Sword Symbol Definition -->
  <g id="swords-group">
    <!-- Sword 1: Rotated -45deg (from bottom-left to top-right) -->
    <g transform="translate(256, 256) rotate(45)">
      <!-- Left side of blade (Lit) -->
      <path d="M 0,-175 L -16,-140 L -14,35 L 0,40 Z" fill="url(#bladeLit)" />
      <!-- Right side of blade (Shaded) -->
      <path d="M 0,-175 L 16,-140 L 14,35 L 0,40 Z" fill="url(#bladeShaded)" />
      <!-- Blade Center Spine / Fuller -->
      <line x1="0" y1="-170" x2="0" y2="35" stroke="#ffffff" stroke-width="2" opacity="0.9" />
      <!-- Crossguard -->
      <path d="M -44,38 C -44,38 -20,32 0,35 C 20,32 44,38 44,38 C 48,42 46,50 40,50 C 20,47 0,49 -40,50 C -46,50 -48,42 -44,38 Z" fill="url(#hiltGrad)" filter="url(#neonGlow)" />
      <circle cx="-42" cy="44" r="4" fill="#ffffff" />
      <circle cx="42" cy="44" r="4" fill="#ffffff" />
      <!-- Grip / Handle -->
      <rect x="-6" y="50" width="12" height="55" rx="3" fill="#182836" stroke="url(#hiltGrad)" stroke-width="2" />
      <!-- Grip Ribs -->
      <line x1="-5" y1="62" x2="5" y2="62" stroke="#00ff87" stroke-width="2" opacity="0.8" />
      <line x1="-5" y1="74" x2="5" y2="74" stroke="#00ff87" stroke-width="2" opacity="0.8" />
      <line x1="-5" y1="86" x2="5" y2="86" stroke="#00ff87" stroke-width="2" opacity="0.8" />
      <line x1="-5" y1="98" x2="5" y2="98" stroke="#00ff87" stroke-width="2" opacity="0.8" />
      <!-- Pommel -->
      <circle cx="0" cy="115" r="14" fill="url(#hiltGrad)" stroke="#ffffff" stroke-width="2" />
      <circle cx="0" cy="115" r="6" fill="#ffffff" />
    </g>

    <!-- Sword 2: Rotated 45deg (from bottom-right to top-left) -->
    <g transform="translate(256, 256) rotate(-45)">
      <!-- Left side of blade (Lit) -->
      <path d="M 0,-175 L -16,-140 L -14,35 L 0,40 Z" fill="url(#bladeLit)" />
      <!-- Right side of blade (Shaded) -->
      <path d="M 0,-175 L 16,-140 L 14,35 L 0,40 Z" fill="url(#bladeShaded)" />
      <!-- Blade Center Spine / Fuller -->
      <line x1="0" y1="-170" x2="0" y2="35" stroke="#ffffff" stroke-width="2" opacity="0.9" />
      <!-- Crossguard -->
      <path d="M -44,38 C -44,38 -20,32 0,35 C 20,32 44,38 44,38 C 48,42 46,50 40,50 C 20,47 0,49 -40,50 C -46,50 -48,42 -44,38 Z" fill="url(#hiltGrad)" filter="url(#neonGlow)" />
      <circle cx="-42" cy="44" r="4" fill="#ffffff" />
      <circle cx="42" cy="44" r="4" fill="#ffffff" />
      <!-- Grip / Handle -->
      <rect x="-6" y="50" width="12" height="55" rx="3" fill="#182836" stroke="url(#hiltGrad)" stroke-width="2" />
      <!-- Grip Ribs -->
      <line x1="-5" y1="62" x2="5" y2="62" stroke="#00ff87" stroke-width="2" opacity="0.8" />
      <line x1="-5" y1="74" x2="5" y2="74" stroke="#00ff87" stroke-width="2" opacity="0.8" />
      <line x1="-5" y1="86" x2="5" y2="86" stroke="#00ff87" stroke-width="2" opacity="0.8" />
      <line x1="-5" y1="98" x2="5" y2="98" stroke="#00ff87" stroke-width="2" opacity="0.8" />
      <!-- Pommel -->
      <circle cx="0" cy="115" r="14" fill="url(#hiltGrad)" stroke="#ffffff" stroke-width="2" />
      <circle cx="0" cy="115" r="6" fill="#ffffff" />
    </g>
  </g>

  <!-- Center Clashing Spark -->
  <circle cx="256" cy="256" r="10" fill="#ffffff" filter="url(#neonGlow)" />
  <circle cx="256" cy="256" r="4" fill="#00ff87" />
</svg>
'''
    return svg

def write_png(filename, width, height, rgba_data):
    """Write uncompressed / zlib compressed 32-bit RGBA PNG."""
    def chunk(tag, data):
        crc = zlib.crc32(tag + data) & 0xffffffff
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', crc)
    
    header = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
    raw_lines = bytearray()
    row_bytes = width * 4
    for y in range(height):
        raw_lines.append(0) # None filter
        raw_lines.extend(rgba_data[y * row_bytes : (y + 1) * row_bytes])
    idat = chunk(b'IDAT', zlib.compress(bytes(raw_lines), 9))
    iend = chunk(b'IEND', b'')
    with open(filename, 'wb') as f:
        f.write(header + ihdr + idat + iend)

def write_ico(filename, png_files):
    """Pack multiple PNG images into a standard .ico file."""
    # Read each png data
    png_entries = []
    for pfile in png_files:
        with open(pfile, 'rb') as f:
            data = f.read()
        w = int.from_bytes(data[16:20], 'big')
        h = int.from_bytes(data[20:24], 'big')
        png_entries.append((w, h, data))
    
    header = struct.pack('<HHH', 0, 1, len(png_entries))
    offset = 6 + 16 * len(png_entries)
    dir_entries = bytearray()
    body = bytearray()
    
    for w, h, data in png_entries:
        bw = 0 if w >= 256 else w
        bh = 0 if h >= 256 else h
        dir_entries.extend(struct.pack('<BBBBHHII', bw, bh, 0, 0, 1, 32, len(data), offset + len(body)))
        body.extend(data)
        
    with open(filename, 'wb') as f:
        f.write(header + dir_entries + body)

print("Helper ready.")
