"""
Decoradores para controle de autenticação e autorização.

Este módulo fornece decoradores Flask para verificar:
- Se o usuário está autenticado (token_required)
- Se o usuário tem um perfil específico (perfil_required)
- Se o usuário tem uma permissão específica (permissao_required)
- Se o usuário é aprovador com nível específico (aprovador_required, nivel_aprovacao_required)
- Se o usuário é ativador (ativador_required)
- Se o usuário é administrador (admin_required)

Perfis do sistema:
  padrao   - Usuário básico: apenas visualização da própria secretaria
  ativador - Ativa/desativa funcionários e gerencia transferências da própria secretaria
  admin    - Acesso administrativo completo (exceto aprovar/reprovar candidatos)
  aprovador - Responsável por aprovar/recusar candidatos no fluxo de contratação
"""

from functools import wraps
from flask import jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity
from models import Usuario, Permissao
from extensions import db


# ---------------------------------------------------------------------------
# Utilitário interno
# ---------------------------------------------------------------------------

def _get_usuario_do_token():
    """Obtém o objeto Usuario a partir do token JWT atual."""
    verify_jwt_in_request()
    user_id = get_jwt_identity()
    return Usuario.query.get(int(user_id))


def _tem_permissao(usuario, recurso):
    """
    Verifica se um usuário possui determinado recurso habilitado.
    """
    if usuario.perfil == 'admin':
        # Admin NÃO pode aprovar nem recusar candidatos
        if recurso in ('aprovar_candidato', 'recusar_candidato'):
            return False
        return True
        
    # Aprovador: Acesso total a contratações, aprovações e logs
    if usuario.perfil == 'aprovador':
        recursos_aprovador = ['candidatos', 'criar_candidato', 'editar_candidato', 'excluir_candidato', 'aprovar_candidato', 'recusar_candidato', 'acessar_logs_atividades']
        if recurso in recursos_aprovador:
            return True

    # Ativador: Acesso ao módulo de contratações (restrito à sua secretaria nas rotas)
    if usuario.perfil == 'ativador':
        recursos_ativador = ['candidatos', 'criar_candidato', 'editar_candidato', 'excluir_candidato']
        if recurso in recursos_ativador:
            return True

    permissao = Permissao.query.filter_by(
        perfil=usuario.perfil,
        recurso=recurso,
        permitido=True
    ).first()
    return permissao is not None

# ---------------------------------------------------------------------------
# Visibilidade do campo "Indicação"
# ---------------------------------------------------------------------------

def pode_ver_indicacao(usuario):
    """
    O campo "Indicação" (Candidato.observacoes / Funcionario.observacao) só é
    visível e editável pelo perfil APROVADOR (qualquer nível: Prefeito,
    Vice-Prefeito ou Planejamento). Admin, ativador e usuário padrão não veem.
    """
    return bool(usuario) and usuario.perfil == 'aprovador'


def usuario_atual_pode_ver_indicacao():
    """
    Versão para uso nos to_dict() dos models.
    - Fora de uma requisição HTTP (scripts, cron, flask shell): libera.
    - Dentro de uma requisição: verifica o usuário do token (resultado em cache no g).
    """
    from flask import has_request_context, g
    if not has_request_context():
        return True
    try:
        verify_jwt_in_request(optional=True)
        user_id = get_jwt_identity()
    except Exception:
        return False
    if not user_id:
        return False
    cache = g.setdefault('_cache_pode_ver_indicacao', {})
    if user_id not in cache:
        cache[user_id] = pode_ver_indicacao(db.session.get(Usuario, int(user_id)))
    return cache[user_id]


# ---------------------------------------------------------------------------
# Decoradores públicos
# ---------------------------------------------------------------------------

def token_required(f):
    """Verifica se o usuário está autenticado via JWT."""
    @wraps(f)
    def decorated(*args, **kwargs):
        try:
            verify_jwt_in_request()
            return f(*args, **kwargs)
        except Exception:
            return jsonify({"erro": "Token inválido ou expirado"}), 401
    return decorated


def perfil_required(*perfis_permitidos):
    """
    Verifica se o usuário possui um dos perfis listados.

    Exemplo:
        @perfil_required('admin', 'aprovador')
        def rota_restrita(): ...
    """
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            try:
                usuario = _get_usuario_do_token()
                if not usuario:
                    return jsonify({"erro": "Usuário não encontrado"}), 404
                if usuario.perfil not in perfis_permitidos:
                    return jsonify({
                        "erro": f"Acesso negado. Perfis permitidos: {', '.join(perfis_permitidos)}",
                        "perfil_usuario": usuario.perfil
                    }), 403
                return f(*args, **kwargs)
            except Exception:
                return jsonify({"erro": "Erro ao verificar permissão"}), 401
        return decorated
    return decorator


