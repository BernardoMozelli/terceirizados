"""adiciona campo de justificativa para transferencia

Revision ID: 5a77cb421b5c
Revises: 419bba4ba4db
Create Date: 2025-09-01 16:53:00.635616

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector

# revision identifiers, used by Alembic.
revision = "5a77cb421b5c"
down_revision = "419bba4ba4db"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)
    
    # Verificar se a tabela existe antes de tentar ver as colunas
    tables = inspector.get_table_names()
    if "transferencias_funcionarios" in tables:
        columns = [c['name'] for c in inspector.get_columns("transferencias_funcionarios")]
        if "justificativa" not in columns:
            op.add_column(
                "transferencias_funcionarios",
                sa.Column("justificativa", sa.Text(), nullable=True),
            )


def downgrade():
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)
    tables = inspector.get_table_names()
    
    if "transferencias_funcionarios" in tables:
        columns = [c['name'] for c in inspector.get_columns("transferencias_funcionarios")]
        if "justificativa" in columns:
            op.drop_column("transferencias_funcionarios", "justificativa")
