"""Merge heads: resolve conflicting branches

Revision ID: h3c4d5e6f7g8
Revises: 4e44493fa5e1, g2b3c4d5e6f7
Create Date: 2026-03-10 14:15:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'h3c4d5e6f7g8'
down_revision = ('4e44493fa5e1', 'g2b3c4d5e6f7')
branch_labels = None
depends_on = None


def upgrade():
    # Esta é uma migração de merge, não há operações SQL
    pass


def downgrade():
    # Esta é uma migração de merge, não há operações SQL
    pass
