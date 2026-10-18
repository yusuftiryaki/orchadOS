# Dev container "core": everything except the Flutter field app.
#   * apps/web           Next.js (Node comes from the devcontainer feature)
#   * supabase/          Supabase CLI runs its stack on the HOST Docker (docker-outside-of-docker)
#   * services/pipeline  Python: ffmpeg, RTKLIB (PPK), GDAL/PROJ CLI tools
#   * services/ai-worker Python
#   * firmware/          ESP32 GNSS logger (PlatformIO)
#
# Kept lean on purpose: the dev machine has ~8 GB RAM and limited disk.
# GPU processing is NOT done here; it runs on the processing workstation.

FROM ubuntu:24.04

ARG DEBIAN_FRONTEND=noninteractive

# --- Core tools -----------------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl wget git gnupg sudo less vim unzip zip jq \
      build-essential pkg-config \
      python3 python3-venv python3-pip pipx \
      usbutils udev \
    && rm -rf /var/lib/apt/lists/*

# --- Pipeline / geo / database tools ----------------------------------------------
#   ffmpeg          frame extraction from 360° video
#   rtklib          rnx2rtkp / convbin for PPK on raw u-blox logs
#   gdal-bin, proj  ogr2ogr, coordinate transforms for boundaries and tree maps
#   postgresql-client  psql against the local Supabase Postgres
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      rtklib \
      gdal-bin proj-bin \
      postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# --- Serial device access for flashing the ESP32 ------------------------------------
RUN usermod -aG dialout ubuntu || true

# --- Passwordless sudo for the dev user ---------------------------------------------
# The base image's 'ubuntu' user (uid 1000, matches the host user) has a locked
# password, so plain sudo would prompt forever. Throwaway dev container only.
RUN echo 'ubuntu ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/ubuntu \
    && chmod 0440 /etc/sudoers.d/ubuntu \
    && visudo -c -f /etc/sudoers.d/ubuntu

USER ubuntu
ENV PATH=/home/ubuntu/.local/bin:${PATH}

# --- Python tooling (user-level, isolated) --------------------------------------------
#   uv          per-service virtualenvs and lockfiles (services/*)
#   platformio  ESP32 firmware build/flash
RUN pipx install uv && pipx install platformio
