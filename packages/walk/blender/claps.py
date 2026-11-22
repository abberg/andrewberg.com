# Finds the hand claps in the soundtrack ahead of time, and writes when they
# fall to src/claps.ts for the sketch, which lights its clouds on them. Doing
# it here rather than by listening as the track plays means every clap is
# found exactly where it is, and nothing else is mistaken for one.
#
# It needs numpy, which Blender's own Python has, and a mono WAV of the track:
#
#   afconvert -f WAVE -d LEI16@22050 -c 1 public/soundtrack.mp3 /tmp/track.wav
#   /Applications/Blender.app/Contents/Resources/5.2/python/bin/python3.13 blender/claps.py /tmp/track.wav
#
# The clap is a sudden burst between 1 and 6 kHz, where the kick and bass
# hardly reach, on every other beat: about once a second, first at 2.66 s.
# It is followed through the track one period at a time, looking each time
# for the biggest jump in that band close to when the next is due, and
# carrying on from wherever a clear one really was, so the search keeps step
# with the playing. Where there is no jump to speak of, no clap is recorded.
import os
import sys
import wave
import numpy as np

FIRST, PERIOD = 2.66, 1.0043   # seconds
NEAR = 0.07                    # how far from due a clap may be
CLEAR, FAINT = 12, 9           # how big a jump is surely a clap, and the least that counts as one
EARLY = 0.03                   # a jump is measured a little after the clap starts

track = wave.open(sys.argv[1])
rate = track.getframerate()
samples = np.frombuffer(track.readframes(track.getnframes()), dtype=np.int16).astype(np.float32) / 32768
SIZE, HOP, LAG = 1024, 128, 4
frames = np.lib.stride_tricks.sliding_window_view(samples, SIZE)[::HOP]
loudness = 20 * np.log10(np.abs(np.fft.rfft(frames * np.hanning(SIZE), axis=1)) + 1e-5)
pitches = np.fft.rfftfreq(SIZE, 1 / rate)
band = (pitches >= 1000) & (pitches < 6000)
jump = np.concatenate([np.zeros(LAG), np.maximum(loudness[LAG:, band] - loudness[:-LAG, band], 0).mean(axis=1)])
times = np.arange(len(frames)) * HOP / rate + SIZE / 2 / rate
per_second = rate / HOP

claps, due = [], FIRST
while due < len(samples) / rate - 0.2:
    start, end = int((due - NEAR) * per_second), int((due + NEAR) * per_second)
    found = start + int(np.argmax(jump[start:end]))
    if jump[found] > FAINT:
        claps.append(round(float(times[found]) - EARLY, 3))
    if jump[found] > CLEAR:
        due = float(times[found])
    due += PERIOD

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'claps.ts')
with open(out, 'w') as file:
    file.write('// When each hand clap in the soundtrack falls, in seconds. Written by blender/claps.py.\n')
    file.write('export const claps = [\n')
    for i in range(0, len(claps), 12):
        file.write('  ' + ', '.join(str(c) for c in claps[i:i + 12]) + ',\n')
    file.write('];\n')
print(f'{len(claps)} claps written to src/claps.ts')
