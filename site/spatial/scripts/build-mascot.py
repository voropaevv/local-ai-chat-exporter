"""Build a rotationally symmetric, editable Jelluvi mascot without generative AI.

The canonical PNG remains the front-view silhouette reference only. The runtime model does not
embed that raster as a flat face. Instead, the script takes the right-hand silhouette from crown to
base as a radial cross-section and revolves it around the vertical axis. That makes every body ring
truly circular while preserving the mascot's domed crown and softly waved base. Only the modeled
eyes, pupils, and reflections define a front side.
"""

from __future__ import annotations

from array import array
import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parent.parent
REPOSITORY_ROOT = ROOT.parent.parent
CANONICAL_MASCOT = REPOSITORY_ROOT / "assets" / "brand" / "jelluvi.png"
SOURCE_DIR = ROOT / "assets" / "source"
RUNTIME_DIR = ROOT / "public" / "models"
QA_DIR = ROOT / "qa" / "turntable"
BLEND_PATH = SOURCE_DIR / "jelluvi-mascot.blend"
GLB_PATH = RUNTIME_DIR / "jelluvi-mascot.glb"

RAY_COUNT = 192
REVOLUTION_SEGMENTS = 96
CROSS_SECTION_SAMPLE_STEP = 2
ALPHA_THRESHOLD = 0.38
SOURCE_CENTER_TOP_LEFT = (600.0, 650.0)
MODEL_WIDTH = 4.7


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for data_collection in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
        bpy.data.images,
    ):
        for block in list(data_collection):
            if block.users == 0:
                data_collection.remove(block)


def set_principled_input(
    principled: bpy.types.ShaderNodeBsdfPrincipled,
    name: str,
    value: float | tuple[float, float, float, float],
) -> None:
    socket = principled.inputs.get(name)
    if socket is not None:
        socket.default_value = value


