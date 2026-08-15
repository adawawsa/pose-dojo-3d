import bpy
import math
import os
from mathutils import Vector


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RENDER_DIR = os.path.join(ROOT, "assets", "renders")
MODEL_DIR = os.path.join(ROOT, "models")
os.makedirs(RENDER_DIR, exist_ok=True)
os.makedirs(MODEL_DIR, exist_ok=True)


def clean_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials,
                       bpy.data.cameras, bpy.data.lights):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def material(name, color, roughness=0.58, metallic=0.0, emission=None):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = next((node for node in nodes if node.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        nodes.clear()
        output = nodes.new("ShaderNodeOutputMaterial")
        bsdf = nodes.new("ShaderNodeBsdfPrincipled")
        mat.node_tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = 4.5
    return mat


SKIN = None
BLACK = None
BLACK_2 = None
HAIR = None
WHITE = None
DARK = None
PINK = None
LIME = None
CYAN = None
GOLD = None


def set_material(obj, mat):
    obj.data.materials.append(mat)
    return obj


def smooth(obj):
    if hasattr(obj.data, "polygons"):
        for poly in obj.data.polygons:
            poly.use_smooth = True
    return obj


def add_uv(name, location, scale, mat, collection=None, segments=32, rings=20):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments, ring_count=rings, location=location
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    smooth(obj)
    set_material(obj, mat)
    if collection:
        move_to_collection(obj, collection)
    return obj


def add_cube(name, location, scale, mat, bevel=0.15, collection=None, rotation=None):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    if rotation:
        obj.rotation_euler = rotation
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new("Soft edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
    set_material(obj, mat)
    if collection:
        move_to_collection(obj, collection)
    return obj


def add_cylinder_between(name, start, end, radius, mat, collection=None, vertices=24):
    a, b = Vector(start), Vector(end)
    delta = b - a
    midpoint = (a + b) * 0.5
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=delta.length, location=midpoint
    )
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = delta.to_track_quat("Z", "Y")
    smooth(obj)
    set_material(obj, mat)
    if collection:
        move_to_collection(obj, collection)
    return obj


def add_torus(name, location, major_radius, minor_radius, mat, collection=None, rotation=None):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=48,
        minor_segments=12,
        location=location,
        rotation=rotation or (0, 0, 0),
    )
    obj = bpy.context.object
    obj.name = name
    smooth(obj)
    set_material(obj, mat)
    if collection:
        move_to_collection(obj, collection)
    return obj


def move_to_collection(obj, collection):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)


def add_text(name, body, location, size, mat, collection, extrude=0.035, align="CENTER"):
    curve = bpy.data.curves.new(name, "FONT")
    curve.body = body
    curve.align_x = align
    curve.align_y = "CENTER"
    curve.size = size
    curve.extrude = extrude
    curve.bevel_depth = 0.012
    obj = bpy.data.objects.new(name, curve)
    obj.location = location
    obj.rotation_euler = (math.radians(90), 0, 0)
    curve.materials.append(mat)
    collection.objects.link(obj)
    return obj


def create_hand(prefix, wrist, gesture, collection):
    x, y, z = wrist
    hand = add_uv(prefix + "_hand", (x, y, z), (0.27, 0.18, 0.36), SKIN, collection)
    fingers = []
    if gesture == "v":
        direction = 1 if x >= 0 else -1
        for index, offset in enumerate((-0.10, 0.11)):
            start = (x + offset, y - 0.02, z - 0.05)
            end = (x + offset + direction * (0.06 if index else -0.02), y - 0.04, z - 0.55)
            fingers.append(add_cylinder_between(prefix + f"_v{index}", start, end, 0.055, SKIN, collection, 16))
    return hand, fingers


