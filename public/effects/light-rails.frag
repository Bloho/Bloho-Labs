// Light Rails by Dinesh — https://light-stroke-rail.vercel.app/

precision highp float;
#define TAU 6.2831853

uniform vec2  uRes;
uniform float uTime, uFade, uSway;

uniform int   uShape;
uniform float uLines, uEdge, uBase, uSpan, uFlare, uWarpA, uWarpB;
uniform vec2  uC0, uC1, uC2, uC3;   // custom path control points, scene units
uniform float uRibDepth, uRibSoft;
uniform vec2  uSeam;           // dark centre seam: depth, width
// generic per-shape knobs. Every shape gets to define what these mean for
// itself; the panel only shows the ones the active shape declares in
// SHAPE_UI, under that shape's own label. Shapes that ignore them cost
// nothing — the sliders simply never appear.
uniform float uP1, uP2, uP3;
// the gradient run: stretch along the shape, ordering jitter, and the floor
// under the Trails envelope that keeps the shape on screen between waves
uniform float uRunV, uJitter, uHold;
// outline mode: 0 = solid fill, 1 = only a thin wall at the silhouette
uniform float uHollow;

uniform vec3  uStops[6];
uniform int   uNStops;
uniform float uDwell;

uniform float uLife, uDelay, uVLag, uPre, uTail, uRise, uFall;
uniform vec4  uCross;          // the four measured white-crossing times
uniform vec3  uNotch;          // centre, width, depth
uniform vec4  uEase;           // cubic-bezier control points

uniform float uGain, uBloom, uBlow;
float gRingLight = 1.0;
vec3  gInkCol = vec3(0.0);    // ASCII rain paints exact inks from the stops
float gInkMix = 0.0;
uniform int   uFlow;               // 0 = measured pulse, 1 = continuous loop
uniform float uBlur;               // edge crispness: low = sharp, high = airbrush
uniform sampler2D uGlyph;          // signed distance field of the typed number
uniform float uGlyphR;             // the range the field was packed over
uniform vec3  uBg;                 // theme background
uniform float uAngle;              // whole-scene rotation, radians
uniform float uGrain;              // film grain amount

// ---- cubic-bezier easing, solved with a few Newton steps ------------------
float bez(float t, float a, float b) {
  float m = 1.0 - t;
  return 3.0 * m * m * t * a + 3.0 * m * t * t * b + t * t * t;
}
float ease(float x) {
  x = clamp(x, 0.0, 1.0);
  float t = x;
  for (int i = 0; i < 5; i++) {
    float m = 1.0 - t;
    float d = 3.0 * m * m * uEase.x + 6.0 * m * t * (uEase.z - uEase.x)
            + 3.0 * t * t * (1.0 - uEase.z);
    if (abs(d) < 1e-4) break;
    t = clamp(t - (bez(t, uEase.x, uEase.z) - x) / d, 0.0, 1.0);
  }
  return bez(t, uEase.y, uEase.w);
}

// ---- the colour list the wave sweeps through and back ---------------------
vec3 gradient(float t) {
  float f = clamp(t, 0.0, 1.0) * float(uNStops - 1);
  vec3 c = uStops[0];
  for (int i = 0; i < 5; i++) {
    if (i >= uNStops - 1) break;
    c = mix(c, uStops[i + 1], clamp(f - float(i), 0.0, 1.0));
  }
  return c;
}

// Phase advances exactly half a cycle between crossings, so the ramp flips
// ends on the keyframed schedule.  Eased inside each segment.
float phase(float a) {
  if (a < uCross.x) return 0.25 - 0.5 * (uCross.x - a) / max(uPre, 1e-3);
  if (a < uCross.y) return 0.25 + 0.5 * ease((a - uCross.x) / max(uCross.y - uCross.x, 1e-4));
  if (a < uCross.z) return 0.75 + 0.5 * ease((a - uCross.y) / max(uCross.z - uCross.y, 1e-4));
  if (a < uCross.w) return 1.25 + 0.5 * ease((a - uCross.z) / max(uCross.w - uCross.z, 1e-4));
  return                     1.75 + 0.5 * (a - uCross.w) / max(uTail, 1e-3);
}

vec3 ramp(float a) {
  float k = cos(TAU * phase(a));
  k = sign(k) * pow(abs(k), uDwell);
  k *= 1.0 - uNotch.z * exp(-pow((a - uNotch.x) / max(uNotch.y, 1e-4), 2.0));
  return gradient(0.5 - 0.5 * k);
}

// Looping palette for flow mode: the stop list wraps and chases forever.
// The per-segment smoothstep is deliberate and was tried both ways: it eases
// the blend rate to zero AT each stop, so every stop holds as a readable
// plateau of its own colour and neighbouring bands keep a defined edge.
// Linear interpolation makes the scroll velocity constant but leaves every
// pixel permanently mid-blend, and the paths smear into each other — tested,
// rejected.
vec3 cyc(float t) {
  float f = fract(t) * float(uNStops);
  float i = floor(f);
  float w = f - i;
  w = w * w * (3.0 - 2.0 * w);
  vec3 a = uStops[0], b = uStops[0];
  for (int k = 0; k < 6; k++) {
    if (float(k) == i) a = uStops[k];
    if (float(k) == i + 1.0) b = uStops[k];
  }
  if (i + 1.0 >= float(uNStops)) b = uStops[0];
  return mix(a, b, w);
}

