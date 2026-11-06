"""merge de heads conflitantes

Revision ID: 4e44493fa5e1
Revises: cc93c15666d2, f1a2b3c4d5e6
Create Date: 2026-03-10 12:54:46.170925

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '4e44493fa5e1'
down_revision = ('cc93c15666d2', 'f1a2b3c4d5e6')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
