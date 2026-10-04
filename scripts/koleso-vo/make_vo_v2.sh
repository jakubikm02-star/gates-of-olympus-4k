#!/bin/bash
# KOLESO host lines v2 (offline, local only): Piper TTS voice cs_CZ-jirka-medium (male) driven by espeak-ng *Slovak*
# phonemes (gen_piper_v2.py), then the ffmpeg chain in process_v2.sh (pitch 0.92). Writes public/sfx/koleso/vo-*.mp3.
# Needs: piper-tts 1.8 + numpy (PY=…/python), models/cs_CZ-jirka-medium.onnx(.json) from rhasspy/piper-voices, ffmpeg.
set -e; cd "$(dirname "$0")"
PY="${PY:-python3}"; OUT=../../public/sfx/koleso; mkdir -p raw_v2
"$PY" gen_piper_v2.py C raw_v2
while IFS=$'\t' read -r k t; do [ -z "$k" ] && continue; ./process_v2.sh raw_v2/vo-$k.wav "$OUT/vo-$k.mp3" 0.92; done < lines.tsv
