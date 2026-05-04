const html = htm.bind(React.createElement);

// ---------------------------------------------------------------------------
// ffmpeg.audio.wasm – audio-only FFmpeg build (~5 MB).
// Used ONLY to convert non-WAV files to WAV before SoX/codec2.
// Uses the older v0.9-style API: createFFmpegCore / ffmpeg.FS / ffmpeg.run
// ---------------------------------------------------------------------------
let _ffmpeg = null;

async function getFFmpeg() {
  if (_ffmpeg) return _ffmpeg;

  // createFFmpegCore is exposed by build/ffmpeg_audio_wasm.js
  const core = await createFFmpegCore({
    locateFile: (path) => `./build/${path}`,
  });

  // Wrap the raw core in a simple helper object matching the v0.9 call style
  const ff = {
    FS: core.FS.bind(core),
    run: (...args) => new Promise((resolve, reject) => {
      try {
        core.callMain(args);
        resolve();
      } catch (e) {
        reject(e);
      }
    }),
  };

  _ffmpeg = ff;
  return ff;
}

/**
 * Convert any audio file to WAV (PCM s16le, 8 kHz, mono) using FFmpeg WASM.
 * Returns an ArrayBuffer containing the WAV bytes.
 */
async function convertToWav(buffer, filename, onStatus) {
  onStatus("Loading FFmpeg audio WASM...");
  const ff = await getFFmpeg();

  onStatus(`Converting ${filename} to WAV...`);

  // Write input into the in-memory FS
  ff.FS("writeFile", filename, new Uint8Array(buffer));

  // Convert to PCM s16le 8 kHz mono WAV - exactly what SoX/codec2 needs
  await ff.run(
    "-i", filename,
    "-ar", "8000",
    "-ac", "1",
    "-sample_fmt", "s16",
    "-f", "wav",
    "ffmpeg_out.wav"
  );

  const data = ff.FS("readFile", "ffmpeg_out.wav");

  // Clean up virtual FS
  try { ff.FS("unlink", filename); } catch (_) {}
  try { ff.FS("unlink", "ffmpeg_out.wav"); } catch (_) {}

  onStatus("");
  return data.buffer;
}

/** Returns true when the file is already a WAV (by MIME or extension). */
function isWavFile(file) {
  if (file.type === "audio/wav" || file.type === "audio/wave" || file.type === "audio/x-wav") return true;
  return file.name.toLowerCase().endsWith(".wav");
}

function hexToArrayBuffer(hex) {
  return new Uint8Array(
    hex.match(/[\da-f]{2}/gi).map(function (h) {
      return parseInt(h, 16);
    })
  ).buffer;
}

function arrayBufferToHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  let bytes = new Uint8Array(buffer);
  for (let byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64) {
  let binary = window.atob(base64);
  let bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function runDecode(mode, data) {
  return new Promise((resolve, reject) => {
    const module = {
      arguments: [mode, "input.bit", "output.raw"],
      preRun: () => {
        module.FS.writeFile("input.bit", new Uint8Array(data));
      },
      postRun: () => {
        let buffer = module.FS.readFile("output.raw", {
          encoding: "binary",
        });
        resolve(buffer);
      },
    };
    createC2Dec(module);
  });
}

function runEncode(mode, data) {
  return new Promise((resolve, reject) => {
    const module = {
      arguments: [mode, "input.raw", "output.bit"],
      preRun: () => {
        module.FS.writeFile("input.raw", new Uint8Array(data));
      },
      postRun: () => {
        let buffer = module.FS.readFile("output.bit", {
          encoding: "binary",
        });
        resolve(buffer);
      },
    };
    createC2Enc(module);
  });
}

function rawToWav(buffer) {
  return new Promise((resolve, reject) => {
    const module = {
      arguments: [
        "-r",
        "8000",
        "-L",
        "-e",
        "signed-integer",
        "-b",
        "16",
        "-c",
        "1",
        "input.raw",
        "output.wav",
      ],
      preRun: () => {
        module.FS.writeFile("input.raw", new Uint8Array(buffer));
      },
      postRun: () => {
        let output = module.FS.readFile("output.wav", {
          encoding: "binary",
        });
        resolve(output);
      },
    };
    SOXModule(module);
  });
}

function audioFileToRaw(buffer, filename) {
  return new Promise((resolve, reject) => {
    const module = {
      arguments: [
        filename,
        "-r",
        "8000",
        "-L",
        "-e",
        "signed-integer",
        "-b",
        "16",
        "-c",
        "1",
        "output.raw",
      ],
      preRun: () => {
        module.FS.writeFile(filename, new Uint8Array(buffer));
      },
      postRun: () => {
        let output = module.FS.readFile("output.raw", {
          encoding: "binary",
        });
        resolve(output);
      },
    };
    SOXModule(module);
  });
}

const DEFAULT_VALUE =
  "dOmBUOGFQjDhwIHwchQBIHIJQWDhxUHwRintQFH78RDBYKkwwUnpUAQ/fZDFj32wTl69oH4jOXBExliwK4pgwC3OYNBActjAGL8o8JCS8QCxpIAQN+oAgIS73AB4kKAQowK9gBYbdUBwXoQQkFaEAFl/gRCmrRSg4bBAAOHHQRBGKekwRlClEMPagMA6TMDQK9T1QC2zrTBtroVA/KhBAAG5QNDN99gA2QggALnlcWAlWr1QLxl9MIQ++RAf9+AA3YWkAF8fAADI3ohgmoLAANyGAAB7IxigjFVc4IwN1JCMDdBAa63QEHhdjABfKRAAu0ncALteGABIdcAAq/kBIOH/gSCT9gIQcj9BkOHDgADhsMFw4fEC0PrXQSByGoFw7qnCQKu3gYDh/4MQ";

function ModeSelector(props) {
  return html`<div style=${{ marginTop: "20px" }} className="form-group row">
    <label htmlFor="decode-mode-select" className="col-sm-3 col-form-label"
      >Codec Mode</label
    >
    <div className="col-sm-9">
      <select defaultValue="700C" id=${props.selectId} className="form-control">
        <option value="3200">3200</option>
        <option value="2400">2400</option>
        <option value="1600">1600</option>
        <option value="1400">1400</option>
        <option value="1300">1300</option>
        <option value="1200">1200</option>
        <option value="700C">700C</option>
        <option value="450">450</option>
        <option value="450PWB">450PWB</option>
      </select>
    </div>
  </div>`;
}

class Decoder extends React.Component {
  render() {
    return html`<div>
      <div className="form-group">
        <label htmlFor="decode-input">Base64 Input</label>
        <textarea
          className="form-control"
          style=${{ width: "100%", height: "300px" }}
          defaultValue=${DEFAULT_VALUE}
          id="decode-input"
        >
        </textarea>
      </div>

      <${ModeSelector} selectId="decode-mode-select" />

      <div
        style=${{
          marginTop: "20px",
          marginBottom: "20px",
          display: "flex",
          justifyContent: "right",
        }}
      >
        <button
          type="submit"
          className="btn btn-primary"
          onClick=${() => this.decode()}
        >
          Decode
        </button>
      </div>
      <hr />
      <div style=${{ marginTop: "20px" }}>
        <audio style=${{ width: "100%" }} id="decode-playback" controls></audio>
      </div>
    </div>`;
  }

  async decode() {
    const mode = document.getElementById("decode-mode-select").value;

    const input = document.getElementById("decode-input").value;
    const encoded = base64ToArrayBuffer(input);

    let decodedRaw = await runDecode(mode, encoded);
    let decodedWav = await rawToWav(decodedRaw);

    document.getElementById("decode-playback").src = URL.createObjectURL(
      new Blob([decodedWav], { type: "audio/wav" })
    );
  }
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result);
    };
    reader.readAsArrayBuffer(file);
  });
}

