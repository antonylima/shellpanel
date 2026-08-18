# Imagem base leve com Node.js e ferramentas Linux essenciais
FROM node:20-slim

# Instala ferramentas comuns do Linux/Ubuntu
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    curl \
    git \
    iproute2 \
    iputils-ping \
    procps \
    net-tools \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copia dependências e instala
COPY package*.json ./
RUN npm ci --only=production || npm install --production

# Copia código da aplicação
COPY . .

# Expõe a porta padrão
EXPOSE 3000

ENV PORT=3000
ENV HOST=0.0.0.0

CMD ["node", "server.js"]
