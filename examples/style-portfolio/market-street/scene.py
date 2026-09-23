"""A short monochrome cable-car film study, authored for Slopcamera Studio.

Call build(context). The source reads no clocks, environment variables, network
resources, external fonts, or external media. Timing comes only from the job.
"""

import json
import math
from pathlib import Path
import random

import bpy
from mathutils import Vector

from mesh import Batch, empty, text_label
import street_data as data


def gray(value):
    return (value, value, value, 1)


def surface(name, value, roughness=.8, metallic=0, texture='stone'):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = gray(value)
    mat.use_nodes = True
    tree = mat.node_tree
    nodes, links = tree.nodes, tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = gray(value)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if texture is None:
        return mat
    geometry = nodes.new('ShaderNodeNewGeometry')
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 2.8 if texture != 'cloth' else 160
    noise.inputs['Detail'].default_value = 4
    noise.inputs['Roughness'].default_value = .74
    links.new(geometry.outputs['Position'], noise.inputs['Vector'])
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = .16
    ramp.color_ramp.elements[0].color = gray(value * .82)
    ramp.color_ramp.elements[1].position = .84
    ramp.color_ramp.elements[1].color = gray(min(.95, value * 1.08))
    links.new(noise.outputs['Fac'], ramp.inputs[0])
    links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = .24
    bump.inputs['Distance'].default_value = .035 if texture == 'stone' else .008
    links.new(noise.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    if texture in ('brick', 'paving'):
        split, combine = nodes.new('ShaderNodeSeparateXYZ'), nodes.new('ShaderNodeCombineXYZ')
        links.new(geometry.outputs['Position'], split.inputs[0])
        # Select X/Z or Y/Z by surface normal so exposed party walls keep
        # brick joints instead of collapsing into repeated horizontal stripes.
        if texture == 'paving':
            links.new(split.outputs['X'], combine.inputs['X'])
            links.new(split.outputs['Y'], combine.inputs['Y'])
        else:
            normal_abs = nodes.new('ShaderNodeVectorMath')
            normal_abs.operation = 'ABSOLUTE'
            normal_split = nodes.new('ShaderNodeSeparateXYZ')
            links.new(geometry.outputs['Normal'], normal_abs.inputs[0])
            links.new(normal_abs.outputs[0], normal_split.inputs[0])
            first, second, summed = (nodes.new('ShaderNodeMath') for _ in range(3))
            first.operation = second.operation = 'MULTIPLY'
            summed.operation = 'ADD'
            links.new(split.outputs['Y'], first.inputs[0])
            links.new(normal_split.outputs['X'], first.inputs[1])
            links.new(split.outputs['X'], second.inputs[0])
            links.new(normal_split.outputs['Y'], second.inputs[1])
            links.new(first.outputs[0], summed.inputs[0])
            links.new(second.outputs[0], summed.inputs[1])
            links.new(summed.outputs[0], combine.inputs['X'])
            links.new(split.outputs['Z'], combine.inputs['Y'])
        brick = nodes.new('ShaderNodeTexBrick')
        links.new(combine.outputs[0], brick.inputs['Vector'])
        brick.inputs['Scale'].default_value = 1
        brick.inputs['Brick Width'].default_value = .31
        brick.inputs['Row Height'].default_value = .17 if texture == 'paving' else .13
        brick.inputs['Mortar Size'].default_value = .004 if texture == 'paving' else .006
        brick.inputs['Mortar Smooth'].default_value = .007
        brick.inputs['Color1'].default_value = gray(value * .85 if texture == 'paving' else value * .68)
        brick.inputs['Color2'].default_value = gray(value * 1.08 if texture == 'paving' else value * 1.23)
        brick.inputs['Mortar'].default_value = gray(value * .64 if texture == 'paving' else value * .36)
        mix = nodes.new('ShaderNodeMixRGB')
        mix.blend_type = 'MULTIPLY'
        mix.inputs[0].default_value = .48
        links.new(brick.outputs['Color'], mix.inputs[1])
        links.new(ramp.outputs['Color'], mix.inputs[2])
        links.new(mix.outputs[0], bsdf.inputs['Base Color'])
        links.new(brick.outputs['Fac'], bump.inputs['Height'])
        bump.inputs['Distance'].default_value = .025 if texture == 'paving' else .012
        if texture == 'paving':
            # Uneven moisture changes reflectance on the paving itself. It
            # never adds opaque polygon islands above the road surface.
            damp = nodes.new('ShaderNodeTexNoise')
            damp.inputs['Scale'].default_value = .35
            damp.inputs['Detail'].default_value = 2.4
            links.new(geometry.outputs['Position'], damp.inputs['Vector'])
            damp_ramp = nodes.new('ShaderNodeValToRGB')
            damp_ramp.color_ramp.elements[0].position = .31
            damp_ramp.color_ramp.elements[0].color = gray(.28)
            damp_ramp.color_ramp.elements[1].position = .57
            damp_ramp.color_ramp.elements[1].color = gray(.92)
            links.new(damp.outputs['Fac'], damp_ramp.inputs[0])
            links.new(damp_ramp.outputs['Color'], bsdf.inputs['Roughness'])
            bsdf.inputs['Specular IOR Level'].default_value = .22
    return mat


def palette():
    definitions = {
        'stone': (.39, .87, 0, 'stone'),
        'stone_light': (.55, .86, 0, 'stone'),
        'brick': (.19, .92, 0, 'brick'),
        'brick_light': (.47, .87, 0, 'brick'),
        'plaster': (.52, .9, 0, 'stone'),
        'reveal': (.045, .86, 0, None),
        'glass': (.065, .18, .22, None),
        'glass_gray': (.15, .25, .15, None),
        'sash': (.36, .77, 0, 'stone'),
        'curtain': (.55, .95, 0, 'cloth'),
        'road': (.17, .76, 0, 'paving'),
        'sidewalk': (.34, .92, 0, 'stone'),
        'iron': (.026, .59, .24, 'stone'),
        'rail': (.35, .22, .75, None),
        'roof': (.16, .65, .15, 'stone'),
        'paint': (.11, .72, 0, 'stone'),
        'cream': (.71, .8, 0, 'cloth'),
        'canvas': (.39, .91, 0, 'cloth'),
        'wood': (.085, .86, 0, 'stone'),
        'leather': (.045, .56, 0, 'cloth'),
        'coat': (.055, .94, 0, 'cloth'),
        'coat_gray': (.2, .96, 0, 'cloth'),
        'skin': (.39, .76, 0, None),
        'horse': (.11, .77, 0, None),
        'horse_light': (.24, .81, 0, None),
        'white': (.8, .9, 0, None),
    }
    return {key: surface(key.replace('_', ' '), *values) for key, values in definitions.items()}


def arch(batch, material, x, y, spring, width, rise, depth, facing='side'):
    """Dark arched opening on a facade plane, with rectangular lower part."""
    points = [(math.cos(t * math.pi / 16) * width / 2,
               math.sin(t * math.pi / 16) * rise) for t in range(17)]
    if facing == 'front':
        vertices = [(x + a, y, spring + z) for a, z in points]
    else:
        vertices = [(x, y + a, spring + z) for a, z in points]
    batch.mesh(material, vertices, [tuple(range(len(vertices)))])


def window(batch, p, face, direction, y, z, width, height, rng, arched=False):
    fx = face + direction * .045
    # The glazing is in front of the solid backing mass; the outer jambs
    # project farther. This keeps the inset visible without costly booleans.
    batch.box(p['reveal'], (fx, y, z), (.055, width + .22, height + .2))
    glass = p['glass'] if rng.random() < .68 else p['glass_gray']
    batch.box(glass, (fx + direction * .038, y, z), (.026, width, height))
    if rng.random() < .32:
        curtain_height = height * rng.uniform(.19, .48)
        batch.box(p['curtain'], (fx + direction * .058, y, z + (height - curtain_height) / 2),
                  (.014, width - .05, curtain_height))
    for offset in (-width / 2 - .11, width / 2 + .11):
        batch.box(p['stone_light'], (fx + direction * .1, y + offset, z), (.17, .13, height + .32))
    batch.box(p['sash'], (fx + direction * .11, y, z), (.06, .055, height))
    batch.box(p['sash'], (fx + direction * .11, y, z + .06), (.07, width, .055))
    batch.box(p['stone_light'], (fx + direction * .15, y, z - height / 2 - .16),
              (.39, width + .49, .14))
    if arched:
        arch(batch, p['reveal'], fx + direction * .01, y, z + height / 2,
             width + .1, width / 2, .02)
        # Individually laid voussoirs give a semicircular masonry silhouette.
        for i in range(11):
            angle = math.pi * (i + .5) / 11
            by = y + math.cos(angle) * (width / 2 + .16)
            bz = z + height / 2 + math.sin(angle) * (width / 2 + .16)
            batch.box(p['stone_light'], (fx + direction * .1, by, bz),
                      (.18, .24, .19), rotation=(angle - math.pi / 2, 0, 0))
    else:
        batch.box(p['stone_light'], (fx + direction * .09, y, z + height / 2 + .2),
                  (.22, width + .48, .16))


def awning(batch, p, face, direction, y, width):
    tip = face + direction * 1.7
    batch.mesh(p['canvas'], [(face, y - width / 2, 4.0), (face, y + width / 2, 4.0),
                            (tip, y + width / 2, 3.25), (tip, y - width / 2, 3.25)],
               [(0, 1, 2, 3)])
    for i in range(max(3, int(width / .28))):
        by = y - width / 2 + .14 + i * .28
        batch.box(p['canvas'], (tip, by, 3.12), (.055, .28, .28))
        batch.ellipsoid(p['canvas'], (tip, by, 2.99), (.035, .139, .055), 8, 4)
    for by in (y - width / 2 + .04, y + width / 2 - .04):
        batch.beam(p['iron'], (face, by, 3.0), (tip, by, 3.24), .02)


def oriel(batch, p, face, direction, y, z, rng):
    """Faceted projecting sash bay with dark angled cheek windows."""
    profile = [(0, -1.04), (.33, -1.04), (.66, -.71),
               (.66, .71), (.33, 1.04), (0, 1.04)]
    vertices = [(face + direction * out, y + along, z + dz)
                for dz in (-1.56, 1.56) for out, along in profile]
    n = len(profile)
    faces = [tuple(reversed(range(n))), tuple(range(n, n * 2))]
    faces += [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]
    batch.mesh(p['stone'], vertices, faces)
    window(batch, p, face + direction * .67, direction, y, z, 1.03, 2.02, rng)
    for side in (-1, 1):
        cheek = [(face + direction * .36, y + side * 1.025, z - .98),
                 (face + direction * .645, y + side * .741, z - .98),
                 (face + direction * .645, y + side * .741, z + .98),
                 (face + direction * .36, y + side * 1.025, z + .98)]
        batch.mesh(p['glass'], cheek, [(0, 1, 2, 3)])
    for dz in (-1.51, 1.52):
        batch.box(p['stone_light'], (face + direction * .34, y, z + dz), (.88, 2.28, .16))


def facade(batch, p, rng, side, parcel, index):
    y, width, height, bays, material, roof = parcel
    face = side * (data.ROAD_WIDTH / 2 + data.SIDEWALK_WIDTH)
    direction = -side
    depth = rng.uniform(14, 21)
    center_x = face + side * depth / 2
    batch.box(p[material], (center_x, y, height / 2), (depth, width, height))
    # Ground-floor pilasters, individual storefronts, and transom divisions.
    spacing = width / bays
    for bay in range(bays):
        by = y - width / 2 + (bay + .5) * spacing
        batch.box(p['reveal'], (face + direction * .045, by, 2.0), (.08, spacing - .31, 3.52))
        batch.box(p['glass'], (face + direction * .093, by, 1.92), (.04, spacing - .55, 3.2))
        for z in (.53, 2.78, 3.55):
            batch.box(p['wood'], (face + direction * .13, by, z), (.10, spacing - .25, .12))
        batch.box(p['stone_light'], (face + direction * .14, by - spacing / 2, 2.06), (.31, .24, 4.12))
        if (bay + index) % 3 == 0 and y > 75:
            awning(batch, p, face, direction, by, spacing - .18)
    for z, protrusion, thick in ((4.25, .25, .24), (4.55, .31, .13),
                                 (height - .5, .31, .2), (height, .58, .24),
                                 (height + .24, .71, .18)):
        batch.box(p['stone_light'], (face + direction * protrusion / 2, y, z),
                  (protrusion, width + .22, thick))
    rows = max(3, int((height - 5.7) / 3.45))
    for row in range(rows):
        z = 6.5 + row * (height - 7.6) / max(rows - 1, 1)
        for bay in range(bays):
            by = y - width / 2 + (bay + .5) * spacing
            if material in ('stone', 'plaster') and bay % 3 == 1 and y > 90:
                oriel(batch, p, face, direction, by, z, rng)
            else:
                window(batch, p, face, direction, by, z, min(1.48, spacing * .51),
                       1.95 if height < 28 else 2.1, rng,
                       arched=roof == 'pediment' and row == rows - 1)
        if row in (0, rows - 2):
            batch.box(p['stone_light'], (face + direction * .1, y, z - 1.36),
                      (.25, width, .12))
    # Deep cornice brackets, parapets, corner quoins and drain pipes break
    # repetition at both architectural and street scales.
    for i in range(max(1, int(width / .72))):
        by = y - width / 2 + .35 + i * .72
        batch.box(p['stone_light'], (face + direction * .2, by, height - .17), (.6, .17, .34))
    batch.box(p[material], (face - direction * .14, y, height + .58), (.30, width, .8))
    for by in (y - width / 2 + .22, y + width / 2 - .22):
        for z in range(5, int(height), 2):
            batch.box(p['stone_light'], (face + direction * .08, by, z), (.20, .58, .45))
    batch.beam(p['iron'], (face + direction * .12, y + width / 2 - .8, .3),
               (face + direction * .12, y + width / 2 - .8, height), .045)
    if roof == 'mansard':
        batch.box(p['roof'], (center_x, y, height + 1.0), (depth, width, 1.7))
        for bay in range(bays):
            by = y - width / 2 + (bay + .5) * spacing
            batch.box(p['stone_light'], (face + side * .8, by, height + 1.1), (1.5, 1.25, 1.45))
            batch.box(p['glass'], (face + side * .04, by, height + 1.1), (.03, .73, 1.04))
            batch.mesh(p['roof'], [(face - direction * .03, by - .79, height + 1.76),
                                  (face - direction * .03, by + .79, height + 1.76),
                                  (face - direction * .03, by, height + 2.39)], [(0, 1, 2)])
    if roof == 'pediment':
        batch.mesh(p['stone_light'], [(face + direction * .35, y - width * .23, height + .58),
                                     (face + direction * .35, y + width * .23, height + .58),
                                     (face + direction * .35, y, height + 3.1)], [(0, 1, 2)])
    for chimney in range(2):
        batch.box(p['brick'], (center_x + side * chimney * 3, y - width * .28, height + 1.2), (1, 1.3, 2.4))
    if y > 90:
        # Invented descriptive businesses; these are never asserted to be
        # occupants of a particular historical parcel.
        words = ['TEA & COFFEE', 'WHOLESALE DRY GOODS', 'HARDWARE', 'WINES & SPIRITS', 'BOOT & SHOE CO.']
        batch.box(p['paint'], (face + direction * .2, y, 4.92), (.22, width * .83, .75))
        text_label('Authored shop lettering', words[index % len(words)],
                   (face + direction * .34, y, 4.70), (direction, 0, 0), .46, p['cream'])
    if index in (2, 4):
        # An authored wall advertisement interrupts a large exposed party
        # wall. Its generic wording is not attributed to an actual occupant.
        batch.box(p['paint'], (center_x, y + width / 2 + .035, height * .73),
                  (depth * .76, .06, height * .20))
        text_label('Authored painted wall advertisement', 'WHOLESALE\nTEA & COFFEE',
                   (center_x, y + width / 2 + .079, height * .70), (0, 1, 0),
                   .80, p['cream'])


def ferry(batch, p):
    y = data.FERRY_Y
    batch.box(p['stone'], (0, y - 9, 10.1), (86, 18, 20.2))
    for i in range(19):
        x = (i - 9) * 4.24
        batch.box(p['reveal'], (x, y + .05, 3.05), (2.98, .10, 6.1))
        arch(batch, p['reveal'], x, y + .11, 6.08, 2.98, 1.49, .1, 'front')
        for j in range(12):
            angle = math.pi * (j + .5) / 12
            batch.box(p['stone_light'], (x + math.cos(angle) * 1.66, y + .19,
                                        6.08 + math.sin(angle) * 1.66),
                      (.39, .32, .31), rotation=(0, math.pi / 2 - angle, 0))
        for offset in (-1.68, 1.68):
            batch.box(p['stone_light'], (x + offset, y + .20, 3.07), (.3, .43, 6.14))
        for z in (11.3, 15.4):
            batch.box(p['reveal'], (x, y + .06, z), (1.82, .12, 2.64))
            batch.box(p['sash'], (x, y + .14, z), (.075, .09, 2.64))
            batch.box(p['sash'], (x, y + .14, z + .15), (1.83, .09, .07))
            batch.box(p['stone_light'], (x, y + .28, z - 1.43), (2.17, .59, .17))
    for z, protrusion in ((8.3, .3), (18.0, .3), (19.6, .62), (20.3, .8)):
        batch.box(p['stone_light'], (0, y + protrusion / 2, z), (87, protrusion, .31))
    # The recognizable campanile establishes the destination throughout.
    batch.box(p['stone'], (0, y - 4.7, 31.1), (11.1, 11.3, 49.8))
    for x in (-5.42, 5.42):
        batch.box(p['stone_light'], (x, y + 1.04, 32), (.58, .53, 45))
    for z in (22.0, 31.0, 42.0):
        for x in (-2.72, 0, 2.72):
            batch.box(p['reveal'], (x, y + 1.03, z), (1.25, .1, 4.32))
            arch(batch, p['reveal'], x, y + 1.11, z + 2.16, 1.25, .625, .1, 'front')
            for bar in range(9):
                batch.box(p['sash'], (x, y + 1.18, z - 1.88 + bar * .45), (1.29, .09, .12))
    for z, w in ((46.6, 12.0), (47.2, 12.8), (56.0, 12.0), (56.6, 13.0)):
        batch.box(p['stone_light'], (0, y - 4.6, z), (w, 12.4, .44))
    # Clock face with radial hour marks and hands at an authored 3:17.
    batch.cone(p['iron'], (0, y + 1.21, 51.4), 2.34, .18, segments=64, rotation=(-math.pi / 2, 0, 0))
    batch.cone(p['cream'], (0, y + 1.33, 51.4), 2.12, .14, segments=64, rotation=(-math.pi / 2, 0, 0))
    for tick in range(60):
        a = math.tau * tick / 60
        r1 = 1.68 if tick % 5 == 0 else 1.88
        batch.beam(p['iron'], (math.sin(a) * r1, y + 1.44, 51.4 + math.cos(a) * r1),
                   (math.sin(a) * 2.01, y + 1.44, 51.4 + math.cos(a) * 2.01), .035 if tick % 5 == 0 else .012, 6)
    for fraction, length, radius in ((17 / 60, 1.65, .055), ((3 + 17 / 60) / 12, 1.08, .08)):
        a = fraction * math.tau
        batch.beam(p['iron'], (0, y + 1.48, 51.4),
                   (math.sin(a) * length, y + 1.48, 51.4 + math.cos(a) * length), radius)
    batch.box(p['reveal'], (0, y - 4.6, 60.2), (9.4, 9.4, 6.7))
    for x in (-4.9, -1.6, 1.6, 4.9):
        batch.cone(p['stone_light'], (x, y + .2, 60), .35, 6.8, segments=12)
    batch.box(p['stone_light'], (0, y - 4.6, 63.6), (12.0, 12.0, .55))
    batch.mesh(p['roof'], [(-5.9, y + 1.3, 63.9), (5.9, y + 1.3, 63.9),
                           (5.9, y - 10.5, 63.9), (-5.9, y - 10.5, 63.9),
                           (0, y - 4.6, 71.7)], [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)])
    batch.cone(p['iron'], (0, y - 4.6, 72.6), .14, 2.0, segments=10)