def principled_material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    roughness: float,
    coat: float = 0.45,
    metallic: float = 0.0,
    emission: tuple[float, float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.diffuse_color = color
    material.use_nodes = True
    material.use_backface_culling = False
    principled = material.node_tree.nodes.get("Principled BSDF")
    if principled is not None:
        set_principled_input(principled, "Base Color", color)
        set_principled_input(principled, "Roughness", roughness)
        set_principled_input(principled, "Metallic", metallic)
        set_principled_input(principled, "Coat Weight", coat)
        set_principled_input(principled, "Coat Roughness", 0.16)
        set_principled_input(principled, "IOR", 1.39)
        set_principled_input(principled, "Subsurface Weight", 0.08)
        if emission is not None:
            set_principled_input(principled, "Emission Color", emission)
            set_principled_input(principled, "Emission Strength", emission_strength)
    return material


def mix_color(
    lower: tuple[float, float, float],
    upper: tuple[float, float, float],
    amount: float,
) -> tuple[float, float, float]:
    amount = max(0.0, min(1.0, amount))
    return tuple(lower[index] + (upper[index] - lower[index]) * amount for index in range(3))


def body_material() -> bpy.types.Material:
    material = principled_material(
        "Jelly Body",
        (0.01, 0.42, 1.0, 1.0),
        roughness=0.19,
        coat=0.72,
    )
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    principled = nodes.get("Principled BSDF")
    if principled is not None:
        vertex_color = nodes.new("ShaderNodeVertexColor")
        vertex_color.name = "Volumetric body gradient"
        vertex_color.layer_name = "BodyGradient"
        links.new(vertex_color.outputs["Color"], principled.inputs["Base Color"])
        set_principled_input(principled, "Emission Color", (0.0, 0.07, 0.24, 1.0))
        set_principled_input(principled, "Emission Strength", 0.055)
    return material


def sample_canonical_outline(
    source_image: bpy.types.Image,
) -> list[tuple[float, float]]:
    """Return clockwise x/z samples from the canonical alpha silhouette."""

    width, height = source_image.size
    center_x = SOURCE_CENTER_TOP_LEFT[0] / 1200.0 * width
    center_y = height - SOURCE_CENTER_TOP_LEFT[1] / 1200.0 * height
    pixels = array("f", [0.0]) * len(source_image.pixels)
    source_image.pixels.foreach_get(pixels)
    max_radius = int(math.hypot(width, height))
    source_visible_width = 1111.0 / 1200.0 * width
    model_scale = MODEL_WIDTH / source_visible_width
    outline: list[tuple[float, float]] = []

    for index in range(RAY_COUNT):
        angle = math.pi / 2.0 - index * math.tau / RAY_COUNT
        last_inside: tuple[int, int] | None = None
        for radius in range(max_radius):
            pixel_x = round(center_x + math.cos(angle) * radius)
            pixel_y = round(center_y + math.sin(angle) * radius)
            if pixel_x < 0 or pixel_y < 0 or pixel_x >= width or pixel_y >= height:
                break
            alpha_index = (pixel_y * width + pixel_x) * 4 + 3
            if pixels[alpha_index] >= ALPHA_THRESHOLD:
                last_inside = (pixel_x, pixel_y)
        if last_inside is None:
            raise RuntimeError(f"No alpha contour intersection for ray {index}")

        pixel_x, pixel_y = last_inside
        outline.append(
            (
                (pixel_x - center_x) * model_scale,
                (pixel_y - center_y) * model_scale,
            )
        )

    return outline


def add_body_gradient(mesh: bpy.types.Mesh) -> None:
    color_layer = mesh.color_attributes.new(name="BodyGradient", type="BYTE_COLOR", domain="POINT")
    minimum_z = min(vertex.co.z for vertex in mesh.vertices)
    maximum_z = max(vertex.co.z for vertex in mesh.vertices)
    height = maximum_z - minimum_z
    deep_blue = (0.0, 0.34, 1.0)
    central_blue = (0.0, 0.63, 1.0)
    top_cyan = (0.34, 0.92, 1.0)
    highlight_cyan = (0.78, 0.98, 1.0)

    def ellipse_influence(
        vertex: Vector,
        center_x: float,
        center_z: float,
        radius_x: float,
        radius_z: float,
        angle: float,
    ) -> float:
        delta_x = vertex.x - center_x
        delta_z = vertex.z - center_z
        cosine = math.cos(angle)
        sine = math.sin(angle)
        local_x = delta_x * cosine + delta_z * sine
        local_z = -delta_x * sine + delta_z * cosine
        distance = (local_x / radius_x) ** 2 + (local_z / radius_z) ** 2
        falloff = max(0.0, 1.0 - distance)
        frontness = max(0.0, min(1.0, (-vertex.y - 0.2) / (MODEL_WIDTH / 2.0 - 0.2)))
        return falloff * falloff * frontness

    for index, vertex in enumerate(mesh.vertices):
        vertical = (vertex.co.z - minimum_z) / height
        if vertical < 0.43:
            color = mix_color(deep_blue, central_blue, vertical / 0.43)
        else:
            color = mix_color(central_blue, top_cyan, (vertical - 0.43) / 0.57)

        main_highlight = ellipse_influence(vertex.co, -0.72, 1.48, 0.62, 0.20, -0.47)
        secondary_highlight = ellipse_influence(vertex.co, -1.31, 0.96, 0.23, 0.15, -0.42)
        highlight_strength = max(main_highlight * 0.88, secondary_highlight * 0.72)
        color = mix_color(color, highlight_cyan, highlight_strength)

        # The rear is intentionally a little darker so a rotation reads as actual depth.
        rear_factor = 1.0 - max(0.0, vertex.co.y) / (MODEL_WIDTH / 2.0) * 0.22
        color_layer.data[index].color = (
            color[0] * rear_factor,
            color[1] * rear_factor,
            color[2] * rear_factor,
            1.0,
        )


def radial_cross_section(
    outline: list[tuple[float, float]],
) -> list[tuple[float, float]]:
    """Convert the top-to-bottom right silhouette into a clean radius/z lathe profile."""

    half_outline = outline[: RAY_COUNT // 2 + 1]
    sampled = half_outline[::CROSS_SECTION_SAMPLE_STEP]
    if sampled[-1] != half_outline[-1]:
        sampled.append(half_outline[-1])

    profile = [(abs(x), z) for x, z in sampled]
    # Both endpoints lie on the vertical axis. Forcing the radius to zero removes tiny raster
    # sampling offsets and gives the surface a single crown and base pole.
    profile[0] = (0.0, profile[0][1])
    profile[-1] = (0.0, profile[-1][1])
    if max(radius for radius, _ in profile) < MODEL_WIDTH * 0.45:
        raise RuntimeError("Canonical cross-section is unexpectedly narrow")
    return profile


def radius_at_height(profile: list[tuple[float, float]], height: float) -> float:
    """Return the outermost radial intersection for a horizontal slice."""

    candidates: list[float] = []
    for (first_radius, first_z), (second_radius, second_z) in zip(profile, profile[1:]):
        minimum = min(first_z, second_z)
        maximum = max(first_z, second_z)
        if minimum <= height <= maximum and not math.isclose(first_z, second_z):
            amount = (height - first_z) / (second_z - first_z)
            candidates.append(first_radius + (second_radius - first_radius) * amount)
    if not candidates:
        raise RuntimeError(f"No body intersection at height {height:.3f}")
    return max(candidates)


def add_rotational_body(
    profile: list[tuple[float, float]],
    material: bpy.types.Material,
    parent: bpy.types.Object,
) -> tuple[bpy.types.Object, float]:
    vertices: list[tuple[float, float, float]] = [(0.0, 0.0, profile[0][1])]
    for radius, z in profile[1:-1]:
        for segment in range(REVOLUTION_SEGMENTS):
            angle = segment * math.tau / REVOLUTION_SEGMENTS
            vertices.append((radius * math.cos(angle), radius * math.sin(angle), z))
    bottom_pole_index = len(vertices)
    vertices.append((0.0, 0.0, profile[-1][1]))

    faces: list[tuple[int, ...]] = []
    for segment in range(REVOLUTION_SEGMENTS):
        faces.append((0, 1 + (segment + 1) % REVOLUTION_SEGMENTS, 1 + segment))

    ring_count = len(profile) - 2
    for ring_index in range(ring_count - 1):
        current_start = 1 + ring_index * REVOLUTION_SEGMENTS
        next_start = current_start + REVOLUTION_SEGMENTS
        for segment in range(REVOLUTION_SEGMENTS):
            next_segment = (segment + 1) % REVOLUTION_SEGMENTS
            faces.append(
                (
                    current_start + segment,
                    current_start + next_segment,
                    next_start + next_segment,
                    next_start + segment,
                )
            )

    last_ring_start = 1 + (ring_count - 1) * REVOLUTION_SEGMENTS
    for segment in range(REVOLUTION_SEGMENTS):
        faces.append(
            (
                last_ring_start + segment,
                last_ring_start + (segment + 1) % REVOLUTION_SEGMENTS,
                bottom_pole_index,
            )
        )

    mesh = bpy.data.meshes.new("Watertight rotational jelly body")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()

    normals_mesh = bmesh.new()
    normals_mesh.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(normals_mesh, faces=normals_mesh.faces)
    open_edges = [edge for edge in normals_mesh.edges if not edge.is_manifold]
    volume = abs(normals_mesh.calc_volume(signed=True))
    normals_mesh.to_mesh(mesh)
    normals_mesh.free()
    if open_edges:
        raise RuntimeError(f"Body is not watertight: {len(open_edges)} non-manifold edges")
    if volume < 1.0:
        raise RuntimeError(f"Body volume is unexpectedly small: {volume:.3f}")

    maximum_radial_variance = 0.0
    for ring_index in range(ring_count):
        ring_start = 1 + ring_index * REVOLUTION_SEGMENTS
        radii = [
            math.hypot(mesh.vertices[ring_start + segment].co.x, mesh.vertices[ring_start + segment].co.y)
            for segment in range(REVOLUTION_SEGMENTS)
        ]
        maximum_radial_variance = max(maximum_radial_variance, max(radii) - min(radii))
    if maximum_radial_variance > 1e-5:
        raise RuntimeError(f"Body lost rotational symmetry: {maximum_radial_variance:.8f}")

    add_body_gradient(mesh)
    for polygon in mesh.polygons:
        polygon.use_smooth = True

    body = bpy.data.objects.new("Body", mesh)
    body.parent = parent
    body["geometry"] = "surface of revolution from canonical radial cross-section"
    body["manifold"] = True
    body["rotationally_symmetric"] = True
    body["maximum_radial_variance"] = maximum_radial_variance
    body["volume"] = volume
    bpy.context.collection.objects.link(body)

    body.shape_key_add(name="Basis")
    squash = body.shape_key_add(name="Squash")
    stretch = body.shape_key_add(name="Stretch")
    basis = body.data.shape_keys.key_blocks["Basis"]
    floor = min(point.co.z for point in basis.data)
    ceiling = max(point.co.z for point in basis.data)
    height = ceiling - floor
    for index, basis_point in enumerate(basis.data):
        x, y, z = basis_point.co
        normalized_height = (z - floor) / height
        squash.data[index].co = (
            x * (1.06 - normalized_height * 0.01),
            y * (1.06 - normalized_height * 0.01),
            floor + (z - floor) * 0.84,
        )
        stretch.data[index].co = (
            x * (0.96 + normalized_height * 0.01),
            y * (0.96 + normalized_height * 0.01),
            floor + (z - floor) * 1.10,
        )

    return body, volume


def superellipse_outline(
    radius_x: float,
    radius_z: float,
    *,
    exponent: float,
    point_count: int = 80,
) -> list[tuple[float, float]]:
    power = 2.0 / exponent
    outline: list[tuple[float, float]] = []
    for index in range(point_count):
        angle = math.pi / 2.0 - index * math.tau / point_count
        cosine = math.cos(angle)
        sine = math.sin(angle)
        outline.append(
            (
                radius_x * math.copysign(abs(cosine) ** power, cosine),
                radius_z * math.copysign(abs(sine) ** power, sine),
            )
        )
    return outline


def add_superellipsoid(
    name: str,
    location: tuple[float, float, float],
    radius_x: float,
    radius_z: float,
    depth: float,
    material: bpy.types.Material,
    parent: bpy.types.Object,
    *,
    exponent: float = 3.2,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    """Create a closed rounded-volume superellipse, suitable for eyes and surface details."""

    outline = superellipse_outline(radius_x, radius_z, exponent=exponent)
    point_count = len(outline)
    local_profile = (
        (-depth * 0.43, 0.35),
        (-depth * 0.34, 0.68),
        (-depth * 0.18, 0.91),
        (0.0, 1.0),
        (depth * 0.18, 0.91),
        (depth * 0.34, 0.68),
        (depth * 0.43, 0.35),
    )
    vertices: list[tuple[float, float, float]] = [(0.0, -depth * 0.5, 0.0)]
    for local_y, scale in local_profile:
        vertices.extend((x * scale, local_y, z * scale) for x, z in outline)
    back_pole_index = len(vertices)
    vertices.append((0.0, depth * 0.5, 0.0))

    faces: list[tuple[int, ...]] = []
    for index in range(point_count):
        faces.append((0, 1 + index, 1 + (index + 1) % point_count))
    for ring_index in range(len(local_profile) - 1):
        current_start = 1 + ring_index * point_count
        next_start = current_start + point_count
        for index in range(point_count):
            next_index = (index + 1) % point_count
            faces.append(
                (
                    current_start + index,
                    next_start + index,
                    next_start + next_index,
                    current_start + next_index,
                )
            )
    last_ring_start = 1 + (len(local_profile) - 1) * point_count
    for index in range(point_count):
        faces.append((last_ring_start + index, back_pole_index, last_ring_start + (index + 1) % point_count))

    mesh = bpy.data.meshes.new(f"{name} geometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    normal_mesh = bmesh.new()
    normal_mesh.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(normal_mesh, faces=normal_mesh.faces)
    normal_mesh.to_mesh(mesh)
    normal_mesh.free()
    for polygon in mesh.polygons:
        polygon.use_smooth = True

    result = bpy.data.objects.new(name, mesh)
    result.location = location
    result.rotation_euler = rotation
    result.parent = parent
    bpy.context.collection.objects.link(result)
    return result


def add_face_geometry(
    parent: bpy.types.Object,
    white: bpy.types.Material,
    pupil: bpy.types.Material,
    shine: bpy.types.Material,
    profile: list[tuple[float, float]],
) -> None:
    for side, x in (("L", -0.73), ("R", 0.73)):
        eye_z = 0.36
        body_radius = radius_at_height(profile, eye_z)
        surface_y = -math.sqrt(body_radius * body_radius - x * x)
        rotation_z = math.asin(x / body_radius)
        eye = add_superellipsoid(
            f"Eye.{side}",
            (x, surface_y - 0.035, eye_z),
            0.36,
            0.69,
            0.24,
            white,
            parent,
            exponent=3.6,
            rotation=(0.0, 0.0, rotation_z),
        )
        eye["role"] = "volumetric eye"
        pupil_object = add_superellipsoid(
            f"Pupil.{side}",
            (x, surface_y - 0.18, 0.31),
            0.18,
            0.39,
            0.14,
            pupil,
            parent,
            exponent=4.0,
            rotation=(0.0, 0.0, rotation_z),
        )
        pupil_object["look_axis"] = "x,z"
        add_superellipsoid(
            f"PupilHighlight.{side}",
            (x - 0.055, surface_y - 0.265, 0.48),
            0.058,
            0.065,
            0.045,
            shine,
            parent,
            exponent=3.0,
            rotation=(0.0, 0.0, rotation_z),
        )


def point_at(target_object: bpy.types.Object, target: tuple[float, float, float]) -> None:
    direction = Vector(target) - target_object.location
    target_object.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_area_light(
    name: str,
    location: tuple[float, float, float],
    energy: float,
    color: tuple[float, float, float],
    size: float,
) -> bpy.types.Object:
    light_data = bpy.data.lights.new(name=name, type="AREA")
    light_data.energy = energy
    light_data.color = color
    light_data.shape = "DISK"
    light_data.size = size
    light_object = bpy.data.objects.new(name, light_data)
    light_object.location = location
    bpy.context.collection.objects.link(light_object)
    point_at(light_object, (0.0, 0.0, 0.1))
    return light_object


def configure_turntable_renderer() -> bpy.types.Object:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    if background is not None:
        background.inputs["Color"].default_value = (0.002, 0.009, 0.028, 1.0)
        background.inputs["Strength"].default_value = 0.22

    add_area_light("Key Light", (-4.5, -5.2, 6.2), 980.0, (0.72, 0.94, 1.0), 5.0)
    add_area_light("Rim Light", (4.8, 1.8, 4.8), 1250.0, (0.06, 0.55, 1.0), 4.0)
    add_area_light("Fill Light", (-4.2, 2.8, 0.6), 720.0, (0.05, 0.26, 1.0), 4.5)

    camera_data = bpy.data.cameras.new("Turntable Camera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 5.45
    camera = bpy.data.objects.new("Turntable Camera", camera_data)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera
    return camera


def render_turntable(camera: bpy.types.Object) -> None:
    QA_DIR.mkdir(parents=True, exist_ok=True)
    views = {
        "front": (0.0, -8.2, 0.25),
        "three-quarter": (5.8, -7.2, 0.35),
        "side": (8.4, 0.0, 0.32),
        "back": (0.0, 8.2, 0.25),
        "top": (0.2, 0.0, 8.6),
    }
    for name, location in views.items():
        camera.location = location
        point_at(camera, (0.0, 0.0, 0.08))
        bpy.context.scene.render.filepath = str(QA_DIR / f"mascot-{name}.png")
        bpy.ops.render.render(write_still=True)


def build_mascot() -> None:
    reset_scene()
    bpy.context.preferences.filepaths.save_version = 0
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)

    if not CANONICAL_MASCOT.exists():
        raise FileNotFoundError(f"Canonical mascot is missing: {CANONICAL_MASCOT}")

    source_image = bpy.data.images.load(str(CANONICAL_MASCOT), check_existing=False)
    outline = sample_canonical_outline(source_image)
    bpy.data.images.remove(source_image)

    jelly = body_material()
    eye_white = principled_material(
        "Eye White",
        (0.92, 0.98, 1.0, 1.0),
        roughness=0.16,
        coat=0.62,
    )
    pupil = principled_material(
        "Pupil Navy",
        (0.004, 0.018, 0.16, 1.0),
        roughness=0.2,
        coat=0.5,
    )
    shine = principled_material(
        "Eye Shine",
        (1.0, 1.0, 1.0, 1.0),
        roughness=0.08,
        coat=0.8,
        emission=(0.78, 0.96, 1.0, 1.0),
        emission_strength=0.3,
    )
    root = bpy.data.objects.new("JelluviMascot", None)
    root["behavior_contract"] = "idle,look,absorb,process,export,success,error"
    root["visual_truth"] = "assets/brand/jelluvi.png"
    root["generation_method"] = "surface of revolution + modeled facial geometry; no generative AI"
    root["model_type"] = "true three-dimensional character"
    bpy.context.collection.objects.link(root)

    profile = radial_cross_section(outline)
    body, volume = add_rotational_body(profile, jelly, root)
    add_face_geometry(root, eye_white, pupil, shine, profile)

    root["body_volume"] = volume
    root["body_vertex_count"] = len(body.data.vertices)
    root["body_depth"] = body.dimensions.y

    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_animations=False,
        export_morph=True,
        export_morph_normal=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
    )

    camera = configure_turntable_renderer()
    render_turntable(camera)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))

    print(f"Sampled {len(profile)} radial cross-section points from {CANONICAL_MASCOT}")
    print(f"Verified closed body volume: {volume:.3f} cubic units")
    print(f"Verified physical body depth: {body.dimensions.y:.3f} units")
    print(f"Verified width/depth equality: {body.dimensions.x:.6f}/{body.dimensions.y:.6f}")
    print(f"Verified maximum ring-radius variance: {body['maximum_radial_variance']:.8f}")
    print(f"Saved editable mascot to {BLEND_PATH}")
    print(f"Saved browser mascot to {GLB_PATH}")
    print(f"Saved five-angle turntable to {QA_DIR}")


build_mascot()
