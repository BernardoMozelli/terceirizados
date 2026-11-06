from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, current_user
from extensions import db
from models import Configuracao, Permissao
from services.log_service import registrar_log
from .usuarios import permission_required

configuracoes_bp = Blueprint("configuracoes", __name__)


@configuracoes_bp.route("", methods=["GET"])
@permission_required("acessar_configuracoes")
def get_configuracoes():
    configs = Configuracao.query.all()
    perms = Permissao.query.order_by(Permissao.recurso, Permissao.perfil).all()

    config_dict = {c.chave: c.valor for c in configs}

    permissoes_dict = {}
    for p in perms:
        if p.recurso not in permissoes_dict:
            permissoes_dict[p.recurso] = {}
        permissoes_dict[p.recurso][p.perfil] = p.permitido

    return jsonify({"configuracoes": config_dict, "permissoes": permissoes_dict})


@configuracoes_bp.route("", methods=["PUT"])
@permission_required("acessar_configuracoes")
def update_configuracoes():
    dados = request.get_json()

    alteracoes_config = []
    if "configuracoes" in dados:
        for chave, valor in dados["configuracoes"].items():
            config = Configuracao.query.filter_by(chave=chave).first()
            if config:
                if config.valor != str(valor):
                    alteracoes_config.append(
                        f"Config '{chave}': de '{config.valor}' para '{valor}'"
                    )
                config.valor = str(valor)

    alteracoes_perm = []
    if "permissoes" in dados:
        for recurso, perfis in dados["permissoes"].items():
            for perfil, permitido in perfis.items():
                if perfil in ["padrao", "admin"]:
                    perm = Permissao.query.filter_by(
                        recurso=recurso, perfil=perfil
                    ).first()
                    if perm:
                        permitido_bool = bool(permitido)
                        if perm.permitido != permitido_bool:
                            status_antigo = "Ativo" if perm.permitido else "Inativo"
                            status_novo = "Ativo" if permitido_bool else "Inativo"
                            alteracoes_perm.append(
                                f"Permissão '{recurso}' para perfil '{perfil}': de {status_antigo} para {status_novo}"
                            )
                            perm.permitido = permitido_bool

    if alteracoes_config or alteracoes_perm:
        detalhes_log = []
        if alteracoes_config:
            detalhes_log.append("Configurações Gerais: " + "; ".join(alteracoes_config))
        if alteracoes_perm:
            detalhes_log.append("Permissões: " + "; ".join(alteracoes_perm))

        registrar_log(
            acao="Atualização de Configurações do Sistema",
            usuario_id=current_user.id,
            detalhes=". ".join(detalhes_log),
        )

    db.session.commit()
    return jsonify({"mensagem": "Configurações atualizadas com sucesso."})