def street(batch, p, rng):
    batch.box(p['road'], (0, 106, -.12), (26, 260, .2))
    for side in (-1, 1):
        sx = side * (13 + data.SIDEWALK_WIDTH / 2)
        batch.box(p['sidewalk'], (sx, 110, .10), (data.SIDEWALK_WIDTH, 260, .22))
        # Individual curb blocks leave subtle seams and uneven catches of light.
        for index in range(166):
            batch.box(p['stone_light'], (side * 13.05, -17.4 + index * 1.55, .17),
                      (.32, 1.50, .34 + rng.uniform(-.02, .02)))
        for y in range(-10, 240, 4):
            batch.box(p['reveal'], (sx, y, .215), (5.25, .013, .006))
    # Cable-car slots and rails; no overhead traction catenary before the quake.
    for x in (-2.1, 2.1):
        batch.box(p['iron'], (x, 111, .018), (.074, 258, .019))
        for dx in (-.71, .71):
            batch.box(p['rail'], (x + dx, 111, .025), (.067, 258, .026))
            batch.box(p['iron'], (x + dx + .045, 111, .02), (.034, 258, .02))
    for side in (-1, 1):
        for y in (31, 80, 127, 173, 219):
            x = side * 13.7
            # Modest period-typical utility posts, not falsely named landmarks.
            batch.cone(p['iron'], (x, y, 2.95), .065, 5.9, segments=10)
            batch.cone(p['iron'], (x, y, .42), .17, .82, top=.10, segments=10)
            batch.cone(p['iron'], (x, y, 5.95), .22, .18, top=.1, segments=10)
            batch.box(p['cream'], (x, y, 5.66), (.27, .27, .45))
            for dx in (-.16, .16):
                batch.box(p['iron'], (x + dx, y, 5.66), (.025, .33, .51))
    # Small goods along shops add a human scale without blocking foot traffic.
    for side, y in ((-1, 140), (1, 162), (1, 90), (-1, 201)):
        for i in range(3):
            x = side * (17.0 - i * .62)
            batch.box(p['wood'], (x, y + i * .75, .6), (.61, .70, 1.0))
            for z in (.31, .56, .81, 1.06):
                batch.box(p['iron'], (x - side * .315, y + i * .75, z), (.012, .70, .024))


