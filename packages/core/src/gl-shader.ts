export const VERTEX = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

export const COPY = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
void main() { gl_FragColor = texture2D(uTex, vUv); }`

/** `taps` is baked in per quality level: GLSL ES 1.0 loops need constant bounds. */
export const effectShader = (taps: number) => `
precision mediump float;
#define TAPS ${taps}
varying vec2 vUv;
uniform sampler2D uTex;
uniform sampler2D uPrev;
uniform vec2 uRes;
uniform float uTime, uCurv, uVig, uScanA, uScanGap, uTintA, uAberr, uNoise, uPersist, uFlicker;
uniform vec3 uTint, uBloom, uBg;
uniform vec4 uCrop;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

// uCrop maps screen uv into source uv, which is how object-fit cover/contain/fill is honoured.
// The k factor tapers the split to nothing at the picture edge; without it the clamped R and B samples
// smear the outermost column into a red and blue outline around the whole screen.
vec3 sampleAberr(vec2 uv, float k) {
  vec2 f = vec2(uAberr / uRes.x * uCrop.z, 0.0) * k;
  return vec3(texture2D(uTex, uv - f).r, texture2D(uTex, uv).g, texture2D(uTex, uv + f).b);
}

// Distance from this pixel to the nearest edge of the unit square, in uv units.
float inset(vec2 p) {
  vec2 d = min(p, 1.0 - p);
  return min(d.x, d.y);
}

void main() {
  vec2 c = vUv * 2.0 - 1.0;
  vec2 screen = c * (1.0 + uCurv * dot(c, c)) * 0.5 + 0.5;
  vec2 uv = uCrop.xy + screen * uCrop.zw;
  // ~2.5 buffer px of feather: enough to read as a smooth curve at any DPR, still a crisp edge.
  float px = 2.5 / min(uRes.x, uRes.y);
  float near = min(inset(screen), inset(uv));
  float edge = smoothstep(0.0, px, near);
  if (edge <= 0.0) { gl_FragColor = vec4(uBg, 1.0); return; }
  float split = clamp(near * uRes.x / max(uAberr * uCrop.z, 0.001), 0.0, 1.0);
  uv = clamp(uv, 0.0, 1.0);

  vec3 col = sampleAberr(uv, split);

  if (uBloom.y > 0.0) {
    vec3 glow = vec3(0.0);
    for (int i = 0; i < TAPS; i++) {
      float a = float(i) * 2.39996;
      float r = sqrt((float(i) + 0.5) / float(TAPS)) * uBloom.x;
      vec3 s = texture2D(uTex, uv + vec2(cos(a), sin(a)) * r / uRes * uCrop.zw).rgb;
      glow += max(s - uBloom.z, 0.0) / max(1.0 - uBloom.z, 0.02);
    }
    col += glow / float(TAPS) * uBloom.y * 1.6;
  }

  if (uTintA > 0.0) {
    vec3 w = vec3(0.299, 0.587, 0.114);
    vec3 tinted = clamp(uTint * dot(col, w) / max(dot(uTint, w), 0.001), 0.0, 1.0);
    col = mix(col, tinted, uTintA);
  }

  // A cosine profile rather than hard bands: at any gap and DPR it cannot alias into moire.
  col *= 1.0 - uScanA * (0.5 + 0.5 * cos(6.2831853 * gl_FragCoord.y / max(uScanGap, 2.0)));
  col += (hash(gl_FragCoord.xy + fract(uTime) * 97.0) - 0.5) * uNoise;
  col *= 1.0 - uFlicker * 0.07 * step(0.93, hash(vec2(floor(uTime * 24.0), 3.0)));
  col *= 1.0 - uVig * clamp((length(c) / 1.4142 - 0.45) / 0.55, 0.0, 1.0);

  col = mix(uBg, col, edge);
  vec3 prev = texture2D(uPrev, vUv).rgb;
  gl_FragColor = vec4(max(col, prev * uPersist), 1.0);
}`
