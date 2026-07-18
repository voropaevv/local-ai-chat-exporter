"""Build the editable and runtime Jelluvi mascot without generative AI.

The canonical PNG is both the visual truth and the texture source. Its alpha contour is sampled
directly to form the 3D silhouette, so the browser model keeps the original crown, side lobes,
wavy base, eyes, lower accent, and highlights instead of approximating them with a sphere.
"""

from __future__ import annotations

from array import array
import math
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.geometry import tessellate_polygon


ROOT = Path(__file__).resolve().parent.parent
REPOSITORY_ROOT = ROOT.parent.parent
CANONICAL_MASCOT = REPOSITORY_ROOT / "assets" / "brand" / "jelluvi.png"
SOURCE_DIR = ROOT / "assets" / "source"
RUNTIME_DIR = ROOT / "public" / "models"
BLEND_PATH = SOURCE_DIR / "jelluvi-mascot.blend"
GLB_PATH = RUNTIME_DIR / "jelluvi-mascot.glb"

RAY_COUNT = 160
ALPHA_THRESHOLD = 0.38
SOURCE_CENTER_TOP_LEFT = (600.0, 650.0)
MODEL_WIDTH = 4.7
MODEL_DEPTH = 0.76


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for data_collection in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.cameras,
    ):
        for block in list(data_collection):
            if block.users == 0:
                data_collection.remove(block)


def principled_material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    roughness: float,
    coat: float = 0.5,
) -> bpy.types.Material:
    result = bpy.data.materials.new(name)
    result.diffuse_color = color
    result.use_nodes = True
    result.use_backface_culling = False
    principled = result.node_tree.nodes.get("Principled BSDF")
    if principled is not None:
        principled.inputs["Base Color"].default_value = color
        principled.inputs["Roughness"].default_value = roughness
        principled.inputs["Coat Weight"].default_value = coat
        principled.inputs["Coat Roughness"].default_value = 0.18
        principled.inputs["IOR"].default_value = 1.38
    return result


def canonical_front_material(source_image: bpy.types.Image) -> bpy.types.Material:
    result = bpy.data.materials.new("Canonical Front")
    result.use_nodes = True
    result.use_backface_culling = False
    nodes = result.node_tree.nodes
    links = result.node_tree.links
    principled = nodes.get("Principled BSDF")
    texture = nodes.new("ShaderNodeTexImage")
    texture.name = "Canonical Jelluvi artwork"
    texture.image = source_image
    texture.interpolation = "Linear"
    texture.extension = "CLIP"
    if principled is not None:
        links.new(texture.outputs["Color"], principled.inputs["Base Color"])
        links.new(texture.outputs["Color"], principled.inputs["Emission Color"])
        principled.inputs["Emission Strength"].default_value = 0.08
        principled.inputs["Roughness"].default_value = 0.34
        principled.inputs["Coat Weight"].default_value = 0.3
        principled.inputs["Coat Roughness"].default_value = 0.2
    return result


def sample_canonical_outline(
    source_image: bpy.types.Image,
) -> list[tuple[float, float, float, float]]:
    """Return clockwise (x, z, u, v) samples from the canonical alpha silhouette."""

    width, height = source_image.size
    center_x = SOURCE_CENTER_TOP_LEFT[0] / 1200.0 * width
    center_y = height - SOURCE_CENTER_TOP_LEFT[1] / 1200.0 * height
    pixels = array("f", [0.0]) * len(source_image.pixels)
    source_image.pixels.foreach_get(pixels)
    max_radius = int(math.hypot(width, height))
    source_visible_width = 1111.0 / 1200.0 * width
    model_scale = MODEL_WIDTH / source_visible_width
    outline: list[tuple[float, float, float, float]] = []

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
                pixel_x / width,
                pixel_y / height,
            )
        )

    return outline


def triangulate_outline(outline: list[tuple[float, float, float, float]]) -> list[tuple[int, int, int]]:
    polygon = [Vector((x, z, 0.0)) for x, z, _, _ in outline]
    triangles: list[tuple[int, int, int]] = []

    for triangle in tessellate_polygon([polygon]):
        triangles.append(tuple(int(index) for index in triangle))

    if not triangles:
        raise RuntimeError("Canonical silhouette could not be triangulated")
    return triangles


