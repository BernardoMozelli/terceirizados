"""Adiciona campo foto para usuarios e funcionarios

Revision ID: e1f2g3h4i5j6
Revises: d4e5f6a7b8c9
Create Date: 2025-12-22 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'e1f2g3h4i5j6'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('usuarios', sa.Column('foto', sa.String(length=255), nullable=True))
    op.add_column('funcionarios', sa.Column('foto', sa.String(length=255), nullable=True))

def downgrade():
    op.drop_column('usuarios', 'foto')
    op.drop_column('funcionarios', 'foto')
