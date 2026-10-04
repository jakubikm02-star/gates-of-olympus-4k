import sys, os, wave, unicodedata, numpy as np
from piper import PiperVoice, SynthesisConfig
from piper.phonemize_espeak import EspeakPhonemizer
v = PiperVoice.load("models/cs_CZ-jirka-medium.onnx")
ph = EspeakPhonemizer()
variant, outdir = sys.argv[1], sys.argv[2]
DIPH = {"A": "i\u032f", "B": "j", "C": "i"}[variant]
cfg = SynthesisConfig(length_scale=1.08, noise_scale=0.55, noise_w_scale=0.7)
os.makedirs(outdir, exist_ok=True)
def fix(s):
    s = s.replace("tʲ", "c").replace("dʲ", "ɟ").replace("lʲ", "ʎ").replace("iʲ", DIPH).replace("ʲ", "").replace("ˌ", "")
    return s
for line in open("lines.tsv", encoding="utf-8"):
    line=line.rstrip("\n")
    if not line: continue
    k,t=line.split("\t")
    audio=[]
    for sent in ph.phonemize("sk", t):
        s = fix(unicodedata.normalize("NFC","".join(sent)))
        if k=="bankrot": s = "bˈaŋkroːt!"
        p = list(unicodedata.normalize("NFD", s))
        ids = v.phonemes_to_ids(p)
        audio.append(v.phoneme_ids_to_audio(ids, cfg))
        if variant=="A": print(k, s)
    a = np.concatenate(audio); a = (np.clip(a,-1,1)*32767).astype(np.int16)
    with wave.open(f"{outdir}/vo-{k}.mp3".replace(".mp3",".wav"),"wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(v.config.sample_rate); w.writeframes(a.tobytes())