def person(p, name, position, rng, heading=0, dress=False, scale=1.0):
    rig = empty(name)
    rig.location = position
    rig.rotation_euler.z = heading
    rig.scale = (scale,) * 3
    body = Batch(name + ' torso')
    coat = p['coat_gray'] if rng.random() < .32 else p['coat']
    if dress:
        body.ellipsoid(coat, (0, 0, 1.14), (.24, .145, .34), 20, 12)
        body.cone(coat, (0, 0, .61), .37, .8, top=.19, segments=24, smooth=True)
        body.ellipsoid(coat, (0, .015, .94), (.23, .16, .17))
    else:
        # A continuous tailored coat encloses shoulders, waist and hem. Small
        # radial folds read as cloth without a stack of disconnected shapes.
        vertices, faces = [], []
        sections = [(.60, .245, .16), (.94, .20, .133),
                    (1.24, .25, .15), (1.38, .22, .123), (1.43, .11, .09)]
        for z, width, depth in sections:
            for j in range(24):
                angle = math.tau * j / 24
                fold = 1 + .022 * math.cos(angle * 6)
                vertices.append((math.cos(angle) * width * fold,
                                 math.sin(angle) * depth * fold, z))
        for section in range(len(sections) - 1):
            for j in range(24):
                k = (j + 1) % 24
                faces.append((section * 24 + j, (section + 1) * 24 + j,
                              (section + 1) * 24 + k, section * 24 + k))
        body.mesh(coat, vertices, faces, smooth=True)
        body.box(p['white'], (0, -.129, 1.37), (.075, .012, .095))
        body.box(p['iron'], (0, -.141, 1.34), (.025, .012, .095))
    body.cone(p['skin'], (0, 0, 1.52), .064, .14, segments=12)
    body.ellipsoid(p['skin'], (0, -.008, 1.65), (.112, .098, .147), 16, 12)
    body.ellipsoid(p['skin'], (0, -.098, 1.65), (.024, .043, .033), 10, 6)
    body.ellipsoid(p['iron'], (0, .015, 1.74), (.116, .097, .084))
    # Brim, crown and band produce an identifiable silhouette at street scale.
    hat_r = .23 if dress else .165
    body.cone(p['iron'], (0, 0, 1.79), hat_r, .028, top=hat_r, segments=24)
    body.cone(p['iron'], (0, 0, 1.87), .108, .14, top=.10, segments=20)
    if dress:
        body.ellipsoid(p['cream'], (.11, 0, 1.89), (.055, .07, .095), 10, 6)
    body.finish(rig)
    limbs = []
    for side in (-1, 1):
        leg = empty(name + ' leg', rig)
        leg.location = (side * .105, 0, .85)
        geometry = Batch(name + ' trousers')
        geometry.cone(coat, (0, 0, -.42), .072, .72, top=.091, segments=16, smooth=True)
        geometry.ellipsoid(p['iron'], (0, -.048, -.77), (.083, .137, .057), 16, 8)
        geometry.finish(leg)
        arm = empty(name + ' arm', rig)
        arm.location = (side * .20, 0, 1.37)
        geometry = Batch(name + ' sleeve')
        geometry.beam(coat, (0, 0, 0), (side * .034, -.025, -.48), .073, 14)
        geometry.ellipsoid(p['skin'], (side * .017, -.026, -.52), (.048, .044, .069), 10, 6)
        geometry.finish(arm)
        limbs.append((leg, arm, side))
    return rig, limbs


