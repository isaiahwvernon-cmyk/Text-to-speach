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
import os
import warnings

# ── Suppress noisy warnings from PyTorch / HuggingFace before any imports ─────
warnings.filterwarnings("ignore")
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

# Silence HuggingFace hub token / rate-limit messages
try:
    import logging
    logging.getLogger("huggingface_hub").setLevel(logging.ERROR)
    logging.getLogger("transformers").setLevel(logging.ERROR)
except Exception:
    pass

# ─────────────────────────────────────────────────────────────────────────────

SAMPLE_RATE = 24000

LANGUAGE_CONFIGS = {
    "en-us": {"lang_code": "a", "voice": "af_heart",    "label": "English (US)"},
    "en-gb": {"lang_code": "b", "voice": "bf_emma",     "label": "English (UK)"},
    "fr":    {"lang_code": "f", "voice": "ff_siwis",    "label": "French"},
    "es":    {"lang_code": "e", "voice": "ef_dora",     "label": "Spanish"},
    "ja":    {"lang_code": "j", "voice": "jf_alpha",    "label": "Japanese"},
    "zh":    {"lang_code": "z", "voice": "zf_xiaobei",  "label": "Mandarin"},
    "ko":    {"lang_code": "k", "voice": "kf_alpha",    "label": "Korean"},
    "pt":    {"lang_code": "p", "voice": "pf_dora",     "label": "Portuguese"},
    "hi":    {"lang_code": "h", "voice": "hf_alpha",    "label": "Hindi"},
    "it":    {"lang_code": "i", "voice": "if_sara",     "label": "Italian"},
}

# Extra pip packages needed per language code (lang_code key, not lang key)
LANGUAGE_EXTRA_PACKAGES = {
    "j": "pyopenjtalk-prebuilt",
    "k": "misaki[ko]",
    "z": "jieba",
    "h": "misaki[hi]",
}


def generate_clip(pipeline_cache, text, lang_key, speed):
    """Generate audio numpy array for the given language and text."""
    from kokoro import KPipeline
    import numpy as np

    cfg = LANGUAGE_CONFIGS.get(lang_key, LANGUAGE_CONFIGS["en-us"])
    lang_code = cfg["lang_code"]
    voice = cfg["voice"]
    label = cfg["label"]

    if lang_code not in pipeline_cache:
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                pipeline_cache[lang_code] = KPipeline(lang_code=lang_code)
        except ImportError as e:
            pkg = LANGUAGE_EXTRA_PACKAGES.get(lang_code)
            if pkg:
                raise ImportError(
                    f"{label} requires an extra package. "
                    f"Install it with: pip install {pkg}"
                ) from e
            raise ImportError(f"{label} requires a missing package: {e}") from e

    pipeline = pipeline_cache[lang_code]
    all_audio = []
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        for _, _, audio in pipeline(text, voice=voice, speed=speed):
            all_audio.append(audio)

    if not all_audio:
        raise RuntimeError(f"No audio generated for {label}")

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
        print(f"Language not available: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"TTS error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
