/**
 * Background effects for the recorder, entirely in the owner's browser: MediaPipe's selfie
 * segmenter finds the person in each camera frame, and a WebGL 2 compositor draws either
 *  - "blur":   the camera picture with the background blurred,
 *  - "studio": the person, lightly graded, in front of a lit studio backdrop, or
 *  - "cutout": a stacked frame, the camera picture on top and the person's mask below.
 * The recorder records this canvas instead of the camera. Camera frames never leave the
 * device; only the model and its runtime are downloaded (pinned versions, below).
 */
import type { ImageSegmenter } from "@mediapipe/tasks-vision";

export type FxMode = "blur" | "studio" | "cutout";

/**
 * Studio backdrops: a seamless sweep (top colour to floor colour), a soft spotlight behind
 * the speaker and a vignette, drawn by the shader (no images to download).
 */
export const STUDIO_LOOKS = {
  charcoal: {
    label: "Charcoal",
    top: "#30343b",
    floor: "#121417",
    light: "#59606b",
  },
  slate: {
    label: "Slate blue",
    top: "#344760",
    floor: "#141b26",
    light: "#5e7899",
  },
  warm: {
    label: "Warm studio",
    top: "#6a5848",
    floor: "#251d17",
    light: "#a08a74",
  },
  light: {
    label: "Soft white",
    top: "#ecebe8",
    floor: "#c4c0b9",
    light: "#ffffff",
  },
} as const;
export type StudioLook = keyof typeof STUDIO_LOOKS;

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Must match the installed @mediapipe/tasks-vision (a test checks this). */
export const MEDIAPIPE_VERSION = "1.2.2";
export const MEDIAPIPE_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
/** Google's selfie segmenter (about 250 KB), version 1. */
export const SELFIE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite";

/** Each half of the recording is at most this many pixels on its long side. */
export const MAX_FX_SIDE = 960;
/** The segmenter works on a small copy of the frame (it is a 256 × 256 model anyway). */
const MASK_WIDTH = 256;

export function fxSupported(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return (
      typeof canvas.captureStream === "function" &&
      Boolean(canvas.getContext("webgl2"))
    );
  } catch {
    return false;
  }
}

let segmenterPromise: Promise<ImageSegmenter> | null = null;

/** Loads the runtime and model once per page (a few MB, cached by the browser after). */
export function loadSegmenter(): Promise<ImageSegmenter> {
  segmenterPromise ??= (async () => {
    const { FilesetResolver, ImageSegmenter } = await import(
      "@mediapipe/tasks-vision"
    );
    const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
    const create = (delegate: "GPU" | "CPU") =>
      ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: SELFIE_MODEL, delegate },
        runningMode: "VIDEO",
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
    try {
      return await create("GPU");
    } catch {
      return await create("CPU");
    }
  })();
  segmenterPromise.catch(() => {
    segmenterPromise = null;
  });
  return segmenterPromise;
}

/** Output size for a camera frame: each half fits MAX_FX_SIDE, even numbers (for encoders). */
export function fxSize(
  videoWidth: number,
  videoHeight: number,
  mode: FxMode,
): { width: number; height: number; half: number } {
  const scale = Math.min(1, MAX_FX_SIDE / Math.max(videoWidth, videoHeight));
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  const width = even(videoWidth * scale);
  const half = even(videoHeight * scale);
  return { width, height: mode === "cutout" ? half * 2 : half, half };
}

