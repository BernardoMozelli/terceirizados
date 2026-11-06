"""
Endpoints para o Super Modal Fullscreen de Gestão de Funcionários.
Inclui: detalhes completos, upload de foto por CPF, ativação/inativação, desligamento.
"""

import os
import re
import logging
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, current_user
from werkzeug.utils import secure_filename
from PIL import Image

from extensions import db
from models import Funcionario, Usuario, AprovacaoCandidato, Candidato
from services.log_service import registrar_log
from .usuarios import permission_required
from decorators import pode_ver_indicacao

# Configuração de fuso horário e logs
SAO_PAULO_TZ = ZoneInfo("America/Sao_Paulo")
logger = logging.getLogger(__name__)

funcionarios_super_modal_bp = Blueprint("funcionarios_super_modal", __name__)

# =====================================================
# HELPER: Processamento de Fotos
# =====================================================

def limpar_cpf(cpf):
    """Remove caracteres especiais do CPF."""
    if not cpf:
        return None
    return "".join(filter(str.isdigit, str(cpf)))


def obter_pasta_fotos():
    """Retorna o caminho da pasta de fotos unificada."""
    pasta = os.path.join(current_app.root_path, 'static', 'uploads')
    os.makedirs(pasta, exist_ok=True)
    return pasta


def gerar_miniatura(caminho_original, largura=150, altura=150):
    """Gera uma miniatura redimensionada da foto original."""
    try:
        if not os.path.exists(caminho_original):
            return None
        
        img = Image.open(caminho_original)
        img.thumbnail((largura, altura), Image.Resampling.LANCZOS)
        
        base, ext = os.path.splitext(caminho_original)
        caminho_miniatura = f"{base}_thumb.png"
        img.save(caminho_miniatura, 'PNG')
        
        return caminho_miniatura
    except Exception as e:
        logger.error(f"Erro ao gerar miniatura: {e}")
        return None


def buscar_foto_por_cpf(cpf):
    """
    Busca uma foto na pasta de funcionários usando o CPF como nome.
    Tenta extensões comuns: .jpg, .jpeg, .png, .gif
    """
    cpf_limpo = limpar_cpf(cpf)
    if not cpf_limpo:
        return None
    
    pasta = obter_pasta_fotos()
    extensoes = ['.jpg', '.jpeg', '.png', '.gif', '.bmp']
    
    for ext in extensoes:
        caminho = os.path.join(pasta, f"{cpf_limpo}{ext}")
        if os.path.exists(caminho):
            return f"/static/uploads/{cpf_limpo}{ext}"
    
    return None


# =====================================================
# ENDPOINT 1: Obter Detalhes Completos do Funcionário
# =====================================================

@funcionarios_super_modal_bp.route("/detalhes/<int:funcionario_id>", methods=["GET"])
@jwt_required()
def obter_detalhes_funcionario(funcionario_id):
    """
    Retorna detalhes completos do funcionário incluindo:
    - Dados básicos
    - Foto (com fallback por CPF)
    - Histórico de aprovações (se houver candidato de origem)
    - Status de ativação
    """
    try:
        funcionario = Funcionario.query.get_or_404(funcionario_id)
        
        # Verificar permissão: admin e aprovador veem tudo, outros veem só sua secretaria
        if current_user.perfil not in ["admin", "aprovador"]:
            if funcionario.secretaria_id != current_user.secretaria_id:
                return jsonify({"erro": "Acesso negado"}), 403
        
        # Preparar dados básicos
        dados = funcionario.to_dict()
        
        # Tentar obter foto: primeiro do banco, depois por CPF
        foto_path = dados.get('foto')
        if not foto_path or foto_path == 'null':
            # Tentar buscar por CPF
            foto_por_cpf = buscar_foto_por_cpf(funcionario.cpf)
            if foto_por_cpf:
                foto_path = foto_por_cpf
                dados['foto'] = foto_path
        
        # Buscar histórico de aprovações (se houver candidato de origem)
        historico_aprovacoes = []
        candidato = Candidato.query.filter_by(funcionario_id=funcionario_id).first()
        indicacao_candidato = None
        foto_candidato = None
        
        if candidato:
            # Capturar indicação (observações) do candidato
            indicacao_candidato = candidato.observacoes
            
            # Capturar foto do candidato se não houver foto no funcionário
            if not foto_path or foto_path == 'null':
                foto_candidato = candidato.foto
                if foto_candidato and foto_candidato != 'null':
                    foto_path = foto_candidato
                    dados['foto'] = foto_path
            
            aprovacoes = AprovacaoCandidato.query.filter_by(candidato_id=candidato.id).order_by(
                AprovacaoCandidato.data_aprovacao.asc()
            ).all()
            
            for aprovacao in aprovacoes:
                historico_aprovacoes.append({
                    "id": aprovacao.id,
                    "nivel": aprovacao.nivel_aprovacao,
                    "acao": aprovacao.acao,
                    "aprovador_nome": aprovacao.aprovador.nome if aprovacao.aprovador else "Sistema",
                    "motivo": aprovacao.motivo,
                    "data": aprovacao.data_aprovacao.astimezone(SAO_PAULO_TZ).strftime("%d/%m/%Y %H:%M")
                })
        
        # Determinar se há fluxo de aprovação pendente
        tem_fluxo_pendente = candidato and candidato.status not in ['contratado', 'recusado', 'desligado']
        
        return jsonify({
            "funcionario": dados,
            "foto_url": foto_path,
            "indicacao": indicacao_candidato if pode_ver_indicacao(current_user) else None,
            "historico_aprovacoes": historico_aprovacoes,
            "tem_candidato_origem": candidato is not None,
            "tem_fluxo_pendente": tem_fluxo_pendente,
            "status_candidato": candidato.status if candidato else None
        }), 200
    
    except Exception as e:
        logger.error(f"Erro ao obter detalhes do funcionário: {e}")
        return jsonify({"erro": str(e)}), 500


