/**
 * Draws a "stacked" cut-out frame (picture on top, black-and-white mask of the person below,
 * see INTRO_BACKGROUNDS) onto a transparent canvas, so only the person shows over the page.
 * Plain WebGL 1 (every browser with WebGL, Safari included). Browser only; no React.
 */

export type StackedSource =
  | HTMLVideoElement
  | HTMLImageElement
  | HTMLCanvasElement;

export type StackedFit = {
  /** "cover" fills the canvas (cropping); "contain" shows the whole picture. */
  fit: "cover" | "contain";
  /** Where to crop vertically when covering: 0 = keep the top (heads), 0.5 = centre. */
  anchorY?: number;
  /** Feather the bottom edge (0..1 of the height) so a cropped body fades out. */
  fadeBottom?: number;
};

export type StackedRenderer = {
  /** Throws a SecurityError for a cross-origin source without CORS. */
  draw: (source: StackedSource, fit: StackedFit) => boolean;
  dispose: () => void;
};

const VERTEX = `
attribute vec2 a_pos;
uniform vec4 u_rect;   // visible part of the picture: x, y, width, height (0..1, y down)
varying vec2 v_uv;
varying float v_y;
void main() {
  vec2 t = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5); // 0..1, y down
  v_uv = u_rect.xy + t * u_rect.zw;
  v_y = t.y;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAGMENT = `
precision mediump float;
uniform sampler2D u_tex;
uniform float u_texel;   // half a texel of the stacked texture, vertically
uniform float u_fade;
varying vec2 v_uv;
varying float v_y;
void main() {
  if (v_uv.x < 0.0 || v_uv.x > 1.0 || v_uv.y < 0.0 || v_uv.y > 1.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  float top = clamp(v_uv.y * 0.5, 0.0, 0.5 - u_texel);
  vec3 color = texture2D(u_tex, vec2(v_uv.x, top)).rgb;
  float mask = texture2D(u_tex, vec2(v_uv.x, max(0.5 + top, 0.5 + u_texel))).r;
  // Slightly tighter than the middle: trims the halo of background around hair/shoulders.
  float alpha = smoothstep(0.4, 0.85, mask);
  if (u_fade > 0.0) alpha *= smoothstep(1.0, 1.0 - u_fade, v_y);
  gl_FragColor = vec4(color * alpha, alpha);
}`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function sourceSize(source: StackedSource): [number, number] {
  if (source instanceof HTMLVideoElement)
    return [source.videoWidth, source.videoHeight];
  if (source instanceof HTMLImageElement)
    return [source.naturalWidth, source.naturalHeight];
  return [source.width, source.height];
}

/** The picture's aspect ratio (width / height of the top half), or null before it loads. */
export function stackedAspect(source: StackedSource): number | null {
  const [w, h] = sourceSize(source);
  return w && h ? w / (h / 2) : null;
}

export function createStackedRenderer(
  canvas: HTMLCanvasElement,
): StackedRenderer | null {
  let gl: WebGLRenderingContext | null = null;
  try {
    gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      preserveDrawingBuffer: false,
    });
  } catch {
    gl = null;
  }
  if (!gl) return null;
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram();
  if (!vs || !fs || !program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const pos = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

  const uRect = gl.getUniformLocation(program, "u_rect");
  const uTexel = gl.getUniformLocation(program, "u_texel");
  const uFade = gl.getUniformLocation(program, "u_fade");

  return {
    draw(source, { fit, anchorY = 0.15, fadeBottom = 0 }) {
      const [sw, sh] = sourceSize(source);
      if (!gl || !sw || !sh) return false;
      // Drawing buffer follows the canvas's CSS size (sharp on high-DPI screens, capped).
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const cw = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const ch = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      gl.viewport(0, 0, cw, ch);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source,
      );
      // Map the canvas onto the picture (the top half of the source).
      const pictureAspect = sw / (sh / 2);
      const canvasAspect = cw / ch;
      let rect: [number, number, number, number];
      if (fit === "cover") {
        if (pictureAspect > canvasAspect) {
          const w = canvasAspect / pictureAspect;
          rect = [(1 - w) / 2, 0, w, 1];
        } else {
          const h = pictureAspect / canvasAspect;
          rect = [0, (1 - h) * anchorY, 1, h];
        }
      } else if (pictureAspect > canvasAspect) {
        const h = pictureAspect / canvasAspect; // > 1: transparent bands above / below
        rect = [0, (1 - h) / 2, 1, h];
      } else {
        const w = canvasAspect / pictureAspect;
        rect = [(1 - w) / 2, 0, w, 1];
      }
      gl.uniform4f(uRect, ...rect);
      gl.uniform1f(uTexel, 0.5 / sh);
      gl.uniform1f(uFade, fadeBottom);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return true;
    },
    dispose() {
      // Free what we made, but keep the context: a canvas hands back the same context on the
      // next getContext(), so losing it would break a remount (React does this in dev).
      gl?.deleteTexture(texture);
      gl?.deleteBuffer(buffer);
      gl?.deleteProgram(program);
      gl?.deleteShader(vs);
      gl?.deleteShader(fs);
      gl = null;
    },
  };
}
