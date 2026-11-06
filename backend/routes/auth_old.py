from flask import Blueprint, request, jsonify
from models import Usuario, Permissao
from flask_jwt_extended import create_access_token

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/login", methods=["POST"])
def login():
    dados = request.get_json()
    email = dados.get("email", None)
    senha = dados.get("senha", None)

    if not email or not senha:
        return jsonify({"erro": "Email e senha são obrigatórios"}), 400

    usuario = Usuario.query.filter_by(email=email).first()
    if not usuario or not usuario.check_password(senha):
        return jsonify({"erro": "Credenciais inválidas"}), 401

    # Obter permissões do usuário
    permissoes = Permissao.query.filter_by(
        perfil=usuario.perfil,
        permitido=True
    ).all()
    
    permissoes_list = [p.recurso for p in permissoes]
    
    # Criar token com dados adicionais
    access_token = create_access_token(
        identity=str(usuario.id),
        additional_claims={
            "perfil": usuario.perfil,
            "nivel_aprovacao": usuario.nivel_aprovacao,
            "permissoes": permissoes_list
        }
    )
    
    # Retornar token e dados do usuário
    return jsonify(
        access_token=access_token,
        usuario={
            "id": usuario.id,
            "nome": usuario.nome,
            "email": usuario.email,
            "perfil": usuario.perfil,
            "nivel_aprovacao": usuario.nivel_aprovacao,
            "permissoes": permissoes_list
        }
    ), 200
