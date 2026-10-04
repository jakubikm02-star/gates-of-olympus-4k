#!/bin/bash
# usage: process.sh <in> <out.mp3> <pitch>
AF="silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,rubberband=pitch=$3:formant=preserved,highpass=f=70,lowpass=f=12000,equalizer=f=120:t=q:w=0.9:g=3.5,equalizer=f=400:t=q:w=1.2:g=-2,equalizer=f=3000:t=q:w=1.2:g=3,equalizer=f=7500:t=q:w=1.5:g=-1.5,acompressor=threshold=-22dB:ratio=4:attack=4:release=140:makeup=4,aecho=0.85:0.45:28|53|89:0.16|0.10|0.06,silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,apad=pad_dur=0.25,loudnorm=I=-14:TP=-1.5:LRA=7"
ffmpeg -loglevel error -y -i "$1" -af "$AF" -ar 44100 -ac 1 -b:a 128k "$2"
