#!/usr/bin/env python3
"""
Script para sincronizar as permissões dos 4 perfis no banco de dados.
Versão v5:
- Aprovador: Acesso total (exceto usuários e logs)
- Ativador: Adicionado acesso a relatórios
- Usuário (Padrão): Removido acesso a transferências
"""

import os
import sys
from dotenv import load_dotenv

# Carregar variáveis de ambiente
load_dotenv()

# Adicionar o diretório do backend ao path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from extensions import db
from app import create_app
from models import Permissao

# Definição completa de permissões por perfil (v5)
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
        "acessar_aprovacoes": False,
        "acessar_relatorios": False,
        "criar_funcionario": False,
        "editar_funcionario": True,
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
        "acessar_relatorios": True,
        "acessar_dashboard": False,
        "acessar_usuarios": False,
        "acessar_secretarias": False,
        "acessar_configuracoes": False,
        "acessar_importacao": False,
        "acessar_logs_atividades": False,
        "acessar_contratacoes": True,
        "acessar_aprovacoes": False,
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
        "candidatos": True,
        "criar_candidato": True,
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
        "acessar_aprovacoes": True,
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
        # Aprovador agora tem acesso a quase tudo (incluindo logs)
        "acessar_dashboard": True,
        "acessar_funcionarios": True,
        "acessar_desligados": True,
        "acessar_empresas": True,
        "acessar_transferencias": True,
        "acessar_contratacoes": True,
        "acessar_aprovacoes": True,
        "acessar_relatorios": True,
        "acessar_secretarias": True,
        "acessar_configuracoes": True,
        "acessar_importacao": True,
        "acessar_logs_atividades": True, # Habilitado
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
        "excluir_empresa": True, # Habilitado
        # Ações em usuários (bloqueado)
        "criar_usuario": False,
        "editar_usuario": False,
        "excluir_usuario": False,
        "alterar_senha_usuario": False,
        # Ações em secretarias
        "criar_secretaria": True,
        "editar_secretaria": True,
        "excluir_secretaria": True, # Habilitado
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


def sincronizar_permissoes():
    """Sincroniza as permissões no banco de dados."""
    app = create_app()
    
    with app.app_context():
        print("🔄 Sincronizando permissões no banco de dados (v5)...")
        
        try:
            # Remover todas as permissões dos 4 perfis gerenciados
            perfis_gerenciados = list(PERMISSOES_POR_PERFIL.keys())
            permissoes_removidas = Permissao.query.filter(
                Permissao.perfil.in_(perfis_gerenciados)
            ).delete()
            
            print(f"✅ Removidas {permissoes_removidas} permissões antigas")
            
            # Inserir as novas permissões
            total_inseridas = 0
            for perfil, recursos in PERMISSOES_POR_PERFIL.items():
                for recurso, permitido in recursos.items():
                    nova_permissao = Permissao(
                        perfil=perfil,
                        recurso=recurso,
                        permitido=permitido
                    )
                    db.session.add(nova_permissao)
                    total_inseridas += 1
            
            db.session.commit()
            print(f"✅ Inseridas {total_inseridas} novas permissões")
            
            # Exibir resumo por perfil
            print("\n📊 Resumo de permissões por perfil:")
            for perfil in perfis_gerenciados:
                count = Permissao.query.filter_by(perfil=perfil).count()
                permitidas = Permissao.query.filter_by(perfil=perfil, permitido=True).count()
                bloqueadas = Permissao.query.filter_by(perfil=perfil, permitido=False).count()
                print(f"   {perfil:12} → {count:3} permissões ({permitidas} permitidas, {bloqueadas} bloqueadas)")
            
            print("\n✨ Sincronização concluída com sucesso!")
            return True
            
        except Exception as e:
            db.session.rollback()
            print(f"❌ Erro ao sincronizar permissões: {str(e)}")
            import traceback
            traceback.print_exc()
            return False


if __name__ == "__main__":
    sucesso = sincronizar_permissoes()
    sys.exit(0 if sucesso else 1)