def animate_person(rig, limbs, start, velocity, fps, frames, phase, walking=True):
    for frame in range(1, frames + 1):
        t = (frame - 1) / fps
        stride = math.sin(t * math.tau * 1.35 + phase) if walking else 0
        rig.location = (start[0] + velocity[0] * t, start[1] + velocity[1] * t,
                        start[2] + (.016 * abs(stride) if walking else 0))
        rig.keyframe_insert('location', frame=frame)
        for leg, arm, side in limbs:
            leg.rotation_euler.x = stride * .38 * side
            arm.rotation_euler.x = -stride * .31 * side
            leg.keyframe_insert('rotation_euler', frame=frame)
            arm.keyframe_insert('rotation_euler', frame=frame)


def cable_car(p, name, position, heading=0):
    rig = empty(name)
    rig.location = position
    rig.rotation_euler.z = heading
    batch = Batch(name)
    for x in (-.74, .74):
        for y in (-2.16, 2.16):
            batch.wheel(p['iron'], (x, y, .48), .43, .10, 10)
    batch.box(p['wood'], (0, 0, .92), (2.2, 7.05, .25))
    batch.box(p['paint'], (0, .90, 1.75), (2.12, 3.92, 1.24))
    # A dark open saloon with visible narrow wood frames, not an opaque box
    # with a window decal hidden inside it.
    batch.box(p['reveal'], (0, .85, 2.30), (1.97, 3.79, 1.10))
    for side in (-1, 1):
        for y in (-.8, .10, 1.0, 1.9, 2.8):
            batch.box(p['cream'], (side * 1.075, y, 2.27), (.12, .085, 1.2))
        for z in (1.7, 2.82):
            batch.box(p['cream'], (side * 1.075, .95, z), (.14, 3.91, .1))
        batch.box(p['wood'], (side * .77, -2.03, 1.37), (.45, 2.25, .14))
        batch.box(p['wood'], (side * .92, -2.03, 1.7), (.09, 2.25, .62))
        for y in (-3.39, -2.2, -1.12):
            batch.beam(p['cream'], (side * 1.01, y, 1.0), (side * 1.01, y, 3.08), .046)
        batch.box(p['wood'], (side * 1.13, -.3, .71), (.36, 5.86, .14))
    batch.box(p['cream'], (0, -.11, 3.04), (2.45, 7.45, .18))
    batch.box(p['roof'], (0, .30, 3.21), (1.76, 5.95, .20))
    for i in range(14):
        batch.box(p['iron'], (0, -2.41 + i * .41, 3.30), (1.81, .04, .16))
    batch.box(p['paint'], (0, -3.53, 1.40), (2.08, .12, .79))
    batch.cone(p['cream'], (0, -3.62, 1.73), .18, .12, segments=24, rotation=(math.pi / 2, 0, 0))
    batch.box(p['iron'], (0, -3.7, .64), (1.62, .24, .16))
    batch.finish(rig)
    text_label(name + ' number', '24', (0, -3.61, 1.01), (0, -1, 0), .24, p['cream'], rig)
    return rig


