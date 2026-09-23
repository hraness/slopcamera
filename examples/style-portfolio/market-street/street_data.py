"""Evidence for the historical interpretation, separate from art direction.

The scene is a compressed invented block inspired by the 1906 film. Dimensions,
shop occupants, figure performances, and most facades are authored estimates.
No building footprint is claimed to have been digitized from a Sanborn plate.
"""

SOURCES = [
    {
        'id': 'loc-film',
        'url': 'https://www.loc.gov/item/00694408/',
        'title': 'A trip down Market Street before the fire',
        'institution': 'Library of Congress',
        'supports': ['1906 setting', 'cable-car viewpoint toward Ferry Building',
                     'black-and-white 35 mm source', 'mixed street traffic',
                     'damp roadway visible in the film'],
    },
    {
        'id': 'sfmta-conversion',
        'url': 'https://www.sfmta.com/blog/how-1906-earthquake-transformed-our-public-transit-system',
        'title': 'How the 1906 Earthquake Transformed Our Public Transit System',
        'institution': 'San Francisco Municipal Transportation Agency',
        'supports': ['electric conversion of Market Street followed the earthquake'],
    },
    {
        'id': 'sfplanning-lamps',
        'url': 'https://commissions.sfplanning.org/hpcpackets/2014.794A.pdf',
        'title': 'Path of Gold Light Standards landmark case report',
        'institution': 'San Francisco Planning Department',
        'supports': ['Path of Gold bases date to 1908, globe tops to 1916'],
    },
]

INTERPRETATION = {
    'depictedPeriod': 'San Francisco, before the April 1906 earthquake',
    'kind': 'procedural historical interpretation',
    'historicalReconstruction': False,
    'authoredEstimates': [
        'All metric geometry, street compression, camera lens and height',
        'Facades, shop names, costumes, individual vehicles and performances',
        'Monochrome material response, weather, lighting and capture cadence',
    ],
    'excludedAnachronisms': ['Path of Gold globes', 'Market Street traction catenary'],
}

# +Y runs inland. The camera travels toward -Y. The shot faces the Ferry,
# where screen-left is +X and screen-right is -X. Parcel coordinates are
# composition coordinates, not surveyed geographic coordinates.
ROAD_WIDTH = 26.0
SIDEWALK_WIDTH = 5.3
FERRY_Y = -12.0
CAPTURE_FPS = 16
DURATION_SECONDS = 6.0

# Art-directed frontage parcels with separate setbacks at side-street cuts.
# Values are (center Y, frontage, height, bays, material, roof treatment).
PARCELS = {
    -1: [(12, 22, 18, 6, 'stone', 'flat'),
         (40, 23, 25, 6, 'brick', 'pediment'),
         (70, 25, 20, 7, 'plaster', 'flat'),
         (105, 30, 31, 8, 'brick_light', 'mansard'),
         (146, 35, 24, 9, 'stone', 'pediment'),
         (187, 31, 36, 8, 'brick', 'flat'),
         (224, 30, 23, 8, 'plaster', 'flat')],
    1: [(14, 24, 21, 7, 'brick_light', 'flat'),
        (46, 25, 18, 7, 'stone', 'flat'),
        (77, 27, 30, 8, 'brick', 'pediment'),
        (111, 24, 22, 6, 'stone', 'flat'),
        (148, 35, 33, 9, 'brick_light', 'mansard'),
        (190, 34, 25, 9, 'plaster', 'pediment'),
        (230, 33, 31, 9, 'brick', 'flat')],
}
