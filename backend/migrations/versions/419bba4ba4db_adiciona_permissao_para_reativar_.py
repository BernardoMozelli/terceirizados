"""adiciona permissao para reativar funcionario

Revision ID: 419bba4ba4db
Revises: 9e1f8a7b6c5d
Create Date: 2025-09-01 16:36:42.760936

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "419bba4ba4db"
down_revision = "9e1f8a7b6c5d"
branch_labels = None
depends_on = None


def upgrade():
    permissoes_table = sa.table(
        "permissoes",
        sa.column("perfil", sa.String),
        sa.column("recurso", sa.String),
        sa.column("permitido", sa.Boolean),
    )
    op.bulk_insert(
        permissoes_table,
        [
            {"perfil": "admin", "recurso": "reativar_funcionario", "permitido": True},
            {"perfil": "padrao", "recurso": "reativar_funcionario", "permitido": False},
        ],
    )


def downgrade():
    op.execute("DELETE FROM permissoes WHERE recurso = 'reativar_funcionario'")
