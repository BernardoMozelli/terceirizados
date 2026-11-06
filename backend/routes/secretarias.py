from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, current_user
from sqlalchemy.exc import IntegrityError
from models import Secretaria
from extensions import db
from services.log_service import registrar_log

secretarias_bp = Blueprint("secretarias", __name__)


@secretarias_bp.route("", methods=["GET"])
@jwt_required()
def listar_secretarias():
    secretarias = Secretaria.query.order_by(Secretaria.nome).all()
    return jsonify([s.to_dict() for s in secretarias])


@secretarias_bp.route("", methods=["POST"])
@jwt_required()  
def criar_secretaria():
    # TRAVA DE ACESSO: Apenas admin e aprovador
    if current_user.perfil not in ['admin', 'aprovador']:
        return jsonify({"erro": "Acesso negado. Apenas administradores e aprovadores podem criar secretarias."}), 403

    dados = request.get_json()
    if not dados or not dados.get("nome"):
        return jsonify({"erro": "O nome da secretaria é obrigatório."}), 400

    if Secretaria.query.filter_by(nome=dados["nome"]).first():
        return jsonify({"erro": "Já existe uma secretaria com este nome."}), 409

    nova_secretaria = Secretaria(nome=dados["nome"])
    db.session.add(nova_secretaria)
    db.session.flush()

    registrar_log(
        acao="Criação de Secretaria",
        usuario_id=current_user.id,
        entidade="Secretaria",
        entidade_id=nova_secretaria.id,
        detalhes=f"Secretaria '{nova_secretaria.nome}' foi criada.",
    )
    db.session.commit()
    return jsonify(nova_secretaria.to_dict()), 201


@secretarias_bp.route("/<int:id>", methods=["PUT"])
@jwt_required()  
def atualizar_secretaria(id):
    # TRAVA DE ACESSO: Apenas admin e aprovador
    if current_user.perfil not in ['admin', 'aprovador']:
        return jsonify({"erro": "Acesso negado. Apenas administradores e aprovadores podem editar secretarias."}), 403

    secretaria = Secretaria.query.get_or_404(id)
    dados = request.get_json()
    if not dados or not dados.get("nome"):
        return jsonify({"erro": "O nome da secretaria é obrigatório."}), 400

    nome_antigo = secretaria.nome
    novo_nome = dados["nome"]

    if nome_antigo != novo_nome:
        if Secretaria.query.filter(
            Secretaria.nome == novo_nome, Secretaria.id != id
        ).first():
            return jsonify({"erro": "Já existe uma secretaria com este nome."}), 409

        secretaria.nome = novo_nome
        registrar_log(
            acao="Edição de Secretaria",
            usuario_id=current_user.id,
            entidade="Secretaria",
            entidade_id=id,
            detalhes=f"Nome da secretaria alterado de '{nome_antigo}' para '{novo_nome}'.",
        )
        db.session.commit()

    return jsonify(secretaria.to_dict())


@secretarias_bp.route("/<int:id>", methods=["DELETE"])
@jwt_required()
def excluir_secretaria(id):
    # 1. TRAVA DE ACESSO: Apenas admin e aprovador
    if current_user.perfil not in ['admin', 'aprovador']:
        return jsonify({"erro": "Acesso negado. Apenas administradores e aprovadores podem excluir secretarias."}), 403

    secretaria = Secretaria.query.get_or_404(id)
    nome_excluido = secretaria.nome 

    # 2. TRAVA DE SEGURANÇA LÓGICA (Evita apagar se tiver vínculos)
    if (hasattr(secretaria, 'funcionarios') and secretaria.funcionarios) or \
       (hasattr(secretaria, 'candidatos') and secretaria.candidatos):
        return jsonify({"erro": "Não é possível excluir: existem funcionários ou candidatos vinculados a esta secretaria."}), 400

    try:
        db.session.delete(secretaria)
        # Flush dispara erros de Foreign Key antes do commit
        db.session.flush()

        registrar_log(
            acao="Exclusão de Secretaria",
            usuario_id=current_user.id,
            entidade="Secretaria",
            entidade_id=id,
            detalhes=f"Secretaria '{nome_excluido}' foi excluída."
        )
        db.session.commit()
        return jsonify({"mensagem": "Secretaria excluída com sucesso."}), 200

    except IntegrityError:
        # 3. TRAVA DE SEGURANÇA DA BASE DE DADOS
        db.session.rollback()
        return jsonify({"erro": "Não é possível excluir esta secretaria pois ela possui registros vinculados no sistema."}), 400
    except Exception as e:
        db.session.rollback()
        return jsonify({"erro": f"Erro interno ao tentar excluir: {str(e)}"}), 500