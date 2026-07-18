"""Build the editable and runtime Jelluvi mascot without generative AI.

The model is constructed from Blender primitives and manually authored deformation rules that
follow the canonical Jelluvi silhouette: a gravity-flattened blue jelly body, tall white eyes,
rectangular navy pupils, and square highlights.
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = ROOT / "assets" / "source"
RUNTIME_DIR = ROOT / "public" / "models"
BLEND_PATH = SOURCE_DIR / "jelluvi-mascot.blend"
GLB_PATH = RUNTIME_DIR / "jelluvi-mascot.glb"


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for data_collection in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras):
        for block in list(data_collection):
            if block.users == 0:
                data_collection.remove(block)


def material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    roughness: float,
    metallic: float = 0.0,
    transmission: float = 0.0,
) -> bpy.types.Material:
    result = bpy.data.materials.new(name)
    result.diffuse_color = color
    result.use_nodes = True
    principled = result.node_tree.nodes.get("Principled BSDF")
    if principled is not None:
        principled.inputs["Base Color"].default_value = color
        principled.inputs["Roughness"].default_value = roughness
        principled.inputs["Metallic"].default_value = metallic
        principled.inputs["Transmission Weight"].default_value = transmission
        principled.inputs["Coat Weight"].default_value = 0.55
        principled.inputs["Coat Roughness"].default_value = 0.12
        principled.inputs["IOR"].default_value = 1.38
    return result


def add_uv_sphere(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    assigned_material: bpy.types.Material,
    *,
    segments: int = 48,
    rings: int = 32,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(assigned_material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def add_rounded_cube(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    assigned_material: bpy.types.Material,
    *,
    bevel: float,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    modifier = obj.modifiers.new(name="Soft corners", type="BEVEL")
    modifier.width = bevel
    modifier.segments = 5
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.data.materials.append(assigned_material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def shape_body(body: bpy.types.Object) -> None:
    for vertex in body.data.vertices:
        point = vertex.co
        original_z = point.z

        lower_bulge = math.exp(-((original_z + 0.78) / 0.48) ** 2)
        point.x *= 1.0 + 0.12 * lower_bulge
        point.y *= 1.0 + 0.055 * lower_bulge

        if original_z < -0.88:
            point.z = -0.88 + (original_z + 0.88) * 0.17

    body.shape_key_add(name="Basis")
    squash = body.shape_key_add(name="Squash")
    stretch = body.shape_key_add(name="Stretch")

    basis = body.data.shape_keys.key_blocks["Basis"]
    for index, basis_point in enumerate(basis.data):
        x, y, z = basis_point.co
        squash.data[index].co = (x * 1.1, y * 1.08, -0.86 + (z + 0.86) * 0.78)
        stretch.data[index].co = (x * 0.92, y * 0.94, -0.86 + (z + 0.86) * 1.16)


def parent_to_root(root: bpy.types.Object, *objects: bpy.types.Object) -> None:
    for obj in objects:
        obj.parent = root


def build_mascot() -> None:
    reset_scene()
    bpy.context.preferences.filepaths.save_version = 0
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)

    blue = material(
        "Jelluvi Blue",
        (0.018, 0.49, 1.0, 1.0),
        roughness=0.16,
        metallic=0.02,
        transmission=0.2,
    )
    white = material("Eye White", (0.96, 0.99, 1.0, 1.0), roughness=0.28)
    navy = material("Pupil Navy", (0.012, 0.035, 0.16, 1.0), roughness=0.22)
    shine = material("Jelly Highlight", (0.75, 0.96, 1.0, 0.92), roughness=0.08)

    root = bpy.data.objects.new("JelluviMascot", None)
    root["behavior_contract"] = "idle,look,absorb,process,export,success,error"
    bpy.context.collection.objects.link(root)

    body = add_uv_sphere("Body", (0.0, 0.0, 0.0), (2.28, 1.17, 1.82), blue)
    shape_body(body)

    eye_left = add_uv_sphere("Eye.L", (-0.73, -1.02, 0.18), (0.42, 0.22, 0.67), white)
    eye_right = add_uv_sphere("Eye.R", (0.73, -1.02, 0.18), (0.42, 0.22, 0.67), white)
    pupil_left = add_rounded_cube(
        "Pupil.L", (-0.73, -1.27, 0.13), (0.23, 0.09, 0.39), navy, bevel=0.16
    )
    pupil_right = add_rounded_cube(
        "Pupil.R", (0.73, -1.27, 0.13), (0.23, 0.09, 0.39), navy, bevel=0.16
    )
    pupil_shine_left = add_rounded_cube(
        "PupilHighlight.L", (-0.8, -1.39, 0.36), (0.07, 0.035, 0.07), white, bevel=0.035
    )
    pupil_shine_right = add_rounded_cube(
        "PupilHighlight.R", (0.66, -1.39, 0.36), (0.07, 0.035, 0.07), white, bevel=0.035
    )

    body_shine_large = add_uv_sphere(
        "BodyHighlight.Large", (-0.88, -1.0, 1.05), (0.53, 0.055, 0.16), shine, segments=32, rings=20
    )
    body_shine_large.rotation_euler[1] = math.radians(-19)
    body_shine_small = add_uv_sphere(
        "BodyHighlight.Small", (-1.42, -0.92, 0.62), (0.14, 0.05, 0.1), shine, segments=24, rings=16
    )

    parent_to_root(
        root,
        body,
        eye_left,
        eye_right,
        pupil_left,
        pupil_right,
        pupil_shine_left,
        pupil_shine_right,
        body_shine_large,
        body_shine_small,
    )

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

    print(f"Saved editable mascot to {BLEND_PATH}")
    print(f"Saved browser mascot to {GLB_PATH}")


build_mascot()