def create_face(prefix, center, expression, collection, facing_back=False):
    cx, cy, cz = center
    head = add_uv(prefix + "_head", center, (0.83, 0.68, 0.94), SKIN, collection)
    # Hair is built from chunky overlapping tufts so it reads clearly at game scale.
    for i in range(11):
        angle = math.tau * i / 11
        hx = cx + math.cos(angle) * 0.52
        hy = cy + math.sin(angle) * 0.42
        hz = cz + 0.57 + 0.09 * math.cos(angle * 2)
        add_uv(prefix + f"_hair_{i}", (hx, hy, hz), (0.36, 0.30, 0.34), HAIR, collection, 20, 12)
    add_uv(prefix + "_hair_top", (cx, cy, cz + 0.70), (0.69, 0.54, 0.39), HAIR, collection, 24, 16)
    if facing_back:
        return head

    face_y = cy - 0.655
    for side in (-1, 1):
        add_uv(prefix + f"_eye_{side}", (cx + side * 0.29, face_y - 0.015, cz + 0.16),
               (0.09, 0.055, 0.12), DARK, collection, 20, 12)
        add_cylinder_between(
            prefix + f"_brow_{side}",
            (cx + side * 0.41, face_y - 0.01, cz + 0.36),
            (cx + side * 0.17, face_y - 0.02, cz + 0.39),
            0.035, HAIR, collection, 12,
        )
    add_uv(prefix + "_nose", (cx, face_y - 0.08, cz - 0.02), (0.10, 0.09, 0.16), SKIN, collection, 20, 12)
    if expression == "smile":
        add_torus(prefix + "_mouth", (cx, face_y - 0.045, cz - 0.25), 0.19, 0.038, PINK,
                  collection, rotation=(math.radians(90), 0, 0))
        # Cover the top half of the torus, leaving a graphic smile arc.
        add_cube(prefix + "_mouth_mask", (cx, face_y - 0.05, cz - 0.14), (0.27, 0.06, 0.11), SKIN,
                 bevel=0.04, collection=collection)
    else:
        add_cylinder_between(prefix + "_mouth", (cx - 0.16, face_y - 0.075, cz - 0.22),
                             (cx + 0.16, face_y - 0.075, cz - 0.22), 0.038, PINK, collection, 12)
    return head


POSES = {
    "stand": {
        "label": "CHOKURITSU",
        "shoulders": [(-0.96, -0.01, 4.92), (0.96, -0.01, 4.92)],
        "elbows": [(-1.25, -0.06, 4.00), (1.25, -0.06, 4.00)],
        "wrists": [(-1.23, -0.13, 3.05), (1.23, -0.13, 3.05)],
        "expression": "neutral",
        "turn": 0,
        "lean": 0,
        "gesture": "plain",
    },
    "wing": {
        "label": "TSUBASA",
        "shoulders": [(-0.96, -0.01, 4.95), (0.96, -0.01, 4.95)],
        "elbows": [(-1.96, -0.04, 4.82), (1.96, -0.04, 4.82)],
        "wrists": [(-1.55, -0.20, 3.96), (1.55, -0.20, 3.96)],
        "expression": "neutral",
        "turn": 0,
        "lean": 0,
        "gesture": "plain",
    },
    "back": {
        "label": "USHIRO",
        "shoulders": [(-0.96, 0.01, 4.92), (0.96, 0.01, 4.92)],
        "elbows": [(-1.28, 0.14, 3.92), (1.28, 0.14, 3.92)],
        "wrists": [(-0.96, -0.34, 3.05), (0.96, -0.34, 3.05)],
        "expression": "neutral",
        "turn": math.pi,
        "lean": 0,
        "gesture": "v",
    },
    "dash": {
        "label": "TOTSUMOU",
        "shoulders": [(-0.96, -0.01, 4.82), (0.96, -0.01, 4.82)],
        "elbows": [(-1.24, -0.10, 3.88), (1.24, -0.10, 3.88)],
        "wrists": [(-1.13, -0.20, 2.96), (1.13, -0.20, 2.96)],
        "expression": "smile",
        "turn": 0,
        "lean": math.radians(-7),
        "gesture": "plain",
    },
}


