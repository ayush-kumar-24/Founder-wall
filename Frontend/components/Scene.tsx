"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useWall } from "@/lib/store";
import { NoteData, WALL } from "@/lib/notes";
import { COLOR_HEX } from "@/lib/mapping";
import { sunrise, paperSettle, throwEase, breath, damp, lerp, spring } from "@/lib/easings";
import { makeNoteTexture, drawNoteFace } from "@/lib/paperTexture";
import { getNoteTexture, pumpTextureQueue, TIER_MID, TIER_CLOSE, TIER_FOCUS } from "@/lib/textureCache";

// ————————————————————————————————————————————————————————————
// Shared exploration state — where the visitor is standing.
// Written by the camera, read by everything that cares about distance.
// ————————————————————————————————————————————————————————————
export const explore = { dist: 8.4, x: 0, y: 1.75, focusedId: -1 };

const MIN_DIST = 1.05; // reading distance — nose almost to the paper
const MAX_DIST = 7.4; // the whole monument, if you choose to step back
const FOV = 36; // a longer lens: architectural, undistorted, calm

// ————————————————————————————————————————————————————————————
// RESPONSIVE FRAMING — one wall, every screen.
//
// Three.js FOV is *vertical*, so on a tall phone the horizontal field of view
// collapses to a sliver and the wall looks zoomed-in. To keep the wall framed
// the same across shapes we hold the *horizontal* field roughly constant: widen
// the lens as the screen narrows, and — once the lens hits a sane cap — let the
// camera step back to cover the rest.
//
// At any aspect ≥ REF_ASPECT (every laptop, desktop, and ultrawide) this returns
// exactly { fov: 36, distScale: 1 }, so the desktop experience is byte-identical.
// ————————————————————————————————————————————————————————————
const REF_ASPECT = 1.5; // 3:2 — at or above this, nothing changes
const FOV_MAX = 50; // widen the lens on tall screens, never into fisheye
const DIST_SCALE_MAX = 1.6; // and step back at most this much to recover width
const REF_HALF_TAN = Math.tan((FOV * Math.PI) / 360) * REF_ASPECT;

function responsiveFraming(aspect: number): { fov: number; distScale: number } {
  if (!Number.isFinite(aspect) || aspect >= REF_ASPECT) {
    return { fov: FOV, distScale: 1 };
  }
  // The vertical FOV that would fully preserve the horizontal framing…
  const idealHalfTan = REF_HALF_TAN / aspect;
  const fov = Math.min(FOV_MAX, (2 * Math.atan(idealHalfTan) * 180) / Math.PI);
  // …then whatever width the capped lens still misses, recover by stepping back.
  const cappedHalfTan = Math.tan((fov * Math.PI) / 360);
  const distScale = Math.min(DIST_SCALE_MAX, REF_HALF_TAN / (cappedHalfTan * aspect));
  return { fov, distScale };
}

function smoothstep(x: number, a: number, b: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// ————————————————————————————————————————————————————————————
// Shared note geometry: a plane with one curled corner.
// Three curl strengths, bucketed by age — the curl tells time.
// ————————————————————————————————————————————————————————————
function makeCurledNoteGeometry(curl = 1): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(0.15, 0.15, 8, 8);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / 0.075;
    const y = p.getY(i) / 0.075;
    const t = Math.max(0, (x + y - 0.7) / 1.3);
    p.setZ(i, p.getZ(i) + t * t * 0.014 * curl);
  }
  g.computeVertexNormals();
  return g;
}

// ————————————————————————————————————————————————————————————
// LIGHTING RIG — unchanged philosophy: the light has no source.
// ————————————————————————————————————————————————————————————
function LightingRig({ notes }: { notes: NoteData[] }) {
  const phase = useWall((s) => s.phase);
  const phaseStartedAt = useWall((s) => s.phaseStartedAt);
  const hemi = useRef<THREE.HemisphereLight>(null!);
  const key = useRef<THREE.DirectionalLight>(null!);
  const glowA = useRef<THREE.PointLight>(null!);
  const glowB = useRef<THREE.PointLight>(null!);
  const writeSpot = useRef<THREE.SpotLight>(null!);
  const washA = useRef<THREE.SpotLight>(null!);
  const washB = useRef<THREE.SpotLight>(null!);
  const washC = useRef<THREE.SpotLight>(null!);
  const writeTarget = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(0, 1.55, 4.35);
    return o;
  }, []);
  const washTargets = useMemo(
    () =>
      [-3.2, 0, 3.2].map((x) => {
        const o = new THREE.Object3D();
        o.position.set(x, 2.7, 0);
        return o;
      }),
    []
  );

  // one note, each day, is given a room of its own — the museum's
  // oldest trick: a single artifact, slightly more light than its
  // neighbors. Not a badge. Not a border. Just light.
  const daySpot = useRef<THREE.SpotLight>(null!);
  const dayNote = useMemo(() => {
    const day = Math.floor(Date.now() / 86400000);
    const candidates = notes.filter(
      (n) => n.y > 1.2 && n.y < 2.6 && Math.abs(n.x) < 4
    );
    if (candidates.length === 0) return null; // a bare wall has nothing to spotlight
    return candidates[(day * 131) % candidates.length];
  }, [notes]);
  const dayTarget = useMemo(() => {
    const o = new THREE.Object3D();
    if (dayNote) o.position.set(dayNote.x, dayNote.y, 0);
    return o;
  }, [dayNote]);

  useFrame((_, dt) => {
    const now = performance.now();
    const inWriting = phase === "writing";
    const entering = phase === "entrance";

    // gallery balance: the wash is the hero, everything else supports
    let hemiT = 0.27,
      keyT = 0.5,
      glowT = 0.7,
      spotT = 0,
      washT = 13;

    if (entering) {
      const t = sunrise(Math.min(1, (now - phaseStartedAt) / 4500));
      hemiT *= t;
      keyT *= t;
      glowT *= t;
      washT *= t;
    } else if (inWriting) {
      hemiT = 0.05;
      keyT = 0.1;
      glowT = 0.1;
      spotT = 2.4;
      washT = 1.5;
    }

    const lam = inWriting ? 1.1 : 1.6;
    hemi.current.intensity = damp(hemi.current.intensity, hemiT, lam, dt);
    key.current.intensity = damp(key.current.intensity, keyT, lam, dt);
    glowA.current.intensity = damp(glowA.current.intensity, glowT, lam, dt);
    glowB.current.intensity = damp(glowB.current.intensity, glowT, lam, dt);
    writeSpot.current.intensity = damp(writeSpot.current.intensity, spotT, 1.4, dt);
    // hierarchy: the heart of the wall breathes a little brighter
    washA.current.intensity = damp(washA.current.intensity, washT * 0.85, lam, dt);
    washB.current.intensity = damp(washB.current.intensity, washT * 1.22, lam, dt);
    washC.current.intensity = damp(washC.current.intensity, washT * 0.85, lam, dt);
    daySpot.current.intensity = damp(
      daySpot.current.intensity,
      inWriting || !dayNote ? 0 : washT * 0.38,
      lam,
      dt
    );
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={["#ffdcae", "#241c14", 0]} />
      <directionalLight
        ref={key}
        position={[2.2, 8.5, 5.5]}
        intensity={0}
        color="#ffd9a8"
      />
      <pointLight ref={glowA} position={[-1.8, 0.16, 0.55]} color="#ffb35e" distance={3.2} decay={2} intensity={0} />
      <pointLight ref={glowB} position={[1.8, 0.16, 0.55]} color="#ffb35e" distance={3.2} decay={2} intensity={0} />
      {/* the museum wash — three overlapping pools falling from an
          unseen track above. Natural falloff, soft scalloped gradients,
          the room's own shadow gathering at the top and edges. */}
      {washTargets.map((t, i) => (
        <primitive key={i} object={t} />
      ))}
      <spotLight
        ref={washA}
        position={[-3.2, 7.2, 2.8]}
        angle={0.66}
        penumbra={1}
        color="#ffdfae"
        intensity={0}
        distance={16}
        decay={1.5}
        target={washTargets[0]}
      />
      <spotLight
        ref={washB}
        position={[0, 7.2, 2.8]}
        angle={0.66}
        penumbra={1}
        color="#ffe4ba"
        intensity={0}
        distance={16}
        decay={1.5}
        target={washTargets[1]}
      />
      <spotLight
        ref={washC}
        position={[3.2, 7.2, 2.8]}
        angle={0.66}
        penumbra={1}
        color="#ffdfae"
        intensity={0}
        distance={16}
        decay={1.5}
        target={washTargets[2]}
      />
      <primitive object={dayTarget} />
      {/* The day-spotlight stays mounted even on an empty wall so its ref and
          the intensity animation in useFrame remain valid. With no note to
          light it is held at zero intensity (see useFrame) and parked at a
          neutral wall-centre position; the moment a note arrives it re-renders
          to that note's position and fades in. */}
      <spotLight
        ref={daySpot}
        position={
          dayNote ? [dayNote.x + 0.5, dayNote.y + 2.4, 2.1] : [0.5, 2.7, 2.1]
        }
        angle={0.13}
        penumbra={0.9}
        color="#ffe8c4"
        intensity={0}
        distance={9}
        decay={1.4}
        target={dayTarget}
      />
      <primitive object={writeTarget} />
      <spotLight
        ref={writeSpot}
        position={[-0.7, 2.6, 5.3]}
        angle={0.5}
        penumbra={0.9}
        color="#ffe6bf"
        intensity={0}
        distance={6}
        decay={1.6}
        target={writeTarget}
      />
    </>
  );
}

