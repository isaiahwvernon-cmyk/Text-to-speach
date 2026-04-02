#!/usr/bin/env python3
"""
Kokoro TTS helper for IV VoxNova.
Supports bilingual announcements: generates primary + optional secondary audio
separated by a configurable silence, then writes a single WAV file.

Usage:
  python3 kokoro_tts.py --text "Hello" --output /tmp/out.wav
  python3 kokoro_tts.py --text "Hello" --lang en-us \
      --second-text "Bonjour" --second-lang fr --pause-ms 700 \
      --output /tmp/out.wav
"""

import argparse
import sys

SAMPLE_RATE = 24000

LANGUAGE_CONFIGS = {
    "en-us": {"lang_code": "a", "voice": "af_heart"},
    "en-gb": {"lang_code": "b", "voice": "bf_emma"},
    "fr":    {"lang_code": "f", "voice": "ff_siwis"},
    "es":    {"lang_code": "e", "voice": "ef_dora"},
    "ja":    {"lang_code": "j", "voice": "jf_alpha"},
    "zh":    {"lang_code": "z", "voice": "zf_xiaobei"},
    "ko":    {"lang_code": "k", "voice": "kf_alpha"},
    "pt":    {"lang_code": "p", "voice": "pf_dora"},
    "hi":    {"lang_code": "h", "voice": "hf_alpha"},
    "it":    {"lang_code": "i", "voice": "if_sara"},
}


def generate_clip(pipeline_cache, text, lang_key, speed):
    """Generate audio numpy array for the given language and text."""
    from kokoro import KPipeline
    import numpy as np

    cfg = LANGUAGE_CONFIGS.get(lang_key, LANGUAGE_CONFIGS["en-us"])
    lang_code = cfg["lang_code"]
    voice = cfg["voice"]

    if lang_code not in pipeline_cache:
        pipeline_cache[lang_code] = KPipeline(lang_code=lang_code)

    pipeline = pipeline_cache[lang_code]
    all_audio = []
    for _, _, audio in pipeline(text, voice=voice, speed=speed):
        all_audio.append(audio)

    if not all_audio:
        raise RuntimeError(f"No audio generated for lang={lang_key}")

    return np.concatenate(all_audio)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--text", required=True, help="Primary announcement text")
    parser.add_argument("--output", required=True, help="Output WAV path")
    parser.add_argument("--speed", type=float, default=1.0)
    parser.add_argument("--pitch", type=float, default=1.0)
    parser.add_argument("--lang", default="en-us", help="Primary language code")
    parser.add_argument("--second-text", default="", help="Secondary announcement text")
    parser.add_argument("--second-lang", default="fr", help="Secondary language code")
    parser.add_argument("--pause-ms", type=int, default=700,
                        help="Silence between primary and secondary (ms)")
    args = parser.parse_args()

    try:
        import soundfile as sf
        import numpy as np

        pipeline_cache = {}

        primary = generate_clip(pipeline_cache, args.text, args.lang, args.speed)

        if args.second_text.strip():
            silence_samples = int(SAMPLE_RATE * args.pause_ms / 1000)
            silence = np.zeros(silence_samples, dtype=primary.dtype)
            secondary = generate_clip(pipeline_cache, args.second_text.strip(),
                                      args.second_lang, args.speed)
            combined = np.concatenate([primary, silence, secondary])
        else:
            combined = primary

        sf.write(args.output, combined, SAMPLE_RATE)
        print("ok")

    except ImportError as e:
        print(f"Missing dependency: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"TTS error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