def create_character(pose_name, offset_x=0):
    data = POSES[pose_name]
    collection = bpy.data.collections.new("POSE_" + pose_name.upper())
    bpy.context.scene.collection.children.link(collection)
    root = bpy.data.objects.new("ROOT_" + pose_name.upper(), None)
    root.empty_display_type = "CIRCLE"
    root.empty_display_size = 1.0
    root.location.x = offset_x
    collection.objects.link(root)

    def add_and_parent(obj):
        obj.parent = root
        return obj

    # Shoes and legs.
    for side in (-1, 1):
        x = side * 0.48
        add_and_parent(add_cube(f"{pose_name}_shoe_{side}", (x, -0.18, 0.28), (0.38, 0.62, 0.22),
                                BLACK_2, bevel=0.18, collection=collection))
        add_and_parent(add_cylinder_between(f"{pose_name}_shin_{side}", (x, 0, 0.47), (x, 0, 1.62),
                                            0.32, SKIN, collection))
        add_and_parent(add_uv(f"{pose_name}_knee_{side}", (x, 0, 1.68), (0.36, 0.33, 0.38),
                              SKIN, collection))
        add_and_parent(add_cylinder_between(f"{pose_name}_thigh_{side}", (x, 0, 1.68),
                                            (side * 0.43, 0, 2.88), 0.43, SKIN, collection))

    # High-waist shorts and waistband echo the strong silhouette in the references.
    add_and_parent(add_cube(pose_name + "_shorts", (0, 0, 3.12), (1.12, 0.58, 0.72), BLACK_2,
                            bevel=0.24, collection=collection))
    add_and_parent(add_torus(pose_name + "_waistband", (0, 0, 3.72), 0.92, 0.13, BLACK,
                             collection, rotation=(math.radians(90), 0, 0)))
    # Torso, neck and sleeves.
    torso = add_and_parent(add_cube(pose_name + "_shirt", (0, 0, 4.38), (1.12, 0.55, 1.18),
                                    BLACK, bevel=0.38, collection=collection))
    torso.rotation_euler.y = data["lean"]
    add_and_parent(add_cylinder_between(pose_name + "_neck", (0, 0, 5.42), (0, 0, 5.72),
                                        0.34, SKIN, collection))

    shoulders = data["shoulders"]
    elbows = data["elbows"]
    wrists = data["wrists"]
    for index, side in enumerate((-1, 1)):
        shoulder, elbow, wrist = shoulders[index], elbows[index], wrists[index]
        add_and_parent(add_uv(f"{pose_name}_sleeve_{side}", shoulder, (0.42, 0.46, 0.48),
                              BLACK, collection))
        add_and_parent(add_cylinder_between(f"{pose_name}_upperarm_{side}", shoulder, elbow,
                                            0.25, SKIN, collection))
        add_and_parent(add_uv(f"{pose_name}_elbow_{side}", elbow, (0.28, 0.25, 0.28),
                              SKIN, collection))
        add_and_parent(add_cylinder_between(f"{pose_name}_forearm_{side}", elbow, wrist,
                                            0.22, SKIN, collection))
        hand, fingers = create_hand(f"{pose_name}_{side}", wrist, data["gesture"], collection)
        add_and_parent(hand)
        for finger in fingers:
            add_and_parent(finger)

    create_face(pose_name, (0, -0.01, 6.35), data["expression"], collection,
                facing_back=pose_name == "back")
    # Face and hair are made from several pieces. Parent every loose piece to the pose root
    # so gallery placement and later animation keep the character together.
    for obj in collection.objects:
        if obj != root and obj.parent is None:
            obj.parent = root
    root.rotation_euler.z = data["turn"]
    return collection, root


def create_stage():
    collection = bpy.data.collections.new("ARCADE_STAGE")
    bpy.context.scene.collection.children.link(collection)
    add_cylinder_between("stage_base", (0, 0, -0.16), (0, 0, 0.02), 2.55, DARK, collection, 64)
    add_torus("stage_neon", (0, 0, 0.03), 2.35, 0.08, CYAN, collection)
    # A graphic arch and floating score blocks make the .blend useful as a complete scene.
    for x in (-3.5, 3.5):
        add_cube("arch_column", (x, 1.0, 3.5), (0.16, 0.16, 3.5), PINK,
                 bevel=0.08, collection=collection)
    add_cube("arch_top", (0, 1.0, 6.9), (3.65, 0.16, 0.16), LIME,
             bevel=0.08, collection=collection)
    add_text("stage_title", "POSE DOJO", (0, 0.78, 6.65), 0.72, WHITE, collection, 0.06)
    # Bar-like props: bottle silhouettes and book stacks.
    for i, x in enumerate((-3.1, -2.75, 2.75, 3.1)):
        add_cylinder_between(f"bottle_{i}", (x, 0.65, 0.15), (x, 0.65, 1.15 + (i % 2) * 0.18),
                             0.13, [CYAN, LIME, PINK, GOLD][i], collection, 20)
        add_cylinder_between(f"bottle_neck_{i}", (x, 0.65, 1.08), (x, 0.65, 1.38 + (i % 2) * 0.18),
                             0.065, [CYAN, LIME, PINK, GOLD][i], collection, 16)
    for side in (-1, 1):
        for i in range(4):
            add_cube(f"book_{side}_{i}", (side * 3.0, 0.85, 1.55 + i * 0.18),
                     (0.62, 0.30, 0.075), [PINK, GOLD, CYAN, LIME][i], bevel=0.025,
                     collection=collection, rotation=(0, 0, side * 0.04 * i))
    return collection


