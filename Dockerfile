FROM python:3.10-slim

# Instala dependências do sistema necessárias para processar imagens (PNG/JPEG)
RUN apt-get update && apt-get install -y \
    libjpeg-dev \
    zlib1g-dev \
    libpng-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copia e instala as bibliotecas Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia o resto do código
COPY . .

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "wsgi:app"]
