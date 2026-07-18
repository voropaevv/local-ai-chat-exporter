"""Build a genuinely volumetric, editable Jelluvi mascot without generative AI.

The canonical PNG remains the front-view silhouette reference only. The runtime model does not
embed that raster as a flat face. Instead, the script lofts a closed jelly body through depth and
builds the eyes, pupils, reflections, and lower accent as separate three-dimensional geometry.
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
ALPHA_THRESHOLD = 0.38
SOURCE_CENTER_TOP_LEFT = (600.0, 650.0)
MODEL_WIDTH = 4.7

# The outline is widest at the middle ring. Front and back rings contract into rounded poles,
# producing a closed volume rather than an extrusion with flat front and rear faces.
LOFT_PROFILE = (
    (-1.72, 0.22),
    (-1.62, 0.42),
    (-1.46, 0.62),
    (-1.20, 0.79),
    (-0.84, 0.91),
    (-0.42, 0.98),
    (0.00, 1.00),
    (0.38, 0.98),
    (0.75, 0.91),
    (1.06, 0.78),
    (1.30, 0.60),
    (1.46, 0.36),
)
FRONT_POLE_Y = -1.82
BACK_POLE_Y = 1.54


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
        frontness = max(
            0.0,
            min(1.0, (-vertex.y - 0.2) / (abs(FRONT_POLE_Y) - 0.2)),
        )
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
        rear_factor = 1.0 - max(0.0, vertex.co.y) / BACK_POLE_Y * 0.22
        color_layer.data[index].color = (
            color[0] * rear_factor,
            color[1] * rear_factor,
            color[2] * rear_factor,
            1.0,
        )


def add_volumetric_body(
    outline: list[tuple[float, float]],
    material: bpy.types.Material,
    parent: bpy.types.Object,
) -> tuple[bpy.types.Object, float]:
    point_count = len(outline)
    vertices: list[tuple[float, float, float]] = [(0.0, FRONT_POLE_Y, 0.12)]
    for depth, scale in LOFT_PROFILE:
        vertices.extend((x * scale, depth, z * scale) for x, z in outline)
    back_pole_index = len(vertices)
    vertices.append((0.0, BACK_POLE_Y, 0.08))

    faces: list[tuple[int, ...]] = []
    first_ring_start = 1
    for index in range(point_count):
        faces.append((0, first_ring_start + index, first_ring_start + (index + 1) % point_count))

    for ring_index in range(len(LOFT_PROFILE) - 1):
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

    last_ring_start = 1 + (len(LOFT_PROFILE) - 1) * point_count
    for index in range(point_count):
        faces.append(
            (
                last_ring_start + index,
                back_pole_index,
                last_ring_start + (index + 1) % point_count,
            )
        )

    mesh = bpy.data.meshes.new("Watertight volumetric jelly body")
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

    add_body_gradient(mesh)
    for polygon in mesh.polygons:
        polygon.use_smooth = True

    body = bpy.data.objects.new("Body", mesh)
    body.parent = parent
    body["geometry"] = "closed volumetric loft"
    body["manifold"] = True
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
            x * (1.07 - normalized_height * 0.02),
            y * 1.06,
            floor + (z - floor) * 0.84,
        )
        stretch.data[index].co = (
            x * (0.96 + normalized_height * 0.01),
            y * 0.96,
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
) -> None:
    for side, x in (("L", -0.73), ("R", 0.73)):
        eye = add_superellipsoid(
            f"Eye.{side}",
            (x, -1.625, 0.36),
            0.36,
            0.69,
            0.24,
            white,
            parent,
            exponent=3.6,
        )
        eye["role"] = "volumetric eye"
        pupil_object = add_superellipsoid(
            f"Pupil.{side}",
            (x, -1.765, 0.31),
            0.18,
            0.39,
            0.14,
            pupil,
            parent,
            exponent=4.0,
        )
        pupil_object["look_axis"] = "x,z"
        add_superellipsoid(
            f"PupilHighlight.{side}",
            (x - 0.055, -1.845, 0.48),
            0.058,
            0.065,
            0.045,
            shine,
            parent,
            exponent=3.0,
        )


def catmull_rom_point(
    first: Vector,
    second: Vector,
    third: Vector,
    fourth: Vector,
    amount: float,
) -> Vector:
    squared = amount * amount
    cubed = squared * amount
    return 0.5 * (
        (2.0 * second)
        + (-first + third) * amount
        + (2.0 * first - 5.0 * second + 4.0 * third - fourth) * squared
        + (-first + 3.0 * second - 3.0 * third + fourth) * cubed
    )


def add_ribbon_mesh(
    name: str,
    control_points: list[tuple[float, float, float]],
    material: bpy.types.Material,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    points = [Vector(point) for point in control_points]
    padded = [points[0], *points, points[-1]]
    samples: list[Vector] = []
    for index in range(1, len(padded) - 2):
        for step in range(8):
            samples.append(
                catmull_rom_point(
                    padded[index - 1],
                    padded[index],
                    padded[index + 1],
                    padded[index + 2],
                    step / 8.0,
                )
            )
    samples.append(points[-1])

    vertices: list[tuple[float, float, float]] = []
    for index, point in enumerate(samples):
        edge_amount = abs(index / max(1, len(samples) - 1) - 0.5) * 2.0
        half_width = 0.055 + edge_amount * 0.085
        vertices.append((point.x, point.y - 0.018, point.z + half_width))
        vertices.append((point.x, point.y + 0.018, point.z - half_width))
    faces = [
        (index * 2, index * 2 + 1, index * 2 + 3, index * 2 + 2)
        for index in range(len(samples) - 1)
    ]

    mesh = bpy.data.meshes.new(f"{name} geometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    ribbon = bpy.data.objects.new(name, mesh)
    ribbon.parent = parent
    bpy.context.collection.objects.link(ribbon)
    bpy.context.view_layer.objects.active = ribbon
    ribbon.select_set(True)
    solidify = ribbon.modifiers.new(name="Physical ribbon depth", type="SOLIDIFY")
    solidify.thickness = 0.035
    solidify.offset = 0.0
    bevel = ribbon.modifiers.new(name="Rounded ribbon edge", type="BEVEL")
    bevel.width = 0.035
    bevel.segments = 4
    bpy.ops.object.modifier_apply(modifier=solidify.name)
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    for polygon in ribbon.data.polygons:
        polygon.use_smooth = True
    return ribbon


def add_surface_details(
    parent: bpy.types.Object,
    accent: bpy.types.Material,
) -> None:
    band_points = [
        (-1.92, -0.72, -1.04),
        (-1.60, -0.84, -1.13),
        (-1.16, -0.95, -1.34),
        (-0.58, -1.03, -1.48),
        (0.00, -1.06, -1.45),
        (0.58, -1.03, -1.48),
        (1.16, -0.95, -1.34),
        (1.60, -0.84, -1.13),
        (1.92, -0.72, -1.04),
    ]
    lower_band = add_ribbon_mesh("LowerAccent.Band", band_points, accent, parent)
    lower_band["role"] = "three-dimensional lower accent"
    for side, x, angle in (("L", -1.78, -0.46), ("R", 1.78, 0.46)):
        add_superellipsoid(
            f"LowerAccent.{side}",
            (x, -0.76, -1.02),
            0.41,
            0.20,
            0.06,
            accent,
            parent,
            exponent=3.2,
            rotation=(0.0, angle, 0.0),
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
    accent = principled_material(
        "Lower Accent",
        (0.02, 0.43, 1.0, 1.0),
        roughness=0.18,
        coat=0.7,
        emission=(0.0, 0.16, 0.72, 1.0),
        emission_strength=0.08,
    )

    root = bpy.data.objects.new("JelluviMascot", None)
    root["behavior_contract"] = "idle,look,absorb,process,export,success,error"
    root["visual_truth"] = "assets/brand/jelluvi.png"
    root["generation_method"] = "closed volumetric loft + modeled facial geometry; no generative AI"
    root["model_type"] = "true three-dimensional character"
    bpy.context.collection.objects.link(root)

    body, volume = add_volumetric_body(outline, jelly, root)
    add_face_geometry(root, eye_white, pupil, shine)
    add_surface_details(root, accent)

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

    print(f"Sampled {len(outline)} silhouette points from {CANONICAL_MASCOT}")
    print(f"Verified closed body volume: {volume:.3f} cubic units")
    print(f"Verified physical body depth: {body.dimensions.y:.3f} units")
    print(f"Saved editable mascot to {BLEND_PATH}")
    print(f"Saved browser mascot to {GLB_PATH}")
    print(f"Saved four-angle turntable to {QA_DIR}")


build_mascot()
