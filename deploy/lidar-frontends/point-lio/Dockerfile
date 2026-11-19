# orchadOS LiDAR front end: Point-LIO (ROS 2 Humble port) for the Unitree L2.
#
# Point-LIO and its ROS 2 port are GPL-2.0. This image is built locally from
# pinned public sources, runs as a separate process and is never pushed to a
# public registry (docs/superpowers/specs/2026-11-18-lidar-kayit-adimi-design.md §3).
#
#   docker build -t orchados-lio-point-lio:local deploy/lidar-frontends/point-lio
#
# Bump ORCHADOS_RECIPE_VERSION whenever this recipe, the patch, the config or
# the recorder changes in a way that can change results (it is part of
# method_version in frontend.json).

ARG BASE_IMAGE=ros:humble-ros-base-jammy@sha256:d9f14e84747bea639a65e00cf871d2c68ae55385d2acf6239614de0cadb41dcc

# --------------------------------------------------------------------- build
FROM ${BASE_IMAGE} AS build
ARG POINT_LIO_REPO=https://github.com/dfloreaa/point_lio_ros2.git
ARG POINT_LIO_COMMIT=a8e2d0d5090af97ead8dd4fac3d37cf3dbb33ff7
ENV MAKEFLAGS=-j2
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      git python3-dev libeigen3-dev libpcl-dev ros-humble-pcl-conversions \
 && rm -rf /var/lib/apt/lists/*

COPY patches/ /tmp/patches/
RUN mkdir -p /opt/point_lio_ws/src \
 && git clone --quiet "${POINT_LIO_REPO}" /opt/point_lio_ws/src/point_lio \
 && cd /opt/point_lio_ws/src/point_lio \
 && git checkout --quiet "${POINT_LIO_COMMIT}" \
 && git apply /tmp/patches/*.patch \
 && rm -rf .git image Log/*.txt PCD/*

RUN source /opt/ros/humble/setup.bash \
 && cd /opt/point_lio_ws \
 && colcon build --merge-install --parallel-workers 1 \
      --cmake-args -DCMAKE_BUILD_TYPE=Release \
 && rm -rf build log

# Runtime packages: the owners of every shared library the binary loads,
# except the ROS PCL wrappers (they pull in the development packages).
RUN source /opt/ros/humble/setup.bash \
 && source /opt/point_lio_ws/install/setup.bash \
 && ldd /opt/point_lio_ws/install/lib/point_lio/pointlio_mapping \
      | awk '/=> \//{print $3}' | xargs -r realpath | sort -u > /tmp/libs.txt \
 && while read -r lib; do \
      dpkg -S "$lib" 2>/dev/null || dpkg -S "${lib#/usr}" 2>/dev/null || true; \
    done < /tmp/libs.txt | cut -d: -f1 | sort -u > /tmp/owners.txt \
 && grep -v -x -e 'ros-humble-pcl-conversions' -e 'ros-humble-pcl-ros' /tmp/owners.txt > /opt/runtime-packages.txt \
 && echo "runtime packages:" && cat /opt/runtime-packages.txt \
 && if ldd /opt/point_lio_ws/install/lib/point_lio/pointlio_mapping | grep -q 'not found'; then exit 1; fi

# ------------------------------------------------------------------- runtime
FROM ${BASE_IMAGE}
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
ARG POINT_LIO_REPO=https://github.com/dfloreaa/point_lio_ros2.git
ARG POINT_LIO_COMMIT=a8e2d0d5090af97ead8dd4fac3d37cf3dbb33ff7
ENV ORCHADOS_RECIPE_VERSION=2 \
    POINT_LIO_REPO=${POINT_LIO_REPO} \
    POINT_LIO_COMMIT=${POINT_LIO_COMMIT} \
    ROS_LOCALHOST_ONLY=1 \
    ROS_HOME=/tmp/ros \
    PYTHONUNBUFFERED=1

COPY --from=build /opt/runtime-packages.txt /opt/runtime-packages.txt
RUN apt-get update \
 && xargs -a /opt/runtime-packages.txt apt-get install -y --no-install-recommends \
      ros-humble-rosbag2-storage-mcap python3-numpy python3-yaml \
 && rm -rf /var/lib/apt/lists/*

# The workspace keeps the (patched) sources: GPL-2 corresponding source, and
# Point-LIO opens Log/ and PCD/ under its source directory at run time.
COPY --from=build /opt/point_lio_ws /opt/point_lio_ws
RUN mkdir -p /opt/point_lio_ws/src/point_lio/Log /opt/point_lio_ws/src/point_lio/PCD \
 && chmod 1777 /opt/point_lio_ws/src/point_lio/Log /opt/point_lio_ws/src/point_lio/PCD \
 && source /opt/ros/humble/setup.bash \
 && source /opt/point_lio_ws/install/setup.bash \
 && ldd /opt/point_lio_ws/install/lib/point_lio/pointlio_mapping | { ! grep 'not found'; }

COPY config/ /opt/orchados/config/
COPY keyframe_recorder.py entrypoint.sh /opt/orchados/
COPY tools/ /opt/orchados/tools/
RUN chmod +x /opt/orchados/entrypoint.sh /opt/orchados/keyframe_recorder.py

ENTRYPOINT ["/opt/orchados/entrypoint.sh"]
