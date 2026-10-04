#!/bin/bash
# Original announcer lines for the fictional host "Peter Marcipán". Piper TTS (sk_SK-lili-medium, generic voice),
# pitched down with formant preservation + compression + short studio room. No imitation of any real voice.
set -e
OUT=${1:-/tmp/wt-koleso/public/sfx/koleso}
mkdir -p "$OUT" raw
while IFS=$'\t' read -r key text; do
  [ -z "$key" ] && continue
  echo "$text" | /tmp/ttsenv/bin/piper -m /tmp/tts/sk_SK-lili-medium.onnx --length_scale 0.92 --noise_scale 0.5 -f raw/$key.wav >/dev/null 2>&1
  ffmpeg -loglevel error -y -i raw/$key.wav -af "rubberband=pitch=0.82:formant=preserved,highpass=f=90,equalizer=f=180:t=q:w=1:g=3,equalizer=f=3200:t=q:w=1.2:g=4,acompressor=threshold=-20dB:ratio=4:attack=5:release=120:makeup=4,aecho=0.8:0.5:38|71:0.18|0.10,silenceremove=start_periods=1:start_threshold=-45dB,apad=pad_dur=0.15,loudnorm=I=-14:TP=-1.5:LRA=7" -ar 44100 -ac 1 -b:a 96k "$OUT/vo-$key.mp3"
  echo "$key $(ffprobe -v error -show_entries format=duration -of csv=p=0 $OUT/vo-$key.mp3)"
done < "$(dirname "$0")/lines.tsv"
