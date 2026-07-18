import { Billboard, Line, RoundedBox, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import * as THREE from "three";

const CONCEPTS = [
  {
    id: "keeper",
    number: "01",
    name: "The Living Keeper",
    englishName: "The Living Keeper",
    headline: "Give Jelluvi the conversation. Take back a file.",
    thesis:
      "The mascot is no longer an illustration beside the copy. It becomes the transformation engine: the conversation enters, stays on-device, and leaves as a file the user owns.",
    motion: "Flow → absorb → compress → release",
    elements: [
      {
        title: "Mascot portal",
        visual: "The character holds the center and physically receives conversation fragments.",
        meaning: "It makes the brand inseparable from the core action: turning a conversation into a file."
      },
      {
        title: "Conversation rows",
        visual: "Message-shaped fragments move from the source side toward the character.",
        meaning: "They show the real input without relying on abstract decorative particles."
      },
      {
        title: "Visible privacy boundary",
        visual: "Two light rings define a contained area around the mascot.",
        meaning: "They make privacy visible: processing happens inside the boundary and data does not leave it."
      },
      {
        title: "Tangible file",
        visual: "A dimensional Markdown object emerges on the output side.",
        meaning: "The story ends with an object the user can take, not with an abstract promise."
      }
    ]
  },
  {
    id: "cosmos",
    number: "02",
    name: "Format Cosmos",
    englishName: "Format Cosmos",
    headline: "One chat. Nine ways to own it.",
    thesis:
      "Jelluvi becomes the central nucleus for every output. The concept communicates product breadth through space instead of returning to a grid of equal cards.",
    motion: "One nucleus → orbital choice → format focus",
    elements: [
      {
        title: "Mascot nucleus",
        visual: "The character stays calm at the center of the system.",
        meaning: "One local process powers every format: this is one system, not nine unrelated features."
      },
      {
        title: "Nine orbital nodes",
        visual: "MD, PDF, DOCX, JSON, HTML, CSV, TXT, PNG, and ZIP occupy different depths.",
        meaning: "They reveal true export breadth without becoming a catalogue wall of blocks."
      },
      {
        title: "Shared orbit",
        visual: "One thin trajectory connects every format around a single center.",
        meaning: "It shows that every file comes from the same prepared conversation."
      },
      {
        title: "Selected-format beam",
        visual: "One highlighted node is linked to the mascot by a focused line.",
        meaning: "It creates a legible selection model: users can explore the space while retaining a clear current result."
      }
    ]
  },
  {
    id: "current",
    number: "03",
    name: "Memory Current",
    englishName: "Memory Current",
    headline: "Keep the thread, not the platform.",
    thesis:
      "The page becomes one continuous route for the conversation: messages pass through a local gateway, keep their order, and gather into an archive at the other end.",
    motion: "Continuous thread → local gateway → complete archive",
    elements: [
      {
        title: "Continuous light thread",
        visual: "A single spatial curve crosses the entire stage.",
        meaning: "It represents the conversation's real value: sequence and context, not disconnected messages."
      },
      {
        title: "Ordered messages",
        visual: "Conversation fragments stay attached to one path and move in sequence.",
        meaning: "They show that export preserves structure instead of reducing the chat to shuffled snippets."
      },
      {
        title: "Local gateway",
        visual: "A vertical ring passes the thread through one clearly marked point.",
        meaning: "It explains the technical boundary through a spatial event rather than jargon."
      },
      {
        title: "Mascot guide and archive",
        visual: "Jelluvi accompanies the thread while the final file anchors its endpoint.",
        meaning: "The character guides the journey, but ownership ultimately stays with the user."
      }
    ]
  }
] as const;

type ConceptId = (typeof CONCEPTS)[number]["id"];
type MotionStyle = ConceptId;

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

function makeLabelTexture(
  title: string,
  subtitle: string,
  accent = "#53ddff",
  width = 512,
  height = 256
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.CanvasTexture(canvas);

  context.clearRect(0, 0, width, height);
  context.fillStyle = "rgba(3, 13, 34, 0.96)";
  context.fillRect(0, 0, width, height);
  context.fillStyle = accent;
  context.fillRect(0, 0, 12, height);
  context.fillStyle = "#f6fbff";
  context.font = "800 62px -apple-system, BlinkMacSystemFont, sans-serif";
  context.fillText(title, 52, 106);
  context.fillStyle = "#87a0bb";
  context.font = "650 28px -apple-system, BlinkMacSystemFont, sans-serif";
  context.fillText(subtitle, 52, 168);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function PreparedMascot({
  position,
  scale,
  rotation = [0, 0, 0],
  motion,
  reducedMotion
}: {
  position: [number, number, number];
  scale: number;
  rotation?: [number, number, number];
  motion: MotionStyle;
  reducedMotion: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const gltf = useGLTF("/models/jelluvi-mascot.glb?v=3");
  const model = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  const basePosition = useMemo(() => new THREE.Vector3(...position), [position]);

  useEffect(() => {
    const ownedMaterials: THREE.Material[] = [];
    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
      const clonedMaterials = sourceMaterials.map((source) => {
        const cloned = source.clone();
        cloned.name = source.name;
        ownedMaterials.push(cloned);
        return cloned;
      });
      child.material = Array.isArray(child.material) ? clonedMaterials : clonedMaterials[0];
    });
    return () => ownedMaterials.forEach((material) => material.dispose());
  }, [model]);

  useFrame(({ clock, pointer }) => {
    const group = groupRef.current;
    if (!group) return;
    const time = reducedMotion ? 0 : clock.elapsedTime;
    const floatAmount = motion === "current" ? 0.1 : 0.07;
    group.position.copy(basePosition);
    group.position.y += Math.sin(time * 1.25) * floatAmount;
    group.rotation.set(...rotation);
    group.rotation.y += Math.sin(time * 0.42) * 0.19 + pointer.x * 0.11;
    group.rotation.x += pointer.y * -0.032;
    const pulse = reducedMotion
      ? 0
      : Math.max(0, Math.sin(time * (motion === "keeper" ? 1.15 : 0.72)));
    const breathe = 1 + Math.sin(time * 1.55) * 0.012;
    const squash = motion === "keeper" ? pulse * 0.025 : 0.008;
    const stretch = motion === "current" ? pulse * 0.02 : 0;
    const baseScale = scale * breathe;
    group.scale.set(
      baseScale * (1 + squash),
      baseScale * (1 - squash + stretch),
      baseScale * (1 + squash * 0.55 - stretch * 0.35)
    );
  });

  return (
    <group ref={groupRef} position={position} rotation={rotation} scale={scale} dispose={null}>
      <primitive object={model} />
    </group>
  );
}

function ConversationStream({ reducedMotion }: { reducedMotion: boolean }) {
  const refs = useRef<Array<THREE.Mesh | null>>([]);

  useFrame(({ clock }) => {
    const time = reducedMotion ? 0.42 : clock.elapsedTime * 0.15;
    refs.current.forEach((mesh, index) => {
      if (!mesh) return;
      const progress = (time + index / refs.current.length) % 1;
      const eased = progress * progress * (3 - 2 * progress);
      mesh.position.x = THREE.MathUtils.lerp(-5.2, 0.15, eased);
      mesh.position.y = 1.9 - index * 0.29 + Math.sin(index * 1.8) * 0.12;
      mesh.position.z = -0.7 + Math.sin(index * 0.8) * 0.44;
      const vanish = progress > 0.86 ? 1 - (progress - 0.86) / 0.14 : 1;
      mesh.scale.setScalar(Math.max(0.001, vanish * (0.82 + (index % 3) * 0.08)));
    });
  });

  return (
    <group>
      {Array.from({ length: 13 }, (_, index) => (
        <RoundedBox
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
          args={[0.86 + (index % 4) * 0.16, 0.13, 0.08]}
          radius={0.055}
          smoothness={4}
        >
          <meshBasicMaterial
            color={index % 3 === 0 ? "#f4fbff" : index % 3 === 1 ? "#41d7ff" : "#087ff5"}
            transparent
            opacity={0.86}
          />
        </RoundedBox>
      ))}
    </group>
  );
}

function PrivacyBoundary({ reducedMotion }: { reducedMotion: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const time = reducedMotion ? 0 : clock.elapsedTime;
    groupRef.current.rotation.z = Math.sin(time * 0.3) * 0.055;
    groupRef.current.scale.setScalar(1 + Math.sin(time * 1.2) * 0.018);
  });

  return (
    <group ref={groupRef} position={[1.45, -0.08, -0.8]}>
      <mesh>
        <torusGeometry args={[2.34, 0.018, 8, 160]} />
        <meshBasicMaterial color="#50dfff" transparent opacity={0.62} />
      </mesh>
      <mesh scale={1.11}>
        <torusGeometry args={[2.34, 0.01, 8, 160]} />
        <meshBasicMaterial color="#087ff5" transparent opacity={0.28} />
      </mesh>
    </group>
  );
}

