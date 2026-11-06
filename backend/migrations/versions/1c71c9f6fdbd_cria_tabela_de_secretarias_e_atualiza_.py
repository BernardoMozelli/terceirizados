"""Cria tabela de secretarias e atualiza fks

Revision ID: 1c71c9f6fdbd
Revises: a818bc76aa46
Create Date: 2025-08-28 16:27:05.333456

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "1c71c9f6fdbd"
down_revision = "a818bc76aa46"
branch_labels = None
depends_on = None


def upgrade():
    # Etapa 1: Criar a tabela de secretarias
    secretarias_table = op.create_table(
        "secretarias",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nome", sa.String(length=100), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("nome"),
    )

    # Etapa 2: Popular a tabela de secretarias com os nomes únicos existentes
    op.execute(
        """
        INSERT INTO secretarias (nome)
        SELECT DISTINCT secretaria FROM usuarios WHERE secretaria IS NOT NULL
        UNION
        SELECT DISTINCT secretaria FROM funcionarios WHERE secretaria IS NOT NULL
    """
    )

    # Etapa 3: Adicionar as colunas de chave estrangeira (nullable por enquanto)
    op.add_column("usuarios", sa.Column("secretaria_id", sa.Integer(), nullable=True))
    op.add_column(
        "funcionarios", sa.Column("secretaria_id", sa.Integer(), nullable=True)
    )

    # Etapa 4: Atualizar as novas colunas com os IDs corretos
    op.execute(
        """
        UPDATE usuarios SET secretaria_id = (
            SELECT id FROM secretarias WHERE secretarias.nome = usuarios.secretaria
        )
    """
    )
    op.execute(
        """
        UPDATE funcionarios SET secretaria_id = (
            SELECT id FROM secretarias WHERE secretarias.nome = funcionarios.secretaria
        )
    """
    )

    # Etapa 5: Tornar as colunas de chave estrangeira não-nulas
    op.alter_column(
        "usuarios", "secretaria_id", existing_type=sa.INTEGER(), nullable=False
    )
    op.alter_column(
        "funcionarios", "secretaria_id", existing_type=sa.INTEGER(), nullable=False
    )

    # Etapa 6: Criar as constraints de chave estrangeira
    op.create_foreign_key(
        "fk_usuarios_secretaria_id",
        "usuarios",
        "secretarias",
        ["secretaria_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_funcionarios_secretaria_id",
        "funcionarios",
        "secretarias",
        ["secretaria_id"],
        ["id"],
    )

    # Etapa 7: Remover as colunas de texto antigas
    op.drop_column("usuarios", "secretaria")
    op.drop_column("funcionarios", "secretaria")


def downgrade():
    # O downgrade é complexo e pode não ser necessário, mas aqui está uma implementação
    op.add_column(
        "usuarios", sa.Column("secretaria", sa.String(length=100), nullable=True)
    )
    op.add_column(
        "funcionarios", sa.Column("secretaria", sa.String(length=100), nullable=True)
    )

    op.execute(
        "UPDATE usuarios SET secretaria = (SELECT nome FROM secretarias WHERE secretarias.id = usuarios.secretaria_id)"
    )
    op.execute(
        "UPDATE funcionarios SET secretaria = (SELECT nome FROM secretarias WHERE secretarias.id = funcionarios.secretaria_id)"
    )

    op.alter_column(
        "usuarios", "secretaria", existing_type=sa.String(length=100), nullable=False
    )
    op.alter_column(
        "funcionarios",
        "secretaria",
        existing_type=sa.String(length=100),
        nullable=False,
    )

    op.drop_constraint("fk_usuarios_secretaria_id", "usuarios", type_="foreignkey")
    op.drop_column("usuarios", "secretaria_id")
    op.drop_constraint(
        "fk_funcionarios_secretaria_id", "funcionarios", type_="foreignkey"
    )
    op.drop_column("funcionarios", "secretaria_id")
    op.drop_table("secretarias")