# =====================================================
# ENDPOINT 2: Upload de Foto com Renomeação por CPF
# =====================================================

@funcionarios_super_modal_bp.route("/upload-foto/<int:funcionario_id>", methods=["POST"])
@jwt_required()
def upload_foto_funcionario(funcionario_id):
    """
    Faz upload de foto e a renomeia para [CPF_APENAS_NUMEROS].ext
    Se já existir uma foto com esse CPF, substitui.
    Permitido para: admin, aprovador, ativador.
    Perfil padrão só pode fazer upload de funcionários da própria secretaria.
    """
    try:
        funcionario = Funcionario.query.get_or_404(funcionario_id)

        # Verificar permissão por perfil
        perfil = current_user.perfil
        if perfil not in ["admin", "aprovador", "ativador", "padrao"]:
            return jsonify({"erro": "Acesso negado"}), 403

        # Perfil padrão só pode editar foto da própria secretaria
        if perfil == "padrao":
            if funcionario.secretaria_id != current_user.secretaria_id:
                return jsonify({"erro": "Acesso negado"}), 403
        
        if 'foto' not in request.files:
            return jsonify({"erro": "Nenhum arquivo enviado"}), 400
        
        arquivo = request.files['foto']
        if not arquivo or arquivo.filename == '':
            return jsonify({"erro": "Arquivo inválido"}), 400
        
        # Validar tipo de arquivo
        tipos_permitidos = {'image/jpeg', 'image/png', 'image/gif', 'image/bmp'}
        if arquivo.content_type not in tipos_permitidos:
            return jsonify({"erro": "Tipo de arquivo não permitido. Use JPG, PNG, GIF ou BMP"}), 400
        
        # Obter extensão
        ext_original = os.path.splitext(arquivo.filename)[1].lower()
        if not ext_original:
            ext_original = '.jpg'
        
        # Preparar nome do arquivo: CPF_APENAS_NUMEROS.ext
        cpf_limpo = limpar_cpf(funcionario.cpf)
        novo_nome = f"{cpf_limpo}{ext_original}"
        
        pasta = obter_pasta_fotos()
        caminho_novo = os.path.join(pasta, novo_nome)
        
        # Se já existe, remover versão anterior
        if os.path.exists(caminho_novo):
            os.remove(caminho_novo)
            # Remover thumbnail também
            base, _ = os.path.splitext(caminho_novo)
            thumb_path = f"{base}_thumb.png"
            if os.path.exists(thumb_path):
                os.remove(thumb_path)
        
        # Salvar novo arquivo
        arquivo.save(caminho_novo)
        
        # Gerar miniatura
        gerar_miniatura(caminho_novo)
        
        # Atualizar banco de dados
        caminho_relativo = f"/static/uploads/{novo_nome}"
        funcionario.foto = caminho_relativo
        db.session.commit()
        
        # Sincronizar com candidato de origem (se houver)
        try:
            candidato = Candidato.query.filter_by(funcionario_id=funcionario_id).first()
            if candidato:
                candidato.foto = caminho_relativo
                candidato.data_atualizacao = datetime.now()
                db.session.commit()
        except Exception as e:
            logger.warning(f"Erro ao sincronizar foto com candidato: {e}")
        
        # Registrar log
        agora = datetime.now(SAO_PAULO_TZ).strftime('%d/%m/%Y às %H:%M')
        registrar_log(
            acao="UPLOAD DE FOTO",
            usuario_id=current_user.id,
            entidade="Funcionarios",
            entidade_id=funcionario_id,
            detalhes=f"Foto do funcionário {funcionario.nome} atualizada em {agora}."
        )
        
        return jsonify({
            "mensagem": "Foto atualizada com sucesso",
            "foto_url": caminho_relativo
        }), 200
    
    except Exception as e:
        logger.error(f"Erro ao fazer upload de foto: {e}")
        return jsonify({"erro": str(e)}), 500


