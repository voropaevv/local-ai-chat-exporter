import { Billboard, ContactShadows, RoundedBox, Sparkles, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject
} from "react";
import * as THREE from "three";

const CHAPTERS = [
  {
    eyebrow: "A chat worth keeping",
    title: "Your AI chats become files you actually own.",
    body: "Jelluvi turns the conversation in your current tab into a clean local archive — without an account, an upload, or an export server."
  },
  {
    eyebrow: "The boundary is visible",
    title: "The conversation enters. Nothing leaves your device.",
    body: "Every fragment crosses one clear boundary: from the open page into Jelluvi's local renderer. The transcript never needs to meet us."
  },
  {
    eyebrow: "One local transformation",
    title: "Inside Jelluvi, one chat becomes nine portable formats.",
    body: "Markdown, PDF, DOCX, JSON, HTML, CSV, TXT, PNG, or a ZIP bundle — shaped from the same prepared conversation."
  },
  {
    eyebrow: "The file is the payoff",
    title: "Take the archive. Keep the conversation.",
    body: "Run the local demo and receive a real Markdown file generated entirely in this browser."
  }
] as const;

type MascotMode = "idle" | "look" | "absorb" | "process" | "export" | "success" | "error";

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function smooth(value: number): number {
  const bounded = clamp(value);
  return bounded * bounded * (3 - 2 * bounded);
}

function sampleKeyframes(progress: number, values: readonly number[]): number {
  const bounded = clamp(progress);
  const segmentCount = values.length - 1;
  const scaled = bounded * segmentCount;
  const index = Math.min(Math.floor(scaled), segmentCount - 1);
  const local = smooth(scaled - index);
  return THREE.MathUtils.lerp(values[index], values[index + 1], local);
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reduced;
}

function makeFileTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 960;
  const context = canvas.getContext("2d");

  if (!context) return new THREE.CanvasTexture(canvas);

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#f8fbff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const wash = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  wash.addColorStop(0, "rgba(0, 198, 255, 0.14)");
  wash.addColorStop(1, "rgba(0, 95, 239, 0.02)");
  context.fillStyle = wash;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = "#005fef";
  context.font = "800 76px -apple-system, BlinkMacSystemFont, sans-serif";
  context.fillText("MD", 72, 132);

  context.fillStyle = "#0d1b4d";
  context.font = "700 44px -apple-system, BlinkMacSystemFont, sans-serif";
  context.fillText("research-chat.md", 72, 232);

  context.fillStyle = "#66758f";
  context.font = "500 28px ui-monospace, SFMono-Regular, monospace";
  const lines = [
    "# Local-first archive",
    "",
    "## User",
    "Keep this conversation.",
    "",
    "## Assistant",
    "Ready on this device."
  ];
  lines.forEach((line, index) => context.fillText(line, 72, 340 + index * 62));

  context.fillStyle = "#00a8e8";
  context.fillRect(72, 844, 624, 8);
  context.fillStyle = "#496078";
  context.font = "650 25px -apple-system, BlinkMacSystemFont, sans-serif";
  context.fillText("8 messages · local render", 72, 902);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function makeFormatTexture(label: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 160;
  const context = canvas.getContext("2d");

  if (!context) return new THREE.CanvasTexture(canvas);

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(5, 18, 43, 0.94)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "rgba(93, 225, 255, 0.72)";
  context.lineWidth = 7;
  context.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
  context.fillStyle = "#eefdff";
  context.font = "800 62px -apple-system, BlinkMacSystemFont, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, canvas.width / 2, canvas.height / 2 + 3);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function ConversationFlow({ progressRef }: { progressRef: RefObject<number> }) {
  const particleRefs = useRef<Array<THREE.Mesh | null>>([]);
  const colors = ["#5ad8ff", "#168bff", "#a6f0ff", "#ffffff"];
  const { viewport } = useThree();

  useFrame(({ clock }) => {
    const progress = smooth((progressRef.current - 0.09) / 0.38);
    const time = clock.elapsedTime;

    particleRefs.current.forEach((particle, index) => {
      if (!particle) return;
      const delay = index / particleRefs.current.length;
      const local = clamp(progress * 1.5 - delay * 0.52);
      const curve = smooth(local);
      const lane = (index % 5) - 2;
      const mascotX =
        viewport.aspect < 1.05
          ? -0.1
          : sampleKeyframes(progressRef.current, [1.35, -1.35, 1.65, -1.75]);
      particle.position.x = THREE.MathUtils.lerp(-5.2 - delay * 1.8, mascotX + 0.2, curve);
      particle.position.y = THREE.MathUtils.lerp(1.7 - delay * 4.6, lane * 0.12, curve);
      particle.position.z = Math.sin(index * 1.7 + time * 0.7) * (0.55 * (1 - curve));
      particle.rotation.z = time * 0.3 + index;
      const vanish = local > 0.92 ? 1 - (local - 0.92) / 0.08 : 1;
      const scale = (0.72 + Math.sin(time * 1.8 + index) * 0.08) * clamp(vanish);
      particle.scale.setScalar(scale);
    });
  });

  return (
    <group>
      {Array.from({ length: 18 }, (_, index) => (
        <RoundedBox
          key={index}
          ref={(node) => {
            particleRefs.current[index] = node;
          }}
          args={[0.58 + (index % 3) * 0.11, 0.12, 0.08]}
          radius={0.06}
          smoothness={3}
        >
          <meshStandardMaterial
            color={colors[index % colors.length]}
            emissive={colors[index % colors.length]}
            emissiveIntensity={0.5}
            roughness={0.24}
          />
        </RoundedBox>
      ))}
    </group>
  );
}

