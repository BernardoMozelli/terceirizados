from flask import Blueprint, request, jsonify
# IMPORTANTE: Adicionado current_user para que o log funcione
from flask_jwt_extended import jwt_required, current_user 
from extensions import db
from models import Empresa
from services.log_service import registrar_log

# Blueprint para rotas de empresas
empresas_bp = Blueprint("empresas", __name__)

@empresas_bp.route("", methods=["GET"])
@jwt_required()
def listar_empresas():
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 15, type=int)
    pagination = Empresa.query.order_by(Empresa.nome).paginate(
        page=page, per_page=per_page, error_out=False
    )
    return jsonify({
        "empresas": [e.to_dict() for e in pagination.items],
        "total_pages": pagination.pages,
        "current_page": page,
    })

@empresas_bp.route("", methods=["POST"])
@jwt_required()
def criar_empresa():
    # TRAVA DE SEGURANÇA MANUAl: Apenas usuário padrao não possui permissão
    if current_user.perfil not in ['admin', 'aprovador', 'ativador']:
        return jsonify({"erro": "Acesso negado. Você não possui permissão para criar novas empresas."}), 403

    dados = request.get_json()
    if not dados or "nome" not in dados:
        return jsonify({"erro": "O nome da empresa é obrigatório."}), 400

    nova_empresa = Empresa(
        nome=dados["nome"], 
        cnpj=dados.get("cnpj"),
        endereco=dados.get("endereco"),
        telefone=dados.get("telefone"),
        email=dados.get("email")
    )
    db.session.add(nova_empresa)
    db.session.flush()

    registrar_log(
        acao="Criação de Empresa",
        usuario_id=current_user.id,
        entidade="Empresa",
        entidade_id=nova_empresa.id,
        detalhes=f"Empresa '{nova_empresa.nome}' foi criada.",
    )
    db.session.commit()
    return jsonify(nova_empresa.to_dict()), 201

@empresas_bp.route("/<int:id>", methods=["GET"])
@jwt_required()
def obter_empresa(id):
    """Retorna os dados de uma empresa específica."""
    empresa = Empresa.query.get_or_404(id)
    return jsonify(empresa.to_dict())

@empresas_bp.route("/<int:id>", methods=["PUT"])
@jwt_required()
def atualizar_empresa(id):

    empresa = Empresa.query.get_or_404(id)
    dados = request.get_json()
    alteracoes = []

    for campo in ["nome", "cnpj", "endereco", "telefone", "email"]:
        if campo in dados and getattr(empresa, campo) != dados[campo]:
            alteracoes.append(f"{campo} alterado")
            setattr(empresa, campo, dados[campo])

    if alteracoes:
        registrar_log(
            acao="Edição de Empresa",
            usuario_id=current_user.id,
            entidade="Empresa",
            entidade_id=id,
            detalhes=f"Empresa {empresa.nome}: {', '.join(alteracoes)}",
        )
        db.session.commit()
    return jsonify(empresa.to_dict())

# ROTA ADICIONADA: Permite excluir uma empresa
@empresas_bp.route("/<int:id>", methods=["DELETE"])
@jwt_required()
def excluir_empresa(id):
    # TRAVA DE SEGURANÇA MANUAL: APENAS ADMIN e APROVADOR podem excluir
    if current_user.perfil not in ['admin', 'aprovador']:
        return jsonify({"erro": "Acesso negado. Você não possui permissão para excluir empresas."}), 403

    empresa = Empresa.query.get_or_404(id)
    
    # Impede a exclusão se houver funcionários ativos na empresa
    if empresa.funcionarios:
        return jsonify({"erro": "Não é possível excluir: existem funcionários vinculados a esta empresa."}), 400

    db.session.delete(empresa)
    registrar_log(
        acao="Exclusão de Empresa", 
        usuario_id=current_user.id, 
        entidade="Empresa", 
        entidade_id=id, 
        detalhes=f"Empresa {empresa.nome} foi removida do sistema."
    )
    db.session.commit()
    return jsonify({"mensagem": "Empresa excluída com sucesso"}), 200