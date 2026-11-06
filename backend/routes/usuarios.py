from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, current_user
from extensions import db
from models import Usuario, ConfirmacaoStatus, Configuracao
from services.log_service import registrar_log
from decorators import pode_ver_indicacao
from functools import wraps
from sqlalchemy import func
from sqlalchemy.orm import joinedload
from sqlalchemy.exc import IntegrityError  # <-- Adicionado para tratar o erro de exclusão
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import traceback

usuarios_bp = Blueprint("usuarios", __name__)
SAO_PAULO_TZ = ZoneInfo("America/Sao_Paulo")


def permission_required(permission: str):
    """
    Decorator que verifica se o usuário logado tem uma permissão específica.
    O perfil 'admin' tem acesso a tudo, exceto aprovar/recusar candidatos.
    """

    def decorator(fn):
        @wraps(fn)
        @jwt_required()
        def wrapper(*args, **kwargs):
            # Admin tem acesso a tudo, exceto aprovar/recusar candidatos
            if current_user.perfil == "admin":
                if permission in ('aprovar_candidato', 'recusar_candidato'):
                    return jsonify({"erro": "Administradores não podem aprovar ou recusar candidatos."}), 403
                return fn(*args, **kwargs)

            # Pega as permissões ativas do usuário
            user_permissions = {
                p.recurso for p in current_user.get_permissoes() if p.permitido
            }

            if permission not in user_permissions:
                return jsonify({"erro": f"Acesso negado. Você não tem permissão para: {permission}"}), 403

            return fn(*args, **kwargs)

        return wrapper

    return decorator


@usuarios_bp.route("", methods=["GET"])
@permission_required("acessar_usuarios")
def listar_usuarios():
    try:
        page = request.args.get("page", 1, type=int)
        per_page = request.args.get("per_page", 15, type=int)

        from sqlalchemy import or_
        termo = (request.args.get("busca") or request.args.get("search") or "").strip()

        print(f"[DEBUG] listar_usuarios | termo='{termo}' | page={page}")

        query = Usuario.query.options(joinedload(Usuario.secretaria))
        if termo:
            query = query.filter(
                or_(
                    Usuario.nome.ilike(f"%{termo}%"),
                    Usuario.email.ilike(f"%{termo}%"),
                    Usuario.matricula.ilike(f"%{termo}%"),
                )
            )

        # Ordem alfabética pelo nome (sem diferenciar maiúsculas nem acentos)
        query = query.order_by(func.lower(func.unaccent(Usuario.nome)), Usuario.id)

        pagination = query.paginate(page=page, per_page=per_page, error_out=False)

        lista_de_usuarios = []
        for u in pagination.items:
            user_dict = u.to_dict()
            user_dict["secretaria_nome"] = u.secretaria.nome if u.secretaria else "N/A"
            user_dict["secretaria"]      = u.secretaria.nome if u.secretaria else None
            user_dict["secretaria_id"]   = u.secretaria_id
            lista_de_usuarios.append(user_dict)

        print(f"[DEBUG] Retornando {len(lista_de_usuarios)} usuarios (total={pagination.total})")

        return jsonify({
            "usuarios":     lista_de_usuarios,
            "total_pages":  pagination.pages,
            "current_page": page,
            "total_items":  pagination.total,
        })
    except Exception as e:
        print(f"ERRO GERAL ao listar usuarios: {e}")
        traceback.print_exc()
        return jsonify({"erro": "Ocorreu um erro inesperado ao buscar os usuarios."}), 500