const VERTEX = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5); // y down, like the image
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision mediump float;
uniform sampler2D u_cam;
uniform sampler2D u_mask;
uniform int u_pass;      // 0: blurred background, 1: picture, 2: mask, 3: studio
uniform vec2 u_texel;    // one camera texel
uniform vec3 u_top;      // studio: backdrop colours
uniform vec3 u_floor;
uniform vec3 u_light;
uniform float u_gain;    // studio: exposure for the person (auto)
uniform float u_aspect;  // width / height of the picture
in vec2 v_uv;
out vec4 o;
float person(vec2 uv) {
  return smoothstep(0.3, 0.7, texture(u_mask, uv).r);
}
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
vec3 grade(vec3 c) {
  c *= u_gain;
  c = (c - 0.5) * 1.07 + 0.505;                      // a touch of contrast
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, 1.06);                         // and of colour
  return clamp(c * vec3(1.02, 1.0, 0.975), 0.0, 1.0); // slightly warm
}
vec3 backdrop(vec2 uv) {
  vec3 base = mix(u_top, u_floor, smoothstep(0.05, 1.0, uv.y));
  vec2 d = (uv - vec2(0.5, 0.36)) * vec2(u_aspect, 1.0);
  base = mix(base, u_light, exp(-dot(d, d) * 2.6) * 0.6); // spotlight behind the speaker
  vec2 v = (uv - 0.5) * vec2(1.0, 1.2);
  base *= mix(0.7, 1.0, smoothstep(0.95, 0.2, length(v)));  // vignette
  return base + (hash(gl_FragCoord.xy) - 0.5) / 255.0;      // dither: no banding
}
void main() {
  if (u_pass == 3) {
    float a = person(v_uv);
    vec3 col = mix(backdrop(v_uv), grade(texture(u_cam, v_uv).rgb), a);
    col += u_light * 0.12 * a * (1.0 - a) * 4.0;              // light wrap on the edges
    o = vec4(col, 1.0);
    return;
  }
  if (u_pass == 2) {
    float m = person(v_uv);
    o = vec4(m, m, m, 1.0);
    return;
  }
  vec3 cam = texture(u_cam, v_uv).rgb;
  if (u_pass == 1) {
    o = vec4(cam, 1.0);
    return;
  }
  // Soft blur from a low mip level plus a ring of samples around it.
  vec3 blur = vec3(0.0);
  float lod = 4.5;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    blur += textureLod(u_cam, v_uv + vec2(cos(a), sin(a)) * u_texel * 24.0, lod).rgb;
  }
  blur = blur / 8.0;
  o = vec4(mix(blur, cam, person(v_uv)), 1.0);
}`;

function program(gl: WebGL2RenderingContext) {
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(s) ?? "shader");
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, shader(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(p, shader(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(p) ?? "program");
  return p;
}

export type FxEngine = {
  /** What to record (and, for blur, what to show). */
  canvas: HTMLCanvasElement;
  setMode: (mode: FxMode) => void;
  setLook: (look: StudioLook) => void;
  /** Called after each composited frame (the cut-out preview draws from `canvas`). */
  onFrame: (fn: (() => void) | null) => void;
  dispose: () => void;
};

/**
 * Composites `video` (the live camera) through the segmenter, every camera frame, until
 * disposed. Throws when WebGL 2 is not available.
 */
export function createFxEngine(
  video: HTMLVideoElement,
  segmenter: ImageSegmenter,
  initialMode: FxMode,
  initialLook: StudioLook = "charcoal",
): FxEngine {
  let mode = initialMode;
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    preserveDrawingBuffer: true, // the preview reads this canvas after each frame
  });
  if (!gl) throw new Error("webgl2");
  const prog = program(gl);
  gl.useProgram(prog);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const loc = gl.getAttribLocation(prog, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const texture = (unit: number, mipmap: boolean) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      mipmap ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  };
  const camTex = texture(0, true);
  const maskTex = texture(1, false);
  gl.uniform1i(gl.getUniformLocation(prog, "u_cam"), 0);
  gl.uniform1i(gl.getUniformLocation(prog, "u_mask"), 1);
  const uPass = gl.getUniformLocation(prog, "u_pass");
  const uTexel = gl.getUniformLocation(prog, "u_texel");
  const uTop = gl.getUniformLocation(prog, "u_top");
  const uFloor = gl.getUniformLocation(prog, "u_floor");
  const uLight = gl.getUniformLocation(prog, "u_light");
  const uGain = gl.getUniformLocation(prog, "u_gain");
  const uAspect = gl.getUniformLocation(prog, "u_aspect");
  let look: StudioLook = initialLook;
  let gain = 1;
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

  const small = document.createElement("canvas");
  const smallCtx = small.getContext("2d", { willReadFrequently: true })!;
  let mask: Uint8Array | null = null;
  let segmentEvery = 1;
  let frameNo = 0;
  let lastTimestamp = 0;
  let after: (() => void) | null = null;
  let disposed = false;

  const segment = () => {
    const w = MASK_WIDTH;
    const h = Math.max(
      2,
      Math.round((video.videoHeight / video.videoWidth) * w),
    );
    if (small.width !== w || small.height !== h) {
      small.width = w;
      small.height = h;
      mask = null;
    }
    smallCtx.drawImage(video, 0, 0, w, h);
    const now = Math.max(performance.now(), lastTimestamp + 1);
    lastTimestamp = now;
    const started = performance.now();
    const result = segmenter.segmentForVideo(small, now);
    try {
      const confidence = result.confidenceMasks?.[0];
      if (!confidence) return;
      const values = confidence.getAsFloat32Array();
      const mw = confidence.width;
      const mh = confidence.height;
      if (!mask || mask.length !== mw * mh) mask = new Uint8Array(mw * mh);
      // A little temporal smoothing keeps hair edges from flickering.
      for (let i = 0; i < values.length; i++)
        mask[i] = Math.round(mask[i]! * 0.35 + values[i]! * 255 * 0.65);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, maskTex);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.R8,
        mw,
        mh,
        0,
        gl.RED,
        gl.UNSIGNED_BYTE,
        mask,
      );
      if (mode === "studio") meter(mw, mh);
    } finally {
      result.close();
    }
    // Slow devices: segment every other (or third) frame, keep compositing every frame.
    const took = performance.now() - started;
    segmentEvery = took > 45 ? 3 : took > 25 ? 2 : 1;
  };

  /** Auto exposure: brighten a dim speaker (or calm a bright one), smoothed over time. */
  const meter = (mw: number, mh: number) => {
    if (!mask || mw !== small.width || mh !== small.height) return;
    const px = smallCtx.getImageData(0, 0, mw, mh).data;
    let sum = 0;
    let weight = 0;
    for (let i = 0; i < mask.length; i += 4) {
      const m = mask[i]! / 255;
      if (m < 0.5) continue;
      sum +=
        (0.299 * px[i * 4]! + 0.587 * px[i * 4 + 1]! + 0.114 * px[i * 4 + 2]!) *
        m;
      weight += m;
    }
    if (weight < 50) return;
    const mean = sum / weight / 255;
    const target = Math.min(1.5, Math.max(0.85, 0.52 / Math.max(mean, 0.05)));
    gain = gain * 0.92 + target * 0.08;
  };

  const draw = () => {
    if (video.readyState < 2 || !video.videoWidth) return;
    const { width, height, half } = fxSize(
      video.videoWidth,
      video.videoHeight,
      mode,
    );
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    if (frameNo++ % segmentEvery === 0 || !mask) segment();
    if (!mask) return;

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, camTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.uniform2f(uTexel, 1 / video.videoWidth, 1 / video.videoHeight);

    if (mode === "blur") {
      gl.viewport(0, 0, width, half);
      gl.uniform1i(uPass, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    } else if (mode === "studio") {
      const l = STUDIO_LOOKS[look];
      gl.uniform3f(uTop, ...rgb(l.top));
      gl.uniform3f(uFloor, ...rgb(l.floor));
      gl.uniform3f(uLight, ...rgb(l.light));
      gl.uniform1f(uGain, gain);
      gl.uniform1f(uAspect, width / half);
      gl.viewport(0, 0, width, half);
      gl.uniform1i(uPass, 3);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    } else {
      // GL's y axis points up: the top half of the canvas is the upper viewport.
      gl.viewport(0, half, width, half);
      gl.uniform1i(uPass, 1);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.viewport(0, 0, width, half);
      gl.uniform1i(uPass, 2);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    after?.();
  };

  // requestAnimationFrame (not requestVideoFrameCallback), so a camera switch, which
  // replaces the stream, never stalls the loop. Draws only when the camera has a new frame.
  let raf = 0;
  let lastTime = -1;
  const loop = () => {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    if (video.currentTime === lastTime) return;
    lastTime = video.currentTime;
    try {
      draw();
    } catch {
      // A frame that fails (camera switching) is skipped.
    }
  };
  raf = requestAnimationFrame(loop);

  return {
    canvas,
    setMode(next) {
      mode = next;
    },
    setLook(next) {
      look = next;
    },
    onFrame(fn) {
      after = fn;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
