# Codec 2 Emscripten

Codec 2 (https://github.com/drowe67/codec2) is a digital speech codec designed to operate as low as 450 bits/s. This repo compiles it using Emscripten for use in the browser.

Check out the demo: https://rameshvarun.github.io/codec2-emscripten/

![A screenshot showing the project demo page.](./screenshot.png)

## Extra Audio Format Support (FFmpeg WASM)

This fork adds support for encoding non-WAV audio files (MP3, OGG, FLAC, AAC, M4A, OPUS, etc.) by converting them to WAV first using FFmpeg WASM — entirely in the browser, with no server required.

WAV files skip FFmpeg entirely and go straight to the original SoX/codec2 pipeline, so there is no overhead for the existing workflow.

### Setup

This fork uses [ffmpeg.audio.wasm](https://github.com/JorenSix/ffmpeg.audio.wasm) — an audio-only FFmpeg build that is only ~5 MB (well under GitHub'''s 25 MB file limit).

Download these two files from the link below and place them in the `build/` folder:



Files needed:
- `ffmpeg_audio_wasm.js`
- `ffmpeg_audio_wasm.wasm`

Then serve the project as usual:

```bash
npm start
```

Both files can be committed directly to the repo with no Git LFS required.