// ————————————————————————————————————————————————————————————
// ROOM
// ————————————————————————————————————————————————————————————
function Room() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 4]} receiveShadow>
        <planeGeometry args={[24, 18]} />
        <meshStandardMaterial color="#211a14" roughness={0.96} metalness={0} />
      </mesh>
      {/* the reveal — a recessed shadow gap where the wall meets the
          floor. The oldest architectural detail there is: it tells the
          eye that both surfaces are real, and neither is a backdrop. */}
      <mesh position={[0, 0.026, 0.03]}>
        <boxGeometry args={[11, 0.052, 0.03]} />
        <meshStandardMaterial color="#241f18" roughness={1} />
      </mesh>
      <mesh position={[-6.5, 5, 4]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[16, 14]} />
        <meshStandardMaterial color="#2a231b" roughness={1} />
      </mesh>
      <mesh position={[6.5, 5, 4]} rotation-y={-Math.PI / 2}>
        <planeGeometry args={[16, 14]} />
        <meshStandardMaterial color="#2a231b" roughness={1} />
      </mesh>
    </group>
  );
}

// ————————————————————————————————————————————————————————————
// THE WALL — aged ivory plaster. A real architectural surface:
// mottled lime wash, trowel arcs, hairline cracks, old water stains.
// Warm, matte, imperfect. Museum quality means it has lived.
// The notes now stand against it instead of sinking into it.
// ————————————————————————————————————————————————————————————
// The client's palette. One ivory: #f7f1eb.
// Every wall tone below is derived from it by luminance scaling only —
// same hue family, no invented colors.
const PALETTE_BASE = "#e6dcca"; // sampled from the reference wall
function shade(hex: string, k: number, alpha?: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * k));
  const b = Math.min(255, Math.round((n & 255) * k));
  return alpha === undefined
    ? `rgb(${r},${g},${b})`
    : `rgba(${r},${g},${b},${alpha})`;
}

