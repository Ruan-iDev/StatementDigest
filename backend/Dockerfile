FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# data volume mounted at runtime
ENV LEDGERFLOW_DEBUG=true

EXPOSE 8470
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8470"]
