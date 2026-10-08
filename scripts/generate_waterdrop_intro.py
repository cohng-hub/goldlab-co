import os
import sys
import time
import math
import subprocess
import shutil
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.io import wavfile

def main():
    print("=== [Clock_K] YouTube Long-Form Waterdrop Intro Generator ===")
    start_time = time.time()

    width = 1920
    height = 1080
    fps = 60
    duration = 3.5
    total_frames = int(fps * duration)
    sample_rate = 48000

    frames_dir = "scratch/frames"
    if os.path.exists(frames_dir):
        shutil.rmtree(frames_dir)
    os.makedirs(frames_dir, exist_ok=True)
    os.makedirs("assets", exist_ok=True)
    os.makedirs("scratch", exist_ok=True)

    # --------------------------------------------------------------------------
    # 1. Generate Studio-Quality Procedural Audio
    # --------------------------------------------------------------------------
    print("1. Synthesizing high-fidelity water droplet pop & sparkle audio...")
    t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
    audio = np.zeros_like(t)

    pop_t = 0.55

    # 1-1. Anticipation suction / whoosh before pop (t: 0.15 to 0.54)
    w_mask = (t >= 0.15) & (t < pop_t)
    tw = (t[w_mask] - 0.15) / (pop_t - 0.15)
    noise = np.random.normal(0, 1, np.sum(w_mask))
    whoosh = noise * (tw ** 2.5) * np.sin(2 * np.pi * (120 + 350 * tw) * t[w_mask])
    audio[w_mask] += whoosh * 0.16

    # 1-2. Main Water Droplet Bubble Pop ('퐁! / 뽁!') at t = 0.55s
    p_mask = (t >= pop_t) & (t < pop_t + 0.38)
    tp = t[p_mask] - pop_t
    sweep_freq = 480 + 1300 * (1.0 - np.exp(-tp / 0.038))
    phase = 2 * np.pi * np.cumsum(sweep_freq) / sample_rate
    bubble_main = np.sin(phase) * np.exp(-tp / 0.055)
    bubble_harm = 0.45 * np.sin(2 * phase) * np.exp(-tp / 0.035)
    thump = np.sin(2 * np.pi * 85 * tp) * np.exp(-tp / 0.03) * 0.85
    audio[p_mask] += (bubble_main + bubble_harm + thump) * 0.78

    # 1-3. Splattering micro water droplets (t: 0.58 to 0.88)
    splashes = [
        (0.025, 1450, 0.22),
        (0.055, 1900, 0.18),
        (0.095, 2300, 0.16),
        (0.135, 1650, 0.14),
        (0.185, 2600, 0.11),
        (0.240, 1950, 0.09),
    ]
    for dt, f_drop, vol in splashes:
        t0 = pop_t + dt
        m = (t >= t0) & (t < t0 + 0.09)
        tp_s = t[m] - t0
        f_sw = f_drop + 700 * (1.0 - np.exp(-tp_s / 0.015))
        ph = 2 * np.pi * np.cumsum(f_sw) / sample_rate
        audio[m] += np.sin(ph) * np.exp(-tp_s / 0.022) * vol

    # 1-4. Shimmering Golden Crystal Chimes (t: 1.25 to 2.85)
    chimes = [
        (1.28, 1568, 0.13), # G6
        (1.42, 1760, 0.14), # A6
        (1.58, 2093, 0.16), # C7
        (1.75, 2349, 0.15), # D7
        (1.95, 2793, 0.13), # F7
        (2.15, 3136, 0.12), # G7
        (2.40, 3520, 0.10), # A7
    ]
    for ct, cf, vol in chimes:
        m = (t >= ct) & (t < ct + 0.85)
        tp_c = t[m] - ct
        bell = (np.sin(2 * np.pi * cf * tp_c) 
                + 0.35 * np.sin(2 * np.pi * cf * 2 * tp_c)
                + 0.18 * np.sin(2 * np.pi * cf * 3 * tp_c)
                + 0.08 * np.sin(2 * np.pi * cf * 4.2 * tp_c))
        bell *= np.exp(-tp_c / 0.28) * (1.0 - np.exp(-tp_c / 0.006))
        audio[m] += bell * vol

    # 1-5. Warm golden ambient pad / sub swell
    pad = np.sin(2 * np.pi * 110 * t) * (1.0 - np.exp(-t / 0.6)) * np.exp(-np.maximum(0, t - 2.8) / 0.5)
    audio += pad * 0.06

    max_val = np.max(np.abs(audio))
    if max_val > 0:
        audio = audio / max_val * 0.94
    audio_int16 = (audio * 32767).astype(np.int16)
    audio_path = "scratch/intro_audio.wav"
    wavfile.write(audio_path, sample_rate, audio_int16)
    print(f"   -> Audio generated: {audio_path}")

    # --------------------------------------------------------------------------
    # 2. Prepare Graphic Assets
    # --------------------------------------------------------------------------
    print("2. Preparing visual layers & background...")
    cutout_path = "assets/clock_k_clean_cutout.png"
    if not os.path.exists(cutout_path):
        raise FileNotFoundError(f"Missing {cutout_path}")
    fg_orig = Image.open(cutout_path).convert("RGBA")
    fg_w, fg_h = fg_orig.size

    target_scale = 750.0 / fg_h
    base_w = int(fg_w * target_scale)
    base_h = int(fg_h * target_scale)
    fg_base = fg_orig.resize((base_w, base_h), Image.Resampling.LANCZOS)

    # Pre-render Background: Luxurious deep dark-gold radial vignette
    bg_arr = np.zeros((height, width, 3), dtype=np.float32)
    y_coords, x_coords = np.ogrid[:height, :width]
    cx, cy = 960.0, 500.0
    dist_norm = np.sqrt(((x_coords - cx) / (width * 0.55)) ** 2 + ((y_coords - cy) / (height * 0.55)) ** 2)
    dist_clamped = np.clip(dist_norm, 0.0, 1.4)

    c_center = np.array([36.0, 28.0, 10.0])
    c_edge = np.array([5.0, 5.0, 3.0])
    factor = np.clip(dist_clamped / 1.15, 0.0, 1.0)[:, :, np.newaxis]
    bg_arr = c_center * (1.0 - factor) + c_edge * factor
    bg_base_img = Image.fromarray(np.clip(bg_arr, 0, 255).astype(np.uint8), mode="RGB")

    # 40 Floating ambient golden bokeh particles
    np.random.seed(42)
    bokeh_particles = []
    for _ in range(40):
        bx = np.random.uniform(100, width - 100)
        by = np.random.uniform(100, height - 100)
        br = np.random.uniform(2.0, 6.0)
        b_speed = np.random.uniform(15.0, 35.0)
        b_alpha = np.random.uniform(0.15, 0.45)
        bokeh_particles.append({
            "x": bx, "y": by, "r": br, "speed": b_speed, "alpha": b_alpha, "phase": np.random.uniform(0, math.pi * 2)
        })

    # Water splash particle seeds (32 droplets)
    splash_particles = []
    for i in range(32):
        angle = (i / 32.0) * math.pi * 2 + np.random.uniform(-0.1, 0.1)
        speed = np.random.uniform(320.0, 780.0)
        vx = math.cos(angle) * speed
        vy = math.sin(angle) * speed - 150.0
        size = np.random.uniform(4.0, 11.0)
        splash_particles.append({
            "vx": vx, "vy": vy, "size": size, "angle": angle
        })

    flare_defs = [
        {"rel_x": 0.20, "rel_y": 0.25, "peak_t": 1.45, "color": (255, 235, 140)},
        {"rel_x": 0.10, "rel_y": 0.58, "peak_t": 1.70, "color": (255, 245, 180)},
        {"rel_x": 0.85, "rel_y": 0.38, "peak_t": 1.95, "color": (255, 230, 130)},
        {"rel_x": 0.92, "rel_y": 0.65, "peak_t": 2.20, "color": (255, 240, 170)},
        {"rel_x": 0.50, "rel_y": 0.85, "peak_t": 2.45, "color": (255, 255, 210)},
    ]

    # --------------------------------------------------------------------------
    # 3. Render Animation Frames to Disk
    # --------------------------------------------------------------------------
    print(f"3. Rendering {total_frames} frames to {frames_dir}...")
    floor_cx = 960
    floor_cy = 540

    for frame_idx in range(total_frames):
        cur_t = frame_idx / float(fps)

        frame_img = bg_base_img.copy()
        draw = ImageDraw.Draw(frame_img, "RGBA")

        # Bokeh dust
        for bp in bokeh_particles:
            by = (bp["y"] - bp["speed"] * cur_t) % (height + 40) - 20
            bx = bp["x"] + math.sin(cur_t * 1.5 + bp["phase"]) * 15.0
            alpha = int(bp["alpha"] * 255 * (0.7 + 0.3 * math.sin(cur_t * 3.0 + bp["phase"])))
            draw.ellipse([bx - bp["r"], by - bp["r"], bx + bp["r"], by + bp["r"]],
                         fill=(230, 195, 90, alpha))

        # PHASE 1: Droplet falling
        if cur_t < 0.55:
            t_fall = cur_t / 0.46
            if t_fall <= 1.0:
                drop_y = -60.0 + (540.0 - (-60.0)) * (t_fall ** 2.2)
                drop_w = 22.0
                drop_h = 36.0
                draw.ellipse([floor_cx - drop_w - 6, drop_y - drop_h - 6, floor_cx + drop_w + 6, drop_y + drop_h + 6],
                             fill=(255, 215, 80, 50))
                draw.ellipse([floor_cx - drop_w, drop_y - drop_h, floor_cx + drop_w, drop_y + drop_h],
                             fill=(245, 190, 45, 220), outline=(255, 240, 160, 255), width=2)
                draw.ellipse([floor_cx - 6, drop_y - drop_h + 8, floor_cx + 2, drop_y - drop_h + 18],
                             fill=(255, 255, 255, 240))
            else:
                t_impact = (cur_t - 0.46) / (0.55 - 0.46)
                squash_w = 22.0 + 55.0 * t_impact
                squash_h = max(5.0, 36.0 * (1.0 - t_impact * 0.8))
                draw.ellipse([floor_cx - squash_w, floor_cy - squash_h, floor_cx + squash_w, floor_cy + squash_h],
                             fill=(255, 205, 55, int(240 * (1.0 - t_impact * 0.3))),
                             outline=(255, 255, 200, 255), width=2)
                r_rad = t_impact * 90.0
                r_alpha = int(180 * (1.0 - t_impact))
                draw.ellipse([floor_cx - r_rad * 1.8, floor_cy - r_rad * 0.6, floor_cx + r_rad * 1.8, floor_cy + r_rad * 0.6],
                             outline=(245, 210, 80, r_alpha), width=2)

        # PHASE 2: Water Ripple Waves
        if cur_t >= 0.55:
            dt_pop = cur_t - 0.55
            for wave_idx, delay in enumerate([0.0, 0.08, 0.17]):
                w_t = dt_pop - delay
                if 0.0 <= w_t < 1.1:
                    w_progress = w_t / 1.1
                    rw = 40.0 + 650.0 * (w_progress ** 0.8)
                    rh = rw * 0.38
                    w_alpha = int(220 * (1.0 - w_progress) ** 1.5)
                    w_width = max(1, int(3.5 * (1.0 - w_progress * 0.7)))
                    draw.ellipse([floor_cx - rw, floor_cy - rh, floor_cx + rw, floor_cy + rh],
                                 outline=(255, 220, 100, w_alpha), width=w_width)

        # Splash Water Droplets
        if cur_t >= 0.55:
            dt_s = cur_t - 0.55
            if dt_s < 0.85:
                s_prog = dt_s / 0.85
                for p in splash_particles:
                    px = floor_cx + p["vx"] * dt_s * (0.85 ** (dt_s * 5))
                    py = floor_cy + p["vy"] * dt_s + 0.5 * 1100.0 * (dt_s ** 2)
                    p_size = p["size"] * (1.0 - s_prog * 0.7)
                    p_alpha = int(240 * (1.0 - s_prog ** 1.8))
                    if 0 <= px < width and 0 <= py < height and p_size > 0.5:
                        draw.ellipse([px - p_size, py - p_size, px + p_size, py + p_size],
                                     fill=(255, 230, 110, p_alpha), outline=(255, 255, 210, p_alpha), width=1)

        # Main Subject POP-OUT
        if cur_t >= 0.55:
            dt_obj = cur_t - 0.55
            zeta = 0.46
            omega = 15.5
            omega_d = omega * math.sqrt(1.0 - zeta * zeta)
            env = math.exp(-zeta * omega * dt_obj)
            spring_val = 1.0 - env * (math.cos(omega_d * dt_obj) + (zeta * omega / omega_d) * math.sin(omega_d * dt_obj))
            
            float_y = 0.0
            if dt_obj > 0.7:
                float_y = math.sin((dt_obj - 0.7) * 2.8) * 4.0
                spring_val += math.sin((dt_obj - 0.7) * 2.8) * 0.008

            cur_scale = max(0.001, spring_val)
            alpha_obj = min(1.0, dt_obj / 0.12)

            cur_w = int(base_w * cur_scale)
            cur_h = int(base_h * cur_scale)

            if cur_w > 4 and cur_h > 4:
                resized_fg = fg_base.resize((cur_w, cur_h), Image.Resampling.BILINEAR)
                paste_x = int((width - cur_w) / 2.0)
                paste_y = int((height - cur_h) / 2.0 + float_y)

                if alpha_obj < 1.0:
                    r_arr = np.array(resized_fg)
                    r_arr[:, :, 3] = (r_arr[:, :, 3].astype(np.float32) * alpha_obj).astype(np.uint8)
                    resized_fg = Image.fromarray(r_arr, mode="RGBA")

                # Light Sheen Sweep
                if 1.35 <= cur_t <= 2.45:
                    sweep_prog = (cur_t - 1.35) / (2.45 - 1.35)
                    glint_x = -150.0 + (cur_w + 300.0) * sweep_prog
                    band_w = cur_w * 0.22

                    fg_np = np.array(resized_fg, dtype=np.float32)
                    alpha_chan = fg_np[:, :, 3] / 255.0

                    yy, xx = np.ogrid[:cur_h, :cur_w]
                    x_dist = np.abs(xx - (glint_x - (yy - cur_h * 0.5) * 0.4))
                    glint_intensity = np.clip(1.0 - (x_dist / band_w), 0.0, 1.0) ** 2.0
                    glint_val = glint_intensity * alpha_chan * 130.0

                    fg_np[:, :, 0] = np.clip(fg_np[:, :, 0] + glint_val * 1.0, 0, 255)
                    fg_np[:, :, 1] = np.clip(fg_np[:, :, 1] + glint_val * 0.95, 0, 255)
                    fg_np[:, :, 2] = np.clip(fg_np[:, :, 2] + glint_val * 0.70, 0, 255)
                    resized_fg = Image.fromarray(fg_np.astype(np.uint8), mode="RGBA")

                frame_img.paste(resized_fg, (paste_x, paste_y), resized_fg)

                # Star Sparkle Cross Flares
                draw_stars = ImageDraw.Draw(frame_img, "RGBA")
                for fd in flare_defs:
                    dt_f = cur_t - fd["peak_t"]
                    if abs(dt_f) < 0.22:
                        flare_strength = 1.0 - abs(dt_f) / 0.22
                        fx = paste_x + cur_w * fd["rel_x"]
                        fy = paste_y + cur_h * fd["rel_y"]
                        f_len = 35.0 * flare_strength
                        f_col = (*fd["color"], int(255 * flare_strength))
                        draw_stars.line([fx - f_len, fy, fx + f_len, fy], fill=f_col, width=3)
                        draw_stars.line([fx, fy - f_len, fx, fy + f_len], fill=f_col, width=3)
                        draw_stars.ellipse([fx - 4, fy - 4, fx + 4, fy + 4], fill=(255, 255, 255, int(255 * flare_strength)))

        # Save frame to disk
        frame_filename = os.path.join(frames_dir, f"frame_{frame_idx:04d}.jpg")
        frame_img.save(frame_filename, "JPEG", quality=95)

        if (frame_idx + 1) % 50 == 0 or frame_idx == total_frames - 1:
            print(f"   -> Rendered frame {frame_idx + 1}/{total_frames} ({int((frame_idx+1)/total_frames*100)}%)")

    # --------------------------------------------------------------------------
    # 4. Encode Video with FFmpeg
    # --------------------------------------------------------------------------
    out_mp4 = "assets/youtube_intro_clock_k.mp4"
    print(f"4. Encoding video with FFmpeg to {out_mp4}...")
    ffmpeg_encode_cmd = [
        "ffmpeg", "-y",
        "-framerate", str(fps),
        "-i", f"{frames_dir}/frame_%04d.jpg",
        "-i", audio_path,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "17",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "320k",
        "-shortest",
        out_mp4
    ]
    subprocess.run(ffmpeg_encode_cmd, check=True)

    root_mp4 = "youtube_intro_clock_k.mp4"
    shutil.copyfile(out_mp4, root_mp4)

    # Clean up frames
    try:
        shutil.rmtree(frames_dir)
    except Exception:
        pass

    total_time = time.time() - start_time
    file_size_mb = os.path.getsize(out_mp4) / (1024 * 1024)
    print(f"\n=======================================================")
    print(f"🎉 YouTube Long-Form Intro Video Successfully Created!")
    print(f"📁 Video Path: {os.path.abspath(out_mp4)}")
    print(f"📁 Root Copy:   {os.path.abspath(root_mp4)}")
    print(f"⏱️ Duration:    {duration} seconds (1920x1080 @ 60 FPS)")
    print(f"📦 File Size:   {file_size_mb:.2f} MB")
    print(f"⚡ Total Time:  {total_time:.1f} seconds")
    print(f"=======================================================")

if __name__ == "__main__":
    main()
