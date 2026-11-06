"""Adiciona permissoes faltantes para paginas de transferencia e logs

Revision ID: 9e1f8a7b6c5d
Revises: 5644cdad44f5
Create Date: 2025-09-01 10:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "9e1f8a7b6c5d"  # Substitua pelo ID gerado no nome do seu arquivo
down_revision = "5644cdad44f5"
branch_labels = None
depends_on = None


# Lista completa de todos os recursos de acesso a páginas que devem existir
RECURSOS_DE_PAGINA = [
    "acessar_funcionarios",
    "acessar_desligados",
    "acessar_empresas",
    "acessar_usuarios",
    "acessar_secretarias",
    "acessar_configuracoes",
    "acessar_importacao",
    "acessar_transferencias",
    "acessar_logs_atividades",
]


def upgrade():
    # Define a estrutura da tabela para a inserção dos dados
    permissoes_table = sa.table(
        "permissoes",
        sa.column("perfil", sa.String),
        sa.column("recurso", sa.String),
        sa.column("permitido", sa.Boolean),
    )

    # Para garantir a consistência, primeiro removemos quaisquer permissões de página existentes
    recursos_str = "','".join(RECURSOS_DE_PAGINA)
    op.execute(f"DELETE FROM permissoes WHERE recurso IN ('{recursos_str}')")

    # Cria as permissões para os perfis 'admin' e 'padrao'
    novas_permissoes = []
    for recurso in RECURSOS_DE_PAGINA:
        novas_permissoes.append(
            {"perfil": "admin", "recurso": recurso, "permitido": True}
        )
        novas_permissoes.append(
            {"perfil": "padrao", "recurso": recurso, "permitido": True}
        )

    # Insere a lista completa e correta de permissões no banco de dados
    if novas_permissoes:
        op.bulk_insert(permissoes_table, novas_permissoes)


def downgrade():
    # Define os recursos que foram adicionados para poder removê-los no downgrade
    recursos_str = "','".join(RECURSOS_DE_PAGINA)
    # Executa o comando SQL para deletar as permissões específicas desta migração
    op.execute(f"DELETE FROM permissoes WHERE recurso IN ('{recursos_str}')")
