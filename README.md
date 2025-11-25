# SOS Chuva API - Docker Setup

API para gerenciamento de eventos climáticos do aplicativo SOS Chuva.

## 📋 Pré-requisitos

- Docker instalado ([Download Docker](https://www.docker.com/products/docker-desktop))
- Docker Compose instalado (geralmente vem com o Docker Desktop)

## 🚀 Como executar

### Opção 1: Usando Docker Compose (Recomendado)

```bash
# Build e iniciar o container
docker-compose up -d

# Ver logs em tempo real
docker-compose logs -f

# Parar o container
docker-compose down
```

### Opção 2: Usando Docker diretamente

```bash
# Build da imagem
docker build -t sos-chuva-api .

# Executar o container
docker run -d -p 3000:3000 --env-file .env --name sos-chuva-api sos-chuva-api

# Ver logs
docker logs -f sos-chuva-api

# Parar o container
docker stop sos-chuva-api

# Remover o container
docker rm sos-chuva-api
```

## 🔧 Configuração

1. As variáveis de ambiente estão no arquivo `.env`
2. Para alterar credenciais do banco de dados, edite o arquivo `.env`
3. A porta padrão é `3000`, mas pode ser alterada no `.env`

## 📡 Endpoints

- `POST /api/eventos` - Criar novo evento
- `GET /api/eventos` - Listar todos os eventos
- `GET /api/eventos/:id` - Buscar evento específico
- `GET /api/tipos-eventos` - Listar tipos de eventos disponíveis

## 🧪 Testando a API

```bash
# Verificar se está rodando
curl http://localhost:3000/api/tipos-eventos

# Criar um evento (exemplo)
curl -X POST http://localhost:3000/api/eventos \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Evento Teste",
    "data": "2025-11-13T10:00:00Z",
    "coordenadas": {
      "latitude": -23.5505,
      "longitude": -46.6333
    },
    "eventos": ["Chuva Forte", "Raios"]
  }'
```

## 🛠️ Comandos úteis

```bash
# Ver containers rodando
docker ps

# Acessar o shell do container
docker exec -it sos-chuva-api sh

# Rebuild após mudanças no código
docker-compose up -d --build

# Ver uso de recursos
docker stats sos-chuva-api

# Limpar containers e imagens não utilizadas
docker system prune -a
```

## ⚠️ Importante

- Nunca commite o arquivo `.env` com credenciais reais!
- O arquivo `.gitignore` já está configurado para ignorar o `.env`
- Para produção, use secrets managers (Azure Key Vault, AWS Secrets Manager, etc.)

## 📝 Estrutura do Projeto

```
.
├── Dockerfile              # Configuração da imagem Docker
├── docker-compose.yml      # Orquestração de containers
├── .dockerignore          # Arquivos ignorados no build
├── .gitignore             # Arquivos ignorados no Git
├── .env                   # Variáveis de ambiente (não commitado)
├── app.js                 # Aplicação Node.js principal
├── package.json           # Dependências Node.js
└── README.md              # Este arquivo
```

## 🐛 Troubleshooting

### Container não inicia
```bash
# Ver logs de erro
docker-compose logs

# Verificar se a porta 3000 está em uso
lsof -i :3000  # Mac/Linux
netstat -ano | findstr :3000  # Windows
```

### Problemas de conexão com banco
- Verifique as credenciais no arquivo `.env`
- Confirme que o Supabase está acessível
- Teste a conexão manualmente

### Rebuild completo
```bash
docker-compose down
docker-compose up -d --build --force-recreate
```