function ProcessingHalo({ progressRef }: { progressRef: RefObject<number> }) {
  const groupRef = useRef<THREE.Group>(null);
  const materialRefs = useRef<Array<THREE.MeshBasicMaterial | null>>([]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const strength = Math.sin(Math.PI * clamp((progressRef.current - 0.42) / 0.35));
    group.rotation.x += delta * 0.24;
    group.rotation.y += delta * 0.42;
    group.scale.setScalar(0.86 + strength * 0.26);
    materialRefs.current.forEach((material) => {
      if (material) material.opacity = Math.max(0, strength * 0.36);
    });
  });

  return (
    <group ref={groupRef}>
      {[0, 1, 2].map((index) => (
        <mesh key={index} rotation={[Math.PI / 2 + index * 0.72, index * 0.58, 0]}>
          <torusGeometry args={[2.38 + index * 0.18, 0.014, 8, 128]} />
          <meshBasicMaterial
            ref={(node) => {
              materialRefs.current[index] = node;
            }}
            color={index === 1 ? "#ffffff" : "#35d6ff"}
            transparent
            opacity={0}
          />
        </mesh>
      ))}
    </group>
  );
}

function FormatOrbit({ progressRef }: { progressRef: RefObject<number> }) {
  const groupRef = useRef<THREE.Group>(null);
  const materialRefs = useRef<Array<THREE.MeshBasicMaterial | null>>([]);
  const textures = useMemo(
    () => ["MD", "PDF", "JSON", "ZIP"].map((label) => makeFormatTexture(label)),
    []
  );

  useEffect(() => () => textures.forEach((texture) => texture.dispose()), [textures]);

  useFrame(({ clock }, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const strength = Math.max(0, Math.sin(Math.PI * clamp((progressRef.current - 0.43) / 0.33)));
    group.rotation.z = clock.elapsedTime * 0.12;
    group.scale.setScalar(THREE.MathUtils.damp(group.scale.x, 0.82 + strength * 0.18, 5, delta));
    group.visible = strength > 0.025;
    materialRefs.current.forEach((material) => {
      if (material) material.opacity = strength * 0.92;
    });
  });

  return (
    <group ref={groupRef} visible={false}>
      {textures.map((texture, index) => {
        const angle = index * (Math.PI / 2) + Math.PI / 4;
        return (
          <Billboard
            key={index}
            position={[Math.cos(angle) * 2.45, Math.sin(angle) * 1.72, 0.35]}
            follow
          >
            <RoundedBox args={[1.05, 0.52, 0.11]} radius={0.12} smoothness={5}>
              <meshPhysicalMaterial
                color="#07172f"
                roughness={0.2}
                metalness={0.12}
                transmission={0.08}
                clearcoat={0.8}
              />
            </RoundedBox>
            <mesh position={[0, 0, 0.061]}>
              <planeGeometry args={[0.95, 0.45]} />
              <meshBasicMaterial
                ref={(node) => {
                  materialRefs.current[index] = node;
                }}
                map={texture}
                transparent
                opacity={0}
                toneMapped={false}
              />
            </mesh>
          </Billboard>
        );
      })}
    </group>
  );
}

