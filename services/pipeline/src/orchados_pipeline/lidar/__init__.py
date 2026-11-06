"""LiDAR measurements from a registered point cloud (docs/arayuzler.md, "Kayıtlı nokta bulutu").

The input is a parcel point cloud already registered in a local east/north/up
frame (LiDAR-inertial SLAM + PPK; not part of this package). This package cuts it
into per-tree clouds and measures them:

- cloud.py      reading/writing the cloud, per-tree extraction, ground height
- models.py     shared report and measurement models
- synthetic.py  parametric pistachio trees and plots with known truth (tests)
- crown.py      crown diameter, tree height, crown volume, size class proposal
- skeleton.py   winter branch skeleton (QSM-style): scaffold branches, wood volume
- pruning.py    before/after skeleton comparison: what was pruned
- world.py      coloured, thinned cloud of the portal's 3D world (world.owc)
"""

LIDAR_DIR = "lidar"
CLOUD_FILE = "cloud.ply"
CLOUD_META_FILE = "cloud.json"
