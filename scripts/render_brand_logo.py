#!/usr/bin/env python3
import math
import time
import os
import sys

# Import our helper
sys.path.append(os.path.abspath('scripts'))
from icon_utils import write_png, write_ico, create_svg

def render_logo(size=512):
    """Render a pixel-perfect, anti-aliased 512x512 RGBA logo."""
    t0 = time.time()
    width = size
    height = size
    scale = size / 512.0
    
    # Precompute sword rotation constants
    cos45 = math.cos(math.pi / 4)
    sin45 = math.sin(math.pi / 4)
    
    # 2x2 supersampling coordinates
    sub_offsets = [(-0.25, -0.25), (0.25, -0.25), (-0.25, 0.25), (0.25, 0.25)]
    
    def sample_point(px, py):
        # Coordinates relative to center (256, 256)
        x = (px - width / 2.0) / scale
        y = (py - height / 2.0) / scale
        
        # 1. Check Background Squircle (rx=105, size=488)
        # Bounding box is [-244, 244]
        bx = max(abs(x) - 144.0, 0.0)
        by = max(abs(y) - 144.0, 0.0)
        dist_box = math.sqrt(bx * bx + by * by) - 100.0
        
        if dist_box > 0.5:
            # Outside badge
            return (0, 0, 0, 0)
        
        # Badge opacity anti-aliasing at outer edge
        badge_alpha = max(0.0, min(1.0, 0.5 - dist_box))
        
        # Border check (dist_box between -7 and 0)
        diag_t = (x + y + 512.0) / 1024.0
        diag_t = max(0.0, min(1.0, diag_t))
        # Gradient: #00ff87 -> #00aaff
        ring_r = int(0 * (1 - diag_t) + 0 * diag_t)
        ring_g = int(255 * (1 - diag_t) + 170 * diag_t)
        ring_b = int(135 * (1 - diag_t) + 255 * diag_t)
        
        if dist_box > -6.0:
            # We are on the stylish outer border
            border_alpha = max(0.0, min(1.0, (dist_box + 6.0) / 2.0))
            return (ring_r, ring_g, ring_b, int(255 * badge_alpha))
            
        # Subtle inner dashed/accent ring (radius ~ 215)
        dist_center = math.sqrt(x * x + y * y)
        
        # Background color: radial dark gradient (#121927 at center -> #0a0a0f at edge)
        center_t = min(1.0, dist_center / 240.0)
        bg_r = int(18 * (1 - center_t) + 10 * center_t)
        bg_g = int(26 * (1 - center_t) + 10 * center_t)
        bg_b = int(38 * (1 - center_t) + 15 * center_t)
        
        # Ambient central glow
        if dist_center < 140:
            glow_t = (1.0 - dist_center / 140.0) ** 1.5
            bg_r = min(255, int(bg_r + 0 * glow_t))
            bg_g = min(255, int(bg_g + 50 * glow_t))
            bg_b = min(255, int(bg_b + 40 * glow_t))
            
        # 2. Check Swords
        # Sword 1: rotated 45 deg
        # u: perpendicular, v: along blade (-175 tip to +125 pommel)
        def eval_sword(u, v):
            # Check Blade
            if -175 <= v <= 38:
                if v < -140:
                    half_w = 16.0 * (v - (-175.0)) / 35.0
                else:
                    half_w = 16.0 - 2.0 * (v - (-140.0)) / 178.0
                
                if abs(u) <= half_w:
                    # Center fuller line
                    if abs(u) <= 1.2:
                        return (255, 255, 255, 255)
                    # Lit side
                    if u < 0:
                        t = (u + half_w) / half_w # 0 at edge, 1 at center
                        # #99ffee -> #ffffff
                        r = int(160 * (1 - t) + 255 * t)
                        g = int(255 * (1 - t) + 255 * t)
                        b = int(240 * (1 - t) + 255 * t)
                        return (r, g, b, 255)
                    else: # Shaded side
                        t = (half_w - u) / half_w # 0 at edge, 1 at center
                        # #21635b -> #e0fff5
                        r = int(40 * (1 - t) + 224 * t)
                        g = int(120 * (1 - t) + 255 * t)
                        b = int(130 * (1 - t) + 245 * t)
                        return (r, g, b, 255)
            
            # Crossguard: v in [35, 50], u in [-46, 46]
            if 34 <= v <= 50 and abs(u) <= 46:
                # Guard shape has curved taper
                guard_w = 46.0 if v >= 40 else 44.0
                if abs(u) <= guard_w:
                    # Tips: balls at +/- 42
                    if abs(abs(u) - 42) <= 3.5:
                        return (255, 255, 255, 255)
                    gt = (u + 46) / 92.0
                    r = int(0 * (1 - gt) + 0 * gt)
                    g = int(255 * (1 - gt) + 180 * gt)
                    b = int(135 * (1 - gt) + 255 * gt)
                    return (r, g, b, 255)
            
            # Grip: v in [50, 105], u in [-6, 6]
            if 50 < v <= 104 and abs(u) <= 6.5:
                # Ribs
                if any(abs(v - rib_y) <= 1.2 for rib_y in [62, 74, 86, 98]):
                    return (0, 255, 135, 255)
                return (24, 40, 54, 255)
                
            # Pommel: circle centered at (0, 116), radius 14
            dp = math.sqrt(u * u + (v - 116) * (v - 116))
            if dp <= 14.5:
                if dp <= 5.5:
                    return (255, 255, 255, 255)
                return (0, 220, 210, 255)
                
            return None

        # Transform to Sword 1 (rotated 45 deg)
        u1 = (x * cos45 + y * sin45)
        v1 = (-x * sin45 + y * cos45)
        
        # Transform to Sword 2 (rotated -45 deg)
        u2 = (x * cos45 - y * sin45)
        v2 = (x * sin45 + y * cos45)
        
        # Evaluate Sword 1
        s1 = eval_sword(u1, v1)
        # Evaluate Sword 2
        s2 = eval_sword(u2, v2)
        
        # Clashing spark in center
        if dist_center <= 6.0:
            return (255, 255, 255, 255)
        elif dist_center <= 10.0:
            return (0, 255, 135, 255)
            
        if s1 and s2:
            # Overlap: blend or pick foreground
            return s1
        elif s1:
            return s1
        elif s2:
            return s2
            
        return (bg_r, bg_g, bg_b, int(255 * badge_alpha))

    # Render pixels with 2x2 supersampling for buttery smoothness
    raw_rgba = bytearray(width * height * 4)
    idx = 0
    for py in range(height):
        for px in range(width):
            r_acc, g_acc, b_acc, a_acc = 0, 0, 0, 0
            for ox, oy in sub_offsets:
                sr, sg, sb, sa = sample_point(px + ox, py + oy)
                r_acc += sr * (sa / 255.0)
                g_acc += sg * (sa / 255.0)
                b_acc += sb * (sa / 255.0)
                a_acc += sa
            a_final = a_acc / 4.0
            if a_final > 0:
                raw_rgba[idx] = int(min(255, r_acc / 4.0 / (a_final / 255.0)))
                raw_rgba[idx+1] = int(min(255, g_acc / 4.0 / (a_final / 255.0)))
                raw_rgba[idx+2] = int(min(255, b_acc / 4.0 / (a_final / 255.0)))
                raw_rgba[idx+3] = int(min(255, a_final))
            else:
                raw_rgba[idx] = 0
                raw_rgba[idx+1] = 0
                raw_rgba[idx+2] = 0
                raw_rgba[idx+3] = 0
            idx += 4

    print(f"Rendered {width}x{height} in {time.time() - t0:.2f}s")
    return raw_rgba

if __name__ == '__main__':
    rgba512 = render_logo(512)
    os.makedirs('frontend/public', exist_ok=True)
    
    # Save master 512
    write_png('frontend/public/logo512.png', 512, 512, rgba512)
    print("Wrote logo512.png")
    
    # Also write favicon.svg
    svg_content = create_svg()
    with open('frontend/public/favicon.svg', 'w') as f:
        f.write(svg_content)
    print("Wrote favicon.svg")
