"""Rain, bottled. An original, editable fourteen-second weather instrument film.

The rain and rings are art-directed geometry, not a fluid simulation. Every
animated value is baked into native keyframes. No handlers, external assets,
network, font downloads, or runtime randomness are needed to replay the scene.
"""
import math
import random
from pathlib import Path
import bpy
from mathutils import Vector

FPS = 24
FRAMES = 336
TAU = math.tau


def smooth(value):
    value = max(0.0, min(1.0, value))
    return value * value * (3 - 2 * value)


def mix(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def finish(obj, name, material, bevel=0):
    obj.name = name
    if material:
        obj.data.materials.append(material)
    if bevel:
        mod = obj.modifiers.new("Machined edge", "BEVEL")
        mod.width = bevel
        mod.segments = 3
    if obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj


def material(name, color, metallic=0, roughness=.35):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*color, 1)
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    return mat


def emission(name, color, strength=1):
    mat = material(name, color, .15, .24)
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Emission Color"].default_value = (*color, 1)
    shader.inputs["Emission Strength"].default_value = strength
    return mat


def glass_material():
    # A deliberate optical illustration: Fresnel reflection over clear faces.
    # This keeps the tiny mechanism readable and does not claim lens refraction.
    mat = bpy.data.materials.new("Optical illustration glass")
    mat.use_nodes = True
    if hasattr(mat, "surface_render_method"):
        mat.surface_render_method = "BLENDED"
    mat.use_backface_culling = True
    if hasattr(mat, "use_transparency_overlap"):
        mat.use_transparency_overlap = False
    if hasattr(mat, "use_transparent_shadow"):
        mat.use_transparent_shadow = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    blend = nodes.new("ShaderNodeAddShader")
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    transparent.inputs[0].default_value = (1, 1, 1, 1)
    reflect = nodes.new("ShaderNodeBsdfGlossy")
    reflect.inputs["Roughness"].default_value = .035
    fresnel = nodes.new("ShaderNodeFresnel")
    fresnel.inputs["IOR"].default_value = 1.16
    tint = nodes.new("ShaderNodeMixRGB")
    tint.blend_type = "MULTIPLY"
    tint.inputs[0].default_value = 1
    tint.inputs[1].default_value = (.72, .78, .80, 1)
    links.new(fresnel.outputs[0], tint.inputs[2])
    links.new(tint.outputs[0], reflect.inputs["Color"])
    links.new(transparent.outputs[0], blend.inputs[0])
    links.new(reflect.outputs[0], blend.inputs[1])
    links.new(blend.outputs[0], output.inputs["Surface"])
    return mat


def cylinder(name, radius, depth, z, mat, xy=(0, 0), bevel=.012, vertices=128):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth,
                                      location=(*xy, z))
    return finish(bpy.context.object, name, mat, bevel)


def sphere(name, location, scale, mat, segments=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=16, location=location)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat)


def torus(name, major, minor, z, mat, xy=(0, 0), rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_segments=96, minor_segments=12,
                                   major_radius=major, minor_radius=minor,
                                   location=(*xy, z), rotation=rotation)
    return finish(bpy.context.object, name, mat)


def box(name, location, scale, mat, bevel=.01):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat, bevel)


def lathe(name, profile, mat):
    count = 128
    verts = [(radius * math.cos(TAU * i / count), radius * math.sin(TAU * i / count), z)
             for z, radius in profile for i in range(count)]
    faces = []
    for row in range(len(profile) - 1):
        for col in range(count):
            nxt = (col + 1) % count
            faces.append((row * count + col, row * count + nxt,
                          (row + 1) * count + nxt, (row + 1) * count + col))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish(obj, name, mat)


def cyclorama(mat):
    # Seamless real geometry avoids a world/floor horizon through the glass.
    profile = [(-40, -.016), (2.0, -.016)]
    for step in range(1, 33):
        angle = math.pi / 2 * step / 32
        profile.append((2 + 5 * math.sin(angle), 5 - 5 * math.cos(angle) - .016))
    profile.append((7, 30))
    verts = [(x, y, z) for y, z in profile for x in (-40, 40)]
    faces = [(i * 2, i * 2 + 1, i * 2 + 3, i * 2 + 2) for i in range(len(profile) - 1)]
    mesh = bpy.data.meshes.new("Seamless stage")
    mesh.from_pydata(verts, [], faces)
    obj = bpy.data.objects.new("Seamless stage", mesh)
    bpy.context.collection.objects.link(obj)
    return finish(obj, "Seamless stage", mat)


