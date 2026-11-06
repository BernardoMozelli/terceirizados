from flask import Blueprint, request, jsonify
from models import Usuario, Permissao
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity

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


@auth_bp.route("/refresh", methods=["POST"])
@jwt_required()
def refresh_token():
    """
    Endpoint para renovar o token JWT.
    Requer um token válido no header Authorization.
    Retorna um novo token com as mesmas claims.
    """
    try:
        usuario_id = get_jwt_identity()
        usuario = Usuario.query.get(usuario_id)
        
        if not usuario:
            return jsonify({"erro": "Usuário não encontrado"}), 401
        
        # Obter permissões atualizadas do usuário
        permissoes = Permissao.query.filter_by(
            perfil=usuario.perfil,
            permitido=True
        ).all()
        
        permissoes_list = [p.recurso for p in permissoes]
        
        # Criar novo token com dados atualizados
        new_access_token = create_access_token(
            identity=str(usuario.id),
            additional_claims={
                "perfil": usuario.perfil,
                "nivel_aprovacao": usuario.nivel_aprovacao,
                "permissoes": permissoes_list
            }
        )
        
        return jsonify(
            access_token=new_access_token,
            usuario={
                "id": usuario.id,
                "nome": usuario.nome,
                "email": usuario.email,
                "perfil": usuario.perfil,
                "nivel_aprovacao": usuario.nivel_aprovacao,
                "permissoes": permissoes_list
            }
        ), 200
    
    except Exception as e:
        return jsonify({"erro": f"Erro ao renovar token: {str(e)}"}), 500
