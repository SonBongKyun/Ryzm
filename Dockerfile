FROM python:3.13-slim

WORKDIR /app

# Install dependencies first (layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Create non-root user
RUN adduser --disabled-password --gecos "" ryzm && chown -R ryzm:ryzm /app
USER ryzm

EXPOSE 8000

ENV HOST=0.0.0.0
ENV PORT=8000

CMD ["python", "main.py"]