void main() {
  // Zoom the scene 25% inside the unchanged hero boundary, cropping the top focal point.
  vec2 frag = (gl_FragCoord.xy / uRes - 0.5) / 1.25 + 0.5;
  float v = 1.0 - frag.y;                    // 0 top, 1 bottom
  float aspect = uRes.x / uRes.y;
  // x in screen-height units: the reference clip is portrait, and normalising
  // by height keeps the fan's proportions identical on any canvas aspect
  float x = (frag.x - 0.5) * aspect;

  x -= uSway * sin(uTime * 0.55 + v * 2.4) * (0.35 + 0.65 * v);

  // whole-scene rotation (skipped in custom-path mode, where the drawn
  // handles ARE the orientation)
  if (uShape != 6 && abs(uAngle) > 1e-4) {
    float cA = cos(uAngle), sA = sin(uAngle);
    vec2 rp = vec2(cA * x - sA * (v - 0.5), sA * x + cA * (v - 0.5));
    x = rp.x;
    v = rp.y + 0.5;
  }

  // ---- shape: each mode only has to produce a rail coordinate u ----------
  float W = uBase + uSpan * pow(v, uFlare);
  W *= 1.0 + 0.018 * sin(uTime * 0.40 + 1.7);
  float u;
  float cubeEdge = 0.0;                      // extra edge light for the cube
  float faceDim  = 1.0;                      // cube faces render below clip

  if (uShape == 1) {                         // parallel bars — a barcode, not a fan
    // The old version was x / constant, which is exactly the measured fan with
    // the taper switched off: at any normal setting it rendered identically to
    // shape 0. Now each bar is an independent slab with its own hashed width,
    // its own palette colour, and real background in the gaps — a barcode field
    // that can never collapse back into the fan.
    //   uP1 = width jitter (0 = perfectly even bars), uP2 = gap fraction.
    float b1_p = max(uBase + uSpan * 0.5, 1e-3);
    float b1_s = x / b1_p;
    float b1_i = floor(b1_s);
    float b1_h = fract(sin(b1_i * 12.9898) * 43758.5453);
    float b1_w = mix(1.0, 0.30 + 1.40 * b1_h, uP1) * (1.0 - uP2 * 0.85);
    float b1_d = abs(fract(b1_s) - 0.5) * 2.0;   // 0 bar centre, 1 cell edge
    if (b1_d > b1_w) { u = 40.0; }               // gap = background
    else { u = b1_d / max(b1_w, 1e-3) * uEdge * 0.98; }
    v = fract(b1_i * 0.2137 + 0.5);              // every bar its own colour
    W = 1.0;
  } else if (uShape == 2) {                  // rays from a focal point
    // mirrored about the focus height: a bowtie pinched at warp A
    u = atan(x, max(abs(v - uWarpA), 2e-3)) / 1.5708 * uWarpB;
  } else if (uShape == 3) {                  // ripple rings — wobbling water rings
    // Plain concentric rings were indistinguishable from the tunnel (shape 7),
    // so this is now the ORGANIC ring mode: ring radius is modulated by an
    // angular sine that also drifts in time, giving rings that ripple and
    // breathe instead of sitting perfectly circular.
    //   uP1 = wobble depth, uP2 = wobble lobes, uP3 = drift speed.
    vec2  r3_p = vec2(x - (uWarpA - 0.5), (v - 0.5) - (uWarpB - 1.0));
    float r3_r = length(r3_p);
    float r3_a = atan(r3_p.y, r3_p.x);
    float r3_n = max(floor(uP2 * 12.0 + 0.5), 1.0);
    float r3_w = 1.0 + uP1 * sin(r3_a * r3_n + r3_r * 7.0
                                 + uTime * uP3 * 6.2831853);
    u = r3_r * r3_w / max(uBase + uSpan * 0.5, 1e-3) * 0.42;
    v = clamp(r3_r * 1.5, 0.0, 1.0);
    W = 1.0;
  } else if (uShape == 4) {                  // fan with a sine warp
    u = x / W + uWarpB * 0.35 * sin(v * uWarpA * 3.14159);
  } else if (uShape == 5) {                  // twisted fan
    float ang = (v - 0.5) * uWarpA;
    u = (x * cos(ang) - (v - 0.5) * sin(ang) * uWarpB) / W;
  } else if (uShape == 10) {                 // mirrored beams (projector)
    // two wedges meeting at a waist: wide at top and bottom edges, pinched
    // at warp A height. Colours flow outward from the waist.
    float fb = abs(v - uWarpA) / max(max(uWarpA, 1.0 - uWarpA), 1e-3);
    float Wb = uBase + uSpan * pow(fb, uFlare);
    u = x / max(Wb, 1e-3);
    v = fb;
  } else if (uShape == 11) {                 // horizon: converge to the right
    // the fan turned on its side: a light plane at warp A height, rails
    // spreading vertically as they travel left away from the focus
    float fh = 1.0 - frag.x;
    float Wh = uBase + uSpan * pow(fh, uFlare);
    u = (v - uWarpA) / max(Wh, 1e-3);
    v = fh;
  } else if (uShape == 12) {                 // petal burst
    // the circle split into mirrored lobes; rails run along each petal and
    // pinch at the centre. warp B sets how many petals (2..14).
    vec2 pp = vec2(x, v - 0.5);
    float pr = length(pp);
    float pa = atan(pp.y, pp.x) / 6.2831853;
    float lobes = floor(clamp(uWarpB, 0.0, 3.0) * 4.0 + 2.0);
    float s = fract(pa * lobes) * 2.0 - 1.0;
    float fr = clamp(pr * 1.35, 0.0, 1.0);
    float Wp = uBase + uSpan * pow(fr, uFlare);
    u = s * 0.7 / max(Wp, 1e-3);
    v = fr;
  } else if (uShape == 13) {                 // flower: petal lobes round a core
    // count = number of petals; warp A twists them into a pinwheel;
    // warp B moves the bloom centre up/down (lotus framing);
    // band step > 0 gives the stepped concentric petal rings.
    vec2 fp = vec2(x, (v - 0.5) - (uWarpB - 1.0));
    float fr = length(fp);
    float fa = atan(fp.y, fp.x);
    float petN = max(floor(uLines + 0.5), 2.0);
    float a2 = fa / 6.2831853 * petN + fr * uWarpA * 2.0;
    float lobe = 0.5 + 0.5 * cos(a2 * 6.2831853);
    float petalR = uBase + uSpan * pow(lobe, max(uFlare, 0.2));
    u = fr / max(petalR, 1e-3) * 0.7;
    v = clamp(fr * 1.2, 0.0, 1.0);
    W = 1.0;
  } else if (uShape == 14) {                 // isolated petals — gap between petals = bg
    // Same polar formula as flower (13) but gap pixels get u=40 (background).
    // uSeam.x (centre-seam depth) is REUSED here as gap-width control:
    //   0 = 50% petal / 50% gap (narrow petals)
    //   1 = 90% petal / 10% gap (fat/round petals, like the LUMA reference)
    // The lane seam calculation that follows is harmless at u=40 (intensity=0).
    // p1 = whorl count (1..3): extra petal rings stacked inside, each scaled
    // by p2 and rotated by p3 petal-fractions — the layered-blossom look
    // (lotus reference). Inner whorls draw over outer; outer sit dimmer for
    // depth. p1 <= 1 is exactly the old single-ring behaviour.
    vec2 fp = vec2(x, (v - 0.5) - (uWarpB - 1.0));
    float fr = length(fp);
    float fa = atan(fp.y, fp.x);
    float petN = max(floor(uLines + 0.5), 2.0);
    float gapT = -uSeam.x * 0.92;    // 0 → threshold 0; 1 → threshold -0.92
    float wN   = clamp(floor(uP1 + 0.5), 1.0, 3.0);
    float wSc  = clamp(uP2, 0.40, 0.95);
    float wRot = clamp(uP3, 0.0, 1.0);
    u = 40.0;
    float t14_v = clamp(fr * 1.2, 0.0, 1.0);
    for (int w = 0; w < 3; w++) {
      if (float(w) >= wN) break;
      float sc = pow(wSc, float(w));
      float a2 = fa / 6.2831853 * petN + fr * uWarpA * 2.0
               + float(w) * wRot / petN * 6.2831853 * 0.15915;
      float lobe = cos(a2 * 6.2831853);
      if (lobe > gapT) {
        float lobN = clamp((lobe - gapT) / max(1.0 - gapT, 1e-3), 0.0, 1.0);
        float petalR = (uBase + uSpan * pow(lobN, max(uFlare, 0.2))) * sc;
        float uw = fr / max(petalR, 1e-3) * 0.7;
        if (uw < 0.7 + 0.301) {      // inside this whorl's petal (incl. rim)
          u = uw;
          // outer whorls sit behind: dimmer, and their colour phase shifts
          faceDim = wN > 1.5 ? (1.0 - 0.34 * (1.0 - float(w) / max(wN - 1.0, 1.0))) : 1.0;
          t14_v = clamp(fr * 1.2 / sc, 0.0, 1.0) * 0.86 + float(w) * 0.07;
        }
      }
    }
    v = clamp(t14_v, 0.0, 1.0);
    W = 1.0;
  } else if (uShape == 15) {
    // rounded petals pointing +x/-x/+y/-y from its centre. A petal is exactly
    // half a cell long, so its tip lands on the cell-edge midpoint and meets
    // the tip of the neighbouring cell's petal. Nothing ever reaches the cell
    // CORNERS (0.707 cells out), so the diagonal gaps of the four cells that
    // meet there open into one dark four-pointed star of background.
    //   uP1 = cells across the frame   uP2 = petal fatness   uP3 = swirl
    //   uLines = ribs per petal half-width (they run centre -> tip)
    //   uEdge  = lit fraction of the petal sector (lower = wider dark star)
    float t15_tiles = max(floor(uP1 + 0.5), 1.0);
    float t15_cell  = aspect / t15_tiles;              // square cell, height units
    vec2  t15_q     = vec2(x, v - 0.5) / max(t15_cell, 1e-3);
    vec2  t15_lp    = t15_q - floor(t15_q + 0.5);      // -0.5..0.5 inside one cell
    float t15_r     = length(t15_lp);
    if (t15_r < 1e-4) { t15_lp = vec2(1e-4, 0.0); t15_r = 1e-4; }
    float t15_rn    = t15_r * 2.0;                     // 1.0 exactly at a petal tip

    u = 40.0;                        // default: outside every petal = background
    v = clamp(t15_rn, 0.0, 1.0);     // colour runs cell centre -> petal tip
    W = 1.0;

    if (t15_rn < 1.0) {
      // swirl: the petal midline spirals from angle -sw at the cell centre to
      // angle 0 at the tip, so the tips stay locked onto their neighbours
      // while the body curls round the cell centre.
      float t15_a  = atan(t15_lp.y, t15_lp.x) + uP3 * 1.2 * (1.0 - t15_rn);
      // s = angle normalised inside one 90-degree petal sector:
      // 0 on the petal midline, +-1 on the diagonal between two petals.
      float t15_s  = fract(t15_a * 0.63661977 + 0.5) * 2.0 - 1.0;
      // outline is r = 0.5 * lobe^e with lobe = 0.5 + 0.5*cos(PI*s); solve it
      // for s, so at this radius the petal spans |s| <= t15_sE.
      float t15_e  = mix(2.40, 0.30, clamp(uP2, 0.0, 1.0));
      float t15_lb = pow(max(t15_rn, 1e-4), 1.0 / max(t15_e, 0.05));
      float t15_sE = acos(clamp(2.0 * t15_lb - 1.0, -1.0, 1.0)) * 0.31830989;
      float t15_uu = t15_s / max(t15_sE, 1e-3);        // +-1 on the petal outline
      if (abs(t15_uu) <= max(1.0, uEdge + uBlur * 1.5)) {
        u = t15_uu;
        // W is read only by the comb's anti-alias width estimate: hand it the
        // true screen scale of one |u| unit (arc length across the petal) so
        // the ribs melt smoothly instead of aliasing where they crowd
        // together at the cell centre and at the tip.
        W = max(t15_sE * t15_r * 0.7854 / t15_tiles, 0.006);
      }
    }
  } else if (uShape == 16) {
    // Flat poster rings. |u| is 0.0 for EVERY pixel inside the disc, so every
    // lit pixel sits dead centre of the solid body (body = 1.0, rim = 0.0,
    // comb core = 1.0 uniformly) — nothing is ever in the uEdge/uBlur falloff,
    // which is what makes the edges read as crisp vector edges. |u| is 40.0
    // outside, a clean background hole. ALL ring structure lives in v, which is
    // QUANTISED to the ring index: constant right across one annulus, stepping
    // at each boundary, so the palette colour JUMPS at the edge and never
    // gradients inside a ring.
    //   uLines = ring count   uP1 = centre X   uP2 = centre Y   uP3 = disc scale
    W = 1.0;
    float t16_n  = floor(clamp(uLines, 3.0, 12.0) + 0.5);          // ring count
    float t16_st = max(uP3, 0.03) / max(t16_n, 1.0);               // annulus width
    vec2  t16_p  = vec2(x - uP1, v - uP2);                         // offset centre
    float t16_r  = length(t16_p);
    // FACETING (warp A > 0): the circle becomes a true N-gon — the radius is
    // stretched by the chord formula so every ring edge is a straight line
    // between vertices, and each face carries its own flat palette offset
    // (warp B) so the stack reads as a hard-shaded low-poly model. warpA = 0
    // leaves the original smooth circles untouched.
    float t16_fN  = floor(clamp(uWarpA * 20.0, 0.0, 20.0) + 0.5);
    float t16_fid = 0.0;
    if (t16_fN >= 3.0) {
      float t16_sec = 6.2831853 / t16_fN;
      float t16_th  = atan(t16_p.y, t16_p.x) + 3.14159265;
      t16_fid = floor(t16_th / t16_sec);
      float t16_lc  = mod(t16_th, t16_sec) - t16_sec * 0.5;
      t16_r = t16_r * cos(t16_lc) / cos(t16_sec * 0.5);
    }
    float t16_f  = t16_r / max(t16_st, 1e-3);                      // radius in rings
    if (t16_f >= t16_n) {                    // past the outermost ring -> bg
      u = 40.0;
      v = 1.0;
    } else {
      // one-PIXEL crossfade at each boundary and no wider: aa is a screen pixel
      // (1.0/uRes.y in screen-height units) re-expressed in ring units.
      float t16_aa = clamp((1.0 / max(uRes.y, 1.0)) / max(t16_st, 1e-3), 1e-4, 0.45);
      float t16_k  = floor(t16_f);                                 // ring index
      float t16_id = t16_k + smoothstep(1.0 - t16_aa, 1.0, t16_f - t16_k);
      t16_id = min(t16_id, t16_n - 1.0);     // outer rim cuts to bg, never blends
      u = 0.0;                               // dead centre of the solid body
      // ring index -> flow coordinate. The palette phase downstream is built as
      // -(1.0 - v)*0.50, so letting v run 0..2 walks a FULL palette cycle and
      // neighbouring rings land on well-separated poster colours.
      v = 2.0 * t16_id / max(t16_n, 1.0);
      if (t16_fN >= 3.0) {
        // flat per-face tint: a hash of (face, ring) nudges the palette
        // sample — constant inside a face, stepping hard at its edges
        float t16_fh = fract(sin(t16_fid * 12.9898 + t16_k * 78.233) * 43758.5453);
        v += (t16_fh - 0.5) * clamp(uWarpB, 0.0, 1.0) * 0.34;
      }
    }
  } else if (uShape == 17) {
    // hourglass: wide at both frame edges, pinched at the waist. The vertical axis
    // is remapped so a ring's HEIGHT scales with its radius — tiny rings at the
    // waist, huge ones at the flares, all with identical proportions.
    //   R(y) = Rw * (1 + (t/c)^2),  t = y - waist        (rational hourglass)
    //   g(y) = integral dy/R  ->  atan, so equal-g bands are self-similar
    // p1 = ring count, p2 = waist tightness, p3 = waist height,
    // warp A = ring squash (tube fatness / scallop depth),
    // warp B = palette jump per ring, base width = column radius at the flares.
    W = 1.0;
    float t17_y  = clamp(v, 0.0, 1.0);                 // 0 frame top, 1 frame bottom
    float t17_N  = floor(clamp(uP1, 4.0, 24.0) + 0.5); // rings
    float t17_wy = clamp(uP3, 0.06, 0.94);             // waist height
    float t17_tw = clamp(uP2, 0.02, 0.95);             // waist tightness
    float t17_sq = clamp(uWarpA, 0.0, 0.95);           // ring squash
    float t17_Rx = max(uBase, 0.04);                   // radius at the flared ends

    float t17_em = max(t17_wy, 1.0 - t17_wy);
    float t17_c  = t17_em * sqrt((1.0 - t17_tw) / max(t17_tw, 1e-3));
    float t17_Rw = t17_Rx * (1.0 - t17_tw);            // waist radius
    float t17_a0 = atan(t17_wy / max(t17_c, 1e-4));
    float t17_a1 = atan((1.0 - t17_wy) / max(t17_c, 1e-4));
    float t17_sp = max(t17_a0 + t17_a1, 1e-3);

    // --- band split: equal steps in g, not in y -----------------------------
    float t17_g  = t17_N * (atan((t17_y - t17_wy) / max(t17_c, 1e-4)) + t17_a0) / t17_sp;
    float t17_k  = floor(t17_g);
    float t17_s  = fract(t17_g) * 2.0 - 1.0;           // -1 ring top .. +1 ring bottom

    // --- this ring's radius, straight from its band centre ------------------
    float t17_th = (t17_k + 0.5) * t17_sp / max(t17_N, 1.0) - t17_a0;
    float t17_ct = max(cos(t17_th), 1e-3);
    float t17_R  = t17_Rw / (t17_ct * t17_ct);

    // --- tube cross-section: major radius R*(1-sq) + tube bulge R*sq --------
    float t17_bl = sqrt(max(1.0 - t17_s * t17_s, 0.0));
    float t17_hw = t17_R * (1.0 - t17_sq + t17_sq * t17_bl);
    float t17_q  = abs(x) / max(t17_hw, 1e-4);         // 0 = axis, 1 = silhouette

    u = t17_q * uEdge;                                 // |u| < uEdge = on the tube
    if (t17_q > 2.40) u = 40.0;                        // far field = pure background

    // --- gloss: hot specular band on the upper face, dark underside ---------
    float t17_in = 1.0 - smoothstep(0.88, 1.02, t17_q);
    float t17_g1 = (t17_s + 0.38) / 0.17;
    float t17_g2 = (t17_s + 0.05) / 0.58;
    float t17_cf = 0.35 + 0.65 * (1.0 - smoothstep(0.10, 0.95, t17_q));
    cubeEdge = t17_in * t17_cf * (3.40 * exp(-t17_g1 * t17_g1)
                                + 0.50 * exp(-t17_g2 * t17_g2));

    faceDim = mix(1.0, 0.12, smoothstep(0.02, 0.92, t17_s))       // shaded underside
            * (1.0 - 0.34 * smoothstep(0.45, 1.0, t17_q))         // rim roll-off
            * (1.0 - 0.55 * smoothstep(0.78, 1.0, abs(t17_s)));   // ring-to-ring contact

    // --- one palette colour per ring: v hops by warp B on every band --------
    // (the small t17_s term tilts the hue from a ring's top to its underside,
    //  the way a lit rubber tube shifts colour as it turns away)
    v = fract(0.05 + t17_k * clamp(uWarpB, 0.0, 1.0) + t17_s * 0.05);
  } else if (uShape == 18) {
    W = 1.0;

    // --- knobs.  NOTE: uSeam is deliberately NOT repurposed - the pipeline
    //     still reads it after this branch (lane *= 1 - uSeam.x*exp(...)).
    float t18_sx   = (clamp(uP1, 0.0, 1.0) - 0.5) * aspect;         // source x
    float t18_sy   = 1.0 - clamp(uP2, 0.0, 1.0);                    // source y, slider 1 = TOP
    float t18_rd   = clamp(uBase,  0.004, 0.060);                   // source dot radius
    float t18_dens = clamp(uWarpA, 0.80,  6.00);                    // shells per e-fold of radius
    float t18_duty = clamp(uWarpB, 0.15,  0.95);                    // solid fraction of one period
    float t18_half = clamp(uP3,    0.05,  3.15);                    // cone half-angle, >=pi = full circle
    float t18_stp  = clamp(uSpan,  0.0,   1.0);                     // palette step between shells
    float t18_gsp  = clamp(uFlare, 0.0,   0.70);                    // palette span across one crescent

    float t18_r0   = t18_rd + 0.020;                                // radius of shell #0
    float t18_aa   = max(1.4 / max(uRes.y, 1.0), 1e-5);             // ~1.4 px in screen-height units

    float t18_dx   = x - t18_sx;
    float t18_dy   = v - t18_sy;                                    // +ve = below the source
    float t18_r    = sqrt(t18_dx * t18_dx + t18_dy * t18_dy) + 1e-5;

    // --- element A: the source dot ---------------------------------------
    float t18_sd   = t18_r - t18_rd;                                // signed dist, <=0 inside
    float t18_col  = 0.015;                                         // its palette coordinate

    // --- element B: nearest right-facing shell ---------------------------
    float t18_k    = t18_dens * log(max(t18_r, 1e-4) / max(t18_r0, 1e-3));  // LOG radius
    float t18_n    = floor(t18_k + 0.5);                            // shell index, 0 = innermost
    float t18_c    = t18_k - t18_n;                                 // signed offset in the period
    float t18_hw   = 0.5 * t18_duty * t18_r / max(t18_dens, 1e-3);  // half thickness, screen units
    float t18_dr   = abs(t18_c) * t18_r / max(t18_dens, 1e-3);      // dist from the centreline
    float t18_a    = atan(t18_dy, t18_dx);                          // 0 = straight right
    float t18_ro   = t18_dr - t18_hw;                               // >0 outside the band
    float t18_ao   = (abs(t18_a) - t18_half) * t18_r;               // >0 outside the cone
    float t18_sds  = length(vec2(max(t18_ro, 0.0), max(t18_ao, 0.0)))
                   + min(max(t18_ro, t18_ao), 0.0);                 // box SDF of the crescent
    if (t18_n < 0.0) { t18_sds = 9.0; }                             // nothing inboard of shell #0

    // vertical gradient across the crescent, normalised to the visible wedge
    float t18_sn   = max(sin(min(t18_half, 1.5707963)), 0.15);
    float t18_g    = clamp(0.5 + 0.5 * (t18_dy / max(t18_r, 1e-4)) / t18_sn, 0.0, 1.0);
    // per-shell base offset + gradient on top. Compressed by (1-gsp) so the
    // walk is MONOTONE inside a shell and can never fold or wrap the palette.
    float t18_cs   = fract(t18_n * t18_stp) * (1.0 - t18_gsp) + t18_gsp * t18_g;

    if (t18_sds < t18_sd) { t18_sd = t18_sds; t18_col = t18_cs; }

    // --- SDF -> |u|.  FLAT ZERO inside the body, so every lit pixel shares one
    //     comb lane (one rnd hue), one uSeam value and one |u| phase term; all
    //     the colour variation therefore comes from v, as designed. The entire
    //     edge transition lives in the uEdge..uEdge+uBlur window and is a fixed
    //     ~1.4 px wide at any radius, so the tight inner shells do not alias.
    if (t18_sd <= 0.0) {
        u = 0.0;
    } else {
        u = min(uEdge + (uBlur + 0.04) * (t18_sd / t18_aa), 40.0);  // ->40 = pure background
    }

    // hot core, confined strictly inside the dot: adds nothing to background
    cubeEdge = 0.55 * (1.0 - smoothstep(0.0, t18_rd, t18_r));

    v = clamp(t18_col, 0.0, 1.0);
  } else if (uShape == 19) {
    // slot carries one horizontally-stretched pointed oval whose local
    // half-height is  h(x) = hH * (1 - |x/hW|^pw), so the left/right ends come
    // to a point and the middle bulges.  t19_r = |vertical offset| / h(x) is
    // the lens coordinate: 0 on the midline, 1 on the outline, >1 in the gaps.
    // KEY FIX: r is mapped to |u| starting exactly AT uEdge and rising, i.e.
    //     |u| = uEdge + reach * r^gs .
    // Because the pipeline's rim bump peaks at |u| = uEdge, that peak now lands
    // on the lens midline, and body, rim and bloom all decrease monotonically
    // as r grows -> a genuinely hot near-white midline with a soft additive
    // falloff, no off-axis white ring, no flat blown-out slab.  Nothing is
    // chopped vertically: r keeps growing through the gap, so |u| climbs past
    // the bloom radius on its own and the dark band appears naturally.
    W = 1.0;
    float t19_n    = clamp(floor(uP1 + 0.5), 2.0, 14.0);    // lens count
    float t19_asp  = clamp(uP2, 1.0, 30.0);                 // width : height
    float t19_tap  = clamp(uP3, 0.0, 1.0);                  // stack taper
    float t19_soft = clamp(uWarpA, 0.0, 1.0);               // glow softness
    float t19_pw   = clamp(uWarpB, 0.6, 6.0);               // tip sharpness
    float t19_fill = clamp(uBase, 0.15, 0.98);              // lens height / slot
    float t19_sh   = clamp(uSpan * 1.7, 0.15, 1.8);         // whole-stack height
    float t19_y    = (v - 0.5) / max(t19_sh, 1e-3) + 0.5;   // 0 top .. 1 bottom
    if (t19_y < 0.0 || t19_y > 1.0) {
        u = 40.0;                                           // above / below stack
        v = 0.5;
    } else {
        float t19_c  = t19_y * t19_n;
        float t19_i  = min(floor(t19_c), t19_n - 1.0);      // which lens
        float t19_f  = t19_c - t19_i;                       // 0..1 down the slot
        // taper: middle lenses widest, the ends of the stack narrow
        float t19_s  = ((t19_i + 0.5) / max(t19_n, 1e-3)) * 2.0 - 1.0;
        float t19_k  = 1.0 - t19_tap * pow(max(abs(t19_s), 1e-4), 1.5);
        float t19_hH = 0.5 * (t19_sh / max(t19_n, 1e-3)) * t19_fill;
        float t19_hW = t19_hH * t19_asp * max(t19_k, 0.05);
        float t19_xn = min(abs(x) / max(t19_hW, 1e-3), 8.0); // 0 centre .. 1 tip
        if (t19_xn >= 1.0) {
            u = 40.0;                                       // outside the lens box
            v = 0.5;
        } else {
            float t19_dy = (t19_f - 0.5) * 2.0 / max(t19_fill, 1e-3); // +-1 at rim
            float t19_pr = 1.0 - pow(max(t19_xn, 1e-4), t19_pw);      // 1 mid, 0 tip
            // extra push in the last 10% of the half-width so the midline sliver
            // converges to a point instead of terminating on a vertical cut
            float t19_tp = 4.0 * smoothstep(0.90, 1.0, t19_xn);
            float t19_r  = min(abs(t19_dy) / max(t19_pr, 1e-3) + t19_tp, 4.0);
            // gs < 1 -> |u| leaves uEdge fast: thin hot core, long gentle halo.
            // gs > 1 -> |u| lingers near uEdge: fuller, more solid lens body.
            float t19_gs = mix(1.80, 0.55, t19_soft);
            float t19_gw = 1.45 * max(uBlur, 0.22);         // glow reach in |u|
            u = uEdge + t19_gw * pow(max(t19_r, 1e-5), t19_gs);
            // one palette band per lens, with a slight gradient down each lens
            v = clamp(((t19_i + 0.5) + (t19_f - 0.5) * 0.30) / max(t19_n, 1e-3),
                      0.0, 1.0);
        }
    }
  } else if (uShape == 20) {
    // The frame is FOLDED into one quadrant (mx, my); the tunnel is drawn
    // once in there, so four mirrored copies meet along the frame's two
    // centre lines. Everything is measured in screen-HEIGHT units, so the
    // rounded squares stay square on any canvas aspect.
    float t20_hx = max(aspect * 0.5, 1e-3);      // quadrant half width
    float t20_hy = 0.5;                          // quadrant half height
    float t20_mx = abs(x);                       // 0 on the vertical centre line
    float t20_my = abs(v - 0.5);                 // 0 on the horizontal centre line

    // vanishing point of this quadrant, slid from the frame centre out
    // toward the quadrant's own outer corner (0 = on the centre lines,
    // 1 = frame corner). It sits on the frame-centre-to-corner diagonal.
    float t20_cf = clamp(uWarpA, 0.05, 0.95);
    float t20_dx = abs(t20_mx - t20_cf * t20_hx);
    float t20_dy = abs(t20_my - t20_cf * t20_hy);

    // squircle norm (|dx|^n + |dy|^n)^(1/n), factored through the larger
    // component so pow() only ever sees a 0..1 base: n = 2 circle,
    // n = 4 rounded square, n = 8 near-square.
    float t20_n  = clamp(uP1, 2.0, 8.0);
    float t20_hi = max(t20_dx, t20_dy);
    float t20_k  = min(t20_dx, t20_dy) / max(t20_hi, 1e-4);
    float t20_r  = t20_hi * pow(1.0 + pow(t20_k, t20_n), 1.0 / t20_n);

    // the same norm at the quadrant corner farthest from that vanishing
    // point: normalises r so the OUTERMOST ring lands exactly on it and
    // nothing in the quadrant ever escapes |u| > uEdge.
    float t20_ef = max(t20_cf, 1.0 - t20_cf);
    float t20_ex = t20_ef * t20_hx;
    float t20_ey = t20_ef * t20_hy;
    float t20_eh = max(t20_ex, t20_ey);
    float t20_ek = min(t20_ex, t20_ey) / max(t20_eh, 1e-4);
    float t20_R  = t20_eh * pow(1.0 + pow(t20_ek, t20_n), 1.0 / t20_n);
    float t20_t  = clamp(t20_r / max(t20_R, 1e-3), 0.0, 1.0);

    // depth curve: < 1 crowds the rings toward the vanishing point the way
    // perspective does, 1 = evenly spaced, > 1 crowds them at the outside.
    float t20_s  = pow(t20_t, clamp(uP2, 0.2, 2.5));

    // one comb cell per ring. u = s*uEdge makes au/stp == s*uLines exactly
    // (stp = uEdge/uLines), so ring boundaries land on the comb MINIMA and
    // on the flow-mode rail index for any uEdge — no moire, and every ring
    // keeps one coherent hue. au tops out at exactly uEdge: all lit.
    float t20_rings = max(uLines, 1.0);
    float t20_sn = t20_s * t20_rings;
    u = t20_s * uEdge;

    // colour staircase: flat across each ring, soft glowing blend over the
    // boundary. uWarpB = half the blend width, measured in rings.
    float t20_hs = clamp(uWarpB, 0.02, 0.49);
    float t20_id = floor(t20_sn)
                 + smoothstep(0.5 - t20_hs, 0.5 + t20_hs, fract(t20_sn));
    v = clamp(t20_id / t20_rings, 0.0, 1.0);

    // thin dark seam down BOTH centre lines, where the four copies meet
    float t20_sw = clamp(uSeam.y, 0.001, 0.06);
    float t20_sd = min(t20_mx, t20_my);          // distance to nearest centre line
    faceDim = 1.0 - clamp(uP3, 0.0, 1.0)
            * (1.0 - smoothstep(t20_sw, t20_sw * 2.2 + 0.006, t20_sd));
    W = 1.0;
  } else if (uShape == 21) {
    // Coarse uP1 x uP2 grid. Column i is filled from the BOTTOM up to
    // (rows - floor(i*uP3)) whole cells, so the fill line walks DOWN the
    // frame in discrete jumps. Cells above the line are cut to background
    // (u = 40); cells below are SOLID and carry uLines crisp horizontal
    // stripes painted by the rib comb.
    float t21_gx  = frag.x;                              // 0 left .. 1 right
    float t21_gy  = v;                                   // 0 top  .. 1 bottom
    float t21_nc  = floor(clamp(uP1, 2.0, 40.0) + 0.5);  // columns
    float t21_nr  = floor(clamp(uP2, 2.0, 40.0) + 0.5);  // rows
    float t21_sn  = max(floor(uLines + 0.5), 1.0);       // stripes per block
    float t21_ci  = clamp(floor(t21_gx * t21_nc), 0.0, t21_nc - 1.0);
    float t21_h   = clamp(t21_nr - floor(t21_ci * max(uP3, 0.0)), 0.0, t21_nr);
    float t21_lip = 1.0 - t21_h / max(t21_nr, 1.0);      // top of fill, in gy
    float t21_gcx = clamp(uWarpA, 0.0, 0.45) * 0.5;      // half column gutter
    float t21_gcy = clamp(uWarpB, 0.0, 0.45) * 0.5;      // half row gutter
    float t21_cx  = fract(t21_gx * t21_nc);              // pos inside the cell
    float t21_cy  = fract(t21_gy * t21_nr);
    float t21_stp = uEdge / max(uLines, 0.5);            // pipeline comb period
    // Remap the INKED part of the cell to 0..1 so exactly t21_sn whole
    // stripes fit between the row gutters: stripes never get sliced by a
    // block boundary, and every block starts and ends on a dark seam.
    float t21_iy  = (t21_cy - t21_gcy) / max(1.0 - 2.0 * t21_gcy, 1e-3);
    float t21_tri = abs(fract(t21_iy * t21_sn) * 2.0 - 1.0);   // 0 at core
    float t21_prf = t21_tri * t21_tri;                   // squared -> most of
    // the block sits at the comb core (bright, solid) and only a thin rule
    // near tri=1 falls to the lane floor, so the fill stays opaque whatever
    // value floorK takes -- the dark seam is a minority of the block area.
    float t21_cut = 0.0;
    if (t21_cx < t21_gcx || t21_cx > 1.0 - t21_gcx) t21_cut = 1.0;  // col gutter
    if (t21_cy < t21_gcy || t21_cy > 1.0 - t21_gcy) t21_cut = 1.0;  // row gutter
    if (t21_gy < t21_lip) t21_cut = 1.0;                 // above the staircase
    // 0.45*stp keeps au/stp + 0.5 below 1.0, so floor() picks comb rail 0 for
    // EVERY lit pixel: body = 1 (blocks stay solid), the comb stays alive
    // (au << 0.85*uEdge) and d = 0.45*prf depends only on stripe phase.
    u = t21_cut > 0.5 ? 40.0 : t21_prf * 0.45 * t21_stp;
    v = clamp(t21_gx * 0.62 + t21_gy * 0.38, 0.0, 1.0);  // one diagonal ramp
    W = 1.0;
  } else if (uShape == 22) {
    // Spine : py = amp*sin(px*freq + phase)   -- a travelling sine wave
    // Body  : perpendicular distance to that spine < half-width  ->  lit
    // Twist : half-width *= |cos(twist*px + phase)|, so the band pinches to a
    //         sliver where it turns edge-on and flares where it faces us.
    //
    // WHY |u| IS DELIBERATELY TINY AND THE FIBRES ARE DRAWN BY HAND:
    //   with flow >= 1 the palette phase carries a PER-RAIL hash --
    //     railC = floor(au/stp + 0.5); rnd = hash(railC);
    //     phase += rnd*0.18 + sin(uTime*(1.3 + rnd*2.7) + rnd*17.0)*0.22
    //   If |u| were the across-band coordinate then railC would BE the fibre
    //   index, and every fibre would take an independent hue (~0.46 cycles of
    //   spread -- more than any gradient v can carry), which is the exact
    //   opposite of "colour runs across the ribbon". So |u| is scaled to stay
    //   inside rail 0 for ANY uLines/uEdge (au <= 0.45*stp => railC == 0 =>
    //   rnd == 0): the hash collapses to one constant and `wander` becomes a
    //   single slow global hue breath shared by the whole band.
    //   The lengthwise striations are therefore drawn by hand into faceDim /
    //   cubeEdge -- contours of constant n run parallel to the spine, so they
    //   still read as fibres, the count is honest, and they melt exactly
    //   where the twist squeezes their pitch below a pixel.
    //   At that scale the pipeline's body/rim never fire, so the silhouette
    //   and its anti-aliasing are ours too (cfg keeps bloom 0: bloom is added
    //   after faceDim and would otherwise square the soft edge back off).
    //   Colour is carried by v ALONE -- cfg sets delay = 0, killing the
    //   -min(au,uEdge)*uDelay*2 term, which is symmetric in |u| and would
    //   fold the gradient back on itself about the spine.
    // p1 amplitude, p2 frequency, p3 width, warpA twist, warpB pinch,
    // lines fibre count, ribSoft fibre width, ribDepth fibre depth + sheen.
    float t22_ph  = uTime * 6.2831853;                 // one wavelength / loop
    float t22_px  = x;                                 // along the sweep
    float t22_py  = 0.5 - v;                           // + up from frame centre
    float t22_amp = clamp(uP1, 0.0, 0.42);
    float t22_frq = clamp(uP2, 0.2, 12.0);
    float t22_wid = clamp(uP3, 0.02, 0.30);            // bounded BOTH ends now:
    float t22_tw  = clamp(uWarpA, 0.0, 12.0);          // amp+wid can no longer
    float t22_pin = clamp(1.0 - uWarpB, 0.06, 1.0);    // wash the whole frame

    float t22_arg = t22_px * t22_frq + t22_ph;
    float t22_spy = t22_amp * sin(t22_arg);            // spine height here
    float t22_slp = t22_amp * t22_frq * cos(t22_arg);  // d(spine)/d(px)
    // first-order perpendicular distance to the graph of the sine: dividing
    // the vertical offset by sqrt(1+slope^2) keeps the band the same thickness
    // on the steep diagonal runs instead of letting it fatten there.
    float t22_prp = (t22_py - t22_spy) * inversesqrt(1.0 + t22_slp * t22_slp);

    float t22_fc  = abs(cos(t22_px * t22_tw + t22_ph * 0.62));  // 1 face-on, 0 edge-on
    float t22_hw  = max(t22_wid * (t22_pin + (1.0 - t22_pin) * t22_fc), 1e-4);
    float t22_n   = t22_prp / t22_hw;                  // -1..1 inside the band
    float t22_an  = abs(t22_n);

    if (t22_an > 1.0) {
        u = 40.0;                                      // outside = pure background
        faceDim  = 0.0;
        cubeEdge = 0.0;
        v = 0.5;
    } else {
        // rail-0 clamp: 0.45 * stp is the widest |u| that still hashes to
        // rail 0, for every uLines / uEdge the panel can produce.
        float t22_stp = uEdge / max(uLines, 0.5);
        u = t22_n * t22_stp * 0.45;

        // ---- lengthwise fibres (constant-n contours = parallel to spine) ---
        float t22_N   = floor(max(uLines, 1.0) + 0.5);          // whole fibres
        float t22_q   = t22_n * t22_N * 0.5;                    // cord on the spine
        float t22_fd  = fract(t22_q + 0.5) - 0.5;               // -0.5..0.5 in pitch
        // melt them where the twist squeezes the pitch under ~1.7 px
        float t22_pxf = clamp(t22_N * 1.7 / max(2.0 * t22_hw * uRes.y, 1.0), 0.0, 1.0);
        float t22_fw  = mix(clamp(uRibSoft, 0.12, 1.0) * 0.55, 0.62, t22_pxf);
        float t22_g   = exp(-(t22_fd * t22_fd) / (2.0 * t22_fw * t22_fw));
        float t22_con = clamp(uRibDepth, 0.0, 1.0) * 0.75 * (1.0 - t22_pxf);

        // ---- our own anti-aliased long edges -------------------------------
        float t22_pxn = 1.0 / max(t22_hw * uRes.y, 1.0);        // 1 px in n units
        float t22_sft = max(1.5 * t22_pxn, uBlur * 0.9);
        float t22_ed  = clamp((1.0 - t22_an) / max(t22_sft, 1e-4), 0.0, 1.0);
        t22_ed = t22_ed * t22_ed * (3.0 - 2.0 * t22_ed);

        // rounded cross-section, and the band darkens as it turns edge-on
        float t22_rnd = mix(0.80, 1.0, sqrt(max(1.0 - t22_n * t22_n, 0.0)));
        faceDim  = (1.0 - t22_con * (1.0 - t22_g)) * t22_rnd * t22_ed
                 * mix(0.55, 1.0, t22_fc);
        cubeEdge = 0.26 * t22_g * t22_ed * t22_fc * (1.0 - t22_pxf);

        // ---- colour: ACROSS the band edge-to-edge, drifting ALONG the sweep
        // v is now the only spatial term in the palette phase, so this is a
        // true monotone gradient: n = -1 and n = +1 land on different stops
        // and nothing turns around on the spine.
        float t22_ac = clamp(0.5 + 0.5 * t22_n, 0.0, 1.0);      // 0/1 = long edges
        float t22_al = clamp(t22_px / max(aspect, 1e-3) + 0.5, 0.0, 1.0);
        v = clamp(0.05 + 0.90 * (0.58 * t22_ac + 0.42 * t22_al), 0.0, 1.0);
    }
    W = 1.0;
  } else if (uShape == 23) {
    // and spread out at the frame edge, plus fat saturated bars dropped into
    // pseudo-random cells.
    //   p1 = rules per half-axis, p2 = bunching exponent (1 = even grid),
    //   p3 = coloured-bar density, warp A = rule thickness in PIXELS,
    //   warp B = bar thickness as a multiple of the rule.
    // Whiteness is bought from the comb, not the palette: a rule pixel sits at
    // |u| = 0 (comb core = 1 -> uBlow bleaches it white) while a bar interior
    // is parked at exactly HALF a comb period (core ~ 0 -> stays saturated).
    W = 1.0;
    float t23_rh = max(uRes.y, 16.0);
    float t23_N  = floor(clamp(uP1, 2.0, 30.0) + 0.5);
    float t23_k  = clamp(uP2, 1.0, 3.2);                     // >1 = tighter centre
    float t23_dn = clamp(uP3, 0.0, 1.0);
    float t23_th = clamp(uWarpA, 0.6, 10.0) * 0.5 / t23_rh;  // rule half-thickness
    float t23_aa = 1.1 / t23_rh;                             // ~1px edge ramp

    // frame normalised to -1..1 on BOTH axes
    float t23_sx = x / max(0.5 * aspect, 1e-3);
    float t23_sy = (v - 0.5) * 2.0;
    float t23_bx = abs(t23_sx);
    float t23_by = abs(t23_sy);
    float t23_ax = min(t23_bx, 1.0);                         // clamped: index lookup
    float t23_ay = min(t23_by, 1.0);

    // the warp: even steps of pow(|s|, 1/k) land at SCREEN positions pow(j/N, k),
    // so the gap grows from tiny at the centre to huge at the frame edge
    float t23_wx = pow(max(t23_ax, 1e-5), 1.0 / t23_k) * t23_N;
    float t23_wy = pow(max(t23_ay, 1e-5), 1.0 / t23_k) * t23_N;
    float t23_jx = floor(t23_wx + 0.5);                      // nearest vertical rule
    float t23_jy = floor(t23_wy + 0.5);                      // nearest horizontal rule
    float t23_qx = pow(max(t23_jx, 1e-5) / t23_N, t23_k);    // its |sx| position
    float t23_qy = pow(max(t23_jy, 1e-5) / t23_N, t23_k);
    // distances converted back to SCREEN units -> constant thickness everywhere
    float t23_dx = abs(t23_bx - t23_qx) * 0.5 * aspect;
    float t23_dy = abs(t23_by - t23_qy) * 0.5;

    // cell = (signed rule index, row band); hashed to choose the coloured bars
    float t23_ix = t23_jx * (t23_sx < 0.0 ? -1.0 : 1.0);
    float t23_iy = floor(t23_wy * (t23_sy < 0.0 ? -1.0 : 1.0));
    float t23_hs = fract(sin(t23_ix * 21.71 + t23_iy * 37.33 + 3.17) * 3571.913);
    float t23_on = step(t23_hs, t23_dn);                     // 1 = cell carries a bar

    // bar half-width, capped at 42% of the LOCAL gap so a fat bar never
    // swallows its neighbours where the grid bunches up
    float t23_nl = pow(max(abs(t23_jx - 1.0), 1e-5) / t23_N, t23_k);
    float t23_nr = pow((t23_jx + 1.0) / t23_N, t23_k);
    float t23_gp = min(abs(t23_qx - t23_nl), abs(t23_nr - t23_qx)) * 0.5 * aspect;
    // same local half-gap on the vertical axis, for the flat bars and the reach
    float t23_ml = pow(max(abs(t23_jy - 1.0), 1e-5) / t23_N, t23_k);
    float t23_mr = pow((t23_jy + 1.0) / t23_N, t23_k);
    float t23_gq = min(abs(t23_qy - t23_ml), abs(t23_mr - t23_qy)) * 0.5;

    // ---- per-cell shape randomness (uSeam.x) ------------------------------
    // Every bar was the same rectangle, so the field read as a regular
    // barcode. Four independent hashes off the SAME cell id give each bar its
    // own girth, its own reach along the rule, and a chance of lying flat —
    // stable frame to frame, unrelated to its neighbours. At 0 this collapses
    // back to the old uniform field exactly.
    float t23_rr = clamp(uSeam.x, 0.0, 1.0);
    float t23_r1 = fract(sin(t23_ix * 11.13 + t23_iy * 29.77 + 5.31) * 1237.71);
    float t23_r3 = fract(sin(t23_ix *  7.77 + t23_iy * 53.19 + 2.41) * 3917.29);
    float t23_r4 = fract(sin(t23_ix * 61.31 + t23_iy * 13.07 + 9.83) * 1499.07);
    // axis: at rr = 0 the step edge sits at 1.0 so nothing ever flips
    float t23_hz = step(1.0 - 0.5 * t23_rr, t23_r4);          // 1 = lay it flat
    float t23_gw = mix(1.0, 0.30 + 1.40 * t23_r3, t23_rr);    // girth multiplier
    float t23_rc = mix(1.0, 0.18 + 0.92 * t23_r1, t23_rr);    // reach along rule

    float t23_fw = max(min(t23_th * clamp(uWarpB, 1.5, 16.0) * t23_gw,
                           mix(t23_gp, t23_gq, t23_hz) * 0.42),
                       t23_th * 1.2);

    // thin rules — inside a bar cell the vertical rule IS the bar, so only the
    // horizontal rule survives there (and it caps the bar's top/bottom ends)
    float t23_dw = mix(min(t23_dx, t23_dy), mix(t23_dy, t23_dx, t23_hz), t23_on);
    float t23_ew = t23_dw - t23_th;
    float t23_uw = max(uEdge * (1.0 + t23_ew / (t23_ew < 0.0 ? t23_th * 0.42 : t23_aa)),
                       0.0);

    // bar — across is the girth axis, along is the reach axis (swapped for a
    // flat bar). floor at half a comb period keeps its whole interior off the core
    float t23_ac = mix(t23_dx, t23_dy, t23_hz);               // across the bar
    float t23_al = mix(t23_dy, t23_dx, t23_hz);               // along the bar
    float t23_lm = mix(t23_gq, t23_gp, t23_hz) * t23_rc;      // how far it reaches
    float t23_eb = max(t23_ac - t23_fw, t23_al - t23_lm);
    float t23_ub = max(uEdge * (1.0 + t23_eb / (t23_eb < 0.0 ? t23_fw * 0.30 : t23_aa)),
                       0.5 * uEdge / max(uLines, 0.5));
    if (t23_on < 0.5) t23_ub = 60.0;

    if (t23_uw <= t23_ub) {          // white rule wins
      u = t23_uw;
      v = 0.5;                       // one faint constant tint under the white
      // Rule opacity (uBase). A rule pixel sits at |u| = 0, dead on the comb
      // core, so it renders at full blown-out white — which reads as a hard
      // wireframe over the field. faceDim only scales the rule's own body, so
      // the coloured bars keep their full strength while the grid drops back.
      faceDim = clamp(uBase, 0.04, 1.0);
    } else {                         // saturated bar, one palette hue per cell
      u = t23_ub;
      v = fract(sin(t23_ix * 13.91 + t23_iy * 57.23 + 1.73) * 2371.317);
    }
    if (u > uEdge * 2.6) u = 40.0;   // everything else is pure background
  } else if (uShape == 24) {
    // Each sheet is a trapezoid (wide edge -> narrow edge); alternate sheets
    // flip, so the stack reads as a concertina. |u| = 0 on a hairline just
    // inside the outline (comb core -> white rim), |u| = the comb midpoint
    // over the whole interior (flat solid fill), u = 40 in the gaps.
    W = 1.0;
    float t24_N   = floor(clamp(uP1, 2.0, 14.0) + 0.5);   // sheet count
    float t24_tap = clamp(uP2, 0.0, 0.94);                // perspective taper
    float t24_gap = clamp(uP3, 0.0, 0.80);                // gap, fraction of a slot
    float t24_alt = step(0.5, uWarpA);                    // 1 = alternate tilt

    float t24_yy  = clamp(v, 0.0, 0.9999) * t24_N;        // 0 top .. N bottom
    float t24_k   = floor(t24_yy);                        // which sheet
    float t24_f   = t24_yy - t24_k;                       // 0..1 down the slot
    float t24_den = max(1.0 - t24_gap, 0.08);
    float t24_q   = (t24_f - t24_gap * 0.5) / t24_den;    // 0 sheet top .. 1 bottom
    float t24_hP  = t24_den / max(t24_N, 1.0);            // sheet height, height units

    float t24_fl  = mod(t24_k, 2.0) * t24_alt;            // is this sheet flipped?
    float t24_qq  = clamp(mix(t24_q, 1.0 - t24_q, t24_fl), 0.0, 1.0);

    float t24_w0  = max(uBase, 0.05) * 0.5 * aspect;      // wide edge half-width
    float t24_w1  = t24_w0 * (1.0 - t24_tap);             // narrow edge half-width
    float t24_hw  = mix(t24_w0, t24_w1, t24_qq);

    // signed distance to the trapezoid outline (positive inside); the side
    // distance is corrected to a true perpendicular so the rim stays even
    float t24_slp = (t24_w0 - t24_w1) / max(t24_hP, 1e-3);
    float t24_cs  = inversesqrt(1.0 + t24_slp * t24_slp);
    float t24_dx  = (t24_hw - abs(x)) * t24_cs;
    float t24_dy  = min(t24_q, 1.0 - t24_q) * t24_hP;
    float t24_sd  = min(t24_dx, t24_dy);

    float t24_pl  = 0.47 * uEdge / max(uLines, 0.5);   // interior rail = comb midpoint
    float t24_px  = 1.0 / max(uRes.y, 120.0);
    float t24_rt  = min(max(uFlare, 0.15) * 3.0 * t24_px, t24_hP * 0.28);  // rim depth
    float t24_fo  = (0.8 + 26.0 * max(uBlur, 0.0)) * t24_px;               // silhouette feather

    if (t24_sd < -t24_fo) {
      u        = 40.0;                        // outside the sheets: pure background
      faceDim  = 0.0;
      cubeEdge = 0.0;
    } else {
      // V in rail space: plateau at the outline -> 0 on the rim contour -> plateau
      u = t24_pl * clamp(abs(1.0 - max(t24_sd, 0.0) / max(t24_rt, 1e-4)), 0.0, 1.0);
      // sheets fall off toward their narrow (far) edge, and the last pixel of
      // the silhouette is feathered by hand so the fill colour never shifts
      faceDim = mix(1.0, 0.80, t24_qq) * clamp(1.0 + t24_sd / max(t24_fo, 1e-4), 0.0, 1.0);
      float t24_rg = (t24_sd - t24_rt) / max(t24_rt * 0.75, 1e-4);
      cubeEdge = (0.25 + 1.45 * uRibDepth) * exp(-t24_rg * t24_rg);
    }

    // one gradient per sheet: extent = span, start phase steps by warp B
    float t24_am = clamp(uSpan, 0.0, 1.0);
    float t24_ph = fract(t24_k * clamp(uWarpB, 0.0, 1.0) + 0.07);
    v = clamp(t24_ph * (1.0 - t24_am) + clamp(t24_q, 0.0, 1.0) * t24_am, 0.0, 1.0);
  } else if (uShape == 25) {
    // Blade fan (pin 1e4gOawDT): pointed metallic blades radiating from a
    // hub, each with a specular ridge — a dark iridescent turbine.
    //   p1 = blade count   p2 = blade width   p3 = tip length fraction
    //   warpA/warpB = hub x/y   base = blade length   span = along-blade
    //   colour amount   flare = rim depth (shared convention with 24)
    W = 1.0;
    vec2  t25_p  = vec2(x - (uWarpA - 0.5), (v - 0.5) - (uWarpB - 1.0));
    float t25_r  = length(t25_p);
    float t25_N  = floor(clamp(uP1, 4.0, 28.0) + 0.5);
    float t25_a  = atan(t25_p.y, t25_p.x) / 6.2831853 + 0.5;
    float t25_k  = floor(t25_a * t25_N);
    float t25_s  = fract(t25_a * t25_N) * 2.0 - 1.0;      // -1..1 across slot
    float t25_j  = fract(sin(t25_k * 7.13) * 311.7);      // per-blade jitter
    float t25_Rk = max(uBase, 0.05) * 2.2 * (0.92 + 0.10 * t25_j);
    float t25_q  = clamp(t25_r / max(t25_Rk, 1e-3), 0.0, 1.5);
    // constant body width, straight pointed tip, slim open root
    float t25_wb = clamp(uP2, 0.10, 0.98);
    float t25_hw = t25_wb * min(1.0, (1.0 - t25_q) / max(clamp(uP3, 0.05, 0.90), 1e-3));
    t25_hw *= smoothstep(0.0, 0.10, t25_q);
    float t25_arc = 3.14159265 * max(t25_r, 1e-3) / t25_N; // s unit -> height units
    float t25_dx  = (t25_hw - abs(t25_s)) * t25_arc;
    float t25_dy  = t25_Rk - t25_r;
    float t25_sd  = min(t25_dx, t25_dy);
    float t25_pl  = 0.47 * uEdge / max(uLines, 0.5);
    float t25_px  = 1.0 / max(uRes.y, 120.0);
    float t25_rt  = min(max(uFlare, 0.15) * 3.0 * t25_px, 0.02);
    float t25_fo  = (0.8 + 26.0 * max(uBlur, 0.0)) * t25_px;
    if (t25_sd < -t25_fo) {
      u = 40.0; faceDim = 0.0; cubeEdge = 0.0;
    } else {
      u = t25_pl * clamp(abs(1.0 - max(t25_sd, 0.0) / max(t25_rt, 1e-4)), 0.0, 1.0);
      // metal sheen: specular ridge sits off-centre (light upper-right) and
      // the blade darkens toward the hub like the reference
      float t25_sh = 0.40 + 0.60 * exp(-pow((t25_s - 0.25) / 0.55, 2.0));
      t25_sh *= 0.52 + 0.48 * smoothstep(0.04, 0.55, t25_q);
      faceDim = t25_sh * clamp(1.0 + t25_sd / max(t25_fo, 1e-4), 0.0, 1.0);
      float t25_rg = (t25_sd - t25_rt) / max(t25_rt * 0.75, 1e-4);
      cubeEdge = (0.15 + 1.20 * uRibDepth) * exp(-t25_rg * t25_rg);
    }
    // iridescence: each blade lands on its own palette phase, gradient runs
    // along the blade by span
    v = fract(t25_k * 0.31 + t25_j * 0.07 + t25_q * clamp(uSpan, 0.0, 1.0));
  } else if (uShape == 7) {                  // tunnel: concentric rings
    // warp A / warp B move the ring centre (0.5 / 1.0 = screen centre)
    // Setting warpB > 1.5 pushes the centre below the canvas so the
    // concentric circles appear as curved arcs sweeping across the frame.
    vec2 pc = vec2(x - (uWarpA - 0.5), (v - 0.5) - (uWarpB - 1.0));
    // P1 squashes the ring plane vertically, so the rings read as an orbit
    // seen at a low angle instead of as flat bullseyes. P2 is the perspective
    // exponent: below 1 the rings bunch up toward the centre and open out in
    // the foreground, which is what makes them recede to a vanishing point.
    float t7_flat = clamp(uP1, 0.06, 1.0);
    float t7_persp = clamp(uP2, 0.25, 2.0);
    pc.y /= t7_flat;
    float r = pow(max(length(pc), 1e-4), t7_persp);
    u = r * 1.15 / max(uBase + uSpan * 0.5, 1e-3) * 0.5;
    // P3 > 0.5 is TRUE 3D TUNNEL PROJECTION. The rings are real geometry:
    // equal-radius circles at equal depth steps along the camera axis. A
    // camera projects a ring at depth z to screen radius R/z, so solving a
    // pixel's ring from its screen radius r is u = a*(1/r - 1/r_out) — the
    // same result as projecting the vertices and rasterising them. This one
    // mapping is what makes near rings thick and far rings thin and tightly
    // packed toward the vanishing point; no power curve can reproduce 1/r.
    if (uP3 > 0.5) {
      float t7rr = max(length(pc), 1e-3);
      u = max(uBase * 1.45 * (1.0 / t7rr - 1.0 / 1.15), 0.0);
      // the light sits up and to the RIGHT of the tunnel mouth: every arc is
      // brightest near its upper-right crown and falls off along its own
      // length toward the frame edges — the reference's strongest 3D cue
      float t7th = atan(pc.x, -pc.y);
      gRingLight = 0.58 + 0.42 * cos(t7th - 0.55);
    }
    v = clamp(u / max(uEdge, 0.1), 0.0, 0.999);   // trails ripple outward
    // P3 > 0.5: SOLID-COLOUR RINGS. v is quantised to the same ring index the
    // comb uses (boundaries land exactly on the comb minima), so every tube
    // holds ONE clean palette colour with the comb still shading it as a
    // pipe — no grey mid-blends from the palette sweeping across a band.
    if (uP3 > 0.5) {
      float t7_stp = uEdge / max(uLines, 0.5);
      float t7_k   = floor(u / t7_stp + 0.5);
      v = clamp((t7_k + 0.5) / max(uLines, 1.0), 0.0, 0.999);
    }
    W = 1.0;
  } else if (uShape == 8) {                  // spiral: true logarithmic arms
    // The old version hardcoded both the arm count and the winding rate, and
    // the winding was linear in r, so it read as slightly-bent rings rather
    // than a spiral. Arms are now log-spiral (constant pitch angle, the real
    // thing) with background between them, so it cannot be mistaken for 3 or 7.
    //   uP1 = winding tightness, uP2 = arm count, uP3 = arm width.
    vec2  s8_p = vec2(x - (uWarpA - 0.5), (v - 0.5) - (uWarpB - 1.0));
    float s8_r = max(length(s8_p), 1e-3);
    float s8_a = atan(s8_p.y, s8_p.x) / 6.2831853;
    float s8_n = max(floor(uP2 * 10.0 + 0.5), 1.0);
    float s8_t = fract(s8_a * s8_n + log(s8_r) * uP1 * 5.0 + uTime * 0.05);
    float s8_d = abs(s8_t - 0.5) * 2.0;        // 0 arm centre, 1 gap centre
    float s8_w = mix(0.95, 0.18, uP3);         // how much of the period is arm
    if (s8_d > s8_w) { u = 40.0; }
    else { u = s8_d / max(s8_w, 1e-3) * uEdge * 0.98; }
    v = clamp(s8_r * 1.4, 0.0, 1.0);
    W = 1.0;
  } else if (uShape == 9) {                  // spinning 3D cube
    // analytic ray/box hit; rails live on the faces and spin with them
    vec2 p = vec2(x, 0.5 - v);
    float a = uTime * 0.30, b = uTime * 0.21 + 0.55;
    float ca = cos(a), sa = sin(a), cb = cos(b), sb = sin(b);
    mat3 R = mat3(1.,0.,0., 0.,cb,sb, 0.,-sb,cb)
           * mat3(ca,0.,-sa, 0.,1.,0., sa,0.,ca);
    vec3 ro = R * vec3(0.0, 0.0, -3.6);
    vec3 rd = R * normalize(vec3(p, 1.5));
    float Hs = 0.62;
    vec3 mv = 1.0 / rd, nv = mv * ro, kv = abs(mv) * Hs;
    vec3 t1 = -nv - kv, t2 = -nv + kv;
    float tN = max(max(t1.x, t1.y), t1.z);
    float tF = min(min(t2.x, t2.y), t2.z);
    if (tN < tF && tF > 0.0) {
      vec3 q = (ro + rd * tN) / Hs;
      vec3 aq = abs(q);
      vec2 fuv; float fid;
      if (aq.x > aq.y && aq.x > aq.z)      { fuv = q.zy; fid = q.x > 0.0 ? 0.0 : 1.0; }
      else if (aq.y > aq.z)                { fuv = q.xz; fid = q.y > 0.0 ? 2.0 : 3.0; }
      else                                 { fuv = q.xy; fid = q.z > 0.0 ? 4.0 : 5.0; }
      u = fuv.x * 0.66;
      v = fract(fuv.y * 0.55 + 0.5 + fid * 0.37);
      float border = max(abs(fuv.x), abs(fuv.y));
      cubeEdge = smoothstep(0.86, 0.995, border);
      faceDim = 0.68 + 0.12 * fid / 5.0;
    } else {
      u = 40.0; v = 0.5;
    }
    W = 1.0;
  } else if (uShape == 26) {
    // Path echo (Adobe-branding style): duplicated rounded-rect OUTLINES
    // marching along the custom drag-handle bezier — an onion-skin motion
    // trail of one card. p1 = copies, p2 = card size, p3 = corner radius.
    // Colour and weight run head -> tail (v = position along the path).
    W = 1.0;
    vec2  t26_P  = vec2(x, v);
    float t26_N  = clamp(floor(uP1 + 0.5), 6.0, 96.0);
    float t26_sz = max(uP2, 0.04);
    float t26_cr = clamp(uP3, 0.0, 1.0) * t26_sz;
    // FILLED cards with occlusion: the front-most copy (largest ti) that
    // contains a pixel owns it — its black body hides every outline behind
    // it, so the train reads as a solid deck, not a wireframe pile.
    float t26_bd = 1e9;
    float t26_bi = 0.0;
    float t26_own = -1.0;
    float t26_ownd = 1e9;
    for (int i = 0; i < 96; i++) {
      if (float(i) >= t26_N) break;
      float ti = fract(float(i) / t26_N + uTime * 0.10);
      float mi = 1.0 - ti;
      vec2 c = mi*mi*mi*uC0 + 3.0*mi*mi*ti*uC1 + 3.0*mi*ti*ti*uC2 + ti*ti*ti*uC3;
      vec2 dq = abs(t26_P - c) - vec2(t26_sz * 1.42, t26_sz) + vec2(t26_cr);
      float rd = length(max(dq, 0.0)) + min(max(dq.x, dq.y), 0.0) - t26_cr;
      float ad = abs(rd);
      if (ad < t26_bd) { t26_bd = ad; t26_bi = ti; }
      if (rd < 0.0 && ti > t26_own) { t26_own = ti; t26_ownd = ad; }
    }
    float t26_px = 1.0 / max(uRes.y, 120.0);
    float t26_lw = (1.2 + 10.0 * max(uBlur, 0.0)) * t26_px;
    if (t26_own >= 0.0) {
      u = 0.7 * (t26_ownd / max(t26_lw, 1e-4));   // only the owner's rim lights
      v = clamp(t26_own, 0.0, 0.999);
      faceDim = 0.45 + 0.55 * t26_own;
    } else {
      u = 0.7 * (t26_bd / max(t26_lw, 1e-4));
      v = clamp(t26_bi, 0.0, 0.999);
      faceDim = 0.45 + 0.55 * t26_bi;
    }
  } else if (uShape == 27) {
    // Glyph field (CHECKMATE reference): a coarse knit-chart grid of micro
    // glyphs — checkers, zigzags, clover dots — whose zones are carved by a
    // slowly morphing organic field. p1 = cells across, p2 = blob scale,
    // p3 = morph speed. Colours come straight from the first two gradient
    // stops (glyphs) over the page background.
    W = 1.0;
    float t27_cells = clamp(floor(uP1 + 0.5), 12.0, 90.0);
    vec2  t27_g  = vec2(x, v) * t27_cells;
    vec2  t27_id = floor(t27_g);
    vec2  t27_lc = fract(t27_g);
    // organic zone field that TRAVELS: zones stream diagonally across the
    // canvas with a gentle swirl, while the blobs also morph
    vec2  t27_cc = (t27_id + 0.5) / t27_cells;
    float t27_s  = max(uP2, 0.15) * 6.0;
    float t27_t  = uTime * uP3 * 1.5;
    vec2  t27_fp = t27_cc + vec2(t27_t * 0.10, t27_t * 0.055);
    t27_fp += 0.07 * vec2(sin(t27_cc.y * 4.2 + t27_t * 0.8),
                          cos(t27_cc.x * 3.1 - t27_t * 0.6));
    float t27_F  = 0.5
      + 0.30 * sin(t27_fp.x * t27_s + t27_t) * cos(t27_fp.y * t27_s * 1.35 - t27_t * 0.7)
      + 0.20 * sin((t27_fp.x + t27_fp.y) * t27_s * 0.62 - t27_t * 0.45)
      + 0.12 * cos(t27_fp.x * t27_s * 2.1 - t27_fp.y * t27_s * 1.7 + t27_t * 0.3);
    float t27_band = t27_F < 0.34 ? 0.0
                   : (t27_F < 0.58 ? 1.0 : (t27_F < 0.80 ? 2.0 : 3.0));
    float t27_on = 0.0;
    float t27_ci = 0.0;                       // which ink slot tints the glyph
    if (t27_band == 0.0) {                    // quiet zone: small dots, FULL cover
      vec2 q0 = t27_lc - 0.5;
      t27_on = step(length(q0), 0.20);
      t27_ci = 1.0;
    } else if (t27_band == 1.0) {             // micro-checker
      t27_on = mod(floor(t27_lc.x * 2.0) + floor(t27_lc.y * 2.0), 2.0);
      t27_ci = 0.0;
    } else if (t27_band == 2.0) {             // zigzag
      float zz = fract(t27_lc.x * 2.0 + step(0.5, t27_lc.y));
      t27_on = step(zz, 0.5) * step(0.12, t27_lc.y) * step(t27_lc.y, 0.88);
      t27_ci = 1.0;
    } else {                                  // clover: four dots
      vec2 q4 = fract(t27_lc * 2.0) - 0.5;
      t27_on = step(length(q4), 0.34);
      t27_ci = 0.0;
    }
    if (t27_on > 0.5) {
      u = 0.47 * uEdge / max(uLines, 0.5);
      // glyphs ride the full gradient pipeline: the palette sweeps across
      // the mosaic diagonally, shifted per zone (and per ink slot), and the
      // flow animation drifts it — gradient colours, not flat inks
      v = fract(t27_cc.x * 0.55 + t27_cc.y * 0.40
                + t27_band * 0.24 + t27_ci * 0.18);
      faceDim = 1.0;
    } else {
      u = 40.0; faceDim = 0.0; v = 0.5;
    }
    cubeEdge = 0.0;
  } else if (uShape == 28) {
    // ASCII rain (pin 20KsyEmaC): a character-grid picture — organic blob
    // zones filled with procedural type glyphs (rings, bars, plus signs) in
    // three inks, with animated rain ticks falling down the open ground.
    // p1 = cells across, p2 = blob scale, p3 = rain speed.
    W = 1.0;
    float t28_cells = clamp(floor(uP1 + 0.5), 16.0, 110.0);
    vec2  t28_g  = vec2(x, v) * t28_cells;
    vec2  t28_id = floor(t28_g);
    vec2  t28_lc = fract(t28_g);
    vec2  t28_cc = (t28_id + 0.5) / t28_cells;
    float t28_s  = max(uP2, 0.15) * 6.0;
    float t28_t  = uTime;
    // the figure WALKS: the blob field sways side to side and bobs like the
    // reference's strolling umbrella figure, while it also slowly morphs
    vec2  t28_wp = t28_cc + vec2(0.10 * sin(t28_t * 0.35),
                                 0.025 * cos(t28_t * 0.70));
    float t28_F  = 0.5
      + 0.30 * sin(t28_wp.x * t28_s + t28_t * 0.22) * cos(t28_wp.y * t28_s * 1.3 - t28_t * 0.15)
      + 0.20 * sin((t28_wp.x + t28_wp.y) * t28_s * 0.6 - t28_t * 0.11)
      + 0.12 * cos(t28_wp.x * t28_s * 2.2 - t28_wp.y * t28_s * 1.6 + t28_t * 0.08);
    float t28_band = t28_F < 0.40 ? 0.0
                   : (t28_F < 0.54 ? 1.0 : (t28_F < 0.68 ? 2.0 : 3.0));
    float t28_h  = fract(sin(dot(t28_id, vec2(12.9898, 78.233))) * 43758.5453);
    float t28_on = 0.0;
    if (t28_band > 0.5) {
      // dense type fill: ring / bar / plus picked per cell
      float t28_gl = 0.0;
      if (t28_h < 0.34) {
        t28_gl = step(abs(length(t28_lc - 0.5) - 0.28), 0.10);          // 0
      } else if (t28_h < 0.67) {
        t28_gl = step(abs(t28_lc.x - 0.5), 0.13)
               * step(0.12, t28_lc.y) * step(t28_lc.y, 0.88);           // 1
      } else {
        t28_gl = max(step(abs(t28_lc.x - 0.5), 0.11) * step(0.18, t28_lc.y) * step(t28_lc.y, 0.82),
                     step(abs(t28_lc.y - 0.5), 0.11) * step(0.18, t28_lc.x) * step(t28_lc.x, 0.82)); // +
      }
      // the figure CORE inverts: solid blocks with the glyph knocked out to
      // paper — the reference's dense navy cells
      t28_on = t28_band > 2.5 ? 1.0 - t28_gl : t28_gl;
    } else {
      // open ground: sparse rain ticks falling per column
      float t28_col = t28_id.x;
      float t28_ch  = fract(sin(t28_col * 4.898) * 24634.6345);
      float t28_ry  = fract(t28_cc.y * 1.0 - uTime * (0.06 + 0.20 * uP3) * (0.5 + t28_ch)
                            - t28_ch * 7.0);
      float t28_hit = step(t28_ry, 0.16) * step(0.25, t28_ch);
      t28_on = t28_hit * step(abs(t28_lc.x - 0.5), 0.10)
             * step(0.18, t28_lc.y) * step(t28_lc.y, 0.82);
    }
    if (t28_on > 0.5) {
      u = 0.47 * uEdge / max(uLines, 0.5);
      // exact inks straight from the first three stops — the reference is
      // flat 3-ink print, not a gradient
      gInkCol = t28_band < 1.5 ? uStops[0]
              : (t28_band < 2.5 ? uStops[1] : uStops[2]);
      gInkMix = 1.0;
      v = 0.5;
      faceDim = 1.0;
    } else {
      u = 40.0; faceDim = 0.0; v = 0.5;
    }
    cubeEdge = 0.0;
  } else if (uShape == 29) {
    // Shooting-star arch tunnel (poster ref "To Infinity and Beyond"):
    // concentric bands at constant distance from a vertical core segment —
    // nested arches around the top end, a rounded landing U around the
    // bottom, straight trail sides between, and a glowing tip.
    //   p1 = colour step per band   p2 = core top   p3 = tip height
    // Every band is a LOBE PINNED AT THE GLOW: nested ellipses that all
    // touch the source point at the bottom and arch over at progressively
    // greater heights — the poster's fountain of arches, narrow at the
    // source, flaring wide up the frame. Solving which lobe a pixel sits on
    // gives the band coordinate directly:
    //     h = (x²/s² + dy²) / (-2·dy)     dy = y - source (negative above)
    W = 1.0;
    vec2  t29_p  = vec2(x, v);
    vec2  t29_g  = vec2(0.0, clamp(uP3, 0.0, 1.2));   // glow / source point
    float t29_s  = max(uP2, 0.10);                    // lobe width : height
    float t29_dy = t29_p.y - t29_g.y;
    float t29_dx = t29_p.x;
    float t29_h  = t29_dy < -1e-4
                 ? (t29_dx * t29_dx / (t29_s * t29_s) + t29_dy * t29_dy) / (-2.0 * t29_dy)
                 : 40.0;                              // below the source: bg
    // sqrt keeps the band WIDTHS even across the frame: raw lobe height
    // explodes near the source, which would make the inner bands enormous
    u = sqrt(max(t29_h, 0.0)) * 0.85;
    // one vivid ink per band: quantise to the same ring index the comb uses
    float t29_stp = uEdge / max(uLines, 0.5);
    float t29_idx = floor(u / t29_stp + 0.5);
    v = fract(t29_idx * clamp(uP1, 0.05, 0.95) + 0.04);
    // the source star: hot core plus a wide halo
    float t29_gd = length(t29_p - t29_g);
    cubeEdge = 2.4 * exp(-pow(t29_gd / 0.045, 2.0))
             + 0.9 * exp(-pow(t29_gd / 0.11, 2.0));
  } else if (uShape == 30) {
    // Waist arches = THE COMB FAN (shape 0), MIRRORED about a waist line so the
    // two fans meet tip to tip. Dinesh found it straight in the panel: comb-fan
    // with base width 0.125, flare span 0.655, flare curve 0.2 already draws
    // the reference's dome, and the poster is that shape plus its mirror.
    //     W = base + span·t^flare        t = distance from the waist, 0..1
    //     u = dx / W                     the fan's rails
    //     |u| > edge  ->  off the fan, showing the pale page
    // The page is what pinches the waist to a point: near the waist W is tiny,
    // so everything but a sliver of the width is outside the fan; at the far
    // end W has opened up and the fan covers the frame edge to edge. The rails
    // that get cut by |u| = edge on the way trace the arch.
    // Everything is frame-normalised (x / aspect) so the poster lands the same
    // on any canvas ratio.
    //   base/span/flare = the fan   lines/edge = rails, outer edge
    //   p3 = waist height    warpA = waist x     p1 = colour spread
    //   warpB = lower shift  dwell = lower spread  blur = palette curve
    //   p2 = rail edge       ribSoft = rail blend
    //   delay = outer wash   jitter = waist glow
    W = 1.0;
    float t30_wx = clamp(uWarpA, 0.0, 1.0) - 0.5;
    float t30_wy = clamp(uP3, 0.05, 0.95);
    float t30_dx = x / max(aspect, 0.05) - t30_wx;
    float t30_hh = v > t30_wy ? (1.0 - t30_wy) : t30_wy;   // this half's height
    float t30_t  = clamp(abs(v - t30_wy) / max(t30_hh, 1e-4), 0.0, 1.0);
    float t30_W  = max(uBase + uSpan * pow(t30_t, max(uFlare, 0.02)), 1e-4);
    float t30_u  = t30_dx / t30_W;
    // hand the comb the fan's ACTUAL local halfwidth. W is read only by the
    // comb's anti-alias width estimate, and leaving it at 1 told the engine the
    // rails were always wide. Right at the waist W collapses, so u sweeps many
    // rail periods inside a single pixel and the gaussian core averaged high —
    // a one-pixel white line straight across the frame, exactly where the two
    // halves meet. With the real W the engine widens the stroke there by itself
    // and the rails fade into a smooth band instead of aliasing.
    W = t30_W;
    // -- rails. The rail coordinate goes to the SHARED cross-section, exactly
    // as the comb fan does: the comb (core heat, stroke width, blow-out, glow)
    // draws the strokes, and |u| > edge falls off to the background, which is
    // what cuts the fan's silhouette. This branch only decides the HUE of each
    // rail; everything about how a rail is rendered is the engine's own comb.
    // FOLDED at the outer edge, not clamped. The fan pinches to a point at the
    // waist, so along that row everything but a sliver of the width sits past
    // the last rail. Left alone it fell through to the background and printed a
    // pale hairline across the frame; clamped, the outermost rail smeared into
    // a flat pale streak at either end of the same row — the same line, softer.
    // Reflecting the coordinate instead continues the comb outward, so those
    // corners fill with rails like everywhere else and there is nothing left to
    // read as a seam. Triangle wave, so it stays continuous however far out u
    // runs. Everywhere else |u| is already inside the edge and unaffected.
    float t30_p4 = 4.0 * uEdge;
    float t30_ff = mod(t30_u + uEdge, t30_p4);
    t30_u = t30_ff < 2.0 * uEdge ? t30_ff - uEdge : 3.0 * uEdge - t30_ff;
    u = t30_u;
    // one flat ink per rail, on the same grid the comb cuts, offset half a step
    // so a stroke core sits in the MIDDLE of its colour and not on the seam
    float t30_stp = uEdge / max(uLines, 0.5);
    float t30_fr  = t30_u / t30_stp + 0.5;
    float t30_w   = fract(t30_fr);
    float t30_q   = clamp(uRibSoft, 0.001, 0.49);
    float t30_st  = 0.5 * smoothstep(0.0, t30_q, t30_w)
                  + 0.5 * smoothstep(1.0 - t30_q, 1.0, t30_w);
    float t30_pos = (floor(t30_fr) + t30_st - 0.5) * t30_stp;
    // PALETTE CURVE: evenly spaced stops give an even ramp and the reference is
    // anything but — it holds the blues across nearly half the fan, then
    // crosses cream into orange inside two rails. Bending the rail position
    // before it becomes a lookup buys that without spending stops: below 1
    // squeezes the middle of the list and stretches both ends.
    // The halves do not share a ramp either: above the waist the reference runs
    // the full palette blue -> cream -> orange, below it a narrower shifted
    // window cream -> orange -> burnt.
    // the lower half's window rides uHold, NOT uDwell: dwell is run speed and
    // this shape has to leave the whole Gradient run section alone so it can
    // run the way the comb fan does
    float t30_sk = 1.0, t30_so = 0.0;
    if (v > t30_wy) {
      t30_sk = clamp(uHold, 0.05, 3.0);
      t30_so = clamp(uWarpB, 0.0, 1.0) - 0.5;
    }
    float t30_gam = max(uBlur, 0.05);
    float t30_sc  = 0.5 / max(uP1, 0.05);
    float t30_z1  = clamp(t30_pos / uEdge, -1.0, 1.0);
    t30_z1 = (t30_z1 < 0.0 ? -1.0 : 1.0) * pow(abs(t30_z1), t30_gam);
    // RUN, or don't. At run speed 0 this is a STILL poster and the ink is
    // forced: gradient() is a CLAMPED ramp, which is the only way to pin blue
    // to one edge and burnt orange to the other. The moment run speed comes up
    // the shape hands the colour back to the SHARED gradient run — the same
    // uTime·dwell − |u|·delay − (1−v)·runv phase every other shape uses — so
    // the waist arch runs exactly the way the comb fan does. Nothing here
    // reimplements it; forcing the ink is simply skipped.
    if (uDwell < 0.001) {
      float t30_arg = 0.5 + t30_z1 * t30_sc * t30_sk + t30_so;
      gInkCol = gradient(clamp(t30_arg, 0.0, 1.0));
      gInkMix = 1.0;
    }
    // -- EACH RAIL STOPS AT ITS OWN HEIGHT. In a plain fan every rail runs the
    // whole way to the apex, so they all converge on the waist in one point.
    // The reference does not do that: only the centre rail reaches the waist,
    // and the ones either side stop progressively short of it. The staggered
    // ends are what draw the nested arches. Cut in t (distance from the waist),
    // proportional to how far off-centre the rail sits.
    float t30_kk  = floor(t30_u / t30_stp + 0.5);
    float t30_end = uP2 * abs(t30_kk) * t30_stp;
    // round the end off: near its stop a rail also loses width, so the corner
    // reads as a cap rather than a square chop
    float t30_ce  = max(t30_end - t30_t, 0.0);
    float t30_rw  = 1.0 - clamp(t30_ce / max(t30_stp * uP2 * 0.9, 1e-4), 0.0, 1.0);
    float t30_fe  = max(2.5 / max(uRes.y, 1.0), 1e-4);
    faceDim = smoothstep(t30_end - t30_fe, t30_end + t30_fe, t30_t)
            + (1.0 - smoothstep(t30_end - t30_fe, t30_end + t30_fe, t30_t))
              * step(abs(t30_w - 0.5) * 2.0, t30_rw);
    // the pinch is a light source
    float t30_rad = length(vec2(t30_dx, (v - t30_wy) / max(aspect, 0.05)));
    cubeEdge = clamp(uJitter, 0.0, 2.0) * exp(-pow(t30_rad / 0.075, 2.0));
    // v is the flow axis for the comb's own shading: 0 at the waist, 1 at the
    // open end, so a rail brightens along its length the way the fan's does
    v = t30_t;
  } else if (uShape == 31) {
    // Number. The rail coordinate is the SIGNED DISTANCE to the typed digits,
    // sampled from a field the CPU builds with a real euclidean distance
    // transform. Nothing else changes: the comb then cuts rails at regular
    // distances from the glyph, which is exactly the reference's look —
    // the digits as nested offset contours with the palette running across.
    // Doing it as a distance field rather than as glyph geometry is what keeps
    // it general: any digits, any font weight, and the contours stay correctly
    // spaced round tight corners and inside counters.
    // Distance is packed 16-bit across R and G, over ±uGlyphR frame heights,
    // because an 8-bit field steps coarser than a rail is wide and the contours
    // come out visibly terraced.
    W = 1.0;
    vec2  t31_uv = gl_FragCoord.xy / uRes;
    vec4  t31_s  = texture2D(uGlyph, vec2(t31_uv.x, 1.0 - t31_uv.y));
    float t31_e  = (t31_s.r * 255.0 * 256.0 + t31_s.g * 255.0) / 65535.0;
    u = (t31_e - 0.5) * 2.0 * uGlyphR;
    // flow axis runs outward from the glyph, so the gradient run travels out of
    // the number rather than down the frame
    v = clamp(0.5 + u * 0.5 / max(uGlyphR, 1e-3), 0.0, 1.0);
    cubeEdge = 0.0;
  } else if (uShape == 32) {
    // Trail. Same signed-distance texture as the Number shape, but the CPU
    // strokes the DRAWN BEZIER into it instead of digits. The rails then become
    // nested offsets of that stroke, which is exactly the album-cover
    // reference: a bundle of parallel bands that starts as a tight hairpin,
    // sweeps along the curve and runs off the frame.
    // Doing it through the distance field rather than through shape 6's
    // perpendicular-distance walk is what buys the HAIRPIN: shape 6 projects
    // its first and last segments off-canvas so the fan never closes, while a
    // true distance transform gives round caps, and a round cap IS the turn.
    W = 1.0;
    vec2  t32_uv = gl_FragCoord.xy / uRes;
    vec4  t32_s  = texture2D(uGlyph, vec2(t32_uv.x, 1.0 - t32_uv.y));
    float t32_e  = (t32_s.r * 255.0 * 256.0 + t32_s.g * 255.0) / 65535.0;
    u = (t32_e - 0.5) * 2.0 * uGlyphR;
    // QUANTISE to the band. The reference's bands are flat ink with hard edges,
    // and the run reads |u| straight, so an unquantised field gives a smooth
    // ramp across the whole bundle instead. Snapping u to its band centre makes
    // every band one colour and puts the edges exactly on the band boundaries.
    float t32_stp = uEdge / max(uLines, 0.5);
    u = (floor(u / t32_stp) + 0.5) * t32_stp;
    // flow axis runs outward from the stroke, so a trail travels away from the
    // curve rather than down the frame
    v = clamp(0.5 + u * 0.5 / max(uGlyphR, 1e-3), 0.0, 1.0);
    cubeEdge = 0.0;
  } else if (uShape == 33) {
    // Bar field — the barcode poster. Vertical slabs on a fixed cell grid, each
    // with its own hashed WIDTH and its own hashed LENGTH, and the rows anchor
    // to alternating edges so the ragged ends interlock down the middle the way
    // the reference's do. Gaps are real background, not a dark ink, which is
    // what keeps the edges hard at any zoom.
    // Colour is deliberately NOT per-bar random the way shape 1 does it: it
    // runs the palette straight across the frame, so the field reads as one
    // gradient with bars cut out of it rather than as confetti.
    //   base/span = cell width   p1 = width jitter   p2 = gap
    //   p3 = length jitter       warpA = rows
    W = 1.0;
    float b3_nx = x / max(aspect, 0.05) + 0.5;         // 0..1 across the frame
    float b3_p  = max(uBase + uSpan * 0.5, 1e-3);
    float b3_s  = b3_nx / b3_p;
    float b3_i  = floor(b3_s);
    float b3_h  = fract(sin(b3_i * 12.9898) * 43758.5453);
    float b3_h2 = fract(sin(b3_i * 78.2330 + 3.7) * 24634.6345);
    float b3_w  = mix(1.0, 0.30 + 1.40 * b3_h, uP1) * (1.0 - uP2 * 0.85);
    float b3_d  = abs(fract(b3_s) - 0.5) * 2.0;        // 0 bar centre, 1 cell edge
    float b3_rows = max(floor(uWarpA * 6.0 + 0.5), 1.0);
    float b3_ry = v * b3_rows;
    float b3_r  = floor(b3_ry);
    float b3_ly = fract(b3_ry);
    // distance from this row's anchored edge, so a bar always grows OUT of it
    float b3_up = mod(b3_r, 2.0) < 0.5 ? b3_ly : 1.0 - b3_ly;
    float b3_len = 1.0 - uP3 * (0.15 + 0.85 * fract(b3_h2 + b3_r * 0.371));
    if (b3_d > b3_w || b3_up > b3_len) { u = 40.0; }   // gap / past the end = bg
    else { u = b3_d / max(b3_w, 1e-3) * uEdge * 0.98; }
    v = clamp(b3_nx, 0.0, 1.0);
  } else if (uShape == 34) {
    // Spiral arcs. Concentric rings cut into ARC SEGMENTS, with the ring index
    // taken from an Archimedean spiral rather than from the radius: adding the
    // angle to the radius before the floor is what makes the whole field one
    // continuous winding band with a single radial seam, instead of a stack of
    // closed rings. Segments are dropped by a per-cell hash so the arcs break
    // the way the reference's do, and the palette steps once per segment so the
    // colours run around each arc rather than being random confetti.
    //   base = ring step    span = band fill   flare = gap chance
    //   p1 = spiral         p2 = segments/turn p3 = per-ring twist
    //   warpA = colour step
    W = 1.0;
    vec2  a4_p  = vec2(x / max(aspect, 0.05), v - 0.5);
    float a4_r  = length(a4_p);
    float a4_a  = atan(a4_p.y, a4_p.x) / TAU + 0.5;       // 0..1 round the turn
    float a4_st = max(uBase, 0.004);
    // the spiral: one turn of angle advances the radius by p1 ring steps
    float a4_c  = (a4_r + uP1 * a4_st * a4_a) / a4_st;
    float a4_k  = floor(a4_c);
    float a4_b  = fract(a4_c);                            // across the ring
    float a4_fl = clamp(uSpan, 0.05, 1.0);
    // angular cells, each ring twisted on by p3 so the joins never line up
    float a4_ns = max(floor(uP2 + 0.5), 1.0);
    float a4_sa = a4_a * a4_ns + a4_k * uP3;
    float a4_si = floor(a4_sa);
    float a4_h  = fract(sin(a4_si * 12.9898 + a4_k * 78.233) * 43758.5453);
    if (a4_b > a4_fl || a4_h < clamp(uFlare, 0.0, 0.9)) {
      u = 40.0;                                           // gap = background
    } else {
      u = abs(a4_b / a4_fl - 0.5) * 2.0 * uEdge * 0.98;
    }
    v = fract(a4_si * max(uWarpA, 0.01));
  } else if (uShape == 35) {
    // Cosmos. Light streaks sweeping past an off-centre core, the way a long
    // exposure of moving light reads: the rails are LOGARITHMIC SPIRALS, since
    // u = angle + k·log(r) has iso-lines that spiral into the focus. Plain
    // rays-from-focus give straight spokes and read as a starburst; the log
    // term is the whole difference between a sunburst and a warp.
    //   p1 = sweep (how hard the spiral winds)   p2 = core size
    //   warpA/warpB = focus x / y                flare = falloff
    W = 1.0;
    float c5_x = x / max(aspect, 0.05) - (clamp(uWarpA, 0.0, 1.0) - 0.5);
    float c5_y = v - clamp(uWarpB, 0.0, 1.0);
    float c5_r = max(length(vec2(c5_x, c5_y)), 1e-4);
    float c5_a = atan(c5_y, c5_x) / TAU;
    u = fract(c5_a + uP1 * log(c5_r)) - 0.5;
    // flow axis is the radius, so the run travels OUT along each streak and
    // the trails motion reads as light moving past the camera
    v = clamp(1.0 - c5_r * 1.4, 0.0, 1.0);
    // near the core the streaks converge past pixel width; fade them into the
    // glow instead of letting them alias into a moire rosette
    float c5_core = max(uP2, 0.01);
    faceDim = smoothstep(c5_core * 0.35, c5_core * 1.15, c5_r)
            * pow(clamp(1.0 - c5_r * clamp(uFlare, 0.1, 2.0), 0.0, 1.0), 0.75);
    cubeEdge = 0.9 * exp(-pow(c5_r / c5_core, 2.0));
  } else if (uShape == 36) {
    // Ring coil. A row of tall ellipse OUTLINES, wider than their own spacing
    // so neighbours overlap and the row reads as one coil rather than as
    // separate hoops. The rail coordinate is the distance to the nearest
    // ellipse, taken over the three cells that can reach a pixel, which is what
    // lets the overlaps cross cleanly instead of one cell clipping the next.
    // Colour is sampled on SCREEN X, never on the angle round each ring: angle
    // restarts the ramp at every hoop and turns each one into its own little
    // colour shape, while one ramp across the frame makes overlapping rings
    // agree exactly where they cross.
    //   p1 = rings   p2 = ring width   p3 = ring height   warpA = overlap
    W = 1.0;
    float k6_nx  = x / max(aspect, 0.05) + 0.5;
    float k6_n   = max(floor(uP1 + 0.5), 1.0);
    float k6_stp = 1.0 / k6_n;
    float k6_rx  = k6_stp * max(uWarpA, 0.2);
    float k6_ry  = max(uP3, 0.05);
    float k6_cy  = 0.5;
    float k6_i   = floor(k6_nx / k6_stp);
    float k6_d   = 1e9;
    for (int j = -1; j <= 1; j++) {
      float cx = (k6_i + float(j) + 0.5) * k6_stp;
      vec2  q  = vec2((k6_nx - cx) / k6_rx, (v - k6_cy) / k6_ry);
      k6_d = min(k6_d, abs(length(q) - 1.0));
    }
    // scale into rail units so the shared comb and edge behave as everywhere
    u = k6_d / max(uP2, 0.02) * uEdge;
    v = clamp(k6_nx, 0.0, 1.0);
    cubeEdge = 0.0;
  } else if (uShape == 37) {
    // Tile grid. A ruled grid with a handful of cells filled, each with its own
    // motif, and the whole layout RESHUFFLED on a timer. The randomness is
    // seeded on floor(time * rate), not on time itself, so a layout holds
    // perfectly still for its whole beat and then cuts to the next one: seeding
    // continuously would make every tile crawl instead of snapping.
    //   p1 = cells across   p2 = fill chance   p3 = reshuffle rate
    //   warpA = tile inset  flare = line weight
    W = 1.0;
    float g7_n  = max(floor(uP1 + 0.5), 2.0);
    vec2  g7_p  = vec2(x / max(aspect, 0.05) + 0.5, v) * g7_n;
    vec2  g7_c  = floor(g7_p);
    vec2  g7_f  = fract(g7_p);
    // CHOREOGRAPHY. Each cell runs the same beat clock but offset by its own
    // position, so the reshuffle sweeps across the grid as a diagonal wave
    // instead of every tile cutting on the same frame. Each tile then pops in
    // from its own centre with a small overshoot, which is what makes the
    // change read as a movement rather than as a jump cut.
    float g7_ph = (g7_c.x + g7_c.y) / g7_n * clamp(uSpan, 0.0, 3.0);
    float g7_tp = uTime * max(uP3, 0.05) - g7_ph;
    float g7_bt = floor(g7_tp);
    float g7_tt = fract(g7_tp);
    float g7_h  = fract(sin(dot(g7_c, vec2(12.9898, 78.233)) + g7_bt * 43.17) * 43758.5453);
    float g7_h2 = fract(sin(dot(g7_c, vec2(39.3468, 11.135)) + g7_bt * 91.73) * 24634.6345);
    // grow from nothing, overshoot a touch, settle
    float g7_gr = smoothstep(0.0, 0.16, g7_tt)
                * (1.0 + 0.11 * exp(-pow((g7_tt - 0.21) / 0.085, 2.0)));
    // the rules: thin, cool, always on, even under an empty cell
    // width is fixed; uFlare now controls how far the rule lifts off the
    // background, so "line fade" reads as opacity and not as thickness
    float g7_lw = 0.010;
    float g7_ln = max(step(g7_f.x, g7_lw) + step(1.0 - g7_lw, g7_f.x)
                    + step(g7_f.y, g7_lw) + step(1.0 - g7_lw, g7_f.y), 0.0);
    float g7_in = clamp(uWarpA, 0.0, 0.4);
    vec2  g7_t  = (g7_f - g7_in) / max(1.0 - 2.0 * g7_in, 1e-3);   // 0..1 in tile
    // dividing the tile-local coord by the growth scales the tile UP on screen
    g7_t = (g7_t - 0.5) / max(g7_gr, 1e-3) + 0.5;
    bool  g7_on = g7_h < clamp(uP2, 0.0, 1.0) &&
                  g7_t.x > 0.0 && g7_t.x < 1.0 && g7_t.y > 0.0 && g7_t.y < 1.0;
    if (!g7_on && g7_ln < 0.5) { u = 40.0; }                        // bare grid
    else {
      u = 0.0;
      vec3 g7_a = gradient(fract(g7_h * 3.7));
      vec3 g7_b = gradient(fract(g7_h2 * 5.3 + 0.37));
      vec3 g7_col;
      if (g7_on) {
        float m = floor(g7_h2 * 6.0);              // which motif this beat
        float k = 0.0;
        if (m < 1.0)      k = 0.0;                                     // solid
        else if (m < 2.0) k = step(0.5, fract(g7_t.y * 4.0));          // bars
        else if (m < 3.0) k = step(0.5, fract(g7_t.x * 5.0));          // stripes
        else if (m < 4.0) k = step(0.72, max(fract(g7_t.x * 6.0),
                                             fract(g7_t.y * 6.0)));    // dots
        else if (m < 5.0) k = step(0.5, fract(floor(g7_t.x * 6.0) * 0.5
                                            + floor(g7_t.y * 6.0) * 0.5)); // check
        else k = 1.0 - step(0.22, min(min(g7_t.x, 1.0 - g7_t.x),
                                      min(g7_t.y, 1.0 - g7_t.y)));     // ring
        g7_col = mix(g7_a, g7_b, k);
      } else {
        g7_col = mix(uBg, vec3(1.0), clamp(uFlare * 0.16, 0.0, 1.0));  // the rule
      }
      gInkCol = g7_col;
      gInkMix = 1.0;
    }
    v = 0.5;
    cubeEdge = 0.0;
  } else if (uShape == 6) {                  // custom drawn path
    // nearest point on the drawn bezier: flow along it replaces v, signed
    // perpendicular distance becomes the rail coordinate, so the whole
    // pulse pipeline just bends along whatever spine is dragged out.
    // First/last segments project past the ends, so the fan runs off the
    // canvas instead of wrapping around the curve tips.
    vec2 P = vec2(x, v);
    vec2 prev = uC0;
    float bd = 1e9, bf = 0.0, bs = 1.0;
    for (int i = 1; i <= 64; i++) {
      float tt = float(i) / 64.0;
      float mm = 1.0 - tt;
      vec2 cur = mm*mm*mm*uC0 + 3.0*mm*mm*tt*uC1 + 3.0*mm*tt*tt*uC2 + tt*tt*tt*uC3;
      vec2 seg = cur - prev;
      float pr = dot(P - prev, seg) / (dot(seg, seg) + 1e-9);
      float lo = i == 1  ? -20.0 : 0.0;
      float hi = i == 64 ?  20.0 : 1.0;
      pr = clamp(pr, lo, hi);
      vec2 q = prev + seg * pr;
      float dd = dot(P - q, P - q);
      if (dd < bd) {
        bd = dd; bf = (float(i - 1) + pr) / 64.0;
        bs = (seg.x * (P.y - q.y) - seg.y * (P.x - q.x)) >= 0.0 ? 1.0 : -1.0;
      }
      prev = cur;
    }
    v = clamp(bf, 0.0, 1.0);
    W = uBase + uSpan * pow(v, uFlare);
    W *= 1.0 + 0.018 * sin(uTime * 0.40 + 1.7);
    u = bs * sqrt(bd) / max(W, 1e-4);
  } else {                                   // 0: measured perspective fan
    u = x / W;
  }
  float au = abs(u);

  // ---- strokes at a regular interval ------------------------------------
  // Each rail is a hot core over a coloured halo: at full brightness the core
  // blows out to white while the space between rails keeps the saturated hue.
  // The comb lives in saturation, not luminance — luminance stays near-flat,
  // which is why a brightness-based rib measurement reads only ~3%.
  float stp   = uEdge / max(uLines, 0.5);
  float blur  = clamp(2.4 / max(stp * W * uRes.x, 1.0), 0.0, 1.0);
  float d     = au / stp - floor(au / stp + 0.5);
  float sg    = mix(uRibSoft, 0.70, blur);
  float core  = exp(-(d * d) / (2.0 * sg * sg));
  // past the outermost rail the comb dies out so the edge is one smooth halo
  core *= 1.0 - smoothstep(uEdge * 0.85, uEdge + 0.15, au);
  // shallow comb by default: the wedge stays solid colour, bands read as a
  // soft step. Pushing core heat past ~0.7 progressively unlocks a deep
  // floor, so high settings become separated strands on dark gaps (the
  // silk / wormhole reference look) without ever breaking the solid range.
  // Solid-ring mode: a gaussian core has NO edge — it fades forever, which
  // reads as blur no matter how narrow. Replace it with a HARD band (one-pixel
  // anti-alias only) shaded inside by a metal ramp: dark inner edge rising to
  // the lit outer rim. The edge is crisp because the band function is a step,
  // not a bell.
  if (uShape == 7 && uP3 > 0.5) {
    float t7h  = clamp(uRibSoft * 2.2, 0.04, 0.44);
    float t7aa = blur * 0.7 + 1.5 / max(stp * uRes.y, 1.0);
    float t7in = 1.0 - smoothstep(t7h - t7aa, t7h + t7aa, abs(d));
    float t7tt = clamp((d + t7h) / (2.0 * t7h), 0.0, 1.0);
    core = t7in * mix(0.16, 0.92, pow(t7tt, 1.6));
  }
  float floorK = 0.12 + 0.73 * smoothstep(0.65, 1.0, uRibDepth);
  float lane  = mix(1.0 - floorK * uRibDepth, 1.0 + 0.90 * uRibDepth, core);
  // measured: a thin dark seam splits the fan at dead centre
  lane *= 1.0 - uSeam.x * exp(-pow(u / max(uSeam.y, 1e-3), 2.0));

  // ---- one travelling wave carries both the gradient and the envelope ----
  // colour age is sampled no further out than the last rail, so the outer
  // glow always carries the outermost rail's colour instead of a younger one
  float age = fract(uTime) - min(au, uEdge) * uDelay - uVLag * (1.0 - v)
            - 0.006 * sin(u * 4.3 + uTime * 0.45);

  // three motions:
  //   trails — a comet enters, runs the rails, exits, loops (default)
  //   solid — colours loop forever through an always-lit shape
  //   pulse — the measured clip wave
  // Timing sliders drive the trail: period = loop time, lifetime = trail
  // length, rise = head softness, fall start = where the tail fade begins,
  // outward lag = how much outer rails trail behind the centre.
  vec3 col;
  float env;
  if (uFlow >= 1) {
    // ---- the gradient RUN: one travelling phase, shared by every shape -----
    // Phase is built from three terms so the run reads the same way whatever
    // the shape is doing with u and v:
    //   uTime * uDwell            how fast the palette travels  (run speed)
    //   |u| * uDelay              spread ACROSS the rails       (run spread)
    //   (1 - v) * uRunV           spread ALONG the shape        (run stretch)
    // Because every shape defines v as its own flow axis, the same three
    // controls give the same "bands marching down the form" feel on the fan,
    // the flower, the ribbon and the tunnel alike.
    //
    // The per-rail random phase and hue wander that used to be hardwired here
    // are now behind uJitter, defaulting to 0: they made neighbouring rails
    // drift independently, so the bands shimmered instead of travelling as one
    // front. At 0 the run is perfectly ordered; dial it up for the old churn.
    float railC  = floor(au / stp + 0.5);
    float rnd    = fract(sin(railC * 12.9898) * 43758.5453);
    float wander = sin(uTime * (1.3 + rnd * 2.7) + rnd * 17.0) * 0.22;
    col = cyc(uTime * uDwell - min(au, uEdge) * uDelay * 2.0
              - (1.0 - v) * uRunV
              + (rnd * 0.18 + wander) * uJitter);
    if (gInkMix > 0.5) col = gInkCol;   // ASCII rain: exact flat inks
    if (uFlow == 2) {
      // Trails: an ignition/death wave rides ON TOP of the run.
      // The phase is WRAPPED (fract of the whole expression) rather than
      // offset-then-clamped. The old form, fract(uTime) - lag, went negative
      // straight after the wrap and stayed dark past uLife, so the entire
      // frame blanked for roughly a third of every loop. Wrapping means a rail
      // that has just died is already re-igniting behind itself, and uHold
      // floors the envelope so the shape never drops out completely — the run
      // stays on screen and only its brightness travels.
      float ph = fract(uTime - min(au, uEdge) * uDelay - uVLag * (1.0 - v));
      float duty = clamp(uLife, 0.05, 1.0);
      float tt = clamp((ph - uFall) / max(duty - uFall, 1e-3), 0.0, 1.0);
      float wave = smoothstep(0.0, max(uRise, 0.004), ph) * pow(1.0 - tt, 2.4);
      env = mix(wave, 1.0, clamp(uHold, 0.0, 1.0));
    } else {
      env = 1.0;
    }
  } else {
    col = ramp(age);
    float aget = fract(uTime);
    env = smoothstep(0.0, uRise, aget) * (1.0 - smoothstep(uFall, uLife, aget));
  }
  // white-hot cores: whiteness rides the stroke core and the envelope, so a
  // dim (young or dying) fan stays saturated while bright phases whiten the
  // rail centres — the white lines the clip shows between colour bands
  // Solid-ring tunnel mode (shape 7 + P3): the specular is a THIN line
  // riding the INNER rim of each tube instead of its centre, and the outer
  // rim picks up a slight shadow — asymmetric lighting is what turns a flat
  // neon band into a solid 3D ring lit from within the tunnel.
  float specK = core;
  if (uShape == 7 && uP3 > 0.5) {
    // crown: a thin bright line at ~82% across the band toward the outer rim,
    // clipped by the same hard band so it cannot glow past the edge
    float t7h = clamp(uRibSoft * 2.2, 0.04, 0.44);
    float t7s = max(t7h * 0.16, 0.015);
    float t7d = d - t7h * 0.64;
    float t7band = step(abs(d), t7h);
    specK = exp(-(t7d * t7d) / (2.0 * t7s * t7s)) * t7band;
    specK *= gRingLight;
  }
  col = mix(col, vec3(1.0), clamp(uBlow * specK * env, 0.0, 0.85));

  // ---- cross-section: filled core, soft rim, wide bloom ------------------
  // uBlur sets how crisp the edges are: low = sharp vector, high = airbrush
  //
  // HOLLOW (uHollow): punch the interior out so only a wall of the given
  // thickness survives at the silhouette — outline mode. This lives here, in
  // the shared cross-section, rather than in any one shape's branch, because
  // |u| is already a distance field for EVERY mode: subtracting an inner
  // cut-off turns any of them — flower, tunnel, ribbon, cube — into its own
  // outline for free. 0 = solid (inner radius 0, unchanged), 1 = a thin stroke.
  float wall  = mix(1.0, 0.05, clamp(uHollow, 0.0, 1.0));   // wall as a fraction of uEdge
  float inner = uEdge * (1.0 - wall);
  float soft  = max(uBlur, 0.015);
  float body  = smoothstep(inner - soft, inner, au)
              * (1.0 - smoothstep(uEdge, uEdge + soft, au));
  float rim   = 0.22 * exp(-pow((au - uEdge) / max(uBlur * 0.55, 0.02), 2.0));
  // a thin wall lights a fraction of the pixels the solid shape did, so it
  // reads far dimmer at the same gain. Lift it back rather than making the
  // user chase the gain slider every time they turn hollow up.
  float hcomp = mix(1.0, 2.1, clamp(uHollow, 0.0, 1.0));
  float I     = lane * (body + rim) * faceDim * hcomp;
  // the wide glow follows the wall too, otherwise a hollow shape stays filled
  // with bloom and reads solid anyway
  float bl0   = uBloom * exp(-pow(au / 1.05, 2.0));
  float blH   = uBloom * exp(-pow((au - uEdge * (1.0 - wall * 0.5)) / max(uEdge * wall * 1.6, 0.02), 2.0));
  float bloom = mix(bl0, blH, clamp(uHollow, 0.0, 1.0));

  // dying trail BLURS out: as the envelope drops, the comb flattens, the
  // outer edge widens and the glow lifts — strokes melt instead of fading
  // as crisp lines
  float soften = uFlow == 2 ? smoothstep(0.0, 1.0, env) : 1.0;
  float laneS  = mix(1.0, lane, 0.30 + 0.70 * soften);
  float bodyW  = smoothstep(inner - soft * 3.0, inner, au)
               * (1.0 - smoothstep(uEdge, uEdge + soft * 3.0, au));
  float bodyS  = mix(bodyW, body, soften);
  I = laneS * (bodyS + rim) * faceDim * hcomp;
  bloom *= 1.0 + (1.0 - soften) * 0.8;

  // envelope is NOT baked into brightness: it multiplies the final alpha
  // instead, so trails dissolve as a smooth luminous fade — over-bright
  // cores would otherwise clip flat and then drop off a visible hard edge
  float bright = (I + bloom) * (1.02 + 0.10 * v) * uGain + cubeEdge * 0.9;

  // hue-preserving roll-off: hot strokes blow out to white rather than
  // shifting toward yellow the way per-channel clipping does
  vec3 rgb = col * bright;
  float m    = max(max(rgb.r, rgb.g), rgb.b);
  float over = max(m - 1.0, 0.0);
  rgb /= max(m, 1.0);
  // blow-out gates ALL whitening: at 0 the rails stay pure colour — over-
  // bright cores just saturate instead of bleaching to white
  rgb  = mix(rgb, vec3(1.0), clamp(over * 0.15, 0.0, 0.50) * min(uBlow / 0.45, 1.0));

  float alpha = clamp(bright, 0.0, 1.0) * env;
  // the arc light must land AFTER the hue-preserving tone map — that map
  // divides by the max channel, so any brightness shaping applied before it
  // is normalised straight back out
  if (uShape == 7 && uP3 > 0.5) rgb *= gRingLight;
  vec3 outc = mix(uBg, rgb, alpha * uFade);
  // film grain: subtle animated noise over the whole frame for richness
  outc += (fract(sin(dot(gl_FragCoord.xy + fract(uTime) * 37.0,
                         vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * uGrain;
  gl_FragColor = vec4(outc, 1.0);
}