class Encoder extends React.Component {
  constructor(props) {
    super(props);
    this.state = { status: "", converting: false };
  }

  render() {
    const { status, converting } = this.state;
    return html`<div>
      <div className="form-group row">
        <div className="col-sm-4">
          <label htmlFor="enc-upload">Audio File Upload</label>
          <div style=${{ fontSize: "0.8em", color: "#666", marginTop: "4px" }}>
            WAV files encode directly.<br/>
            MP3, OGG, FLAC, AAC, M4A, OPUS, etc. are
            converted to WAV first via FFmpeg WASM.
          </div>
        </div>
        <div className="col-sm-8">
          <input
            id="enc-upload"
            className="form-control-file"
            type="file"
            accept="audio/wav,audio/wave,audio/x-wav,audio/mpeg,audio/mp4,audio/aac,audio/ogg,audio/flac,audio/x-flac,audio/opus,.wav,.mp3,.m4a,.aac,.ogg,.flac,.opus,.mp4"
          />
        </div>
      </div>

      <${ModeSelector} selectId="encode-mode-select" />

      ${status ? html`<div className="alert alert-info" style=${{ marginTop: "12px", padding: "8px 14px", display: "flex", alignItems: "center", gap: "10px" }}>
        <span className="spinner-border spinner-border-sm" role="status"></span>
        <span>${status}</span>
      </div>` : null}

      <div
        style=${{
          marginTop: "20px",
          marginBottom: "20px",
          display: "flex",
          justifyContent: "right",
        }}
      >
        <button
          type="submit"
          className="btn btn-primary"
          disabled=${converting}
          onClick=${() => this.encode()}
        >
          ${converting ? "Processing…" : "Encode"}
        </button>
      </div>

      <hr />

      <div className="form-group">
        <textarea
          className="form-control"
          style=${{ width: "100%", height: "300px", marginTop: "20px" }}
          id="encode-output"
        >
        </textarea>
      </div>
    </div>`;
  }

  async encode() {
    let file = document.getElementById("enc-upload").files[0];
    if (!file) {
      alert("Please select an audio file first.");
      return;
    }

    const mode = document.getElementById("encode-mode-select").value;
    this.setState({ converting: true, status: "" });

    try {
      let buffer = await readFileAsArrayBuffer(file);

      // --- FFmpeg pre-conversion: only fires for non-WAV files ---
      if (!isWavFile(file)) {
        buffer = await convertToWav(
          buffer,
          file.name || "input_audio",
          (msg) => this.setState({ status: msg })
        );
      }
      // WAV files skip FFmpeg entirely and go straight into SoX

      this.setState({ status: "Converting to raw PCM via SoX…" });
      let rawBuffer = await audioFileToRaw(buffer, "input.wav");

      this.setState({ status: "Encoding with codec2…" });
      let encoded = await runEncode(mode, rawBuffer);

      document.getElementById("encode-output").innerHTML =
        arrayBufferToBase64(encoded);
    } catch (err) {
      console.error(err);
      alert("Encoding failed: " + err.message);
    } finally {
      this.setState({ converting: false, status: "" });
    }
  }
}

ReactDOM.createRoot(document.getElementById("dec-root")).render(
  React.createElement(Decoder)
);

ReactDOM.createRoot(document.getElementById("enc-root")).render(
  React.createElement(Encoder)
);
