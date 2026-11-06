"""Implementa perfis completos: padrao, ativador, admin, aprovador (v5)

Revision ID: i4d5e6f7g8h9
Revises: h3c4d5e6f7g8
Create Date: 2026-03-11 10:00:00.000000

- Aprovador: Acesso total (exceto usuários e logs)
- Ativador: Adicionado acesso a relatórios
- Usuário (Padrão): Removido acesso a transferências
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'i4d5e6f7g8h9'
down_revision = 'h3c4d5e6f7g8'
branch_labels = None
depends_on = None

PERMISSOES_POR_PERFIL = {
    "padrao": {
        "acessar_funcionarios": True,
        "acessar_desligados": True,
        "acessar_transferencias": False, # REMOVIDO
        "acessar_dashboard": False,
        "acessar_empresas": False,
        "acessar_usuarios": False,
        "acessar_secretarias": False,
        "acessar_configuracoes": False,
        "acessar_importacao": False,
        "acessar_logs_atividades": False,
        "acessar_contratacoes": False,
        "acessar_relatorios": False,
        "criar_funcionario": False,
        "editar_funcionario": False,
        "desligar_funcionario": False,
        "reativar_funcionario": False,
        "transferir_funcionario": False,
        "salvar_status": False,
        "criar_empresa": False,
        "editar_empresa": False,
        "excluir_empresa": False,
        "criar_usuario": False,
        "editar_usuario": False,
        "excluir_usuario": False,
        "alterar_senha_usuario": False,
        "criar_secretaria": False,
        "editar_secretaria": False,
        "excluir_secretaria": False,
        "candidatos": False,
        "criar_candidato": False,
        "editar_candidato": False,
        "excluir_candidato": False,
        "aprovar_candidato": False,
        "recusar_candidato": False,
        "ativar_ad": False,
        "desativar_ad": False,
    },

    "ativador": {
        "acessar_funcionarios": True,
        "acessar_desligados": True,
        "acessar_empresas": True,
        "acessar_transferencias": True,
        "acessar_relatorios": True, # ADICIONADO
        "acessar_dashboard": False,
        "acessar_usuarios": False,
        "acessar_secretarias": False,
        "acessar_configuracoes": False,
        "acessar_importacao": False,
        "acessar_logs_atividades": False,
        "acessar_contratacoes": False,
        "criar_funcionario": True,
        "editar_funcionario": True,
        "desligar_funcionario": True,
        "reativar_funcionario": True,
        "transferir_funcionario": True,
        "salvar_status": True,
        "criar_empresa": True,
        "editar_empresa": False,
        "excluir_empresa": False,
        "criar_usuario": False,
        "editar_usuario": False,
        "excluir_usuario": False,
        "alterar_senha_usuario": False,
        "criar_secretaria": False,
        "editar_secretaria": False,
        "excluir_secretaria": False,
        "candidatos": False,
        "criar_candidato": False,
        "editar_candidato": False,
        "excluir_candidato": False,
        "aprovar_candidato": False,
        "recusar_candidato": False,
        "ativar_ad": True,
        "desativar_ad": True,
    },

    "admin": {
        "acessar_dashboard": True,
        "acessar_funcionarios": True,
        "acessar_desligados": True,
        "acessar_empresas": True,
        "acessar_transferencias": True,
        "acessar_usuarios": True,
        "acessar_secretarias": True,
        "acessar_configuracoes": True,
        "acessar_importacao": True,
        "acessar_logs_atividades": True,
        "acessar_contratacoes": True,
        "acessar_relatorios": True,
        "criar_funcionario": True,
        "editar_funcionario": True,
        "desligar_funcionario": True,
        "reativar_funcionario": True,
        "transferir_funcionario": True,
        "salvar_status": True,
        "criar_empresa": True,
        "editar_empresa": True,
        "excluir_empresa": True,
        "criar_usuario": True,
        "editar_usuario": True,
        "excluir_usuario": True,
        "alterar_senha_usuario": True,
        "criar_secretaria": True,
        "editar_secretaria": True,
        "excluir_secretaria": True,
        "candidatos": True,
        "criar_candidato": False,
        "editar_candidato": False,
        "excluir_candidato": False,
        "aprovar_candidato": False,
        "recusar_candidato": False,
        "ativar_ad": True,
        "desativar_ad": True,
    },

    "aprovador": {
        # Aprovador agora tem acesso a quase tudo (exceto usuários e logs)
        "acessar_dashboard": True,
        "acessar_funcionarios": True,
        "acessar_desligados": True,
        "acessar_empresas": True,
        "acessar_transferencias": True,
        "acessar_contratacoes": True,
        "acessar_relatorios": True,
        "acessar_secretarias": True,
        "acessar_configuracoes": True,
        "acessar_importacao": True,
        # Bloqueados
        "acessar_usuarios": False,
        "acessar_logs_atividades": False,
        # Ações em funcionários
        "criar_funcionario": True,
        "editar_funcionario": True,
        "desligar_funcionario": True,
        "reativar_funcionario": True,
        "transferir_funcionario": True,
        "salvar_status": True,
        # Ações em empresas
        "criar_empresa": True,
        "editar_empresa": True,
        "excluir_empresa": False,
        # Ações em usuários (bloqueado)
        "criar_usuario": False,
        "editar_usuario": False,
        "excluir_usuario": False,
        "alterar_senha_usuario": False,
        # Ações em secretarias
        "criar_secretaria": True,
        "editar_secretaria": True,
        "excluir_secretaria": False,
        # Candidatos - aprovador tem acesso completo ao fluxo
        "candidatos": True,
        "criar_candidato": True,
        "editar_candidato": True,
        "excluir_candidato": True,
        "aprovar_candidato": True,
        "recusar_candidato": True,
        # AD
        "ativar_ad": True,
        "desativar_ad": True,
    },
}

def upgrade():
    permissoes_table = sa.table(
        "permissoes",
        sa.column("perfil", sa.String),
        sa.column("recurso", sa.String),
        sa.column("permitido", sa.Boolean),
    )

    # Coletar todos os recursos únicos
    todos_recursos = set()
    for perms in PERMISSOES_POR_PERFIL.values():
        todos_recursos.update(perms.keys())

    # Remover TODAS as permissões existentes para garantir consistência
    perfis_gerenciados = list(PERMISSOES_POR_PERFIL.keys())
    perfis_str = "','".join(perfis_gerenciados)
    op.execute(f"DELETE FROM permissoes WHERE perfil IN ('{perfis_str}')")

    # Inserir as novas permissões
    novas_permissoes = []
    for perfil, recursos in PERMISSOES_POR_PERFIL.items():
        for recurso, permitido in recursos.items():
            novas_permissoes.append({
                "perfil": perfil,
                "recurso": recurso,
                "permitido": permitido,
            })

    if novas_permissoes:
        op.bulk_insert(permissoes_table, novas_permissoes)


def downgrade():
    # Remove as permissões inseridas por esta migração
    perfis_gerenciados = list(PERMISSOES_POR_PERFIL.keys())
    perfis_str = "','".join(perfis_gerenciados)
    op.execute(f"DELETE FROM permissoes WHERE perfil IN ('{perfis_str}')")