// Multi-octave value noise: soft clouds with no repetition and no
// blotch artifacts. Drawn small, scaled up with smoothing — the classic
// darkroom trick. Blended in "overlay" so it only modulates luminance:
// every pixel stays inside the palette's hue family.
function noiseOctave(
  ctx: CanvasRenderingContext2D,
  S: number,
  cells: number,
  alpha: number,
  rnd: () => number
) {
  const small = document.createElement("canvas");
  small.width = cells;
  small.height = cells;
  const c2 = small.getContext("2d")!;
  const img = c2.createImageData(cells, cells);
  for (let i = 0; i < cells * cells; i++) {
    const v = 108 + Math.floor(rnd() * 40); // hover around neutral gray
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  c2.putImageData(img, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "overlay";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(small, 0, 0, S, S);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
}

function makePlasterTextures(): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const S = 2048;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d")!;

  let s = 4271;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };

  // base — the palette, exactly
  ctx.fillStyle = PALETTE_BASE;
  ctx.fillRect(0, 0, S, S);

  // lime wash: four octaves of cloud noise, large to fine.
  // No repetition, no procedural blotches — just uneven age.
  noiseOctave(ctx, S, 4, 0.10, rnd);
  noiseOctave(ctx, S, 9, 0.08, rnd);
  noiseOctave(ctx, S, 21, 0.06, rnd);
  noiseOctave(ctx, S, 90, 0.05, rnd);

  // trowel arcs — the hand that made the wall
  for (let i = 0; i < 130; i++) {
    ctx.strokeStyle =
      rnd() > 0.5 ? shade(PALETTE_BASE, 1.03, 0.022) : shade(PALETTE_BASE, 0.93, 0.022);
    ctx.lineWidth = 1 + rnd() * 2.5;
    ctx.beginPath();
    const x = rnd() * S,
      y = rnd() * S,
      l = S * (0.05 + rnd() * 0.13),
      a = rnd() * Math.PI;
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + Math.cos(a) * l * 0.5 + (rnd() - 0.5) * 40,
      y + Math.sin(a) * l * 0.5 + (rnd() - 0.5) * 40,
      x + Math.cos(a) * l,
      y + Math.sin(a) * l
    );
    ctx.stroke();
  }

  // plaster grain
  ctx.globalAlpha = 0.04;
  for (let i = 0; i < 5200; i++) {
    ctx.fillStyle = rnd() > 0.5 ? shade(PALETTE_BASE, 1.04) : shade(PALETTE_BASE, 0.85);
    ctx.fillRect(rnd() * S, rnd() * S, 1 + rnd(), 1 + rnd());
  }
  ctx.globalAlpha = 1;

  // tiny stains — the palette, aged
  for (let i = 0; i < 8; i++) {
    const x = rnd() * S,
      y = rnd() * S,
      r = S * (0.02 + rnd() * 0.06);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, shade(PALETTE_BASE, 0.89, 0.08));
    g.addColorStop(0.7, shade(PALETTE_BASE, 0.89, 0.04));
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    if (rnd() > 0.6) {
      const dg = ctx.createLinearGradient(x, y, x, y + r * 2.4);
      dg.addColorStop(0, shade(PALETTE_BASE, 0.89, 0.045));
      dg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = dg;
      ctx.fillRect(x - r * 0.06, y, r * 0.12, r * 2.4);
    }
  }

  // hairline cracks — faint, never structural, never a seam
  const crack = (x: number, y: number, steps: number, angle: number, w: number) => {
    ctx.strokeStyle = shade(PALETTE_BASE, 0.76, 0.22);
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let i = 0; i < steps; i++) {
      angle += (rnd() - 0.5) * 0.7;
      x += Math.cos(angle) * (4 + rnd() * 10);
      y += Math.sin(angle) * (4 + rnd() * 10);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  };
  for (let i = 0; i < 7; i++) {
    crack(rnd() * S, rnd() * S, 26 + Math.floor(rnd() * 70), rnd() * Math.PI * 2, 0.7 + rnd() * 0.7);
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;

  // ————— relief: a separate grayscale bump so light can rake the
  // surface. Plaster is felt before it is seen. —————
  const B = 1024;
  const bc = document.createElement("canvas");
  bc.width = B;
  bc.height = B;
  const bctx = bc.getContext("2d")!;
  bctx.fillStyle = "#808080";
  bctx.fillRect(0, 0, B, B);
  let s2 = 9973;
  const rnd2 = () => {
    s2 = (s2 * 16807) % 2147483647;
    return s2 / 2147483647;
  };
  noiseOctave(bctx, B, 5, 0.5, rnd2);
  noiseOctave(bctx, B, 13, 0.4, rnd2);
  noiseOctave(bctx, B, 47, 0.3, rnd2);
  bctx.globalAlpha = 0.25;
  for (let i = 0; i < 3000; i++) {
    bctx.fillStyle = rnd2() > 0.5 ? "#9a9a9a" : "#6a6a6a";
    bctx.fillRect(rnd2() * B, rnd2() * B, 1 + rnd2() * 2, 1 + rnd2());
  }
  bctx.globalAlpha = 1;
  const bump = new THREE.CanvasTexture(bc);
  bump.anisotropy = 4;

  return { map, bump };
}

// Real plaster is never planar. A few millimetres of hand-applied
// undulation is what separates architecture from geometry.
function plasterUndulation(x: number, y: number): number {
  return (
    (Math.sin(x * 1.3 + y * 0.7) * 0.45 +
      Math.sin(x * 0.5 - y * 1.1 + 1.7) * 0.35 +
      Math.sin(x * 2.3 + y * 1.9 + 4.2) * 0.2) *
    0.006
  );
}

function Wall() {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(WALL.width, WALL.height, 96, 48);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      p.setZ(i, WALL.curve(x) + plasterUndulation(x, y));
    }
    g.computeVertexNormals();
    return g;
  }, []);
  const { map, bump } = useMemo(() => makePlasterTextures(), []);
  return (
    <group position={[0, WALL.height / 2, 0]}>
      <mesh geometry={geo}>
        <meshStandardMaterial
          map={map}
          bumpMap={bump}
          bumpScale={0.5}
          roughness={0.96}
          metalness={0}
        />
      </mesh>
    </group>
  );
}