function OwnedFile({
  position,
  rotation = [0, 0, 0],
  label = "MD",
  subtitle = "OWNED FILE"
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
  label?: string;
  subtitle?: string;
}) {
  const texture = useMemo(() => makeLabelTexture(label, subtitle), [label, subtitle]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <group position={position} rotation={rotation}>
      <RoundedBox args={[1.48, 1.92, 0.16]} radius={0.1} smoothness={5}>
        <meshPhysicalMaterial color="#eefaff" roughness={0.24} clearcoat={0.7} />
      </RoundedBox>
      <mesh position={[0, 0, 0.086]}>
        <planeGeometry args={[1.34, 1.76]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}

function ResponsiveSceneGroup({
  children,
  mobileScale,
  mobilePosition
}: {
  children: ReactNode;
  mobileScale: number;
  mobilePosition: [number, number, number];
}) {
  const { viewport } = useThree();
  const narrow = viewport.aspect < 0.78;
  return (
    <group scale={narrow ? mobileScale : 1} position={narrow ? mobilePosition : [0, 0, 0]}>
      {children}
    </group>
  );
}

function KeeperScene({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <ResponsiveSceneGroup mobileScale={0.72} mobilePosition={[-1.05, 1.45, 0]}>
      <ConversationStream reducedMotion={reducedMotion} />
      <PrivacyBoundary reducedMotion={reducedMotion} />
      <PreparedMascot position={[1.45, -0.2, 0]} scale={0.93} motion="keeper" reducedMotion={reducedMotion} />
      <OwnedFile position={[4.65, -1.35, -0.3]} rotation={[0, -0.3, -0.08]} />
    </ResponsiveSceneGroup>
  );
}

const FORMATS = ["MD", "PDF", "DOCX", "JSON", "HTML", "CSV", "TXT", "PNG", "ZIP"];

function FormatConstellation({ reducedMotion }: { reducedMotion: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const textures = useMemo(
    () => FORMATS.map((format) => makeLabelTexture(format, "LOCAL OUTPUT", format === "PDF" ? "#ffffff" : "#53ddff", 420, 210)),
    []
  );
  useEffect(() => () => textures.forEach((texture) => texture.dispose()), [textures]);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.z = reducedMotion ? -0.14 : clock.elapsedTime * 0.045 - 0.14;
    groupRef.current.rotation.y = Math.sin((reducedMotion ? 0 : clock.elapsedTime) * 0.2) * 0.08;
  });

  return (
    <group ref={groupRef} position={[1.18, 0, -0.45]}>
      <mesh>
        <torusGeometry args={[3.1, 0.012, 8, 192]} />
        <meshBasicMaterial color="#2fd5ff" transparent opacity={0.34} />
      </mesh>
      {textures.map((texture, index) => {
        const angle = index * (Math.PI * 2) / textures.length;
        const radius = index % 2 === 0 ? 3.12 : 2.62;
        return (
          <Billboard
            key={FORMATS[index]}
            position={[Math.cos(angle) * radius, Math.sin(angle) * radius * 0.63, index % 3 === 0 ? 0.42 : 0]}
            follow
          >
            <RoundedBox args={[1.12, 0.56, 0.09]} radius={0.08} smoothness={4}>
              <meshBasicMaterial color={index === 1 ? "#eefdff" : "#071832"} />
            </RoundedBox>
            <mesh position={[0, 0, 0.051]}>
              <planeGeometry args={[1.02, 0.51]} />
              <meshBasicMaterial map={texture} transparent toneMapped={false} />
            </mesh>
          </Billboard>
        );
      })}
      <Line points={[[0, 0, 0.1], [0.52, 1.54, 0.25]]} color="#ffffff" lineWidth={1.4} transparent opacity={0.75} />
    </group>
  );
}

function CosmosScene({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <ResponsiveSceneGroup mobileScale={0.62} mobilePosition={[-0.72, 1.4, 0]}>
      <FormatConstellation reducedMotion={reducedMotion} />
      <PreparedMascot position={[1.18, -0.16, 0.35]} scale={0.61} motion="cosmos" reducedMotion={reducedMotion} />
    </ResponsiveSceneGroup>
  );
}

function MemoryRibbon({ reducedMotion }: { reducedMotion: boolean }) {
  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-5.4, 1.75, -1.35),
        new THREE.Vector3(-3.1, 1.12, 0.1),
        new THREE.Vector3(-0.9, 0.28, -0.45),
        new THREE.Vector3(1.15, -0.58, 0.15),
        new THREE.Vector3(3.2, -1.12, -0.25),
        new THREE.Vector3(5.25, -1.32, 0.15)
      ]),
    []
  );
  const markersRef = useRef<Array<THREE.Mesh | null>>([]);

  useFrame(({ clock }) => {
    const drift = reducedMotion ? 0 : clock.elapsedTime * 0.025;
    markersRef.current.forEach((marker, index) => {
      if (!marker) return;
      const progress = (0.06 + index * 0.095 + drift) % 0.94;
      marker.position.copy(curve.getPoint(progress));
      const tangent = curve.getTangent(progress);
      marker.rotation.z = Math.atan2(tangent.y, tangent.x);
    });
  });

  return (
    <group>
      <mesh>
        <tubeGeometry args={[curve, 180, 0.055, 10, false]} />
        <meshBasicMaterial color="#39d9ff" transparent opacity={0.72} />
      </mesh>
      <mesh scale={1.035}>
        <tubeGeometry args={[curve, 180, 0.09, 10, false]} />
        <meshBasicMaterial color="#005fef" transparent opacity={0.14} />
      </mesh>
      {Array.from({ length: 9 }, (_, index) => (
        <RoundedBox
          key={index}
          ref={(node) => {
            markersRef.current[index] = node;
          }}
          args={[0.72 + (index % 3) * 0.16, 0.12, 0.07]}
          radius={0.05}
          smoothness={3}
        >
          <meshBasicMaterial color={index % 2 === 0 ? "#f5fbff" : "#148dff"} />
        </RoundedBox>
      ))}
    </group>
  );
}

