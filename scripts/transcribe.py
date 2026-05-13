#!/usr/bin/env python3
import sys
import json
import argparse
import time
import logging

logging.basicConfig(
    level=logging.INFO,
    format="[whisper] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(__name__)

def parse_args():
    parser = argparse.ArgumentParser(description="Transcribe audio using faster-whisper")
    parser.add_argument("audio_path", help="Path to the audio file")
    parser.add_argument("--model-size", default="base", help="Model size")
    parser.add_argument("--device", default="cuda", help="Device (cuda/cpu)")
    parser.add_argument("--compute-type", default="float16", help="Compute type")
    parser.add_argument("--beam-size", type=int, default=5, help="Beam size")
    return parser.parse_args()

def run_transcription(model, audio_path, beam_size):
    segments_gen, info = model.transcribe(audio_path, beam_size=beam_size)
    segments_list = []
    full_text_parts = []
    for segment in segments_gen:
        segments_list.append({
            "start": round(segment.start, 3),
            "end": round(segment.end, 3),
            "text": segment.text.strip(),
        })
        full_text_parts.append(segment.text.strip())
    return segments_list, full_text_parts, info

def main():
    args = parse_args()
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        logger.error("faster-whisper not installed.")
        sys.exit(1)

    start_time = time.time()
    segments = []
    full_text = ""
    info = None
    load_start = time.time()
    
    current_device = args.device
    current_compute = args.compute_type

    try:
        logger.info(f"Loading model '{args.model_size}' on {current_device}...")
        model = WhisperModel(args.model_size, device=current_device, compute_type=current_compute)
        load_time = time.time() - load_start
        
        logger.info("Starting transcription...")
        segments, full_text_parts, info = run_transcription(model, args.audio_path, args.beam_size)
        full_text = " ".join(full_text_parts)
        
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Error during execution: {error_msg}")
        
        if current_device == "cuda" and ("cublas" in error_msg.lower() or "cudnn" in error_msg.lower() or "cuda" in error_msg.lower()):
            logger.warning("CUDA error detected. Falling back to CPU...")
            try:
                load_start = time.time()
                model = WhisperModel(args.model_size, device="cpu", compute_type="int8")
                load_time = time.time() - load_start
                
                segments, full_text_parts, info = run_transcription(model, args.audio_path, args.beam_size)
                full_text = " ".join(full_text_parts)
                current_device = "cpu"
                current_compute = "int8"
            except Exception as fallback_error:
                logger.error(f"Fallback failed: {fallback_error}")
                sys.exit(1)
        else:
            sys.exit(1)

    output = {
        "language": info.language if info else "unknown",
        "language_probability": round(info.language_probability, 4) if info else 0,
        "duration_seconds": round(info.duration, 2) if info else 0,
        "segments": segments,
        "full_text": full_text,
        "metadata": {
            "model_size": args.model_size,
            "device": current_device,
            "compute_type": current_compute,
            "load_time_seconds": round(load_time, 2),
            "transcribe_time_seconds": round(time.time() - start_time, 2),
        },
    }

    json.dump(output, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.flush()
    logger.info("Done.")

if __name__ == "__main__":
    main()