# =====================================================
# ENDPOINT 3: Ativar/Inativar Funcionário
# =====================================================

@funcionarios_super_modal_bp.route("/toggle-ativo/<int:funcionario_id>", methods=["POST"])
@jwt_required()
@permission_required("editar_funcionario")
def toggle_ativo_funcionario(funcionario_id):
    """
    Alterna o status de ativação do funcionário (1 = ativo, 0 = inativo).
    """
    try:
        funcionario = Funcionario.query.get_or_404(funcionario_id)
        
        # Verificar permissão
        if current_user.perfil not in ["admin", "aprovador"]:
            if funcionario.secretaria_id != current_user.secretaria_id:
                return jsonify({"erro": "Acesso negado"}), 403
        
        dados = request.get_json()
        novo_status = dados.get('status_contratual')
        
        if novo_status not in [0, 1]:
            return jsonify({"erro": "Status inválido"}), 400
        
        status_anterior = funcionario.status_contratual
        funcionario.status_contratual = novo_status
        db.session.commit()
        
        # Registrar log
        agora = datetime.now(SAO_PAULO_TZ).strftime('%d/%m/%Y às %H:%M')
        acao_texto = "ATIVAÇÃO" if novo_status == 1 else "INATIVAÇÃO"
        status_texto = "ativado" if novo_status == 1 else "inativado"
        
        registrar_log(
            acao=acao_texto,
            usuario_id=current_user.id,
            entidade="Funcionarios",
            entidade_id=funcionario_id,
            detalhes=f"O funcionário {funcionario.nome} foi {status_texto} em {agora}."
        )
        
        return jsonify({
            "mensagem": f"Funcionário {status_texto} com sucesso",
            "status_contratual": novo_status
        }), 200
    
    except Exception as e:
        logger.error(f"Erro ao alternar ativo/inativo: {e}")
        return jsonify({"erro": str(e)}), 500


# =====================================================
# ENDPOINT 4: Desligar Funcionário
# =====================================================

@funcionarios_super_modal_bp.route("/desligar/<int:funcionario_id>", methods=["POST"])
@jwt_required()
@permission_required("editar_funcionario")
def desligar_funcionario(funcionario_id):
    """
    Desliga um funcionário, registrando o motivo.
    """
    try:
        funcionario = Funcionario.query.get_or_404(funcionario_id)
        
        # Verificar permissão
        if current_user.perfil not in ["admin", "aprovador"]:
            if funcionario.secretaria_id != current_user.secretaria_id:
                return jsonify({"erro": "Acesso negado"}), 403
        
        dados = request.get_json()
        motivo = dados.get('motivo', 'Desligamento via Super Modal')
        
        # Atualizar status
        funcionario.status_contratual = 0
        db.session.commit()
        
        # Sincronizar com candidato de origem
        try:
            candidato = Candidato.query.filter_by(funcionario_id=funcionario_id).first()
            if candidato:
                candidato.status = 'desligado'
                candidato.data_atualizacao = datetime.now()
                
                # Registrar no histórico de aprovações
                desligamento = AprovacaoCandidato(
                    candidato_id=candidato.id,
                    aprovador_id=current_user.id,
                    nivel_aprovacao='desligamento',
                    acao='desligado',
                    motivo=motivo
                )
                db.session.add(desligamento)
                db.session.commit()
        except Exception as e:
            logger.warning(f"Erro ao sincronizar desligamento com candidato: {e}")
        
        # Registrar log
        agora = datetime.now(SAO_PAULO_TZ).strftime('%d/%m/%Y às %H:%M')
        registrar_log(
            acao="DESLIGAMENTO",
            usuario_id=current_user.id,
            entidade="Funcionarios",
            entidade_id=funcionario_id,
            detalhes=f"O funcionário {funcionario.nome} foi desligado em {agora}. Motivo: {motivo}"
        )
        
        return jsonify({
            "mensagem": "Funcionário desligado com sucesso",
            "status_contratual": 0
        }), 200
    
    except Exception as e:
        logger.error(f"Erro ao desligar funcionário: {e}")
        return jsonify({"erro": str(e)}), 500