function JelluviMascot({
  progressRef,
  modeRef
}: {
  progressRef: RefObject<number>;
  modeRef: RefObject<MascotMode>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const gltf = useGLTF("/models/jelluvi-mascot.glb?v=3");
  const { viewport } = useThree();
  const model = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  const bodyMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);

  useEffect(() => {
    const ownedMaterials: THREE.Material[] = [];
    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = false;
      child.receiveShadow = false;
      const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
      const clonedMaterials = sourceMaterials.map((source) => {
        const cloned = source.clone();
        cloned.name = source.name;
        ownedMaterials.push(cloned);
        return cloned;
      });
      child.material = Array.isArray(child.material) ? clonedMaterials : clonedMaterials[0];
      if (child.name === "Body") {
        bodyMaterialRef.current = clonedMaterials.find(
          (candidate): candidate is THREE.MeshStandardMaterial =>
            candidate instanceof THREE.MeshStandardMaterial && candidate.name === "Jelly Body"
        ) ?? null;
      }
    });

    return () => ownedMaterials.forEach((owned) => owned.dispose());
  }, [model]);

  useFrame(({ clock, pointer }, delta) => {
    const group = groupRef.current;
    if (!group) return;

    const progress = progressRef.current;
    const mode = modeRef.current;
    const time = clock.elapsedTime;
    const isNarrow = viewport.aspect < 1.05;
    const targetX = isNarrow ? -0.1 : sampleKeyframes(progress, [1.35, -1.35, 1.65, -1.75]);
    const targetY = isNarrow ? 0.12 : sampleKeyframes(progress, [-0.15, -0.08, -0.06, 0.2]);
    const targetScale = isNarrow
      ? sampleKeyframes(progress, [0.58, 0.55, 0.56, 0.52])
      : sampleKeyframes(progress, [0.94, 0.78, 0.8, 0.72]);
    const modeLift = mode === "success" ? Math.abs(Math.sin(time * 6.5)) * 0.16 : 0;

    group.position.x = THREE.MathUtils.damp(group.position.x, targetX, 3.8, delta);
    group.position.y = THREE.MathUtils.damp(group.position.y, targetY + modeLift, 4.6, delta);
    group.rotation.y = THREE.MathUtils.damp(
      group.rotation.y,
      sampleKeyframes(progress, [-0.18, 0.34, -0.24, 0.28]) + pointer.x * 0.13,
      4.2,
      delta
    );
    group.rotation.x = THREE.MathUtils.damp(group.rotation.x, -pointer.y * 0.045, 4.2, delta);
    const breathe = 1 + Math.sin(time * 1.7) * 0.018;
    const absorb = Math.max(0, Math.sin(Math.PI * clamp((progress - 0.2) / 0.26)));
    const process = Math.max(0, Math.sin(Math.PI * clamp((progress - 0.43) / 0.28)));
    const actionSquash = mode === "export" ? 0.18 : mode === "success" ? 0.06 : 0;
    const squash = Math.max(0.012 + Math.sin(time * 1.7) * 0.008, absorb * 0.1, actionSquash);
    const stretch = Math.max(0, process * 0.055, mode === "success" ? 0.07 : 0);
    const baseScale = targetScale * breathe;
    group.scale.x = THREE.MathUtils.damp(
      group.scale.x,
      baseScale * (1 + squash * 0.55 - stretch * 0.18),
      4.2,
      delta
    );
    group.scale.y = THREE.MathUtils.damp(
      group.scale.y,
      baseScale * (1 - squash * 0.72 + stretch * 0.68),
      4.2,
      delta
    );
    group.scale.z = THREE.MathUtils.damp(
      group.scale.z,
      baseScale * (1 + squash * 0.34 - stretch * 0.12),
      4.2,
      delta
    );

    const bodyMaterial = bodyMaterialRef.current;
    if (bodyMaterial) {
      bodyMaterial.emissive.set(mode === "success" ? "#0759ba" : "#00152f");
      bodyMaterial.emissiveIntensity = THREE.MathUtils.damp(
        bodyMaterial.emissiveIntensity,
        mode === "success"
          ? 0.28
          : 0.08 +
            Math.max(0, Math.sin(Math.PI * clamp((progress - 0.43) / 0.28))) *
              0.12,
        4,
        delta
      );
    }
  });

  return (
    <group ref={groupRef} dispose={null}>
      <primitive object={model} />
      <ProcessingHalo progressRef={progressRef} />
      <FormatOrbit progressRef={progressRef} />
    </group>
  );
}