@usuarios_bp.route("", methods=["POST"])
@permission_required("criar_usuario")
def criar_usuario():
    dados = request.get_json()
    campos = ["nome", "email", "senha", "perfil", "matricula", "secretaria_id"]
    if not all(c in dados and dados[c] for c in campos):
        return jsonify({"erro": "Campos obrigatórios ausentes."}), 400

    # Valida o perfil informado
    perfis_validos = ['padrao', 'ativador', 'admin', 'aprovador']
    if dados["perfil"] not in perfis_validos:
        return jsonify({"erro": f"Perfil inválido. Perfis permitidos: {', '.join(perfis_validos)}"}), 400

    # Para perfil aprovador, nivel_aprovacao é obrigatório
    if dados["perfil"] == 'aprovador' and not dados.get("nivel_aprovacao"):
        return jsonify({"erro": "O campo 'nivel_aprovacao' é obrigatório para o perfil Aprovador."}), 400

    # Verifica se o e-mail ou matrícula já existem
    if Usuario.query.filter_by(email=dados["email"]).first():
        return jsonify({"erro": "Este e-mail já está em uso."}), 409
    if Usuario.query.filter_by(matricula=dados["matricula"]).first():
        return jsonify({"erro": "Esta matrícula já está em uso."}), 409

    novo_usuario = Usuario(
        nome=dados["nome"],
        email=dados["email"],
        matricula=dados["matricula"],
        perfil=dados["perfil"],
        secretaria_id=dados["secretaria_id"],
        nivel_aprovacao=dados.get("nivel_aprovacao") if dados["perfil"] == 'aprovador' else None,
    )
    novo_usuario.set_password(dados["senha"])
    db.session.add(novo_usuario)
    db.session.flush()

    registrar_log(
        acao="Criação de Usuário",
        usuario_id=current_user.id,
        entidade="Usuario",
        entidade_id=novo_usuario.id,
        detalhes=f"Usuário '{novo_usuario.nome}' (Email: {novo_usuario.email}) foi criado com perfil '{novo_usuario.perfil}'.",
    )
    db.session.commit()
    return jsonify(novo_usuario.to_dict()), 201


@usuarios_bp.route("/<int:id>", methods=["PUT"])
@permission_required("editar_usuario")
def atualizar_usuario(id):
    usuario = Usuario.query.get_or_404(id)
    dados = request.get_json()

    alteracoes = []
    if "nome" in dados and usuario.nome != dados["nome"]:
        alteracoes.append(f"Nome de '{usuario.nome}' para '{dados['nome']}'")
        usuario.nome = dados["nome"]
    if "email" in dados and usuario.email != dados["email"]:
        if Usuario.query.filter(
            Usuario.email == dados["email"], Usuario.id != id
        ).first():
            return (
                jsonify({"erro": "Este e-mail já está em uso por outro usuário."}),
                409,
            )
        alteracoes.append(f"E-mail de '{usuario.email}' para '{dados['email']}'")
        usuario.email = dados["email"]
    if "matricula" in dados and usuario.matricula != dados["matricula"]:
        if Usuario.query.filter(
            Usuario.matricula == dados["matricula"], Usuario.id != id
        ).first():
            return (
                jsonify({"erro": "Esta matrícula já está em uso por outro usuário."}),
                409,
            )
        alteracoes.append(
            f"Matrícula de '{usuario.matricula}' para '{dados['matricula']}'"
        )
        usuario.matricula = dados["matricula"]
    if "perfil" in dados and usuario.perfil != dados["perfil"]:
        # Valida o perfil
        perfis_validos = ['padrao', 'ativador', 'admin', 'aprovador']
        if dados["perfil"] not in perfis_validos:
            return jsonify({"erro": f"Perfil inválido. Perfis permitidos: {', '.join(perfis_validos)}"}), 400
        alteracoes.append(f"Perfil de '{usuario.perfil}' para '{dados['perfil']}'")
        usuario.perfil = dados["perfil"]
        # Se mudou para aprovador, nivel_aprovacao é obrigatório
        if dados["perfil"] == 'aprovador' and not dados.get("nivel_aprovacao") and not usuario.nivel_aprovacao:
            return jsonify({"erro": "O campo 'nivel_aprovacao' é obrigatório para o perfil Aprovador."}), 400
        # Se mudou de aprovador para outro perfil, limpar nivel_aprovacao
        if dados["perfil"] != 'aprovador':
            usuario.nivel_aprovacao = None
    if "nivel_aprovacao" in dados:
        novo_nivel = dados["nivel_aprovacao"]
        niveis_validos = ['vice_prefeito', 'prefeito', 'planejamento', None, '']
        if novo_nivel not in niveis_validos:
            return jsonify({"erro": "Nível de aprovação inválido. Use: vice_prefeito, prefeito ou planejamento."}), 400
        if usuario.nivel_aprovacao != novo_nivel:
            alteracoes.append(f"Nível de aprovação alterado para '{novo_nivel}'")
            usuario.nivel_aprovacao = novo_nivel if novo_nivel else None
    if "secretaria_id" in dados and usuario.secretaria_id != dados["secretaria_id"]:
        usuario.secretaria_id = dados["secretaria_id"]
        alteracoes.append(f"Secretaria alterada.")

    if alteracoes:
        registrar_log(
            acao="Edição de Usuário",
            usuario_id=current_user.id,
            entidade="Usuario",
            entidade_id=id,
            detalhes=f"Dados do usuário '{usuario.nome}' atualizados: {'; '.join(alteracoes)}.",
        )

    db.session.commit()
    return jsonify(usuario.to_dict())