def add_canonical_body(
    outline: list[tuple[float, float, float, float]],
    front_material: bpy.types.Material,
    side_material: bpy.types.Material,
) -> bpy.types.Object:
    half_depth = MODEL_DEPTH / 2.0
    point_count = len(outline)
    vertices = [(x, -half_depth, z) for x, z, _, _ in outline]
    vertices.extend((x, half_depth, z) for x, z, _, _ in outline)

    triangles = triangulate_outline(outline)
    # The canonical front faces -Y. Materials are double-sided as a safety net for exporters.
    front_faces = [tuple(reversed(triangle)) for triangle in triangles]
    back_faces = [tuple(point_count + index for index in triangle) for triangle in triangles]
    side_faces = [
        (
            index,
            (index + 1) % point_count,
            point_count + (index + 1) % point_count,
            point_count + index,
        )
        for index in range(point_count)
    ]

    mesh = bpy.data.meshes.new("Canonical Jelluvi silhouette")
    mesh.from_pydata(vertices, [], front_faces + back_faces + side_faces)
    mesh.materials.append(front_material)
    mesh.materials.append(side_material)
    mesh.update()

    front_face_count = len(front_faces)
    for polygon_index, polygon in enumerate(mesh.polygons):
        polygon.material_index = 0 if polygon_index < front_face_count else 1
        polygon.use_smooth = polygon_index >= front_face_count

    uv_layer = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index % point_count
            uv_layer.data[loop_index].uv = outline[vertex_index][2:4]

    body = bpy.data.objects.new("Body", mesh)
    bpy.context.collection.objects.link(body)

    bevel = body.modifiers.new(name="Soft jelly edge", type="BEVEL")
    bevel.width = 0.105
    bevel.segments = 5
    bevel.limit_method = "ANGLE"
    bevel.angle_limit = math.radians(34)
    bevel.harden_normals = True
    bpy.context.view_layer.objects.active = body
    body.select_set(True)
    bpy.ops.object.modifier_apply(modifier=bevel.name)

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
            x * (1.08 - normalized_height * 0.035),
            y * 1.05,
            floor + (z - floor) * 0.82,
        )
        stretch.data[index].co = (
            x * (0.95 + normalized_height * 0.015),
            y * 0.96,
            floor + (z - floor) * 1.12,
        )

    return body


def build_mascot() -> None:
    reset_scene()
    bpy.context.preferences.filepaths.save_version = 0
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)

    if not CANONICAL_MASCOT.exists():
        raise FileNotFoundError(f"Canonical mascot is missing: {CANONICAL_MASCOT}")

    source_image = bpy.data.images.load(str(CANONICAL_MASCOT), check_existing=False)
    source_image.name = "Canonical Jelluvi PNG"
    source_image.colorspace_settings.name = "sRGB"
    source_image.pack()

    front = canonical_front_material(source_image)
    side = principled_material(
        "Jelly Side",
        (0.006, 0.29, 0.92, 1.0),
        roughness=0.2,
        coat=0.72,
    )

    root = bpy.data.objects.new("JelluviMascot", None)
    root["behavior_contract"] = "idle,look,absorb,process,export,success,error"
    root["visual_truth"] = "assets/brand/jelluvi.png"
    root["generation_method"] = "canonical alpha contour + canonical texture; no generative AI"
    bpy.context.collection.objects.link(root)

    outline = sample_canonical_outline(source_image)
    body = add_canonical_body(outline, front, side)
    body.parent = root

    bpy.context.scene.render.engine = "BLENDER_EEVEE"
    bpy.context.scene.render.film_transparent = True
    bpy.context.scene.view_settings.look = "AgX - Medium High Contrast"

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_animations=False,
        export_morph=True,
        export_morph_normal=True,
        export_materials="EXPORT",
    )

    print(f"Sampled {len(outline)} silhouette points from {CANONICAL_MASCOT}")
    print(f"Saved editable mascot to {BLEND_PATH}")
    print(f"Saved browser mascot to {GLB_PATH}")


build_mascot()
