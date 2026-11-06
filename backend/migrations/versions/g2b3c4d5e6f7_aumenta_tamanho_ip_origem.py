"""Aumenta tamanho do campo ip_origem de 45 para 255 caracteres

Revision ID: g2b3c4d5e6f7
Revises: f1a2b3c4d5e6
Create Date: 2026-03-10 14:10:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'g2b3c4d5e6f7'
down_revision = 'f1a2b3c4d5e6'
branch_labels = None
depends_on = None


def upgrade():
    # Aumentar tamanho da coluna ip_origem
    op.alter_column('logs_atividades', 'ip_origem',
               existing_type=sa.String(45),
               type_=sa.String(255),
               existing_nullable=True)


def downgrade():
    # Reverter para tamanho original
    op.alter_column('logs_atividades', 'ip_origem',
               existing_type=sa.String(255),
               type_=sa.String(45),
               existing_nullable=True)
