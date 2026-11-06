# PMSL Terceiros

Sistema de gestão de funcionários terceirizados da Prefeitura Municipal de Santa Luzia (MG), com integração ao Active Directory.

## O que o sistema faz

- Cadastro e gestão de funcionários terceirizados por empresa, secretaria e setor
- Fluxo de contratação: solicitação, aprovação e ativação
- Transferências entre secretarias e desligamentos (com desativação da conta no AD)
- Central de Gestão do funcionário: dados, foto, histórico e busca por nome ou CPF
- Perfis de acesso (admin, aprovador, ativador e usuário), com permissões por módulo
- Campo de indicação visível apenas para o perfil aprovador
- Tela inicial em cartões, com módulos favoritos por usuário
- Dashboard, relatórios e exportação para Excel

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Backend | Python 3.10, Flask, SQLAlchemy, Flask-JWT-Extended, Gunicorn |
| Banco de dados | PostgreSQL 15 |
| Frontend | HTML, CSS, JavaScript, Bootstrap 5, SweetAlert2 |
| Integrações | Active Directory (LDAP/LDAPS), SMTP |
| Infraestrutura | Docker Compose e Nginx |

## Estrutura

```
backend/            API Flask (rotas em backend/routes, serviços em backend/services)
  migrations/       Migrações do banco (Alembic)
  .env.example      Modelo das variáveis de ambiente
frontend/           Páginas, scripts e estilos servidos pelo Nginx
nginx/              Configuração do Nginx
docker-compose.yml  Banco, backend e Nginx
```

## Como rodar

1. Copie o modelo de configuração e preencha os valores:

   ```bash
   cp backend/.env.example backend/.env
   ```

2. Suba os containers:

   ```bash
   docker compose up -d --build
   ```

3. Acesse em `http://localhost/`.

O arquivo `backend/.env` contém senhas e chaves e **nunca** deve ser versionado.

## Scripts de manutenção

Rodam dentro do container do backend. Por padrão fazem só uma simulação e geram um relatório. Para gravar no banco, acrescente `--aplicar`.

- `importar_indicacoes_fotos.py`: preenche a indicação e a foto dos funcionários a partir de planilhas e de uma pasta de fotos.
- `cadastrar_funcionarios_planilha.py`: cadastra em lote quem está na planilha e ainda não existe no sistema. Não cria contas no AD.

Exemplo:

```bash
docker exec -it pmsl_backend python importar_indicacoes_fotos.py --planilha importacao/planilha.xlsx --fotos importacao/fotos
```

As pastas de importação, os uploads, os backups e as planilhas ficam fora do Git. Veja o `.gitignore`.

## Autoria

Desenvolvido por **BeMo Sistemas**, por Bernardo Mozelli de Medeiros.
Instagram: [@bemosistemas](https://instagram.com/bemosistemas)
