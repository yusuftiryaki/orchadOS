# orchadOS processing image: pipeline + AI worker + ingest + RTKLIB + ffmpeg.
#
# Build from the repository root:
#   docker build -f deploy/processing/Dockerfile -t orchados-processing .
#
# No Docker Hub images: the base is NVIDIA's CUDA image on nvcr.io, uv comes
# from ghcr.io. With the NVIDIA container toolkit (`docker run --gpus all`) the
# driver libraries are mounted in and ffmpeg can use NVDEC/NVENC; without a GPU
# everything runs on the CPU (the pipeline itself is CPU-only today).

FROM ghcr.io/astral-sh/uv:0.11.32 AS uv

FROM nvcr.io/nvidia/cuda:12.6.3-base-ubuntu24.04

ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        ffmpeg \
        jq \
        libglib2.0-0t64 \
        libgomp1 \
        python3.12 \
        python3.12-venv \
        rtklib \
        tini \
    && rm -rf /var/lib/apt/lists/*

COPY --from=uv /uv /usr/local/bin/uv
# Optional build secret `extra_ca`: a CA bundle for builds behind a TLS-inspecting
# proxy (docker build --secret id=extra_ca,src=ca.pem). Not needed on CI.
RUN printf '%s\n' '#!/bin/sh' \
      'if [ -s /run/secrets/extra_ca ]; then export SSL_CERT_FILE=/run/secrets/extra_ca; fi' \
      'exec "$@"' > /usr/local/bin/with-extra-ca \
    && chmod +x /usr/local/bin/with-extra-ca
ENV UV_PYTHON=/usr/bin/python3.12 \
    UV_PYTHON_DOWNLOADS=never \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_NO_CACHE=1

# One virtual environment per service, each from its own lock file.
COPY services/pipeline/pyproject.toml services/pipeline/uv.lock services/pipeline/README.md /opt/orchados/pipeline/
COPY services/pipeline/src /opt/orchados/pipeline/src
RUN --mount=type=secret,id=extra_ca,required=false \
    cd /opt/orchados/pipeline && with-extra-ca uv sync --locked --no-dev --no-editable

COPY services/ai-worker/pyproject.toml services/ai-worker/uv.lock services/ai-worker/README.md /opt/orchados/ai-worker/
COPY services/ai-worker/src /opt/orchados/ai-worker/src
RUN --mount=type=secret,id=extra_ca,required=false \
    cd /opt/orchados/ai-worker && with-extra-ca uv sync --locked --no-dev --no-editable

COPY services/ingest/pyproject.toml services/ingest/uv.lock services/ingest/README.md /opt/orchados/ingest/
COPY services/ingest/src /opt/orchados/ingest/src
RUN --mount=type=secret,id=extra_ca,required=false \
    cd /opt/orchados/ingest && with-extra-ca uv sync --locked --no-dev --no-editable

RUN ln -s /opt/orchados/pipeline/.venv/bin/orchados-pipeline /usr/local/bin/orchados-pipeline \
    && ln -s /opt/orchados/ai-worker/.venv/bin/ai-worker /usr/local/bin/ai-worker \
    && ln -s /opt/orchados/ingest/.venv/bin/orchados-ingest /usr/local/bin/orchados-ingest

COPY deploy/processing/orchados-process /usr/local/bin/orchados-process

# Non-root; /work is the scratch area (mount a large disk there on the VM).
RUN useradd --create-home --uid 10001 orchados \
    && mkdir -p /work && chown orchados:orchados /work
USER orchados
WORKDIR /work
ENV ORCHADOS_WORK_DIR=/work \
    ORCHADOS_INGEST_STATE=/work/.state/ingest \
    AI_WORKER_STATE_DIR=/work/.state/ai-worker \
    NVIDIA_VISIBLE_DEVICES=all \
    NVIDIA_DRIVER_CAPABILITIES=compute,video,utility

ARG VERSION=dev
LABEL org.opencontainers.image.title="orchados-processing" \
      org.opencontainers.image.source="https://github.com/yusuftiryaki/orchadOS" \
      org.opencontainers.image.version="${VERSION}"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["orchados-process", "--help"]