# =====================================================
# ENDPOINT 5: Atualizar Dados do Funcionário
# =====================================================

'''
@funcionarios_super_modal_bp.route("/atualizar/<int:funcionario_id>", methods=["PUT"])
@jwt_required()
def atualizar_dados_funcionario(funcionario_id):
    """
    Atualiza dados do funcionário: nome, cargo, observação, matrícula.
    CPF é read-only.
    """
    try:
        funcionario = Funcionario.query.get_or_404(funcionario_id)
        
        # Verificar permissão
        # Apenas 'padrao' não pode editar funcionários
        if current_user.perfil == "padrao":
            return jsonify({"erro": "Acesso negado. Apenas administradores, ativadores e aprovadores podem editar funcionários."}), 403
        
        dados = request.get_json()
        
        campos_permitidos = ['nome', 'cargo', 'observacao', 'matricula']
        alteracoes = []
        
        for campo in campos_permitidos:
            if campo in dados:
                valor_novo = dados[campo]
                valor_antigo = getattr(funcionario, campo, None)
                
                if valor_novo != valor_antigo:
                    setattr(funcionario, campo, valor_novo)
                    alteracoes.append(f"{campo}: '{valor_antigo}' → '{valor_novo}'")
        
        if alteracoes:
            try:
                db.session.flush()  # Detecta erros de constraint antes do commit
                db.session.commit()
                
                # Registrar log
                agora = datetime.now(SAO_PAULO_TZ).strftime('%d/%m/%Y às %H:%M')
                registrar_log(
                    acao="EDIÇÃO DE DADOS",
                    usuario_id=current_user.id,
                    entidade="Funcionarios",
                    entidade_id=funcionario_id,
                    detalhes=f"Funcionário {funcionario.nome} atualizado em {agora}. Alterações: {'; '.join(alteracoes)}"
                )
            except Exception as e:
                db.session.rollback()
                # Verificar se é erro de constraint UNIQUE
                if "unique" in str(e).lower() or "duplicate" in str(e).lower():
                    return jsonify({"erro": "Matrícula já existe no sistema. Escolha uma matrícula única."}), 400
                raise
        
        return jsonify({
            "mensagem": "Dados atualizados com sucesso",
            "funcionario": funcionario.to_dict()
        }), 200
    
    except Exception as e:
        db.session.rollback()
        logger.error(f"Erro ao atualizar dados do funcionário: {e}")
        return jsonify({"erro": str(e)}), 500
'''

@funcionarios_super_modal_bp.route("/atualizar/<int:funcionario_id>", methods=["PUT"])
@jwt_required()
def atualizar_dados_funcionario(funcionario_id):
    try:
        funcionario = Funcionario.query.get_or_404(funcionario_id)

        # 🔐 REGRA DE PERMISSÃO
        # Admin e Aprovador podem editar qualquer funcionário
        if current_user.perfil not in ["admin", "aprovador"]:
            # Ativador e Padrao só podem editar da própria secretaria
            if funcionario.secretaria_id != current_user.secretaria_id:
                return jsonify({"erro": "Acesso negado"}), 403

        dados = request.get_json()

        campos_permitidos = ['nome', 'cargo', 'matricula', 'setor']
        # Indicação só pode ser alterada por admin, Prefeito e Vice-Prefeito
        if pode_ver_indicacao(current_user):
            campos_permitidos.append('observacao')
        alteracoes = []

        for campo in campos_permitidos:
            if campo in dados:
                valor_novo = dados[campo]
                valor_antigo = getattr(funcionario, campo, None)

                if valor_novo != valor_antigo:
                    setattr(funcionario, campo, valor_novo)
                    alteracoes.append(f"{campo}: '{valor_antigo}' → '{valor_novo}'")

        if alteracoes:
            try:
                db.session.flush()
                db.session.commit()
            except Exception as e:
                db.session.rollback()
                if "unique" in str(e).lower() or "duplicate" in str(e).lower():
                    return jsonify({"erro": "Matrícula já existe no sistema. Escolha uma matrícula única."}), 400
                raise

        return jsonify({
            "mensagem": "Dados atualizados com sucesso",
            "funcionario": funcionario.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({"erro": str(e)}), 500