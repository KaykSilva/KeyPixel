#!/usr/bin/env python3
"""
KeyPixel GIF Converter & Optimizer for ESP32 ST7789 (240x240)
Converte GIFs pesados (>1MB, alta resolucao ou muitos frames)
em GIFs ultraleves perfeitamente compativeis com a RAM da ESP32-C3.
"""

import sys
import os
import argparse
from PIL import Image, ImageSequence, ImageOps

TARGET_SIZE = (240, 240)

def optimize_gif(input_path, output_path=None, max_fps=15, colors=128, crop_mode="cover"):
    if not os.path.exists(input_path):
        print(f"Erro: Arquivo '{input_path}' nao encontrado.")
        sys.exit(1)

    if not output_path:
        base, _ = os.path.splitext(input_path)
        output_path = f"{base}_240x240.gif"

    orig_size_bytes = os.path.getsize(input_path)
    print(f"\n📂 Processando: {input_path}")
    print(f"   Tamanho original: {orig_size_bytes / 1024:.1f} KB ({orig_size_bytes / (1024*1024):.2f} MB)")

    img = Image.open(input_path)
    frames = []
    durations = []

    # Get frame info
    orig_w, orig_h = img.size
    print(f"   Resolucao original: {orig_w}x{orig_h}")

    total_frames = getattr(img, "n_frames", 1)
    print(f"   Total de quadros: {total_frames}")

    # Determine frame step to limit FPS
    # Standard frame duration in ms
    orig_duration = img.info.get("duration", 40)
    if orig_duration <= 0:
        orig_duration = 40
    
    orig_fps = 1000.0 / orig_duration
    step = 1
    if orig_fps > max_fps:
        step = max(1, round(orig_fps / max_fps))
        print(f"   Limitando FPS de {orig_fps:.1f} para ~{orig_fps/step:.1f} (passo = {step})")

    frame_idx = 0
    for frame in ImageSequence.Iterator(img):
        if frame_idx % step == 0:
            # Convert to RGBA
            rgba_frame = frame.convert("RGBA")

            # Resize to 240x240
            if crop_mode == "cover":
                # Scale keeping aspect ratio then crop center
                scale = max(240.0 / rgba_frame.width, 240.0 / rgba_frame.height)
                new_w = int(rgba_frame.width * scale)
                new_h = int(rgba_frame.height * scale)
                resized = rgba_frame.resize((new_w, new_h), Image.Resampling.LANCZOS)
                
                left = (new_w - 240) // 2
                top = (new_h - 240) // 2
                cropped = resized.crop((left, top, left + 240, top + 240))
            elif crop_mode == "contain":
                resized = ImageOps.pad(rgba_frame, TARGET_SIZE, color=(0, 0, 0, 255), method=Image.Resampling.LANCZOS)
                cropped = resized
            else:
                # Stretch
                cropped = rgba_frame.resize(TARGET_SIZE, Image.Resampling.LANCZOS)

            # Convert to RGB with black background if transparent
            bg = Image.new("RGB", TARGET_SIZE, (0, 0, 0))
            bg.paste(cropped, mask=cropped.split()[3]) # 3 is alpha

            # Quantize palette
            quantized = bg.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)
            frames.append(quantized)
            durations.append(orig_duration * step)

        frame_idx += 1

    if not frames:
        print("Erro: Nenhum quadro extraido.")
        sys.exit(1)

    print(f"   Quadros finais otimizados: {len(frames)}")

    # Save animated GIF
    frames[0].save(
        output_path,
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=0,
        optimize=True,
        disposal=2
    )

    new_size_bytes = os.path.getsize(output_path)
    reduction = (1 - (new_size_bytes / orig_size_bytes)) * 100
    print(f"\n✅ GIF Otimizado com Sucesso!")
    print(f"   Destino: {output_path}")
    print(f"   Novo tamanho: {new_size_bytes / 1024:.1f} KB ({new_size_bytes / (1024*1024):.2f} MB)")
    print(f"   Reducao de tamanho: {reduction:.1f}%")
    print(f"   Pronto para rodar suave na ESP32!\n")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Otimizador de GIF para ESP32 240x240")
    parser.add_argument("input", help="Caminho do GIF original pesado")
    parser.add_argument("-o", "--output", help="Caminho de saida (opcional)")
    parser.add_argument("--fps", type=int, default=14, help="FPS maximo (padrao: 14)")
    parser.add_argument("--colors", type=int, default=128, help="Numero de cores da paleta (64, 128, 256)")
    parser.add_argument("--crop", choices=["cover", "contain", "stretch"], default="cover", help="Modo de enquadramento")

    args = parser.parse_args()
    optimize_gif(args.input, args.output, args.fps, args.colors, args.crop)