// ————————————————————————————————————————————————————————————
// THE FIELD — all 300 notes as instanced color quads. From distance
// the wall is exactly what it should be: color and density. Nothing more.
// Ambient flutter only happens while the visitor stands back — up close
// the wall holds still. The wall never fights the visitor.
// ————————————————————————————————————————————————————————————
function NotesField({ notes }: { notes: NoteData[] }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const group = useRef<THREE.Group>(null!);
  const lastLanding = useWall((s) => s.lastLanding);
  const geo = useMemo(() => makeCurledNoteGeometry(1), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const flutter = useRef({ idx: -1, start: 0, next: 2500 });
  const breezeAmt = useMemo(() => new Float32Array(notes.length), [notes.length]);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  // explore.focusedId is a note *id*, not an instance index — this maps one to
  // the other so the focused note's instance can be addressed on the GPU.
  const indexById = useMemo(() => {
    const m = new Map<number, number>();
    notes.forEach((n, i) => m.set(n.id, i));
    return m;
  }, [notes]);
  const prevFocused = useRef(-1);
  const lastPointerMove = useRef(0);

  useEffect(() => {
    const onMove = () => (lastPointerMove.current = performance.now());
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  const compose = (
    n: NoteData,
    extraRot = 0,
    extraZ = 0,
    rx = 0,
    ry = 0,
    scaleMul = 1,
    out: THREE.Object3D = dummy
  ) => {
    out.position.set(n.x, n.y, WALL.curve(n.x) + 0.018 + n.age * 0.006 + extraZ);
    out.rotation.set(rx, WALL.normalYaw(n.x) + ry, n.rot + extraRot);
    const s = n.scale * scaleMul;
    out.scale.set(s, s, Math.max(1e-4, s * (0.6 + n.age * 0.9)));
    out.updateMatrix();
  };

  useEffect(() => {
    const mesh = ref.current;
    if (notes.length === 0) return;
    const c = new THREE.Color();
    notes.forEach((n, i) => {
      compose(n);
      mesh.setMatrixAt(i, dummy.matrix);
      c.set(n.color).lerp(new THREE.Color("#cfc6b3"), n.age * 0.45);
      mesh.setColorAt(i, c);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((state, dt) => {
    const now = state.clock.elapsedTime * 1000;
    const t = state.clock.elapsedTime;
    const mesh = ref.current;
    let dirty = false;

    // ————— the breeze: paper answering the visitor's hand.
    // Works at every distance — the wall is alive even from across
    // the room. Subtle enough to feel rather than notice. —————
    // a breeze needs a moving hand; a resting cursor is still air.
    // But paper mid-lean always settles home, hand or no hand.
    const handAlive =
      performance.now() - lastPointerMove.current < 2600 &&
      useWall.getState().phase === "idle";
    let cwx = 1e9,
      cwy = 1e9;
    if (handAlive) {
      raycaster.setFromCamera(state.pointer, state.camera);
      const dir = raycaster.ray.direction;
      if (dir.z < -1e-4) {
        const k = (0.02 - state.camera.position.z) / dir.z;
        cwx = raycaster.ray.origin.x + dir.x * k;
        cwy = raycaster.ray.origin.y + dir.y * k;
      }
    }
    {
      // reach widens slightly with distance so it stays perceivable
      const R = 0.32 + explore.dist * 0.05;
      for (let i = 0; i < notes.length; i++) {
        const n = notes[i];
        const dx = n.x - cwx;
        const dy = n.y - cwy;
        const dd = Math.hypot(dx, dy);
        const target = dd < R ? (1 - dd / R) * (1 - dd / R) : 0;
        const prev = breezeAmt[i];
        if (target > 0.001 || prev > 0.001) {
          const b = damp(prev, target, 5, dt);
          breezeAmt[i] = b;
          if (n.id === explore.focusedId) continue; // the read note is elsewhere
          if (b > 0.0015) {
            const nx = dx / Math.max(dd, 0.05);
            const ny = dy / Math.max(dd, 0.05);
            // 1–2°: a lean away from the hand, a wobble riding on top,
            // then the soft spring back handled by the damping itself.
            // Slightly amplified with distance so it never dies visually.
            const amp = 0.85 + Math.min(0.55, explore.dist * 0.07);
            compose(
              n,
              (nx * 0.014 * b + Math.sin(t * 4.3 + n.id * 1.7) * 0.01 * b) * amp,
              0.0022 * b,
              -ny * 0.026 * b * amp,
              nx * 0.03 * b * amp
            );
            mesh.setMatrixAt(i, dummy.matrix);
          } else {
            breezeAmt[i] = 0;
            compose(n);
            mesh.setMatrixAt(i, dummy.matrix);
          }
          dirty = true;
        }
      }
    }

    // ————— the read note steps forward; its wall instance steps aside —————
    if (explore.focusedId !== prevFocused.current) {
      if (prevFocused.current >= 0) {
        const pi = indexById.get(prevFocused.current);
        if (pi !== undefined) {
          compose(notes[pi]);
          mesh.setMatrixAt(pi, dummy.matrix);
        }
      }
      if (explore.focusedId >= 0) {
        const ci = indexById.get(explore.focusedId);
        if (ci !== undefined) {
          compose(notes[ci], 0, 0, 0, 0, 1e-4);
          mesh.setMatrixAt(ci, dummy.matrix);
        }
      }
      prevFocused.current = explore.focusedId;
      dirty = true;
    }

    const f = flutter.current;
    // flutter lives at viewing distance; reading distance is stillness
    if (f.idx === -1 && now > f.next && explore.dist > 3.6 && notes.length > 0) {
      const pick = Math.floor(Math.random() * notes.length);
      if (notes[pick].id !== explore.focusedId) {
        f.idx = pick;
        f.start = now;
      }
    }
    if (f.idx >= 0 && f.idx < notes.length) {
      const t = (now - f.start) / 480;
      if (t >= 1) {
        compose(notes[f.idx]);
        mesh.setMatrixAt(f.idx, dummy.matrix);
        f.idx = -1;
        f.next = now + 4000 + Math.random() * 5000;
      } else {
        const a = Math.sin(t * Math.PI) * 0.035;
        compose(notes[f.idx], a, Math.sin(t * Math.PI) * 0.004);
        mesh.setMatrixAt(f.idx, dummy.matrix);
      }
      dirty = true;
    }

    if (lastLanding) {
      const dtL = (performance.now() - lastLanding.time) / 1000;
      if (dtL >= 0 && dtL < 1.4) {
        notes.forEach((n, i) => {
          if (n.id === explore.focusedId) return;
          const d = Math.hypot(n.x - lastLanding.x, n.y - lastLanding.y);
          if (d < 0.9) {
            const delay = d * 0.55;
            const local = dtL - delay;
            if (local > 0 && local < 0.6) {
              const a = Math.sin((local / 0.6) * Math.PI) * (1 - d / 0.9);
              compose(n, a * 0.03, a * 0.002);
              mesh.setMatrixAt(i, dummy.matrix);
              dirty = true;
            } else if (local >= 0.6) {
              compose(n);
              mesh.setMatrixAt(i, dummy.matrix);
              dirty = true;
            }
          }
        });
      }
      const bt = dtL - 0.7;
      if (bt > 0 && bt < 0.4) {
        group.current.position.x = Math.sin((bt / 0.4) * Math.PI) * 0.008;
      } else {
        group.current.position.x = 0;
      }
    }

    if (dirty) mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group ref={group}>
      <instancedMesh
        ref={ref}
        args={[geo, undefined as unknown as THREE.Material, Math.max(1, notes.length)]}
      >
        <meshStandardMaterial roughness={0.92} side={THREE.DoubleSide} />
      </instancedMesh>
    </group>
  );
}

// ————————————————————————————————————————————————————————————
// READABLE NOTES — every note becomes an artifact as you approach.
// Overlay meshes sit a hair in front of their instances, carrying the
// same paper color plus handwriting. Their opacity is driven by
// distance, so text *emerges* on approach — the note doesn't change,
// your eyes adjust. Tier upgrades swap identical content at higher
// resolution: focus arriving, never popping.
// ————————————————————————————————————————————————————————————
function ReadableNotes({ notes }: { notes: NoteData[] }) {
  const { camera, size } = useThree();
  const group = useRef<THREE.Group>(null!);
  const hovered = useRef<THREE.Mesh | null>(null);
  const focused = useRef<THREE.Mesh | null>(null);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const pointer = useRef(new THREE.Vector2(10, 10));
  const cursorOnWall = useRef(new THREE.Vector3(999, 999, 0));
  const frame = useRef(0);
  const press = useRef({ x: 0, y: 0, t: 0 });
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    let alive = true;
    const fonts: FontFaceSet | undefined = (document as any).fonts;
    if (fonts?.load) {
      Promise.all([
        fonts.load("400 40px 'Patrick Hand'"),
        fonts.load("500 40px Caveat"),
      ])
        .then(() => alive && setFontsReady(true))
        .catch(() => alive && setFontsReady(true));
    } else setFontsReady(true);
    return () => {
      alive = false;
    };
  }, []);

  const meshes = useMemo(() => {
    const geoByCurl = [
      makeCurledNoteGeometry(0.45),
      makeCurledNoteGeometry(0.85),
      makeCurledNoteGeometry(1.3),
    ];
    return notes.map((n) => {
      const g = geoByCurl[Math.min(2, Math.floor(n.age * 3))];
      const mat = new THREE.MeshStandardMaterial({
        roughness: 0.9,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        emissive: new THREE.Color("#fff3dd"),
        emissiveIntensity: 0,
      });
      const m = new THREE.Mesh(g, mat);
      m.position.set(n.x, n.y, WALL.curve(n.x) + 0.0208 + n.age * 0.006);
      m.rotation.set(0, WALL.normalYaw(n.x), n.rot);
      m.scale.setScalar(n.scale);
      m.visible = false;
      m.castShadow = false;
      m.receiveShadow = false;
      m.userData = { note: n, baseZ: m.position.z, lift: 0, breeze: 0, dim: 1, zv: 0, sv: 0 };
      return m;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);

  useEffect(() => {
    const g = group.current;
    meshes.forEach((m) => g.add(m));

    const onMove = (e: PointerEvent) => {
      pointer.current.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
      );
    };
    // click vs drag: a click barely moves and doesn't linger
    const onDown = (e: PointerEvent) => {
      press.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    };
    const onUp = (e: PointerEvent) => {
      if (useWall.getState().phase !== "idle") return;
      const moved = Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y);
      const held = performance.now() - press.current.t;
      if (moved > 7 || held > 380) return; // it was a drag, not a choice
      pointer.current.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
      );
      raycaster.setFromCamera(pointer.current, camera);
      const visibles = meshes.filter((m) => m.visible);
      let hit = raycaster.intersectObjects(visibles, false)[0]?.object as
        | THREE.Mesh
        | undefined;
      // from across the room the overlays are hidden — pick against the
      // wall itself. Reading must work from any distance.
      if (!hit) {
        const dir = raycaster.ray.direction;
        if (dir.z < -1e-4) {
          const k = (0.02 - camera.position.z) / dir.z;
          const wx = raycaster.ray.origin.x + dir.x * k;
          const wy = raycaster.ray.origin.y + dir.y * k;
          let best: THREE.Mesh | null = null;
          let bestD = 1e9;
          for (const m of meshes) {
            const n: NoteData = m.userData.note;
            const dd = Math.hypot(n.x - wx, n.y - wy);
            if (dd < 0.085 * n.scale && dd < bestD) {
              best = m;
              bestD = dd;
            }
          }
          hit = best ?? undefined;
        }
      }
      // choosing the chosen note lets it go; empty wall lets it go
      focused.current = hit && hit !== focused.current ? hit : null;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      meshes.forEach((m) => {
        g.remove(m);
        (m.material as THREE.Material).dispose();
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meshes]);

  useFrame((state, dt) => {
    pumpTextureQueue(2); // never a hitch, even mid-approach
    if (!fontsReady) return;

    frame.current++;
    const t = state.clock.elapsedTime;
    const d = explore.dist;
    const cx = explore.x;
    const cy = explore.y;

    if (useWall.getState().phase !== "idle") focused.current = null;

    const fade = 1 - smoothstep(d, 3.8, 5.8);
    const overlayOn = fade > 0.01;
    const halfH = d * Math.tan((FOV * Math.PI) / 360) + 0.55;
    const halfW = halfH * (size.width / size.height) + 0.35;
    const tier = d < 2.5 ? TIER_CLOSE : TIER_MID;

    // where the visitor's hand hovers on the wall — the source of the breeze
    raycaster.setFromCamera(pointer.current, camera);
    const dir = raycaster.ray.direction;
    if (dir.z < -1e-4) {
      const k = (0.02 - camera.position.z) / dir.z;
      cursorOnWall.current
        .copy(raycaster.ray.origin)
        .addScaledVector(dir, k);
    } else {
      cursorOnWall.current.set(999, 999, 0);
    }

    // hover raycast — every third frame is plenty
    if (frame.current % 3 === 0 && overlayOn) {
      const visibles = meshes.filter((m) => m.visible);
      const hits = raycaster.intersectObjects(visibles, false);
      hovered.current = (hits[0]?.object as THREE.Mesh) ?? null;
    } else if (!overlayOn) {
      hovered.current = null;
    }

    const foc = focused.current;
    const fn: NoteData | null = foc ? foc.userData.note : null;
    explore.focusedId = fn ? fn.id : -1;
    // the breeze reaches this far from the hand
    const BR = 0.42;

    for (const m of meshes) {
      const n: NoteData = m.userData.note;
      const mat = m.material as THREE.MeshStandardMaterial;
      const isFocused = m === foc;
      const inView = Math.abs(n.x - cx) < halfW && Math.abs(n.y - cy) < halfH;
      const want = (overlayOn && inView) || isFocused;

      if (want) {
        const tex = getNoteTexture(n, isFocused ? TIER_FOCUS : tier);
        if (tex && mat.map !== tex) {
          mat.map = tex;
          mat.needsUpdate = true;
        }
      }

      const targetOpacity = want && mat.map ? (isFocused ? 1 : fade) : 0;
      mat.opacity = damp(mat.opacity, targetOpacity, 7, dt);
      m.visible = mat.opacity > 0.02;

      // ————— the breeze: paper answering the visitor's hand —————
      let bx = 0,
        by = 0;
      if (m.visible && !isFocused) {
        const dx = n.x - cursorOnWall.current.x;
        const dy = n.y - cursorOnWall.current.y;
        const dd = Math.hypot(dx, dy);
        const inf = dd < BR ? 1 - dd / BR : 0;
        m.userData.breeze = damp(m.userData.breeze, inf * inf * (3 - 2 * inf), 5, dt);
        if (m.userData.breeze > 0.003) {
          bx = dx / Math.max(dd, 0.05);
          by = dy / Math.max(dd, 0.05);
        }
      } else {
        m.userData.breeze = damp(m.userData.breeze, 0, 5, dt);
      }
      const b = m.userData.breeze;

      // hover: tiny elevation, a breath more light
      const isHover = hovered.current === m && !isFocused;
      m.userData.lift = damp(m.userData.lift, isHover ? 0.007 : 0, 8, dt);
      mat.emissiveIntensity = damp(
        mat.emissiveIntensity,
        isHover ? 0.055 : isFocused ? 0.03 : 0,
        8,
        dt
      );

      // ————— transforms: everything damped, everything has weight —————
      let tz: number, tsc: number, trx: number, try_: number, trz: number;
      if (isFocused) {
        // real paper lifted from a wall: it comes off gently, grows to
        // about twice itself, and turns just enough to face you.
        // The visitor steps closer (the camera walks); the paper meets
        // them halfway. No formula-sized UI element.
        tz = m.userData.baseZ + 0.26;
        tsc = n.scale * 2.0;
        trx = -0.03; // tipped up a breath, like paper held to read
        try_ = WALL.normalYaw(n.x) * 0.3;
        trz = n.rot * 0.35; // a few degrees — it stays handwritten, not framed
      } else {
        tz = m.userData.baseZ + m.userData.lift + b * 0.0028;
        tsc = n.scale;
        // tilt away from the hand, corner flutter riding on top
        trx = -by * 0.028 * b;
        try_ = WALL.normalYaw(n.x) + bx * 0.045 * b;
        trz = n.rot + Math.sin(t * 4.3 + n.id * 1.7) * 0.009 * b;
      }
      // z and scale ride a soft spring — mass, release, settle.
      // The overshoot is the paper exhaling back onto the wall.
      const [nz, nzv] = spring(m.position.z, m.userData.zv, tz, dt);
      m.position.z = nz;
      m.userData.zv = nzv;
      const [nsc, nsv] = spring(m.scale.x, m.userData.sv, tsc, dt);
      m.scale.setScalar(Math.max(0.01, nsc));
      m.userData.sv = nsv;
      const lam = isFocused ? 4.6 : 6.5;
      m.rotation.x = damp(m.rotation.x, trx, lam, dt);
      m.rotation.y = damp(m.rotation.y, try_, lam, dt);
      m.rotation.z = damp(m.rotation.z, trz, lam, dt);

      // ————— recession: neighbors step back while one note speaks —————
      const targetDim =
        fn && !isFocused && Math.hypot(n.x - fn.x, n.y - fn.y) < 1.6 ? 0.9 : 1;
      m.userData.dim = damp(m.userData.dim, targetDim, 5, dt);
      mat.color.setScalar(m.userData.dim);
    }
  });

  return <group ref={group} />;
}

// ————————————————————————————————————————————————————————————
// THE WRITING NOTE
// ————————————————————————————————————————————————————————————
const WRITE_POS = new THREE.Vector3(0, 1.55, 4.35);

function WritingNote() {
  const phase = useWall((s) => s.phase);
  const phaseStartedAt = useWall((s) => s.phaseStartedAt);
  const text = useWall((s) => s.writingText);
  const color = useWall((s) => s.writingColor);
  const ref = useRef<THREE.Mesh>(null!);
  const caretOn = useRef(true);

  const canvas = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 512;
    return c;
  }, []);
  const tex = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.anisotropy = 8;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [canvas]);

  useEffect(() => {
    const draw = () => {
      drawNoteFace(canvas, text, COLOR_HEX[color], { caret: caretOn.current, seed: 11, detail: 1, who: "" });
      tex.needsUpdate = true;
    };
    draw();
    const iv = setInterval(() => {
      caretOn.current = !caretOn.current;
      draw();
    }, 550);
    return () => clearInterval(iv);
  }, [text, color, canvas, tex]);

  useFrame(() => {
    if (!ref.current) return;
    const t = (performance.now() - phaseStartedAt) / 1000;
    const s = paperSettle(Math.min(1, t));
    ref.current.scale.setScalar(0.55 * (0.85 + 0.15 * s));
    ref.current.position.y = WRITE_POS.y + breath(t, 5.5, 0.006);
  });

  if (phase !== "writing") return null;
  return (
    <mesh ref={ref} position={WRITE_POS.toArray()} rotation={[-0.14, 0, 0.01]}>
      <planeGeometry args={[1, 1, 4, 4]} />
      <meshStandardMaterial map={tex} roughness={0.9} />
    </mesh>
  );
}

// ————————————————————————————————————————————————————————————
// THE FLIGHT
// ————————————————————————————————————————————————————————————
function FlyingNote() {
  const phase = useWall((s) => s.phase);
  const phaseStartedAt = useWall((s) => s.phaseStartedAt);
  const pending = useWall((s) => s.pendingNote);
  const setPhase = useWall((s) => s.setPhase);
  const upsertNote = useWall((s) => s.upsertNote);
  const setPendingNote = useWall((s) => s.setPendingNote);
  const setLastLanding = useWall((s) => s.setLastLanding);
  const setWritingText = useWall((s) => s.setWritingText);
  const ref = useRef<THREE.Mesh>(null!);
  const done = useRef(false);

  // The note's place on the wall was assigned by the server before the flight
  // began; we animate toward it, then commit it to the live wall on contact.
  const target = useMemo(
    () =>
      pending
        ? { x: pending.x, y: pending.y, rot: pending.rot }
        : { x: 0, y: 1.62, rot: 0 },
    [pending]
  );

  const tex = useMemo(
    () =>
      makeNoteTexture(
        pending?.text ?? "",
        pending?.color ?? "#e9e0cc",
        512,
        0,
        pending?.id ?? 11,
        1,
        ""
      ),
    [pending]
  );

  const p0 = WRITE_POS.clone().add(new THREE.Vector3(0, 0.12, 0.1));
  const p2 = useMemo(
    () => new THREE.Vector3(target.x, target.y, WALL.curve(target.x) + 0.024),
    [target]
  );
  const p1 = useMemo(
    () => p0.clone().lerp(p2, 0.45).add(new THREE.Vector3(0.25, 0.75, 0.55)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p2]
  );

  useEffect(() => {
    done.current = false;
  }, [phase]);

  useFrame(() => {
    if (phase !== "flying" || done.current || !ref.current) return;
    const t = (performance.now() - phaseStartedAt) / 1000;
    const m = ref.current;

    if (t < 0.9) {
      const k = paperSettle(t / 0.9);
      m.position.lerpVectors(WRITE_POS, p0, k);
      m.rotation.set(-0.14 + 0.14 * k, 0, 0.01 * (1 - k));
      m.scale.setScalar(0.55 + 0.03 * k);
    } else if (t < 1.6) {
      m.position.copy(p0);
    } else if (t < 3.8) {
      const k = throwEase((t - 1.6) / 2.2);
      const a = p0.clone().lerp(p1, k);
      const b = p1.clone().lerp(p2, k);
      m.position.copy(a.lerp(b, k));
      const wobble = Math.sin(k * 7) * 0.02 * (1 - k);
      m.rotation.set(0, WALL.normalYaw(target.x) * k, lerp(0, target.rot, k) + wobble);
      m.scale.setScalar(lerp(0.58, 0.15, k));
    } else {
      done.current = true;
      if (pending) upsertNote(pending);
      setLastLanding({ x: target.x, y: target.y, time: performance.now() });
      setWritingText("");
      setPendingNote(null);
      setPhase("settling");
      setTimeout(() => useWall.getState().setPhase("idle"), 1800);
    }
  });

  useEffect(() => () => tex.dispose(), [tex]);

  if (phase !== "flying" || !pending) return null;
  return (
    <mesh ref={ref} position={WRITE_POS.toArray()} scale={0.55}>
      <planeGeometry args={[1, 1, 6, 6]} />
      <meshStandardMaterial map={tex} roughness={0.9} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ————————————————————————————————————————————————————————————
// DUST
// ————————————————————————————————————————————————————————————
function Dust() {
  const ref = useRef<THREE.Points>(null!);
  const COUNT = 55;
  const [positions, speeds] = useMemo(() => {
    const p = new Float32Array(COUNT * 3);
    const s = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      p[i * 3] = (Math.random() - 0.5) * 9;
      p[i * 3 + 1] = Math.random() * 4.5;
      p[i * 3 + 2] = 0.3 + Math.random() * 4.5;
      s[i] = 0.012 + Math.random() * 0.02;
    }
    return [p, s];
  }, []);

  useFrame((state) => {
    const arr = ref.current.geometry.attributes.position.array as Float32Array;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < COUNT; i++) {
      arr[i * 3 + 1] += speeds[i] * 0.016;
      arr[i * 3] += Math.sin(t * 0.3 + i) * 0.0004;
      if (arr[i * 3 + 1] > 4.6) arr[i * 3 + 1] = 0.1;
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.014}
        color="#ffd9a0"
        transparent
        opacity={0.35}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// ————————————————————————————————————————————————————————————
// CAMERA — a museum visitor, not a game.
// Drag: walk along the wall (up, down, left, right) — the wall follows
// your hand 1:1 in world space, with the inertia of a heavy trolley.
// Scroll / pinch: step closer or back. No sudden acceleration anywhere.
// The breathing fades to nothing as you come close: when you stop to
// read, the camera is perfectly stable. The wall never fights you.
// ————————————————————————————————————————————————————————————
function CameraRig() {
  const { camera, gl, size } = useThree();
  const phase = useWall((s) => s.phase);
  const phaseStartedAt = useWall((s) => s.phaseStartedAt);
  const notes = useWall((s) => s.notes);

  const pos = useRef({ x: -0.1, y: 1.7 }); // eye level, on the clearing
  const vel = useRef({ x: 0, y: 0 });
  const dist = useRef(4.6);
  const targetDist = useRef(2.9);
  const drag = useRef({ on: false, lx: 0, ly: 0, lt: 0, pid: -1 });
  const focusGoal = useRef<{ x: number; y: number } | null>(null);
  const prevFocusId = useRef(-1);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number } | null>(null);
  const look = useMemo(() => new THREE.Vector3(0, 1.85, 0), []);

  // Responsive framing, recomputed only when the viewport shape changes.
  const framing = useRef({ fov: FOV, distScale: 1 });
  const appliedFov = useRef(FOV);
  const prevScale = useRef(1);
  const reducedMotion = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => (reducedMotion.current = mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const el = gl.domElement;
    el.style.touchAction = "none";
    el.style.cursor = "grab";

    const worldPerPx = () =>
      (2 * dist.current * Math.tan((framing.current.fov * Math.PI) / 360)) /
      el.clientHeight;

    const down = (e: PointerEvent) => {
      if (useWall.getState().phase !== "idle") return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size === 1) {
        drag.current = { on: true, lx: e.clientX, ly: e.clientY, lt: performance.now(), pid: e.pointerId };
        vel.current.x = 0;
        vel.current.y = 0;
        focusGoal.current = null; // the visitor took back their feet
        el.style.cursor = "grabbing";
      } else if (pointers.current.size === 2) {
        drag.current.on = false;
        const [a, b] = [...pointers.current.values()];
        pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y) };
      }
      el.setPointerCapture(e.pointerId);
    };

    const move = (e: PointerEvent) => {
      const p = pointers.current.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX;
      p.y = e.clientY;
      if (pinch.current && pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        const nd = Math.max(20, Math.hypot(a.x - b.x, a.y - b.y));
        targetDist.current = Math.min(
          MAX_DIST,
          Math.max(MIN_DIST, (targetDist.current * pinch.current.d) / nd)
        );
        pinch.current.d = nd;
        return;
      }
      if (drag.current.on && e.pointerId === drag.current.pid) {
        const now = performance.now();
        const dtMs = Math.max(8, now - drag.current.lt);
        const w = worldPerPx();
        const dx = -(e.clientX - drag.current.lx) * w;
        const dy = (e.clientY - drag.current.ly) * w;
        pos.current.x += dx;
        pos.current.y += dy;
        // rolling velocity estimate for release inertia
        vel.current.x = vel.current.x * 0.72 + (dx / (dtMs / 1000)) * 0.28;
        vel.current.y = vel.current.y * 0.72 + (dy / (dtMs / 1000)) * 0.28;
        drag.current.lx = e.clientX;
        drag.current.ly = e.clientY;
        drag.current.lt = now;
      }
    };

    const up = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId);
      if (e.pointerId === drag.current.pid) {
        drag.current.on = false;
        el.style.cursor = "grab";
        // a stale flick from long ago shouldn't launch the wall
        if (performance.now() - drag.current.lt > 90) {
          vel.current.x = 0;
          vel.current.y = 0;
        }
      }
      if (pointers.current.size < 2) pinch.current = null;
    };

    const wheel = (e: WheelEvent) => {
      if (useWall.getState().phase !== "idle") return;
      e.preventDefault();
      // trackpad pinch arrives as ctrl+wheel with small deltas — give it teeth
      const k = e.ctrlKey ? 0.009 : 0.0024;
      targetDist.current = Math.min(
        MAX_DIST,
        Math.max(MIN_DIST, targetDist.current * Math.exp(e.deltaY * k))
      );
    };

    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
    };
  }, [gl]);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const now = performance.now();

    // — Responsive framing. Math only; the projection matrix is rebuilt solely
    //   when the FOV actually changes (i.e. on a shape change), never per frame.
    const aspect = size.width / Math.max(1, size.height);
    const f = responsiveFraming(aspect);
    framing.current = f;
    if (Math.abs(f.fov - appliedFov.current) > 0.02) {
      const cam = camera as THREE.PerspectiveCamera;
      cam.fov = f.fov;
      cam.updateProjectionMatrix();
      appliedFov.current = f.fov;
    }
    // When the shape changes (rotate a phone, drag a split-screen divider),
    // rescale the live distance so the visitor's current zoom is preserved
    // relative to the new framing rather than snapping.
    const S = f.distScale;
    if (Math.abs(S - prevScale.current) > 1e-4) {
      const r = S / prevScale.current;
      dist.current = Math.min(MAX_DIST, Math.max(MIN_DIST, dist.current * r));
      targetDist.current = Math.min(MAX_DIST, Math.max(MIN_DIST, targetDist.current * r));
      prevScale.current = S;
    }

    if (phase === "entrance") {
      // a person walking in: slow, unhurried, coming to rest on their own.
      // Ends close enough to read — the wall introduces itself by speaking.
      const k = sunrise(Math.min(1, (now - phaseStartedAt) / 4800));
      // The resting frame scales with the screen; on a phone the visitor comes
      // to rest a little further back so the wall reads at the same width.
      dist.current = lerp(4.6 * S, 2.9 * S, k);
      targetDist.current = 2.9 * S;
      pos.current.x = -0.1;
      pos.current.y = 1.7;
    } else if (phase === "idle" || phase === "settling") {
      // inertia — glide, decay, settle. ~1.5s of glide after release.
      if (!drag.current.on) {
        pos.current.x += vel.current.x * dt;
        pos.current.y += vel.current.y * dt;
        const decay = Math.exp(-2.3 * dt);
        vel.current.x *= decay;
        vel.current.y *= decay;
      }
      // the room has walls: increasing resistance, never a bounce
      const bx = 4.2,
        byLo = 0.8,
        byHi = 3.55;
      if (pos.current.x > bx) {
        pos.current.x = damp(pos.current.x, bx, 6, dt);
        vel.current.x *= 0.6;
      } else if (pos.current.x < -bx) {
        pos.current.x = damp(pos.current.x, -bx, 6, dt);
        vel.current.x *= 0.6;
      }
      if (pos.current.y > byHi) {
        pos.current.y = damp(pos.current.y, byHi, 6, dt);
        vel.current.y *= 0.6;
      } else if (pos.current.y < byLo) {
        pos.current.y = damp(pos.current.y, byLo, 6, dt);
        vel.current.y *= 0.6;
      }
      // choosing a note is choosing to walk to it — a museum visitor
      // steps up to the piece. Gentle, cancellable by any drag.
      if (explore.focusedId !== prevFocusId.current) {
        prevFocusId.current = explore.focusedId;
        if (explore.focusedId >= 0) {
          const n = notes.find((nn) => nn.id === explore.focusedId);
          if (n) {
            focusGoal.current = { x: n.x, y: n.y };
            targetDist.current = Math.min(targetDist.current, 2.1);
          }
        } else {
          focusGoal.current = null;
        }
      }
      if (focusGoal.current && explore.focusedId >= 0 && !drag.current.on) {
        const gx = Math.min(4.2, Math.max(-4.2, focusGoal.current.x));
        const gy = Math.min(3.55, Math.max(0.8, focusGoal.current.y));
        pos.current.x = damp(pos.current.x, gx, 1.7, dt);
        pos.current.y = damp(pos.current.y, gy, 1.7, dt);
        if (Math.abs(pos.current.x - gx) < 0.02 && Math.abs(pos.current.y - gy) < 0.02) {
          focusGoal.current = null; // arrived; stand freely
        }
      }
      dist.current = damp(dist.current, targetDist.current, 4.2, dt);
    } else if (phase === "writing") {
      pos.current.x = damp(pos.current.x, 0, 1.4, dt);
      pos.current.y = damp(pos.current.y, 1.72, 1.4, dt);
      dist.current = damp(dist.current, 5.75, 1.2, dt);
      vel.current.x = 0;
      vel.current.y = 0;
    } else if (phase === "flying") {
      pos.current.x = damp(pos.current.x, 0, 1.4, dt);
      pos.current.y = damp(pos.current.y, 1.72, 1.4, dt);
      dist.current = damp(dist.current, 6.1, 1.2, dt);
    }

    // closeness: 0 far → 1 reading. Breathing and drift belong to distance.
    // Up close the camera is a tripod. Reading must feel comfortable.
    const closeness = 1 - smoothstep(dist.current, 1.2, 2.6);
    let breathAmp = 0.005 * (1 - closeness);
    if (phase === "writing") breathAmp = 0; // the room waits
    let driftAmp = phase === "idle" ? 1 - closeness : 0;
    // a note in your hands is read in stillness. Nothing moves.
    if (explore.focusedId >= 0) {
      breathAmp = 0;
      driftAmp = 0;
    }
    // Respect a visitor who asked for stillness: the wall stays put, the
    // camera still obeys their drag — only the ambient breathing/drift rests.
    if (reducedMotion.current) {
      breathAmp = 0;
      driftAmp = 0;
    }
    // never a gimbal: incommensurate periods, so the path never repeats
    const drift =
      (Math.sin(t * 0.131) * 0.022 +
        Math.sin(t * 0.047 + 2) * 0.015 +
        Math.sin(t * 0.019 + 5) * 0.011) *
      driftAmp;
    const driftY =
      (Math.sin(t * 0.083 + 1.3) * 0.009 + Math.sin(t * 0.029 + 4) * 0.006) * driftAmp;

    camera.position.x = pos.current.x + drift;
    camera.position.y = pos.current.y + breath(t, 4.2, breathAmp) + driftY;
    camera.position.z = dist.current;

    if (phase === "writing" || phase === "flying") {
      look.set(0, 1.55, 4.35);
      if (phase === "flying") {
        const ft = (now - phaseStartedAt) / 1000;
        const k = ft < 1.6 ? 0 : Math.min(1, (ft - 1.6) / 2.2);
        look.set(lerp(0, -0.1, k), lerp(1.55, 1.65, k), lerp(4.35, 0, sunrise(k)));
      }
    } else {
      // far: the museum gaze, slightly upward at the monument.
      // close: eye level with the paper — straight, comfortable, still.
      look.set(
        pos.current.x,
        lerp(1.85, pos.current.y, 0.3 + 0.7 * closeness),
        0
      );
    }
    camera.lookAt(look);

    explore.dist = dist.current;
    explore.x = camera.position.x;
    explore.y = camera.position.y;

    // Dev-only telemetry for responsive/framing verification. Stripped from
    // production builds; never runs for real visitors.
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __wall?: unknown }).__wall = {
        fov: +(camera as THREE.PerspectiveCamera).fov.toFixed(2),
        distScale: +framing.current.distScale.toFixed(3),
        dist: +dist.current.toFixed(2),
        aspect: +aspect.toFixed(3),
      };
    }
  });

  return null;
}