function FileArtifact({
  progressRef,
  modeRef
}: {
  progressRef: RefObject<number>;
  modeRef: RefObject<MascotMode>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const texture = useMemo(() => makeFileTexture(), []);
  const { viewport } = useThree();

  useEffect(() => () => texture.dispose(), [texture]);

  useFrame(({ clock }, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const reveal = smooth((progressRef.current - 0.61) / 0.27);
    const successBoost = modeRef.current === "success" ? 0.12 : 0;
    const isNarrow = viewport.aspect < 1.05;
    const targetScale = reveal * ((isNarrow ? 0.32 : 0.63) + successBoost);
    group.scale.setScalar(THREE.MathUtils.damp(group.scale.x, targetScale, 5, delta));
    group.position.x = THREE.MathUtils.damp(
      group.position.x,
      THREE.MathUtils.lerp(0.6, isNarrow ? 0 : 3.2, reveal),
      4,
      delta
    );
    group.position.y = THREE.MathUtils.damp(
      group.position.y,
      THREE.MathUtils.lerp(-0.16, isNarrow ? -1.18 : -1.65, reveal) + Math.sin(clock.elapsedTime * 1.4) * 0.05,
      4,
      delta
    );
    group.rotation.y = THREE.MathUtils.damp(group.rotation.y, THREE.MathUtils.lerp(-0.7, -0.12, reveal), 4, delta);
  });

  return (
    <group ref={groupRef} position={[0.6, -0.16, 0]} scale={0.001}>
      <RoundedBox args={[2.06, 2.66, 0.2]} radius={0.13} smoothness={6}>
        <meshPhysicalMaterial
          color="#ecf8ff"
          roughness={0.18}
          metalness={0.04}
          transmission={0.08}
          clearcoat={0.9}
        />
      </RoundedBox>
      <mesh position={[0, 0, 0.112]}>
        <planeGeometry args={[1.85, 2.4]} />
        <meshBasicMaterial map={texture} transparent toneMapped={false} />
      </mesh>
      <pointLight color="#46dfff" intensity={3.2} distance={4.2} position={[0, -0.2, 1.2]} />
    </group>
  );
}

function SpatialScene({
  progressRef,
  modeRef
}: {
  progressRef: RefObject<number>;
  modeRef: RefObject<MascotMode>;
}) {
  return (
    <>
      <color attach="background" args={["#030712"]} />
      <fog attach="fog" args={["#030712", 7.5, 15]} />
      <ambientLight intensity={1.25} color="#8bc9ff" />
      <directionalLight position={[4, 6, 8]} intensity={4.5} color="#d9f8ff" />
      <pointLight position={[-4, -2, 4]} intensity={22} distance={10} color="#005fef" />
      <pointLight position={[4, 2, 1]} intensity={18} distance={9} color="#00c6ff" />
      <ConversationFlow progressRef={progressRef} />
      <JelluviMascot progressRef={progressRef} modeRef={modeRef} />
      <FileArtifact progressRef={progressRef} modeRef={modeRef} />
      <Sparkles count={80} scale={[13, 7, 6]} size={1.1} speed={0.18} opacity={0.42} color="#7be3ff" />
      <ContactShadows position={[0, -2.25, 0]} scale={10} opacity={0.32} blur={2.8} far={4.5} color="#0050c8" />
    </>
  );
}

function StaticStory() {
  const [status, setStatus] = useState("Ready on this device");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    },
    [downloadUrl]
  );

  const runExport = () => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(downloadDemo(setStatus));
  };

  return (
    <main id="spatial-story" className="static-story">
      <header className="static-header">
        <img src="/brand/jelluvi.png" alt="" />
        <span>Jelluvi</span>
        <small>Reduced-motion view</small>
      </header>
      <div className="static-mascot">
        <img src="/brand/jelluvi.png" alt="Jelluvi mascot" />
      </div>
      {CHAPTERS.map((chapter, index) => (
        <section key={chapter.title}>
          <p>{String(index + 1).padStart(2, "0")} · {chapter.eyebrow}</p>
          <h1>{chapter.title}</h1>
          <div>{chapter.body}</div>
          {index === 3 ? (
            <div className="export-actions">
              <button type="button" onClick={runExport}>Run local export</button>
              {downloadUrl ? (
                <a href={downloadUrl} download="jelluvi-local-demo.md">Download demo.md</a>
              ) : null}
              <p role="status" aria-live="polite">{status}</p>
            </div>
          ) : null}
        </section>
      ))}
    </main>
  );
}