function LocalGate({ reducedMotion }: { reducedMotion: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const pulse = reducedMotion ? 1 : 1 + Math.sin(clock.elapsedTime * 1.4) * 0.035;
    groupRef.current.scale.setScalar(pulse);
  });
  return (
    <group ref={groupRef} position={[0.55, -0.28, -0.35]} rotation={[0, 1.02, 0]}>
      <mesh>
        <torusGeometry args={[1.16, 0.055, 14, 128]} />
        <meshBasicMaterial color="#f4fbff" transparent opacity={0.85} />
      </mesh>
      <mesh scale={1.13}>
        <torusGeometry args={[1.16, 0.018, 10, 128]} />
        <meshBasicMaterial color="#32d8ff" transparent opacity={0.48} />
      </mesh>
    </group>
  );
}

function CurrentScene({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <ResponsiveSceneGroup mobileScale={0.5} mobilePosition={[-0.55, 1.42, 0]}>
      <MemoryRibbon reducedMotion={reducedMotion} />
      <LocalGate reducedMotion={reducedMotion} />
      <PreparedMascot
        position={[2.15, 0.83, 0.15]}
        scale={0.52}
        rotation={[0, -0.12, 0.05]}
        motion="current"
        reducedMotion={reducedMotion}
      />
      <OwnedFile position={[4.55, -1.12, -0.05]} rotation={[0, -0.2, -0.08]} label="ZIP" subtitle="COMPLETE ARCHIVE" />
    </ResponsiveSceneGroup>
  );
}

function SceneFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <color attach="background" args={["#020714"]} />
      <fog attach="fog" args={["#020714", 8, 17]} />
      <ambientLight intensity={0.75} color="#8bdcff" />
      <directionalLight position={[5, 5, 7]} intensity={3.2} color="#e5fbff" />
      <pointLight position={[3, -3, 2]} intensity={18} distance={10} color="#005fef" />
      <pointLight position={[-3, 2, 1]} intensity={12} distance={9} color="#38d9ff" />
      {children}
    </>
  );
}

export default function ConceptGallery() {
  const [activeId, setActiveId] = useState<ConceptId>("keeper");
  const [rationaleOpen, setRationaleOpen] = useState(false);
  const reducedMotion = useReducedMotion();
  const active = CONCEPTS.find((concept) => concept.id === activeId) ?? CONCEPTS[0];

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("concept");
    if (CONCEPTS.some((concept) => concept.id === requested)) {
      setActiveId(requested as ConceptId);
    }
  }, []);

  const selectConcept = (conceptId: ConceptId) => {
    setActiveId(conceptId);
    const url = new URL(window.location.href);
    url.searchParams.set("concept", conceptId);
    window.history.replaceState(null, "", url);
  };

  return (
    <main className={`concept-lab concept-lab-${active.id}`} data-concept={active.id}>
      <a className="skip-link" href="#concept-rationale">Skip to concept rationale</a>
      <div className="concept-canvas" role="img" aria-label={`Spatial concept: ${active.name}`}>
        <Canvas camera={{ position: [0, 0, 9.4], fov: 42 }} dpr={[1, 1.7]} gl={{ antialias: true, alpha: false }}>
          <Suspense fallback={null}>
            <SceneFrame>
              {active.id === "keeper" ? <KeeperScene reducedMotion={reducedMotion} /> : null}
              {active.id === "cosmos" ? <CosmosScene reducedMotion={reducedMotion} /> : null}
              {active.id === "current" ? <CurrentScene reducedMotion={reducedMotion} /> : null}
            </SceneFrame>
          </Suspense>
        </Canvas>
      </div>

      <header className="concept-lab-header">
        <a href="/" aria-label="Back to the current spatial prototype">
          <img src="/brand/jelluvi.png" alt="" />
          <span>Jelluvi · Concept Lab</span>
        </a>
        <p>Local only · non-generative</p>
      </header>

      <section className="concept-intro" aria-live="polite">
        <p className="concept-kicker">{active.number} · {active.englishName}</p>
        <h1>{active.headline}</h1>
        <p>{active.thesis}</p>
      </section>

      <button
        className="rationale-toggle"
        data-testid="rationale-toggle"
        type="button"
        aria-expanded={rationaleOpen}
        aria-controls="concept-rationale"
        onClick={() => setRationaleOpen((open) => !open)}
      >
        {rationaleOpen ? "Hide rationale" : "Show element rationale"}
      </button>

      <aside id="concept-rationale" className="concept-rationale" hidden={!rationaleOpen}>
        <div className="rationale-heading">
          <p>Why every element exists</p>
          <span>{active.motion}</span>
        </div>
        <ol>
          {active.elements.map((element) => (
            <li key={element.title}>
              <h2>{element.title}</h2>
              <p><strong>Visible role:</strong> {element.visual}</p>
              <p><strong>Product meaning:</strong> {element.meaning}</p>
            </li>
          ))}
        </ol>
      </aside>

      <nav className="concept-selector" aria-label="Choose a spatial concept">
        {CONCEPTS.map((concept) => (
          <button
            key={concept.id}
            type="button"
            data-testid={`concept-${concept.id}`}
            className={concept.id === active.id ? "is-active" : ""}
            aria-pressed={concept.id === active.id}
            onClick={() => selectConcept(concept.id)}
          >
            <span>{concept.number}</span>
            {concept.name}
          </button>
        ))}
      </nav>
    </main>
  );
}

useGLTF.preload("/models/jelluvi-mascot.glb?v=3");