# =====================================================================
# NOVA ROTA DE EXCLUSÃO DE USUÁRIO
# =====================================================================
@usuarios_bp.route("/<int:id>", methods=["DELETE"])
@permission_required("excluir_usuario") 
def excluir_usuario(id):
    # Regra de segurança: Impedir que o usuário exclua a si mesmo
    if id == current_user.id:
        return jsonify({"erro": "Você não pode excluir sua própria conta."}), 403

    usuario = Usuario.query.get_or_404(id)
    nome_excluido = usuario.nome
    email_excluido = usuario.email 

    try:
        db.session.delete(usuario)
        
        # O log é registrado ANTES do commit, mas com a entidade já deletada da sessão
        registrar_log(
            acao="Exclusão de Usuário",
            usuario_id=current_user.id,
            entidade="Usuario",
            entidade_id=id,
            detalhes=f"Usuário '{nome_excluido}' ({email_excluido}) foi excluído."
        )
        
        db.session.commit()
        return jsonify({"mensagem": "Usuário excluído com sucesso."}), 200

    except IntegrityError:
        db.session.rollback()
        return jsonify({
            "erro": "Não é possível excluir este usuário pois ele possui histórico ou registros vinculados no sistema. Recomenda-se inativá-lo."
        }), 409
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"erro": f"Ocorreu um erro interno: {str(e)}"}), 500
# =====================================================================


@usuarios_bp.route("/<int:id>/definir-senha", methods=["POST"])
@permission_required("alterar_senha_usuario")
def admin_define_senha(id):
    usuario = Usuario.query.get_or_404(id)
    dados = request.get_json()
    nova_senha = dados.get("nova_senha")

    if not nova_senha:
        return jsonify({"erro": "Nova senha não fornecida."}), 400

    usuario.set_password(nova_senha)
    registrar_log(
        acao="Redefinição de Senha",
        usuario_id=current_user.id,
        entidade="Usuario",
        entidade_id=id,
        detalhes=f"Senha do usuário '{usuario.nome}' foi redefinida pelo administrador '{current_user.nome}'.",
    )
    db.session.commit()
    return jsonify({"mensagem": "Senha do usuário alterada com sucesso."})


