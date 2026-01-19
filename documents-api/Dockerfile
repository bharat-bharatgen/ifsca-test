# Stage 1: Build
FROM python:3.11-slim as build
WORKDIR /
COPY pyproject.toml .
COPY poetry.lock .
COPY README.md .
COPY .env .
RUN pip install poetry
RUN pip install poetry-plugin-export
# RUN poetry export -f requirements.txt --output dist/requirements.txt
RUN mkdir -p dist && poetry export -f requirements.txt --output dist/requirements.txt


# Stage 2: Deploy
FROM python:3.11-slim as deploy
WORKDIR /app
COPY --from=build /dist /dist
COPY --from=build /.env ./.env

# System dependencies
RUN apt-get -y update
RUN apt-get -y install libssl-dev build-essential ca-certificates wget tesseract-ocr poppler-utils

# Python dependencies
RUN pip install -r /dist/requirements.txt

# Copy application source
COPY . /app

# Ensure asyncpg is available (redundant if already in requirements but kept for parity)
RUN pip install asyncpg

# Expose port and define the entry point
EXPOSE 9219
# Use multiple workers to handle concurrent requests (4 workers for better throughput)
# Note: Each worker can handle multiple requests concurrently due to async nature
CMD ["uvicorn", "server:app", "--workers", "1", "--host", "0.0.0.0", "--port", "9219"]