// ————————————————————————————————————————————————————————————
export default function Scene() {
  const { scene, gl } = useThree();
  useEffect(() => {
    scene.background = new THREE.Color("#120e0b");
    scene.fog = new THREE.Fog("#120e0b", 8.5, 20);
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 0.98;

    // Survive a GPU context loss (tab backgrounding, driver reset, memory
    // pressure) instead of crashing to the error boundary: preventDefault lets
    // the browser restore the context, and three re-uploads its resources.
    const canvas = gl.domElement;
    const onLost = (e: Event) => e.preventDefault();
    canvas.addEventListener("webglcontextlost", onLost);
    return () => canvas.removeEventListener("webglcontextlost", onLost);
  }, [scene, gl]);

  const notes = useWall((s) => s.notes);
  const notesVersion = useWall((s) => s.notesVersion);
  return (
    <>
      <LightingRig notes={notes} />
      <Room />
      <Wall />
      {/* The wall's note layers are sized to the note count at mount, so a
          version bump (a note added, edited, or removed) remounts them to
          rebuild cleanly. Keyed together so instances and overlays stay paired. */}
      <group key={notesVersion}>
        {notes.length > 0 && (
          <>
            <NotesField notes={notes} />
            <ReadableNotes notes={notes} />
          </>
        )}
      </group>
      <WritingNote />
      <FlyingNote />
      <Dust />
      <CameraRig />
    </>
  );
}
