#!/usr/bin/env python3
"""
transcribe.py — Audio transcription using faster-whisper.

Receives an audio file path and outputs structured JSON to stdout.
All logging goes to stderr to avoid polluting the JSON output.

Usage:
    python transcribe.py <audio_path> [--model-size base] [--device cuda] [--compute-type float16]
"""

import sys
import json
import argparse
import time
import logging

# Configure logging to stderr only
logging.basicConfig(
    level=logging.INFO,
    format="[whisper] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(__name__)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Transcribe audio using faster-whisper"
    )
    parser.add_argument(
        "audio_path",
        help="Path to the audio file to transcribe",
    )
    parser.add_argument(
        "--model-size",
        default="base",
        choices=["tiny", "base", "small", "medium", "large-v2", "large-v3"],
        help="Whisper model size (default: base)",
    )
    parser.add_argument(
        "--device",
        default="cuda",
        choices=["cpu", "cuda"],
        help="Device to run inference on (default: cuda)",
    )
    parser.add_argument(
        "--compute-type",
        default="float16",
        choices=["int8", "float16", "float32"],
        help="Compute type for inference (default: float16)",
    )
    parser.add_argument(
        "--beam-size",
        type=int,
        default=5,
        help="Beam size for decoding (default: 5)",
    )
    return parser.parse_args()


def main():
    args = parse_args()

    logger.info(f"Audio file: {args.audio_path}")
    logger.info(
        f"Config: model={args.model_size}, device={args.device}, "
        f"compute_type={args.compute_type}, beam_size={args.beam_size}"
    )

    # Import here to avoid slow import overhead on --help calls
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        logger.error(
            "faster-whisper is not installed. "
            "Install it with: pip install faster-whisper"
        )
        sys.exit(1)

    # ── Load Model ───────────────────────────────────────────────────
    start_load = time.time()
    logger.info(f"Loading model '{args.model_size}' on {args.device}...")

    try:
        model = WhisperModel(
            args.model_size,
            device=args.device,
            compute_type=args.compute_type,
        )
    except Exception as e:
        logger.error(f"Failed to load model: {e}")

        # Fallback: try CPU if CUDA fails
        if args.device == "cuda":
            logger.warning("CUDA failed. Falling back to CPU with int8...")
            try:
                model = WhisperModel(
                    args.model_size,
                    device="cpu",
                    compute_type="int8",
                )
                logger.info("CPU fallback successful")
            except Exception as fallback_error:
                logger.error(f"CPU fallback also failed: {fallback_error}")
                sys.exit(1)
        else:
            sys.exit(1)

    load_time = time.time() - start_load
    logger.info(f"Model loaded in {load_time:.2f}s")

    # ── Transcribe ───────────────────────────────────────────────────
    start_transcribe = time.time()
    logger.info("Starting transcription...")

    try:
        segments_gen, info = model.transcribe(
            args.audio_path,
            beam_size=args.beam_size,
        )
    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        sys.exit(1)

    # Consume the generator and build segment list
    segments = []
    full_text_parts = []

    for segment in segments_gen:
        seg_data = {
            "start": round(segment.start, 3),
            "end": round(segment.end, 3),
            "text": segment.text.strip(),
        }
        segments.append(seg_data)
        full_text_parts.append(segment.text.strip())

    transcribe_time = time.time() - start_transcribe
    logger.info(
        f"Transcription complete: {len(segments)} segments in {transcribe_time:.2f}s"
    )

    # ── Build Output ─────────────────────────────────────────────────
    output = {
        "language": info.language,
        "language_probability": round(info.language_probability, 4),
        "duration_seconds": round(info.duration, 2),
        "segments": segments,
        "full_text": " ".join(full_text_parts),
        "metadata": {
            "model_size": args.model_size,
            "device": args.device,
            "compute_type": args.compute_type,
            "load_time_seconds": round(load_time, 2),
            "transcribe_time_seconds": round(transcribe_time, 2),
        },
    }

    # Output JSON to stdout (this is what the Node.js worker reads)
    json.dump(output, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.flush()

    logger.info("Done. JSON output written to stdout.")


if __name__ == "__main__":
    main()