def setup_world_and_camera():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = True
    scene.render.image_settings.color_depth = "8"
    scene.view_settings.look = "AgX - Medium High Contrast"

    world = bpy.data.worlds.new("World") if not bpy.data.worlds else bpy.data.worlds[0]
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.006, 0.008, 0.015, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.35

    bpy.ops.object.camera_add(location=(0, -18, 6.0))
    camera = bpy.context.object
    camera.name = "GAME_CAMERA"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 8.3
    camera.rotation_euler = (math.radians(83), 0, 0)
    # Point camera precisely at the character.
    target = Vector((0, 0, 3.5))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera

    def area(name, location, energy, color, size):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.color = color
        data.shape = "DISK"
        data.size = size
        obj = bpy.data.objects.new(name, data)
        obj.location = location
        obj.rotation_euler = ((Vector((0, 0, 3.5)) - obj.location).to_track_quat("-Z", "Y").to_euler())
        scene.collection.objects.link(obj)

    area("Key_Pink", (-5, -7, 10), 1050, (1.0, 0.12, 0.32), 5)
    area("Fill_Cyan", (5, -5, 7), 900, (0.05, 0.82, 1.0), 4)
    area("Rim_Lime", (0, 3, 9), 1200, (0.65, 1.0, 0.12), 3)
    return camera


def render_pose(collections, pose_name):
    for name, collection in collections.items():
        visible = name == pose_name
        collection.hide_render = not visible
        collection.hide_viewport = not visible
    stage = bpy.data.collections.get("ARCADE_STAGE")
    stage.hide_render = True
    stage.hide_viewport = True
    bpy.context.scene.render.filepath = os.path.join(RENDER_DIR, f"pose-{pose_name}.png")
    bpy.ops.render.render(write_still=True)


def export_gallery(collections):
    # Place all variants in a clean gallery for GLB export and easy inspection.
    positions = {"stand": -5.4, "wing": -1.8, "back": 1.8, "dash": 5.4}
    for name, collection in collections.items():
        collection.hide_render = False
        collection.hide_viewport = False
        root = bpy.data.objects.get("ROOT_" + name.upper())
        root.location.x = positions[name]
    stage = bpy.data.collections.get("ARCADE_STAGE")
    stage.hide_render = False
    stage.hide_viewport = False
    bpy.context.scene.render.film_transparent = False
    bpy.context.scene.render.resolution_x = 1600
    bpy.context.scene.render.resolution_y = 900
    camera = bpy.data.objects.get("GAME_CAMERA")
    camera.data.ortho_scale = 15.5
    camera.location = (0, -22, 6.2)
    target = Vector((0, 0, 3.5))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.render.filepath = os.path.join(RENDER_DIR, "pose-gallery.jpg")
    bpy.context.scene.render.image_settings.file_format = "JPEG"
    bpy.context.scene.render.image_settings.color_mode = "RGB"
    bpy.context.scene.render.image_settings.quality = 92
    bpy.ops.render.render(write_still=True)
    bpy.context.scene.render.image_settings.file_format = "PNG"
    bpy.context.scene.render.image_settings.color_mode = "RGBA"


def main():
    global SKIN, BLACK, BLACK_2, HAIR, WHITE, DARK, PINK, LIME, CYAN, GOLD
    clean_scene()
    SKIN = material("Skin", (0.63, 0.32, 0.18), roughness=0.67)
    BLACK = material("Shirt black", (0.012, 0.016, 0.024), roughness=0.72)
    BLACK_2 = material("Shorts black", (0.025, 0.03, 0.045), roughness=0.44)
    HAIR = material("Silver hair", (0.32, 0.35, 0.38), roughness=0.76)
    WHITE = material("Warm white", (0.95, 0.91, 0.78), roughness=0.52)
    DARK = material("Stage dark", (0.008, 0.012, 0.022), roughness=0.35, metallic=0.35)
    PINK = material("Neon pink", (1.0, 0.025, 0.25), roughness=0.3, emission=(1.0, 0.008, 0.16))
    LIME = material("Neon lime", (0.63, 1.0, 0.08), roughness=0.3, emission=(0.45, 1.0, 0.02))
    CYAN = material("Neon cyan", (0.03, 0.75, 1.0), roughness=0.3, emission=(0.01, 0.55, 1.0))
    GOLD = material("Golden", (1.0, 0.52, 0.04), roughness=0.32, metallic=0.3,
                    emission=(1.0, 0.24, 0.01))

    setup_world_and_camera()
    create_stage()
    collections = {}
    for pose_name in POSES:
        collection, _ = create_character(pose_name)
        collections[pose_name] = collection
    for pose_name in POSES:
        render_pose(collections, pose_name)
    export_gallery(collections)

    blend_path = os.path.join(MODEL_DIR, "pose-dojo.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    print("ASSET_BUILD_COMPLETE")
    print(blend_path)


if __name__ == "__main__":
    main()
