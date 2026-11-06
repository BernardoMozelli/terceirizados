"""Adiciona tabelas de configuracao e permissoes

Revision ID: 5644cdad44f5
Revises: d4e5f6a7b8c9
Create Date: 2025-08-29 16:41:42.389729

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector

# revision identifiers, used by Alembic.
revision = "5644cdad44f5"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)
    tables = inspector.get_table_names()

    # Criar tabela configuracoes se não existir
    if 'configuracoes' not in tables:
        op.create_table(
            "configuracoes",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("chave", sa.String(length=50), nullable=False),
            sa.Column("valor", sa.String(length=255), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("chave"),
        )
    
    # Criar tabela permissoes se não existir
    if 'permissoes' not in tables:
        op.create_table(
            "permissoes",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("perfil", sa.String(length=50), nullable=False),
            sa.Column("recurso", sa.String(length=100), nullable=False),
            sa.Column("permitido", sa.Boolean(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("perfil", "recurso", name="_perfil_recurso_uc"),
        )


def downgrade():
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)
    tables = inspector.get_table_names()

    if 'permissoes' in tables:
        op.drop_table("permissoes")
    if 'configuracoes' in tables:
        op.drop_table("configuracoes")