def text(name, body, location, size, mat, rotation=(math.pi / 2, 0, 0)):
    curve = bpy.data.curves.new(name, "FONT")
    curve.body, curve.size = body, size
    curve.align_x, curve.align_y = "CENTER", "CENTER"
    curve.space_character = 1.18
    curve.extrude = .0003
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.location, obj.rotation_euler = location, rotation
    obj.data.materials.append(mat)
    return obj


def aim(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat("-Z", "Y").to_euler()


def area(name, location, target, energy, color, size, size_y):
    data = bpy.data.lights.new(name, "AREA")
    data.energy, data.color = energy, color
    data.shape, data.size, data.size_y = "RECTANGLE", size, size_y
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    aim(obj, target)
    return obj


def linear_keys():
    for owner in list(bpy.data.objects) + list(bpy.data.cameras) + list(bpy.data.lights):
        animation = owner.animation_data
        if not animation or not animation.action:
            continue
        action = animation.action
        for slot in action.slots:
            for layer in action.layers:
                for strip in layer.strips:
                    bag = strip.channelbag(slot)
                    if bag:
                        for curve in bag.fcurves:
                            for point in curve.keyframe_points:
                                point.interpolation = "LINEAR"


def cloud_mesh(mat):
    # Density reaches zero before the bounds; the cube is never a solid surface.
    obj = box("Soft cloud volume", (0, 0, 2.30), (1.42, 1.00, .95), mat, 0)
    for polygon in obj.data.polygons:
        polygon.use_smooth = False
    return obj


def build(context):
    parameters = context.get("parameters", {})
    if set(parameters) - {"weather", "rainStrength"}:
        raise ValueError("Unknown Rain, bottled direction")
    weather = parameters.get("weather", "rain")
    strength = parameters.get("rainStrength", 1)
    if weather not in ("rain", "amber") or type(strength) not in (int, float) or not .25 <= strength <= 1:
        raise ValueError("weather is rain or amber; rainStrength is between 0.25 and 1")
    render = context["render"]
    if render["endFrameExclusive"] > FRAMES or render["frameRate"] != {"numerator": FPS, "denominator": 1}:
        raise ValueError("The film is fourteen seconds at 24 fps")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.world = bpy.data.worlds.new("Warm cyclorama")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (.13, .18, .22, 1)
    scene.world.node_tree.nodes["Background"].inputs[1].default_value = .15
    scene.view_settings.look = "AgX - Medium High Contrast"
    if hasattr(scene, "eevee"):
        if hasattr(scene.eevee, "use_raytracing"):
            scene.eevee.use_raytracing = True
        if hasattr(scene.eevee, "use_volumetric_shadows"):
            scene.eevee.use_volumetric_shadows = True
        if hasattr(scene.eevee, "volumetric_tile_size"):
            scene.eevee.volumetric_tile_size = "2"
        if hasattr(scene.eevee, "volumetric_samples"):
            scene.eevee.volumetric_samples = 96
    brass = material("Brushed champagne", (.63, .39, .16), .84, .23)
    gold_edge = material("Polished champagne edges", (.72, .50, .23), .90, .13)
    graphite = material("Graphite ceramic", (.025, .038, .037), .30, .27)
    ink = material("Black dial enamel", (.012, .026, .025), .18, .31)
    warm_white = material("Warm engraved marks", (.79, .78, .68), .38, .25)
    jade = material("Still jade reservoir", (.015, .09, .075), .62, .16)
    rain_color = (.13, .40, .39) if weather == "rain" else (.74, .30, .07)
    rain_mat = emission("Rain highlights", rain_color, .05)
    amber = emission("Amber pilot light", (1, .23, .026), 2)
    cloud_mat = material("Pearl storm cloud", (.22, .27, .28), .12, .80)
    # A bounded native volume, with stable object-space density.
    nodes, links = cloud_mat.node_tree.nodes, cloud_mat.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    volume = nodes.new("ShaderNodeVolumePrincipled")
    volume.inputs["Color"].default_value = (.64, .73, .74, 1)
    volume.inputs["Anisotropy"].default_value = .15
    coords = nodes.new("ShaderNodeTexCoord")
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 11
    noise.inputs["Detail"].default_value = 4
    noise.inputs["Roughness"].default_value = .7
    links.new(coords.outputs["Object"], noise.inputs["Vector"])
    center_noise = nodes.new("ShaderNodeVectorMath")
    center_noise.operation = "SUBTRACT"
    center_noise.inputs[1].default_value = (.5, .5, .5)
    links.new(noise.outputs["Color"], center_noise.inputs[0])
    warp = nodes.new("ShaderNodeVectorMath")
    warp.operation = "SCALE"
    warp.inputs[3].default_value = .22
    links.new(center_noise.outputs["Vector"], warp.inputs[0])
    warped = nodes.new("ShaderNodeVectorMath")
    warped.operation = "ADD"
    links.new(coords.outputs["Object"], warped.inputs[0])
    links.new(warp.outputs["Vector"], warped.inputs[1])
    field = None
    for location, radius in [((-.32, 0, -.06), .30), ((-.08, 0, .08), .36),
                             ((.19, .03, 0), .33), ((.37, 0, -.12), .25),
                             ((.04, -.13, -.15), .29), ((-.23, -.08, -.15), .24),
                             ((.10, .16, -.04), .30)]:
        distance = nodes.new("ShaderNodeVectorMath")
        distance.operation = "DISTANCE"
        distance.inputs[1].default_value = location
        links.new(warped.outputs["Vector"], distance.inputs[0])
        density = nodes.new("ShaderNodeMapRange")
        density.interpolation_type = "SMOOTHERSTEP"
        density.inputs["From Min"].default_value = 0
        density.inputs["From Max"].default_value = radius
        density.inputs["To Min"].default_value = 22
        density.inputs["To Max"].default_value = 0
        links.new(distance.outputs["Value"], density.inputs["Value"])
        if field is None:
            field = density.outputs["Result"]
        else:
            union = nodes.new("ShaderNodeMath")
            union.operation = "MAXIMUM"
            links.new(field, union.inputs[0])
            links.new(density.outputs["Result"], union.inputs[1])
            field = union.outputs[0]
    textured_density = nodes.new("ShaderNodeMath")
    textured_density.operation = "MULTIPLY"
    links.new(field, textured_density.inputs[0])
    links.new(noise.outputs["Fac"], textured_density.inputs[1])
    links.new(textured_density.outputs[0], volume.inputs["Density"])
    links.new(volume.outputs["Volume"], output.inputs["Volume"])
    glass = glass_material()
    floor = material("Midnight enamel stage", (.012, .020, .025), .24, .26)
    cyclorama(floor)
    cylinder("Low graphite plinth", .94, .17, .04, graphite, bevel=.035)
    cylinder("Plinth bright edge", .92, .025, .14, gold_edge, bevel=.009)
    cylinder("Instrument lower body", .72, .34, .32, brass, bevel=.04)
    cylinder("Lower shadow gap", .724, .035, .47, graphite, bevel=.005)
    cylinder("Reservoir mount", .74, .08, .53, gold_edge, bevel=.018)
    cylinder("Black well", .655, .07, .575, ink, bevel=.008)
    cylinder("Jade water meniscus", .61, .035, .617, jade, bevel=.01)
    # A subtle conical chamber gives a single elegant silhouette.
    chamber = lathe("Glass weather chamber", [(.59, .672), (.65, .681), (2.62, .575),
                                     (2.69, .555), (2.70, .542)], glass)
    torus("Lower seal", .681, .012, .63, gold_edge)
    torus("Upper seal", .564, .013, 2.66, gold_edge)
    cylinder("Weather crown", .594, .15, 2.77, brass, bevel=.025)
    cylinder("Crown black inset", .495, .025, 2.852, graphite, bevel=.008)
    cylinder("Crown central medallion", .175, .025, 2.87, gold_edge, bevel=.008)
    text("Crown monogram", "R", (0, -.025, 2.886), .21, ink, (0, 0, 0))
    for i in range(72):
        angle = TAU * i / 72
        rib = box("Crown flute %02d" % i, (.591 * math.cos(angle), .591 * math.sin(angle), 2.765),
                  (.012, .014, .093), gold_edge, .002)
        rib.rotation_euler.z = angle
    for i in range(3):
        angle = TAU * i / 3 + .3
        xy = (.635 * math.cos(angle), .635 * math.sin(angle))
        cylinder("Lower countersunk bolt %d" % i, .027, .009, .582, graphite, xy, .002, 32)
    # Raised dial face: one front-facing circle with an independently moving hand.
    dial = cylinder("Weather selector", .175, .07, .32, graphite, (0, -.71), .009)
    dial.rotation_euler.x = math.pi / 2
    ring = torus("Dial rim", .167, .009, .32, gold_edge, (0, -.757), (math.pi / 2, 0, 0))
    for i in range(25):
        angle = math.radians(-120 + i * 10)
        x, z = .138 * math.sin(angle), .32 + .138 * math.cos(angle)
        tick = box("Selector index %02d" % i, (x, -.755, z),
                   (.008 if i % 3 == 0 else .003, .004, .022 if i % 3 == 0 else .013),
                   warm_white, .001)
        tick.rotation_euler.y = angle
    hand = box("Weather hand", (0, -.764, .32), (.009, .008, .118), gold_edge, .003)
    # Move its mesh up relative to origin so rotation pivots about the dial center.
    for vertex in hand.data.vertices:
        vertex.co.z += .043
    sphere("Selector spindle", (0, -.773, .32), (.024, .012, .024), brass)
    text("Dial number", "01", (.342, -.638, .33), .088, ink,
         (math.pi / 2, 0, math.atan2(.342, .638)))
    sphere("Pilot light", (-.32, -.65, .32), (.019, .012, .019), amber)
    cloud = cloud_mesh(cloud_mat)
    # Elliptical reflection cards come from real studio lights.
    surface_lights = [
        area("Long warm key", (-3.0, -3.8, 6), (0, 0, 1.4), 1000, (1, .88, .68), 3, 5),
        area("Cool vertical rim", (2.4, 1.2, 4.2), (0, 0, 1.7), 950, (.54, .83, 1), 1, 4.5),
        area("Front silk", (.4, -5.5, 3.0), (0, 0, 1.2), 180, (.85, 1, .95), 4, 4),
        area("Top strip", (-.3, .2, 6), (0, 0, 2), 350, (1, .97, .83), 3, .6),
    ]
    for lamp in surface_lights:
        lamp.data.volume_factor = 0
    # EEVEE's area-light volume shadows produce hard occlusion wedges from the
    # crown. Dedicated unshadowed volume lights keep the little cloud readable;
    # ordinary surface lights retain the instrument's real shadows and glints.
    volume_lights = [
        area("Cloud warm silk", (-2.0, -3.0, 4), (0, 0, 2.3), 320, (1, .90, .78), 3, 3),
        area("Cloud cool silk", (2.0, 1.0, 3.7), (0, 0, 2.3), 340, (.65, .85, 1), 3, 3),
    ]
    for lamp in volume_lights:
        lamp.data.diffuse_factor = 0
        lamp.data.specular_factor = 0
        lamp.data.use_shadow = False
    lightning_data = bpy.data.lights.new("Contained lightning", "POINT")
    lightning_data.color, lightning_data.shadow_soft_size = rain_color, .2
    lightning = bpy.data.objects.new("Contained lightning", lightning_data)
    bpy.context.collection.objects.link(lightning)
    lightning.location = (0, -.20, 2.02)
    rng = random.Random(719)
    drops = []
    for index in range(76):
        radius, angle = math.sqrt(rng.random()) * .44, rng.random() * TAU
        x, y = radius * math.cos(angle), radius * math.sin(angle)
        length, cycle, offset = rng.uniform(.02, .058), rng.uniform(.39, .61), rng.random()
        drop = sphere("Rain needle %03d" % index, (x, y, 1), (.0028, .0028, length), rain_mat, 8)
        drops.append((drop, x, y, cycle, offset))
    ripples = []
    for index in range(9):
        radius, angle = rng.uniform(.06, .36), rng.random() * TAU
        xy = (radius * math.cos(angle), radius * math.sin(angle))
        ripple = torus("Surface ring %02d" % index, .095, .0024, .641, rain_mat, xy)
        ripples.append((ripple, rng.uniform(.58, .93), rng.random()))
    data = bpy.data.cameras.new("Film camera")
    data.sensor_width = 36
    data.clip_start, data.clip_end = .01, 250
    data.dof.use_dof = True
    data.dof.aperture_fstop, data.dof.aperture_blades = 5.6, 8
    shot = bpy.data.objects.new("Film camera", data)
    bpy.context.collection.objects.link(shot)
    scene.camera = shot
    font = bpy.data.fonts.load(str(Path(context["sourceRoot"]) / "assets/instrument-serif.ttf"))
    font.pack()
    title_mat = emission("Ivory title", (.84, .81, .69), .85)
    title = text("Closing title", "Rain,\nbottled.", (0, 0, 0), 1, title_mat, (0, 0, 0))
    title.data.font = font
    title.data.align_x, title.data.align_y = "LEFT", "TOP_BASELINE"
    title.data.space_character, title.data.space_line = 1, .90
    title.data.extrude = 0
    kicker = text("Closing line", "A LITTLE WEATHER.\nENTIRELY YOURS.", (0, 0, 0), 1, title_mat, (0, 0, 0))
    kicker.data.align_x, kicker.data.align_y = "LEFT", "TOP_BASELINE"
    kicker.data.space_character, kicker.data.space_line = 1.25, 1.30
    kicker.data.extrude = 0
    for typography in (title, kicker):
        typography.parent = shot
        typography.visible_shadow = False
    for frame in range(FRAMES):
        t = frame / FPS
        if t < 2.5:
            u = smooth(t / 2.5)
            position = mix((1.06, -2.18, .84), (.82, -2.12, .70), u)
            target, lens = (0, -.55, .38), 65
        elif t < 6:
            u = smooth((t - 2.5) / 3.5)
            position = mix((4.7, -10.0, 4.0), (4.05, -10.05, 3.75), u)
            target, lens = (0, 0, 1.43), 58
        elif t < 10:
            u = smooth((t - 6) / 4)
            position = mix((1.9, -4.8, 2.55), (1.25, -4.90, 2.42), u)
            target, lens = (0, 0, 1.75), 58
        else:
            u = smooth(min(1, (t - 10) / 2.25))
            position = mix((4.8, -10.2, 4.1), (5.2, -11.4, 4.4), u)
            target, lens = (-1.50, 0, 1.40), 61
        shot.location = position
        aim(shot, target)
        data.lens, data.dof.focus_distance = lens, (Vector(position) - Vector(target)).length
        shot.keyframe_insert("location", frame=frame)
        shot.keyframe_insert("rotation_euler", frame=frame)
        data.keyframe_insert("lens", frame=frame)
        data.dof.keyframe_insert("focus_distance", frame=frame)
        distance = data.dof.focus_distance
        width = distance * data.sensor_width / lens
        height = width * render["height"] / render["width"]
        for typography, size, top in ((title, .085, .13), (kicker, .0095, -.21)):
            # Camera-relative native type sits on the focal plane, so it stays
            # crisp and editable without platform fonts or a finishing overlay.
            typography.location = (-.365 * width, top * height, -distance)
            scale = size * width if t >= 10.25 else .000001
            typography.scale = (scale, scale, scale)
            typography.keyframe_insert("location", frame=frame)
            typography.keyframe_insert("scale", frame=frame)
        hand.rotation_euler.y = -.68 + 1.28 * smooth((t - .65) / .62)
        hand.keyframe_insert("rotation_euler", frame=frame)
        intensity = smooth((t - 3.3) / 1.0) * (1 - .73 * smooth((t - 10.2) / 2.1)) * strength
        flash = max(0, 1 - abs(t - 7.13) / .07) + .55 * max(0, 1 - abs(t - 7.40) / .065)
        lightning_data.energy = 3 + 130 * flash
        lightning_data.keyframe_insert("energy", frame=frame)
        for index, (drop, x, y, cycle, offset) in enumerate(drops):
            phase = (t / cycle + offset) % 1
            active = intensity > (index + .5) / len(drops)
            drop.location = (x + .016 * math.sin(t * 1.6 + offset * TAU), y, 2.035 - 1.38 * phase)
            drop.scale = (1, 1, 1) if active else (.001, .001, .001)
            drop.keyframe_insert("location", frame=frame)
            drop.keyframe_insert("scale", frame=frame)
        for index, (ripple, cycle, offset) in enumerate(ripples):
            phase = (t / cycle + offset) % 1
            active = intensity > (index + .5) / len(ripples)
            scale = .18 + 1.55 * phase
            ripple.scale = (scale, scale, max(.025, 1 - phase)) if active else (.001, .001, .001)
            ripple.keyframe_insert("scale", frame=frame)
    linear_keys()
    scene["title"] = "Rain, bottled"
    scene["direction"] = "Original weather instrument; procedural rain choreography; optical illustration glass"
    scene["weather"] = weather
    scene["rainStrength"] = strength
    scene["review_frames"] = "0, 30, 60, 120, 168, 180, 239, 240, 300, 335"
    scene.frame_set(render["startFrame"])
