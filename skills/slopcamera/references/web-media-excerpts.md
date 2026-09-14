# Acquire bounded web-media excerpts with yt-dlp

Use this route when a scene needs a short piece of audio or video from a public
web URL. Slopcamera's renderers consume local, retained media; acquire the
excerpt first, then pass its local path to `audio.path` or a media operation.
Only acquire material the user is authorized to download and reuse. Stop when
the source requires DRM or an access-control workaround.

The examples use `yt-dlp`. If a machine only exposes the legacy `youtube-dl`
command, check its installed help for equivalent bounded-section options before
using it; format IDs and client behavior are never portable between runs.

## Keep the acquisition bounded and reproducible

Check the local tools and create a private staging directory before contacting
the source:

```sh
command -v yt-dlp
command -v ffmpeg
yt-dlp --version
ffmpeg -version | head -1
mkdir -m 700 -p artifacts/slopcamera/source/web-excerpt
```

Set `URL`, `START_SECONDS`, and `END_SECONDS` to the requested source and
window. Use integer or decimal seconds, and keep `END_SECONDS` greater than
`START_SECONDS`:

```sh
URL='https://www.youtube.com/watch?v=VIDEO_ID'
START_SECONDS=0
END_SECONDS=60
DURATION_SECONDS=60 # END_SECONDS - START_SECONDS
```

Use the canonical URL as one argument, disable playlist expansion, and state
the exact time window. `--download-sections` asks yt-dlp/FFmpeg for the window;
it does not guarantee that every site will transfer only those bytes, so check
the resulting file size and duration.

For an audio excerpt, try the best available audio stream first:

```sh
yt-dlp --no-playlist --retries 3 --fragment-retries 3 \
  -f 'bestaudio[ext=m4a]/bestaudio' \
  --download-sections "*${START_SECONDS}-${END_SECONDS}" \
  -o 'artifacts/slopcamera/source/web-excerpt/raw.%(ext)s' \
  "$URL"
```

If that stream returns HTTP 403 or cannot be cut, inspect the current format
list (`yt-dlp -F "$URL"`) and choose an available progressive format that has
both video and audio. A progressive stream can be downloaded for the same
window and then reduced to audio locally:

```sh
yt-dlp --no-playlist --retries 3 --fragment-retries 3 \
  -f 'best[acodec!=none][vcodec!=none]/best' \
  --download-sections "*${START_SECONDS}-${END_SECONDS}" \
  --force-keyframes-at-cuts \
  -o 'artifacts/slopcamera/source/web-excerpt/raw.%(ext)s' \
  "$URL"
```

After either download, set `RAW_PATH` to the actual file and normalize it
locally. This makes the duration, codec, sample rate, and channel layout
independent of the source container:

```sh
RAW_PATH='artifacts/slopcamera/source/web-excerpt/raw.mp4' # use yt-dlp's actual output extension
ffmpeg -nostdin -hide_banner -loglevel error -y \
  -i "$RAW_PATH" \
  -map 0:a:0 -vn -t "$DURATION_SECONDS" \
  -c:a aac -b:a 128k -ar 48000 -ac 2 -movflags +faststart \
  artifacts/slopcamera/source/web-excerpt/excerpt.m4a
```

Use the actual extension printed by yt-dlp when the progressive source is
WebM or another container. `--force-keyframes-at-cuts` is useful for a video
section; it is not a substitute for the final local audio trim.

Format IDs and client behavior change. Do not hard-code a format ID from an old
run without checking `-F` again. When YouTube reports that a client needs a
Proof of Origin (PO) token, use a current, user-authorized browser cookie/token
route only when that access is in scope. Never guess a token, loop through
clients to evade a block, or put cookies, PO tokens, signed media URLs, or
browser profiles in the scene source, logs, or a retained bundle. The
[yt-dlp PO Token Guide](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide)
and [yt-dlp FAQ](https://github.com/yt-dlp/yt-dlp/wiki/FAQ) describe the current
failure modes and browser-state requirements.

## Verify before importing

Probe the finished local file before giving it to Slopcamera. For a music-video
soundtrack, require one audio stream, a positive duration close to the requested
window, and the expected channel layout; then hash the bytes:

```sh
ffprobe -v error \
  -show_entries 'format=duration,size:stream=index,codec_type,codec_name,channels,sample_rate,duration,start_time' \
  -of json artifacts/slopcamera/source/web-excerpt/excerpt.m4a
shasum -a 256 artifacts/slopcamera/source/web-excerpt/excerpt.m4a
```

Retain a small sidecar next to the excerpt with the canonical source URL (and
video ID when available), requested start/end seconds, selected format, tool
versions, observed duration, and output SHA-256. Keep the sidecar free of
cookies and expiring signed URLs. Rename or copy the verified excerpt into the
project's ordinary source area only after the probe succeeds; keep the original
local source unchanged.

Once verified, use the local path in the scene request. HTML scenes do not fetch
remote media at render time, so rerenders remain reproducible and do not depend
on a web session. Review the first and last audio/video frames and report any
boundary padding or partial download explicitly.

See the [yt-dlp README's format-selection guidance](https://github.com/yt-dlp/yt-dlp#format-selection)
for selector syntax and the [music-video guide](music-video.md) for retaining a
local soundtrack beside an authored scene.
