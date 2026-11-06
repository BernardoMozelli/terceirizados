# Use uma imagem base oficial do Python
FROM python:3.10-slim

# Define variáveis de ambiente para evitar a criação de arquivos .pyc e para o output ser imediato
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Define o diretório de trabalho dentro do container
WORKDIR /app

# Copia o arquivo de dependências e instala
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia todo o código do backend para o diretório de trabalho
COPY . .