function downloadDemo(setStatus: (status: string) => void): string {
  const content = [
    "# Jelluvi local export demo",
    "",
    "> Generated locally in this browser. No transcript was uploaded.",
    "",
    "## User",
    "Keep this conversation.",
    "",
    "## Assistant",
    "Ready on this device."
  ].join("\n");
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  setStatus("Ready — the demo file was created locally.");
  return URL.createObjectURL(blob);
}

export default function SpatialExperience() {
  const reducedMotion = useReducedMotion();
  const rootRef = useRef<HTMLElement>(null);
  const progressRef = useRef(0);
  const modeRef = useRef<MascotMode>("idle");
  const timerRef = useRef<number | null>(null);
  const [chapter, setChapter] = useState(0);
  const [status, setStatus] = useState("Ready on this device");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => {
    if (reducedMotion) return;
    const root = rootRef.current;
    if (!root) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;

    void Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(
      ([gsapModule, scrollTriggerModule]) => {
        if (disposed) return;
        const gsap = gsapModule.default;
        const ScrollTrigger = scrollTriggerModule.ScrollTrigger;
        gsap.registerPlugin(ScrollTrigger);
        const trigger = ScrollTrigger.create({
          trigger: root,
          start: "top top",
          end: "bottom bottom",
          scrub: true,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            progressRef.current = self.progress;
            root.style.setProperty("--story-progress", self.progress.toFixed(4));
            const nextChapter = Math.min(CHAPTERS.length - 1, Math.floor(self.progress * CHAPTERS.length));
            setChapter((current) => (current === nextChapter ? current : nextChapter));

            if (modeRef.current !== "export" && modeRef.current !== "success") {
              modeRef.current =
                self.progress < 0.12
                  ? "look"
                  : self.progress < 0.43
                    ? "absorb"
                    : self.progress < 0.7
                      ? "process"
                      : "idle";
            }
          }
        });
        cleanup = () => trigger.kill();
      }
    );

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [reducedMotion]);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    },
    [downloadUrl]
  );

  const jumpToChapter = useCallback((index: number) => {
    const root = rootRef.current;
    if (!root) return;
    const rootTop = window.scrollY + root.getBoundingClientRect().top;
    const distance = Math.max(0, root.offsetHeight - window.innerHeight);
    window.scrollTo({
      top: rootTop + distance * (index / (CHAPTERS.length - 1)),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
    });
  }, []);

  const runExport = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
    setStatus("Preparing 8 messages locally…");
    modeRef.current = "export";
    timerRef.current = window.setTimeout(() => {
      const url = downloadDemo(setStatus);
      setDownloadUrl(url);
      modeRef.current = "success";
      timerRef.current = window.setTimeout(() => {
        modeRef.current = "idle";
      }, 1800);
    }, 1150);
  }, [downloadUrl]);

  if (reducedMotion) return <StaticStory />;

  return (
    <main id="spatial-story" ref={rootRef} className="spatial-root">
      <div className="spatial-viewport">
        <header className="spatial-header">
          <a className="spatial-brand" href="#spatial-story" aria-label="Jelluvi Spatial home">
            <img src="/brand/jelluvi.png" alt="" />
            <span>Jelluvi</span>
          </a>
          <p>Spatial concept · local only</p>
          <button type="button" onClick={() => jumpToChapter(3)}>See the local export</button>
        </header>

        <div className="canvas-shell" aria-label="Interactive 3D Jelluvi product story">
          <Canvas
            dpr={[1, 1.5]}
            camera={{ position: [0, 0, 8.2], fov: 38, near: 0.1, far: 30 }}
            gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
            fallback={<div className="webgl-fallback"><img src="/brand/jelluvi.png" alt="Jelluvi mascot" /></div>}
          >
            <Suspense fallback={null}>
              <SpatialScene progressRef={progressRef} modeRef={modeRef} />
            </Suspense>
          </Canvas>
        </div>

        <div className="story-overlay">
          {CHAPTERS.map((item, index) => (
            <section
              key={item.title}
              className={`story-chapter story-chapter-${index + 1}${chapter === index ? " is-active" : ""}`}
              aria-hidden={chapter !== index}
            >
              <p className="chapter-eyebrow">
                <span>{String(index + 1).padStart(2, "0")}</span>
                {item.eyebrow}
              </p>
              <h1>{item.title}</h1>
              <p className="chapter-body">{item.body}</p>
              {index === 3 ? (
                <div className="export-actions">
                  <button type="button" onClick={runExport}>Run local export</button>
                  {downloadUrl ? (
                    <a href={downloadUrl} download="jelluvi-local-demo.md">Download demo.md</a>
                  ) : null}
                  <p role="status" aria-live="polite">{status}</p>
                </div>
              ) : null}
            </section>
          ))}
        </div>

        <nav className="story-progress" aria-label="Spatial story chapters">
          {CHAPTERS.map((item, index) => (
            <button
              key={item.eyebrow}
              type="button"
              className={chapter === index ? "is-active" : ""}
              aria-current={chapter === index ? "step" : undefined}
              aria-label={`Go to chapter ${index + 1}: ${item.eyebrow}`}
              onClick={() => jumpToChapter(index)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
            </button>
          ))}
        </nav>

        <p className="scroll-cue" aria-hidden="true"><span /> Scroll to transform</p>
      </div>
    </main>
  );
}

useGLTF.preload("/models/jelluvi-mascot.glb?v=3");