def wagon(p, rng, name, position, heading=0):
    rig = empty(name)
    rig.location = position
    rig.rotation_euler.z = heading
    b = Batch(name)
    for x in (-.82, .82):
        for y, radius in ((-1.05, .52), (1.13, .65)):
            b.wheel(p['wood'], (x, y, radius), radius, .095, 14)
    b.box(p['wood'], (0, 0, 1.02), (1.58, 3.15, .14))
    for side in (-1, 1):
        for z in (1.19, 1.41, 1.63):
            b.box(p['wood'], (side * .76, 0, z), (.085, 3.04, .18))
        for y in (-1.31, 0, 1.31):
            b.box(p['iron'], (side * .812, y, 1.39), (.032, .075, .72))
    for y in (-1.51, 1.51):
        b.box(p['wood'], (0, y, 1.4), (1.52, .08, .69))
    for i in range(4):
        b.box(p['canvas'], ((i % 2 - .5) * .7, (i // 2 - .5) * 1.25, 1.68), (.62, .92, .52))
    # Anatomical masses overlap smoothly. Legs are articulated in a separate
    # group, and the muzzle is narrower than the head rather than a cube.
    horse = p['horse_light'] if rng.random() < .3 else p['horse']
    hy = -3.22
    b.ellipsoid(horse, (0, hy, 1.51), (.43, .91, .53), 24, 14)
    b.ellipsoid(horse, (0, hy - .58, 1.50), (.39, .4, .58), 20, 12)
    b.ellipsoid(horse, (0, hy + .64, 1.56), (.39, .4, .45), 20, 12)
    b.beam(horse, (0, hy - .67, 1.56), (0, hy - 1.06, 2.31), .25, 16)
    b.ellipsoid(horse, (0, hy - 1.10, 2.28), (.21, .27, .27), 20, 12)
    b.ellipsoid(horse, (0, hy - 1.34, 2.13), (.15, .26, .17), 18, 10)
    for side in (-1, 1):
        b.cone(horse, (side * .105, hy - 1.02, 2.58), .066, .29, top=.01, segments=10)
        b.ellipsoid(p['iron'], (side * .191, hy - 1.19, 2.31), (.016, .036, .025), 10, 6)
        b.beam(p['leather'], (side * .33, hy - .61, 1.97), (side * .34, hy - .56, 1.1), .051)
        b.beam(p['wood'], (side * .56, -1.56, 1.05), (side * .54, hy - .51, 1.20), .04)
        b.beam(p['leather'], (side * .08, hy - 1.48, 2.11), (side * .33, -.85, 1.65), .016, 6)
    b.beam(p['leather'], (0, hy - .61, 2.02), (0, hy - 1.02, 2.54), .071, 10)
    b.beam(p['leather'], (0, hy + .82, 1.67), (0, hy + 1.16, .77), .079, 12)
    b.finish(rig)
    legs = []
    for side in (-1, 1):
        for front in (False, True):
            leg = empty(name + ' horse leg', rig)
            leg.location = (side * .28, hy + (-.58 if front else .64), 1.35)
            geometry = Batch(name + ' horse leg')
            geometry.beam(horse, (0, 0, 0), (0, .06 if front else -.08, -.61), .069, 12)
            geometry.ellipsoid(horse, (0, .05, -.61), (.079, .083, .087), 12, 8)
            geometry.beam(horse, (0, .05, -.61), (0, -.018, -1.16), .043, 10)
            geometry.box(p['iron'], (0, -.065, -1.23), (.14, .23, .15))
            geometry.finish(leg)
            legs.append((leg, side * (1 if front else -1)))
    return rig, legs


def automobile(p, name, position, heading=0):
    rig = empty(name)
    rig.location = position
    rig.rotation_euler.z = heading
    b = Batch(name)
    for x in (-.82, .82):
        for y in (-1.11, 1.1):
            b.wheel(p['iron'], (x, y, .52), .50, .10, 12)
            # Curved mudguards made as narrow segments.
            for i in range(12):
                angle = math.pi * (i + .5) / 12
                b.box(p['paint'], (x, y + .60 * math.cos(angle), .52 + .60 * math.sin(angle)),
                      (.24, .18, .04), rotation=(angle - math.pi / 2, 0, 0))
    b.box(p['paint'], (0, 0, .81), (1.53, 3.10, .22))
    b.box(p['paint'], (0, -.94, 1.16), (1.04, 1.14, .51))
    b.box(p['rail'], (0, -1.54, 1.12), (.91, .06, .49))
    for x in (-.36, -.18, 0, .18, .36):
        b.box(p['iron'], (x, -1.578, 1.12), (.032, .021, .4))
    b.box(p['leather'], (0, .53, 1.09), (1.32, 1.01, .21))
    b.box(p['leather'], (0, .98, 1.36), (1.37, .20, .61))
    for x in (-.61, .61):
        b.ellipsoid(p['rail'], (x, -1.39, 1.38), (.12, .16, .14), 16, 8)
        b.beam(p['iron'], (x, .7, 1.08), (x, .74, 2.3), .021)
    b.box(p['canvas'], (0, .59, 2.28), (1.46, 1.44, .069))
    b.finish(rig)
    return rig


def linear_animation(obj, start, velocity, fps, frames):
    for frame in (1, max(2, frames)):
        t = (frame - 1) / fps
        obj.location = tuple(start[i] + velocity[i] * t for i in range(3))
        obj.keyframe_insert('location', frame=frame)


def build(context):
    parameters = context.get('parameters', {})
    render = context.get('render') or {}
    rate = render.get('frameRate') or {'numerator': data.CAPTURE_FPS, 'denominator': 1}
    fps = float(rate['numerator']) / float(rate['denominator'])
    frames = int(parameters.get('frames', round(data.DURATION_SECONDS * fps)))
    if not 1 <= frames <= 480 or not 1 <= fps <= 60:
        raise ValueError('Use 1..480 frames and a 1..60 fps job rate.')
    seed = int(parameters.get('seed', 19060414))
    rng = random.Random(seed)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1
    p = palette()
    architecture = Batch('Architecture and street')
    street(architecture, p, rng)
    ferry(architecture, p)
    for side, parcels in data.PARCELS.items():
        for index, parcel in enumerate(parcels):
            facade(architecture, p, rng, side, parcel, index)
    architecture.finish()

    # Deep street activity, a near crossing, and independently moving traffic
    # form the shot's changing occlusions. No figure is a cylinder-only token.
    for i in range(35):
        side = -1 if i % 2 else 1
        start = (side * rng.uniform(14.1, 16.6), rng.uniform(15, 211), .21)
        speed = rng.uniform(.45, .91) * (-1 if i % 3 else 1)
        heading = 0 if speed < 0 else math.pi
        human, limbs = person(p, 'Sidewalk walker %02d' % i, start, rng, heading,
                              dress=i % 5 == 0, scale=rng.uniform(.92, 1.06))
        animate_person(human, limbs, start, (0, speed), fps, frames, rng.random() * math.tau)
    for i, (x, y, speed) in enumerate(((-7.0, 120, 1.16), (8.5, 109, -.87),
                                      (-6.5, 85, .98), (10.5, 58, -1.06))):
        start = (x, y, .035)
        heading = math.pi / 2 if speed > 0 else -math.pi / 2
        human, limbs = person(p, 'Crossing pedestrian %02d' % i, start, rng, heading,
                              dress=i == 1)
        animate_person(human, limbs, start, (speed, .06), fps, frames, i * 1.41)
    car = cable_car(p, 'Departing cable car', (-2.1, 107, .035))
    linear_animation(car, (-2.1, 107, .035), (0, -3.55, 0), fps, frames)
    driver, _ = person(p, 'Departing gripsman', (0, -2.8, 1.05), rng)
    driver.parent = car
    car = cable_car(p, 'Oncoming cable car', (2.1, 109, .035), math.pi)
    linear_animation(car, (2.1, 109, .035), (0, 3.7, 0), fps, frames)
    driver, _ = person(p, 'Oncoming gripsman', (0, -2.8, 1.05), rng)
    driver.parent = car
    for i, (x, y, speed) in enumerate(((-8.0, 126, -1.7), (8.0, 81, 1.4), (-7.4, 51, -1.3))):
        start = (x, y, .04)
        wagon_rig, legs = wagon(p, rng, 'Delivery wagon %d' % i, start, 0 if speed < 0 else math.pi)
        linear_animation(wagon_rig, start, (0, speed, 0), fps, frames)
        driver, limbs = person(p, 'Wagon driver %d' % i, (0, -.88, 1.0), rng, scale=.93)
        driver.parent = wagon_rig
        for leg, arm, _ in limbs:
            leg.rotation_euler.x = -1.1
            arm.rotation_euler.x = -.9
        for frame in range(1, frames + 1):
            t = (frame - 1) / fps
            for leg, offset in legs:
                leg.rotation_euler.x = math.sin(t * math.tau * 1.2 + offset * math.pi / 2) * .32
                leg.keyframe_insert('rotation_euler', frame=frame)
    auto = automobile(p, 'Runabout crossing the middle distance', (-10, 71, .04), math.pi / 2)
    linear_animation(auto, (-10, 71, .04), (2.2, .1, 0), fps, frames)
    driver, limbs = person(p, 'Runabout driver', (.26, .40, .85), rng, scale=.86)
    driver.parent = auto
    for leg, arm, _ in limbs:
        leg.rotation_euler.x = -.95
        arm.rotation_euler.x = -.9

    # Neutral broad daylight, contact shadows, and mild volumetric extinction
    # establish depth before the separate film-transfer finishing operation.
    scene.world = bpy.data.worlds.new('Pale April sky')
    scene.world.use_nodes = True
    world_nodes, world_links = scene.world.node_tree.nodes, scene.world.node_tree.links
    background = world_nodes.get('Background')
    background.inputs['Color'].default_value = gray(.70)
    background.inputs['Strength'].default_value = .27
    # The reference's bright sky and dark doorways require separate visible
    # sky exposure and ambient fill. Raising fill to whiten the sky flattens
    # every shadow in the street, which was the first proof's main failure.
    visible_sky = world_nodes.new('ShaderNodeBackground')
    visible_sky.inputs['Color'].default_value = gray(1)
    visible_sky.inputs['Strength'].default_value = 3.2
    light_path = world_nodes.new('ShaderNodeLightPath')
    mix_sky = world_nodes.new('ShaderNodeMixShader')
    world_links.new(light_path.outputs['Is Camera Ray'], mix_sky.inputs[0])
    world_links.new(background.outputs[0], mix_sky.inputs[1])
    world_links.new(visible_sky.outputs[0], mix_sky.inputs[2])
    world_links.new(mix_sky.outputs[0], world_nodes.get('World Output').inputs['Surface'])
    sun_data = bpy.data.lights.new('Soft oblique afternoon light', 'SUN')
    sun_data.energy = 2.55
    sun_data.angle = math.radians(1.6)
    sun = bpy.data.objects.new(sun_data.name, sun_data)
    scene.collection.objects.link(sun)
    sun.rotation_euler = Vector((.74, .31, -.60)).to_track_quat('-Z', 'Y').to_euler()
    fill_data = bpy.data.lights.new('Broad sky bounce', 'AREA')
    fill_data.energy = 800
    fill_data.shape = 'DISK'
    fill_data.size = 55
    fill = bpy.data.objects.new(fill_data.name, fill_data)
    scene.collection.objects.link(fill)
    fill.location = (-12, 130, 45)
    fill.rotation_euler = (Vector((0, 100, 4)) - fill.location).to_track_quat('-Z', 'Y').to_euler()
    mist = bpy.data.materials.new('Distant maritime haze')
    mist.use_nodes = True
    mist.node_tree.nodes.clear()
    scatter = mist.node_tree.nodes.new('ShaderNodeVolumeScatter')
    scatter.inputs['Color'].default_value = gray(.81)
    scatter.inputs['Density'].default_value = .0014
    scatter.inputs['Anisotropy'].default_value = .18
    output = mist.node_tree.nodes.new('ShaderNodeOutputMaterial')
    mist.node_tree.links.new(scatter.outputs[0], output.inputs['Volume'])
    haze = Batch('Atmosphere')
    # Fog starts at Y=80, beyond all foreground traffic. Surface blacks stay
    # intact near the camera while the terminal separates in the distance.
    haze.box(mist, (0, -15, 65), (450, 190, 170))
    haze.finish()

    camera_data = bpy.data.cameras.new('Cable-car camera')
    camera_data.lens = 32
    camera_data.sensor_width = 36
    camera_data.sensor_fit = 'HORIZONTAL'
    camera_data.clip_end = 550
    camera_data.dof.use_dof = False
    camera = bpy.data.objects.new(camera_data.name, camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    for frame in range(1, frames + 1):
        t = (frame - 1) / fps
        # Mechanical vibration is deliberately subpixel to a few pixels. Film
        # gate weave belongs to the later transfer, not this physical camera.
        camera.location = (-2.1 + math.sin(t * 7.3) * .018,
                           185 - t * 4.4, 2.72 + math.sin(t * 9.1) * .012)
        target = Vector((0, data.FERRY_Y, 12.5))
        camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
        camera.keyframe_insert('location', frame=frame)
        camera.keyframe_insert('rotation_euler', frame=frame)
    scene.render.resolution_x = int(render.get('width', 1920))
    scene.render.resolution_y = int(render.get('height', 1440))
    scene.render.resolution_percentage = 100
    scene.render.fps = int(round(fps))
    scene.render.fps_base = scene.render.fps / fps
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = -.10
    scene.view_settings.gamma = 1
    scene.frame_start, scene.frame_end = 1, frames
    scene.frame_set(int(render.get('startFrame', 1)))
    metadata = {
        'kind': 'historical-film-study', 'schemaVersion': 1,
        'interpretation': data.INTERPRETATION, 'sources': data.SOURCES,
        'seed': seed, 'frames': frames, 'captureFps': fps,
        'camera': {'lensMm': 32, 'heightM': 2.72, 'speedMetersPerSecond': 4.4,
                   'destination': 'Ferry Building interpretation', 'direction': '-Y'},
        'renderIntent': {'width': 1920, 'height': 1440, 'renderer': 'eevee',
                         'samples': 64, 'nativeAspect': '4:3', 'viewTransform': 'AgX'},
        'meshObjects': sum(obj.type == 'MESH' for obj in scene.objects),
        'objects': len(scene.objects),
    }
    scene['historical_film_study'] = json.dumps(metadata, sort_keys=True)
    working = context.get('workingRoot')
    if working:
        path = Path(working) / 'creative-metadata.json'
        with path.open('x') as stream:
            json.dump(metadata, stream, indent=2)
            stream.write('\n')
    return scene
