#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/process_review_image.py
GoldLab&co Customer Review Photo Optimization & Security Pipeline
- Magic byte validation (JPEG, PNG, WebP)
- Strict file size check (<= 10MB)
- EXIF & GPS location metadata removal
- Auto-orientation correction based on EXIF Transpose
- Maximum long-edge 1,600px high-fidelity downsampling
- WebP conversion & optimization
"""

import sys
import os
import json
from PIL import Image, ImageOps

MAX_ORIGINAL_SIZE_BYTES = 10 * 1024 * 1024  # 10MB
MAX_LONG_EDGE_PX = 1600

def validate_magic_bytes(filepath):
    """Ensure the file is truly a valid JPEG, PNG, or WebP image by inspecting binary headers."""
    with open(filepath, 'rb') as f:
        header = f.read(16)
        if len(header) < 12:
            return False, "파일 크기가 너무 작아 유효한 이미지가 아닙니다."

        # JPEG: FF D8 FF
        if header.startswith(b'\xff\xd8\xff'):
            return True, "image/jpeg"

        # PNG: 89 50 4E 47 0D 0A 1A 0A
        if header.startswith(b'\x89PNG\r\n\x1a\n'):
            return True, "image/png"

        # WebP: 'RIFF' .... 'WEBP'
        if header.startswith(b'RIFF') and header[8:12] == b'WEBP':
            return True, "image/webp"

    return False, "지원되지 않는 이미지 포맷입니다. (JPG, PNG, WebP만 허용)"

def process_image(input_path, output_path):
    if not os.path.exists(input_path):
        return {"success": False, "error": f"입력 파일이 존재하지 않습니다: {input_path}"}

    file_size = os.path.getsize(input_path)
    if file_size > MAX_ORIGINAL_SIZE_BYTES:
        return {"success": False, "error": f"파일 용량이 10MB를 초과했습니다. (현재: {file_size / (1024*1024):.2f}MB)"}

    # 1. Binary Magic Bytes Validation
    is_valid, mime_or_err = validate_magic_bytes(input_path)
    if not is_valid:
        return {"success": False, "error": mime_or_err}

    # 2. Open & Process with Pillow
    try:
        with Image.open(input_path) as img:
            # Transpose orientation based on EXIF tag before stripping
            try:
                img = ImageOps.exif_transpose(img)
            except Exception:
                pass  # Keep original if orientation tag is absent or invalid

            # Color mode normalization
            if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
                img = img.convert('RGBA')
            elif img.mode != 'RGB':
                img = img.convert('RGB')

            # Max Long-Edge 1,600px Resizing (maintains aspect ratio)
            orig_w, orig_h = img.size
            if max(orig_w, orig_h) > MAX_LONG_EDGE_PX:
                img.thumbnail((MAX_LONG_EDGE_PX, MAX_LONG_EDGE_PX), Image.Resampling.LANCZOS)

            final_w, final_h = img.size

            # Ensure parent output directory exists
            out_dir = os.path.dirname(os.path.abspath(output_path))
            if out_dir and not os.path.exists(out_dir):
                os.makedirs(out_dir, exist_ok=True)

            # 3. Save as clean WebP with EXIF metadata completely stripped
            # Pillow by default does NOT write EXIF unless explicitly passed in `exif=...`
            img.save(output_path, format="WEBP", quality=85, method=6)

        out_size = os.path.getsize(output_path)
        return {
            "success": True,
            "original_size": file_size,
            "processed_size": out_size,
            "width": final_w,
            "height": final_h,
            "format": "webp",
            "output_path": output_path
        }
    except Exception as e:
        return {"success": False, "error": f"이미지 처리 중 오류 발생: {str(e)}"}

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(json.dumps({"success": False, "error": "Usage: process_review_image.py <input_path> <output_path>"}, ensure_ascii=False))
        sys.exit(1)

    inp = sys.argv[1]
    out = sys.argv[2]
    res = process_image(inp, out)
    print(json.dumps(res, ensure_ascii=False))
    if not res["success"]:
        sys.exit(1)