@usuarios_bp.route("/trocar-senha", methods=["PUT"])
@jwt_required()
def alterar_minha_senha():
    try:
        dados = request.get_json()
        senha_atual = dados.get("senha_atual")
        nova_senha = dados.get("nova_senha")

        if not senha_atual or not nova_senha:
            return jsonify({"erro": "Informe a senha atual e a nova senha."}), 400

        # O current_user já é o objeto do usuário logado graças ao @jwt_required
        if not current_user.check_password(senha_atual):
            return jsonify({"erro": "A senha atual informada está incorreta."}), 400

        current_user.set_password(nova_senha)

        registrar_log(
            acao="Alteração de Senha (Própria)",
            usuario_id=current_user.id,
            entidade="Usuario",
            entidade_id=current_user.id,
            detalhes=f"O usuário '{current_user.nome}' alterou a própria senha.",
        )

        db.session.commit()
        return jsonify({"mensagem": "Senha alterada com sucesso!"}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({"erro": f"Erro interno ao processar troca: {str(e)}"}), 500


@usuarios_bp.route("/me", methods=["GET"])
@jwt_required()
def get_me():
    """
    Rota unificada para obter dados do usuário autenticado.
    
    Retorna:
        - id: ID do usuário
        - nome: Nome do usuário
        - email: Email do usuário
        - perfil: Perfil do usuário (padrao, ativador, admin, aprovador)
        - nivel_aprovacao: Nível de aprovação (se for aprovador)
        - secretaria_id: ID da secretaria
        - secretaria_nome: Nome da secretaria
        - permissoes: Dicionário de permissões {recurso: permitido}
    """
    try:
        # Buscar foto do funcionário vinculado ao usuário (via matrícula)
        foto_usuario = None
        if hasattr(current_user, 'foto') and current_user.foto:
            foto_usuario = current_user.foto
        else:
            # Tentar buscar foto do funcionário com a mesma matrícula
            from models import Funcionario
            funcionario = Funcionario.query.filter_by(matricula=current_user.matricula).first()
            if funcionario and hasattr(funcionario, 'foto') and funcionario.foto:
                foto_usuario = funcionario.foto
        
        # Construir dicionário de permissões (recurso: permitido)
        permissoes_dict = {
            p.recurso: p.permitido for p in current_user.get_permissoes()
        }
        
        return jsonify(
            {
                "id": current_user.id,
                "nome": current_user.nome,
                "email": current_user.email,
                "perfil": current_user.perfil,
                "nivel_aprovacao": current_user.nivel_aprovacao,
                "secretaria": (
                    current_user.secretaria.nome if current_user.secretaria else None
                ),
                "secretaria_nome": (
                    current_user.secretaria.nome if current_user.secretaria else None
                ),
                "secretaria_id": current_user.secretaria_id,
                "foto": foto_usuario,
                "permissoes": permissoes_dict,
                "pode_ver_indicacao": pode_ver_indicacao(current_user),
            }
        )
    except Exception as e:
        print(f"ERRO ao obter dados do usuário: {e}")
        traceback.print_exc()
        return jsonify({"erro": f"Erro ao obter dados do usuário: {str(e)}"}), 500


@usuarios_bp.route("/me/last-status-save", methods=["GET"])
@jwt_required()
def get_last_save():
    """Retorna a data do último salvamento de status e os dias para alerta."""
    try:
        dias_alerta_config = Configuracao.query.filter_by(
            chave="dias_alerta_status"
        ).first()
        dias_alerta = int(dias_alerta_config.valor) if dias_alerta_config else 30

        ultima_confirmacao = (
            db.session.query(func.max(ConfirmacaoStatus.data_confirmacao))
            .filter(ConfirmacaoStatus.usuario_id == current_user.id)
            .scalar()
        )

        if not ultima_confirmacao:
            return jsonify({"last_save_date": None, "dias_alerta": dias_alerta})

        # Use naive UTC datetimes for comparison to avoid timezone errors
        dias_desde_confirmacao = (datetime.utcnow() - ultima_confirmacao).days
        return jsonify(
            {
                "last_save_date": ultima_confirmacao.replace(tzinfo=timezone.utc)
                .astimezone(SAO_PAULO_TZ)
                .strftime("%d/%m/%Y às %H:%M"),
                "dias_desde_confirmacao": dias_desde_confirmacao,
                "dias_alerta": dias_alerta,
            }
        )
    except Exception as e:
        return jsonify({"erro": str(e)}), 500

@usuarios_bp.route("/me/foto", methods=["POST"])
@jwt_required()
def upload_foto_usuario():
    """Faz upload da foto do usuário logado."""
    from flask import current_app
    from werkzeug.utils import secure_filename
    from services.image_service import create_thumbnail
    import os
    
    if 'foto' not in request.files:
        return jsonify({"erro": "Nenhuma imagem enviada."}), 400

    file = request.files['foto']

    if file.filename == '':
        return jsonify({"erro": "Nenhuma imagem selecionada."}), 400

    if file:
        try:
            # Define o diretório de upload
            upload_folder = os.path.join(current_app.root_path, 'uploads')
            os.makedirs(upload_folder, exist_ok=True)

            # Gera um nome seguro para o arquivo
            filename = secure_filename(f"user_{current_user.id}_{file.filename}")
            filepath = os.path.join(upload_folder, filename)

            # Salva o arquivo
            file.save(filepath)

            # Criar thumbnail
            thumb_filename = f"{os.path.splitext(filename)[0]}_thumb.png"
            thumb_path = os.path.join(upload_folder, thumb_filename)
            create_thumbnail(filepath, thumb_path)

            # Atualiza o caminho da foto no banco de dados
            current_user.foto = f"/uploads/{filename}"

            registrar_log(
                acao="Alteração de Foto de Perfil",
                usuario_id=current_user.id,
                entidade="Usuario",
                entidade_id=current_user.id,
                detalhes=f"Foto de perfil do usuário '{current_user.nome}' foi atualizada."
            )

            db.session.commit()
            return jsonify({
                "mensagem": "Foto enviada com sucesso.",
                "foto": current_user.foto
            }), 200

        except Exception as e:
            db.session.rollback()
            return jsonify({"erro": f"Erro ao fazer upload da foto: {str(e)}"}), 500
    
    return jsonify({"erro": "Erro desconhecido ao processar a imagem."}), 500


# ---------------------------------------------------------------------------
# Menu pessoal: telas favoritadas (fixadas) no Início, por usuário
# A tabela é criada sozinha na primeira chamada (não precisa de migração).
# ---------------------------------------------------------------------------
import json as _json
from sqlalchemy import text as _text

_TABELA_MENU_OK = False
_PAGINAS_VALIDAS = {
    "dashboard.html", "funcionarios.html", "funcionarios_inativos.html", "transferencias.html",
    "contratacoes.html", "aprovacoes.html", "secretarias.html", "empresas.html",
    "usuarios.html", "relatorios.html", "importar_funcionarios.html",
}


def _garantir_tabela_menu():
    global _TABELA_MENU_OK
    if _TABELA_MENU_OK:
        return
    db.session.execute(_text(
        "CREATE TABLE IF NOT EXISTS preferencias_menu ("
        " usuario_id INTEGER PRIMARY KEY,"
        " dados TEXT NOT NULL,"
        " atualizado_em TIMESTAMP)"
    ))
    db.session.commit()
    _TABELA_MENU_OK = True


def _limpar_lista(valor):
    if not isinstance(valor, list):
        return []
    vistos, saida = set(), []
    for v in valor:
        if isinstance(v, str) and v in _PAGINAS_VALIDAS and v not in vistos:
            vistos.add(v)
            saida.append(v)
    return saida[:30]


@usuarios_bp.route("/menu-pessoal", methods=["GET"])
@jwt_required()
def get_menu_pessoal():
    try:
        _garantir_tabela_menu()
        linha = db.session.execute(
            _text("SELECT dados FROM preferencias_menu WHERE usuario_id = :u"), {"u": current_user.id}
        ).first()
        dados = _json.loads(linha[0]) if linha else {}
        return jsonify({"favoritos": _limpar_lista(dados.get("favoritos")), "ordem": _limpar_lista(dados.get("ordem"))})
    except Exception as e:
        db.session.rollback()
        return jsonify({"erro": f"Erro ao ler o menu pessoal: {e}"}), 500


@usuarios_bp.route("/menu-pessoal", methods=["PUT"])
@jwt_required()
def put_menu_pessoal():
    try:
        _garantir_tabela_menu()
        corpo = request.get_json(silent=True) or {}
        dados = {"favoritos": _limpar_lista(corpo.get("favoritos")), "ordem": _limpar_lista(corpo.get("ordem"))}
        params = {"u": current_user.id, "d": _json.dumps(dados), "t": datetime.now(SAO_PAULO_TZ).replace(tzinfo=None)}
        atualizou = db.session.execute(
            _text("UPDATE preferencias_menu SET dados = :d, atualizado_em = :t WHERE usuario_id = :u"), params
        ).rowcount
        if not atualizou:
            db.session.execute(
                _text("INSERT INTO preferencias_menu (usuario_id, dados, atualizado_em) VALUES (:u, :d, :t)"), params
            )
        db.session.commit()
        return jsonify(dados)
    except Exception as e:
        db.session.rollback()
        return jsonify({"erro": f"Erro ao salvar o menu pessoal: {e}"}), 500
