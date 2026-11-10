ARG HERMES_AGENT_BASE=nousresearch/hermes-agent:v2026.9.14@sha256:99641e57ec762c59e54cb44aa6746b7fc68c18b3c5ddb088af54234c613d9294
FROM ${HERMES_AGENT_BASE}

USER root
COPY infrastructure/docker/patch-advisor-token-budget.py /tmp/patch-advisor-token-budget.py
RUN python3 /tmp/patch-advisor-token-budget.py && rm /tmp/patch-advisor-token-budget.py
