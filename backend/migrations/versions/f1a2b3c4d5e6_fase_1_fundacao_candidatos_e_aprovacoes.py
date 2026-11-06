"""Fase 1 - Fundação: Adiciona tabelas de candidatos e aprovações

Revision ID: f1a2b3c4d5e6
Revises: e1f2g3h4i5j6
Create Date: 2026-03-09 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector

# revision identifiers, used by Alembic.
revision = 'f1a2b3c4d5e6'
down_revision = 'e1f2g3h4i5j6'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)
    tables = inspector.get_table_names()

    # Criar tabela candidatos se não existir
    if 'candidatos' not in tables:
        op.create_table(
            'candidatos',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('nome', sa.String(length=255), nullable=False),
            sa.Column('email', sa.String(length=255), nullable=False),
            sa.Column('telefone', sa.String(length=20), nullable=True),
            sa.Column('cpf', sa.String(length=14), nullable=False),
            sa.Column('empresa_id', sa.Integer(), nullable=False),
            sa.Column('secretaria_id', sa.Integer(), nullable=False),
            sa.Column('cargo', sa.String(length=255), nullable=False),
            sa.Column('data_inicio_prevista', sa.Date(), nullable=False),
            sa.Column('foto', sa.String(length=500), nullable=True),
            sa.Column('observacoes', sa.Text(), nullable=True),
            sa.Column('status', sa.String(length=50), nullable=False),
            sa.Column('usuario_solicitante_id', sa.Integer(), nullable=False),
            sa.Column('data_criacao', sa.DateTime(), nullable=False),
            sa.Column('data_atualizacao', sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(['empresa_id'], ['empresas.id'], ),
            sa.ForeignKeyConstraint(['secretaria_id'], ['secretarias.id'], ),
            sa.ForeignKeyConstraint(['usuario_solicitante_id'], ['usuarios.id'], ),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('cpf')
        )
        # Criar índices para tabela candidatos
        op.create_index('idx_candidatos_status', 'candidatos', ['status'], unique=False)
        op.create_index('idx_candidatos_empresa', 'candidatos', ['empresa_id'], unique=False)
        op.create_index('idx_candidatos_secretaria', 'candidatos', ['secretaria_id'], unique=False)
    
    # Criar tabela aprovacoes_candidato se não existir
    if 'aprovacoes_candidato' not in tables:
        op.create_table(
            'aprovacoes_candidato',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('candidato_id', sa.Integer(), nullable=False),
            sa.Column('aprovador_id', sa.Integer(), nullable=False),
            sa.Column('nivel_aprovacao', sa.String(length=50), nullable=False),
            sa.Column('acao', sa.String(length=50), nullable=False),
            sa.Column('motivo', sa.Text(), nullable=True),
            sa.Column('data_aprovacao', sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(['aprovador_id'], ['usuarios.id'], ),
            sa.ForeignKeyConstraint(['candidato_id'], ['candidatos.id'], ),
            sa.PrimaryKeyConstraint('id')
        )
        # Criar índices para tabela aprovacoes_candidato
        op.create_index('idx_aprovacoes_candidato', 'aprovacoes_candidato', ['candidato_id'], unique=False)
        op.create_index('idx_aprovacoes_nivel', 'aprovacoes_candidato', ['nivel_aprovacao'], unique=False)


def downgrade():
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)
    tables = inspector.get_table_names()

    # Remover tabela aprovacoes_candidato
    if 'aprovacoes_candidato' in tables:
        op.drop_index('idx_aprovacoes_nivel', table_name='aprovacoes_candidato')
        op.drop_index('idx_aprovacoes_candidato', table_name='aprovacoes_candidato')
        op.drop_table('aprovacoes_candidato')

    # Remover tabela candidatos
    if 'candidatos' in tables:
        op.drop_index('idx_candidatos_secretaria', table_name='candidatos')
        op.drop_index('idx_candidatos_empresa', table_name='candidatos')
        op.drop_index('idx_candidatos_status', table_name='candidatos')
        op.drop_table('candidatos')
