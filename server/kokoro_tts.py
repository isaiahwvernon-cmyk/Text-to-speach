#!/usr/bin/env python3
"""
Kokoro TTS helper script for IV VoxNova.
Usage: python3 kokoro_tts.py --text "Hello world" --output /tmp/out.wav --speed 1.0
"""

import argparse
import sys

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--text", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--speed", type=float, default=1.0)
    parser.add_argument("--pitch", type=float, default=1.0)
    args = parser.parse_args()

    try:
        from kokoro import KPipeline
        import soundfile as sf
        import numpy as np

        pipeline = KPipeline(lang_code="a")  # 'a' = American English

        generator = pipeline(args.text, voice="af_heart", speed=args.speed)

        all_audio = []
        for _, _, audio in generator:
            all_audio.append(audio)

        if not all_audio:
            print("No audio generated", file=sys.stderr)
            sys.exit(1)

        combined = np.concatenate(all_audio)
        sf.write(args.output, combined, 24000)
        print("ok")

    except ImportError as e:
        print(f"Missing dependency: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"TTS error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