def permissao_required(recurso):
    """
    Verifica se o usuário tem permissão para o recurso indicado.
    O perfil 'admin' passa automaticamente (exceto aprovar/recusar candidatos).

    Exemplo:
        @permissao_required('candidatos')
        def listar_candidatos(): ...
    """
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            try:
                usuario = _get_usuario_do_token()
                if not usuario:
                    return jsonify({"erro": "Usuário não encontrado"}), 404

                if not _tem_permissao(usuario, recurso):
                    return jsonify({
                        "erro": f"Acesso negado. Você não tem permissão para: {recurso}",
                        "recurso": recurso,
                        "perfil_usuario": usuario.perfil
                    }), 403

                return f(*args, **kwargs)
            except Exception:
                return jsonify({"erro": "Erro ao verificar permissão"}), 401
        return decorated
    return decorator


def admin_required(f):
    """Permite acesso apenas ao perfil 'admin'."""
    @wraps(f)
    def decorated(*args, **kwargs):
        try:
            usuario = _get_usuario_do_token()
            if not usuario:
                return jsonify({"erro": "Usuário não encontrado"}), 404
            perfil_atual = (usuario.perfil or "").lower()
            if perfil_atual not in ('admin', 'administrador', 'adminstrador'):
                return jsonify({
                    "erro": "Acesso negado. Apenas administradores podem acessar.",
                    "perfil_usuario": usuario.perfil
                }), 403
            return f(*args, **kwargs)
        except Exception:
            return jsonify({"erro": "Erro ao verificar permissão"}), 401
    return decorated


def aprovador_required(f):
    """
    Permite acesso apenas ao perfil 'aprovador'.
    Exige que o campo nivel_aprovacao esteja preenchido.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        try:
            usuario = _get_usuario_do_token()
            if not usuario:
                return jsonify({"erro": "Usuário não encontrado"}), 404

            if usuario.perfil != 'aprovador':
                return jsonify({
                    "erro": "Acesso negado. Apenas aprovadores podem realizar esta ação.",
                    "perfil_usuario": usuario.perfil
                }), 403

            if not usuario.nivel_aprovacao:
                return jsonify({
                    "erro": "Erro: Aprovador sem nível de aprovação definido.",
                    "usuario_id": usuario.id
                }), 400

            return f(*args, **kwargs)
        except Exception:
            return jsonify({"erro": "Erro ao verificar permissão"}), 401
    return decorated


def nivel_aprovacao_required(*niveis_permitidos):
    """
    Verifica se o aprovador possui um dos níveis de aprovação informados.

    Exemplo:
        @nivel_aprovacao_required('vice_prefeito', 'prefeito')
        def aprovar(): ...
    """
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            try:
                usuario = _get_usuario_do_token()
                if not usuario:
                    return jsonify({"erro": "Usuário não encontrado"}), 404

                if usuario.perfil != 'aprovador':
                    return jsonify({
                        "erro": "Acesso negado. Apenas aprovadores podem realizar esta ação.",
                        "perfil_usuario": usuario.perfil
                    }), 403

                if usuario.nivel_aprovacao not in niveis_permitidos:
                    return jsonify({
                        "erro": f"Acesso negado. Níveis permitidos: {', '.join(niveis_permitidos)}",
                        "nivel_usuario": usuario.nivel_aprovacao
                    }), 403

                return f(*args, **kwargs)
            except Exception:
                return jsonify({"erro": "Erro ao verificar permissão"}), 401
        return decorated
    return decorator


def ativador_required(f):
    """Permite acesso apenas ao perfil 'ativador'."""
    @wraps(f)
    def decorated(*args, **kwargs):
        try:
            usuario = _get_usuario_do_token()
            if not usuario:
                return jsonify({"erro": "Usuário não encontrado"}), 404

            if usuario.perfil != 'ativador':
                return jsonify({
                    "erro": "Acesso negado. Apenas ativadores podem realizar esta ação.",
                    "perfil_usuario": usuario.perfil
                }), 403

            return f(*args, **kwargs)
        except Exception:
            return jsonify({"erro": "Erro ao verificar permissão"}), 401
    return decorated


def get_usuario_autenticado():
    """
    Função auxiliar para obter o usuário autenticado atual.

    Returns:
        Usuario: Objeto do usuário autenticado ou None
    """
    try:
        return _get_usuario_do_token()
    except Exception:
        return None
