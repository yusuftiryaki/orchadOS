# Dev container "mobile": Flutter + Android SDK for apps/field.
# Heavy (~5 GB) on purpose kept separate from "core"; open it only when working
# on the field app. No Android emulator: the dev machine has ~8 GB RAM. Debug on
# a real phone over USB (adb), see docs/gelistirme-ortami.md.

FROM ubuntu:24.04

ARG DEBIAN_FRONTEND=noninteractive

# Flutter channel/tag. "stable" follows the latest stable release; pin a tag
# (e.g. 3.x.y) once the app exists so every rebuild gets the same SDK.
ARG FLUTTER_REF=stable
# Android command-line tools build number (from developer.android.com/studio).
ARG ANDROID_CMDLINE_TOOLS=11076708
ARG ANDROID_PLATFORM=android-35
ARG ANDROID_BUILD_TOOLS=35.0.0

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl wget git sudo less vim unzip zip xz-utils jq \
      openjdk-17-jdk-headless \
      usbutils udev \
    && rm -rf /var/lib/apt/lists/*

ENV ANDROID_HOME=/opt/android-sdk \
    ANDROID_SDK_ROOT=/opt/android-sdk \
    FLUTTER_HOME=/opt/flutter
ENV PATH=${FLUTTER_HOME}/bin:${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools:${PATH}

# --- Android SDK (command-line tools only, no emulator) ----------------------------
RUN mkdir -p ${ANDROID_HOME}/cmdline-tools \
    && curl -fsSL -o /tmp/cmdline-tools.zip \
       https://dl.google.com/android/repository/commandlinetools-linux-${ANDROID_CMDLINE_TOOLS}_latest.zip \
    && unzip -q /tmp/cmdline-tools.zip -d ${ANDROID_HOME}/cmdline-tools \
    && mv ${ANDROID_HOME}/cmdline-tools/cmdline-tools ${ANDROID_HOME}/cmdline-tools/latest \
    && rm /tmp/cmdline-tools.zip \
    && yes | sdkmanager --licenses > /dev/null \
    && sdkmanager "platform-tools" "platforms;${ANDROID_PLATFORM}" "build-tools;${ANDROID_BUILD_TOOLS}" \
    && chown -R ubuntu:ubuntu ${ANDROID_HOME}

# --- Flutter SDK ---------------------------------------------------------------------
RUN git clone --depth 1 --branch ${FLUTTER_REF} https://github.com/flutter/flutter.git ${FLUTTER_HOME} \
    && chown -R ubuntu:ubuntu ${FLUTTER_HOME}

# --- USB access for adb (real phone) -------------------------------------------------
RUN usermod -aG plugdev ubuntu || true

# --- Passwordless sudo for the dev user (throwaway dev container only) -----------------
RUN echo 'ubuntu ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/ubuntu \
    && chmod 0440 /etc/sudoers.d/ubuntu \
    && visudo -c -f /etc/sudoers.d/ubuntu

USER ubuntu
RUN git config --global --add safe.directory ${FLUTTER_HOME} \
    && flutter config --no-analytics \
    && flutter precache --android \
    && yes | flutter doctor --android-licenses > /dev/null || true
