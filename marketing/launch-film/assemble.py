"""Cut the FinatriX launch film from edit.json.

Every shot, in order, from the best source that exists:
  render shots   the file rendered here (out/*.mp4, with its own sound)
  clip shots     clips/<id>.mp4 — the Higgsfield image-to-video take, trimmed from `in`
                 else storyboard/<id>.png|jpg with a slow push-in (animatic)
                 else a slate naming the shot and its action
Act I is letterboxed to 2.39:1 (the finale opens its own bars). Transitions:
fade through white out of the shower, fade to black into the turn.

Output: out/film.mp4 when every shot is final, otherwise out/film-animatic.mp4.
1920×1080, 30 fps, H.264 + AAC 48 kHz, loudness-normalised to -14 LUFS.

Usage: python3 assemble.py        (needs only ffmpeg; stdlib Python)
"""

import json
import subprocess
import textwrap
from pathlib import Path

HERE = Path(__file__).resolve().parent
EDIT = json.loads((HERE / "edit.json").read_text())
W, H, FPS = EDIT["width"], EDIT["height"], EDIT["fps"]
BAR = round((H - W / EDIT["act1_letterbox"]) / 2)
WORK = HERE / "out" / "segments"


def ffmpeg(*args):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *args], check=True)


def has_audio(path: Path) -> bool:
    probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", str(path)],
                           capture_output=True, text=True, check=True)
    return bool(probe.stdout.strip())


def drawtext(text, size, y, color="white@0.9"):
    safe = text.replace("\\", "\\\\").replace(":", "\\:").replace("'", "’").replace("%", "\\%")
    return f"drawtext=text='{safe}':fontsize={size}:fontcolor={color}:x=(w-text_w)/2:y={y}"


def source_for(shot):
    """(inputs, label) for the best available source of a shot."""
    d = shot["duration"]
    if shot["kind"] == "render":
        path = HERE / shot["file"]
        if path.exists():
            return ["-t", f"{d}", "-i", str(path)], "render", path
    else:
        clip = HERE / "clips" / f"{shot['id']}.mp4"
        if clip.exists():
            return ["-ss", f"{shot.get('in', 0)}", "-t", f"{d}", "-i", str(clip)], "clip", clip
        for ext in ("png", "jpg", "jpeg", "webp"):
            still = HERE / "storyboard" / f"{shot['id']}.{ext}"
            if still.exists():
                return ["-loop", "1", "-framerate", str(FPS), "-t", f"{d}", "-i", str(still)], "storyboard", still
    slate = f"color=c=0x0d0d0d:s={W}x{H}:r={FPS}:d={d}"
    return ["-f", "lavfi", "-i", slate], "slate", None


def segment(index, shot):
    d = shot["duration"]
    inputs, kind, path = source_for(shot)
    frames = round(d * FPS)
    vf = []
    if kind == "storyboard":  # a slow push-in on the still: an animatic, not a slideshow
        vf += [f"scale={W * 2}:{H * 2}:force_original_aspect_ratio=increase", f"crop={W * 2}:{H * 2}",
               f"zoompan=z='1+0.05*on/{frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s={W}x{H}:fps={FPS}"]
    else:
        vf += [f"scale={W}:{H}:force_original_aspect_ratio=increase", f"crop={W}:{H}", f"fps={FPS}"]
    if kind == "slate":
        vf.append(drawtext(f"{shot['id']}  ·  {shot['title']}", 54, "h*0.36"))
        for k, line in enumerate(textwrap.wrap(shot.get("motion", ""), 78)[:4]):
            vf.append(drawtext(line, 30, f"h*0.47+{k * 44}", "white@0.6"))
        vf.append(drawtext("AI shot not generated yet — see edit.json", 24, "h*0.70", "0xD4AF37@0.8"))
    if shot.get("in_transition") == "white":
        vf.append("fade=t=in:st=0:d=0.3:color=white")
    if shot.get("out_transition") == "white":
        vf.append(f"fade=t=out:st={d - 0.4:.3f}:d=0.4:color=white")
    if shot.get("out_transition") == "black":
        vf.append(f"fade=t=out:st={d - 0.3:.3f}:d=0.3")
    if shot.get("letterbox", True):  # bars go on last, so fades never tint them
        vf += [f"drawbox=x=0:y=0:w=iw:h={BAR}:color=black:t=fill", f"drawbox=x=0:y=ih-{BAR}:w=iw:h={BAR}:color=black:t=fill"]
    vf += ["setsar=1", "format=yuv420p"]

    audio_inputs, audio_map = [], "0:a"
    if path is None or not has_audio(path):
        audio_inputs = ["-f", "lavfi", "-t", f"{d}", "-i", "anullsrc=r=48000:cl=stereo"]
        audio_map = "1:a"
    af = f"aresample=48000,aformat=channel_layouts=stereo,apad,atrim=0:{d},afade=t=in:d=0.02,afade=t=out:st={d - 0.04:.3f}:d=0.04"

    out = WORK / f"{index:02d}-{shot['id']}.mp4"
    ffmpeg(*inputs, *audio_inputs, "-map", "0:v", "-map", audio_map, "-vf", ",".join(vf), "-af", af,
           "-frames:v", str(frames), "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-r", str(FPS),
           "-c:a", "aac", "-b:a", "256k", "-ar", "48000", str(out))
    return out, kind


def main():
    WORK.mkdir(parents=True, exist_ok=True)
    parts, placeholders, clock = [], [], 0.0
    for i, shot in enumerate(EDIT["shots"]):
        out, kind = segment(i, shot)
        parts.append(out)
        if kind in ("slate", "storyboard"):
            placeholders.append(f"{shot['id']} ({kind})")
        print(f"{clock:6.2f}s  {shot['id']:7s} {shot['duration']:5.2f}s  {kind:10s} {shot['title']}")
        clock += shot["duration"]
    listing = WORK / "concat.txt"
    listing.write_text("".join(f"file '{p.name}'\n" for p in parts))
    final = HERE / "out" / ("film-animatic.mp4" if placeholders else "film.mp4")
    ffmpeg("-f", "concat", "-safe", "0", "-i", str(listing), "-c:v", "copy",
           "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-movflags", "+faststart", str(final))
    print(f"\n{final.name}: {clock:.2f}s")
    if placeholders:
        print("placeholders: " + ", ".join(placeholders))


if __name__ == "__main__":
    main()
