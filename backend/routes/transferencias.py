from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, current_user
from extensions import db
from models import (
    TransferenciaFuncionario,
    Funcionario,
    Secretaria,
    Usuario,
    Configuracao,
    ConfirmacaoStatus,
)
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from services.log_service import registrar_log
from sqlalchemy import func

transferencias_bp = Blueprint("transferencias", __name__)

SAO_PAULO_TZ = ZoneInfo("America/Sao_Paulo")


# Rota para iniciar uma transferência
@transferencias_bp.route("", methods=["POST"])
@jwt_required()
def solicitar_transferencia():
    # Apenas ativador e admin podem criar transferências
    if current_user.perfil not in ('admin', 'aprovador', 'ativador'):
        return jsonify({
            "erro": "Acesso negado. Seu usuário não possui permissão para solicitar transferências.",
            "perfil_usuario": current_user.perfil
        }), 403

    dados = request.get_json()
    funcionario_id = dados.get("funcionario_id")
    secretaria_destino_id = dados.get("secretaria_destino_id")
    justificativa = dados.get("justificativa")

    if not funcionario_id or not secretaria_destino_id:
        return (
            jsonify(
                {"erro": "ID do funcionário e secretaria de destino são obrigatórios."}
            ),
            400,
        )

    funcionario = db.session.get(Funcionario, funcionario_id)
    if not funcionario:
        return jsonify({"erro": "Funcionário não encontrado."}), 404

    secretaria_destino = db.session.get(Secretaria, secretaria_destino_id)
    if not secretaria_destino:
        return jsonify({"erro": "Secretaria de destino não encontrada."}), 404

    if (
        current_user.perfil not in ["admin", "aprovador"]
        and funcionario.secretaria_id != current_user.secretaria_id
    ):
        return (
            jsonify(
                {"erro": "Você só pode transferir funcionários da sua secretaria."}
            ),
            403,
        )

    if int(funcionario.secretaria_id) == int(secretaria_destino_id):
        return (
            jsonify(
                {"erro": "A secretaria de destino não pode ser a mesma de origem."}
            ),
            400,
        )

    # Verifica se já existe uma transferência pendente para este funcionário
    pendente_existente = TransferenciaFuncionario.query.filter_by(
        funcionario_id=funcionario_id, status="pendente"
    ).first()
    if pendente_existente:
        return (
            jsonify({"erro": "Este funcionário já possui uma transferência pendente."}),
            409,
        )

    nova_transferencia = TransferenciaFuncionario(
        funcionario_id=funcionario_id,
        secretaria_origem_id=funcionario.secretaria_id,
        secretaria_destino_id=secretaria_destino_id,
        usuario_solicitante_id=current_user.id,
        status="pendente",
        justificativa=justificativa,
    )

    db.session.add(nova_transferencia)

    # Garante que as secretarias sejam carregadas para o log
    secretaria_origem_nome = (
        funcionario.secretaria.nome if funcionario.secretaria else "Desconhecida"
    )

    registrar_log(
        acao="Solicitação de Transferência",
        usuario_id=current_user.id,
        entidade="Funcionario",
        entidade_id=funcionario.id,
        detalhes=f"Transferência do funcionário '{funcionario.nome}' da secretaria '{secretaria_origem_nome}' para '{secretaria_destino.nome}'.",
    )
    db.session.commit()

    return (
        jsonify({"mensagem": "Solicitação de transferência enviada com sucesso."}),
        201,
    )


# Rota para listar transferências (pendentes para aprovação e solicitadas)
@transferencias_bp.route("/pendentes", methods=["GET"])
@jwt_required()
def listar_transferencias_pendentes():
    # Admin e padrão veem todas as transferências pendentes
    if current_user.perfil in ("admin", "padrao"):
        aguardando_aprovacao = TransferenciaFuncionario.query.filter_by(status="pendente").all()
        solicitadas_por_mim = TransferenciaFuncionario.query.filter_by(
            usuario_solicitante_id=current_user.id, status="pendente"
        ).all()
    else:
        # Demais perfis veem apenas as transferências em que sua secretaria é origem ou destino
        aguardando_aprovacao = TransferenciaFuncionario.query.filter(
            TransferenciaFuncionario.status == "pendente",
            (TransferenciaFuncionario.secretaria_destino_id == current_user.secretaria_id) |
            (TransferenciaFuncionario.secretaria_origem_id == current_user.secretaria_id)
        ).all()

        solicitadas_por_mim = TransferenciaFuncionario.query.filter_by(
            usuario_solicitante_id=current_user.id, status="pendente"
        ).all()

    return jsonify(
        {
            "aguardando_aprovacao": [
                {
                    "id": t.id,
                    "funcionario_nome": t.funcionario.nome,
                    "funcionario_matricula": t.funcionario.matricula,
                    "secretaria_origem_nome": t.secretaria_origem.nome,
                    "secretaria_destino_nome": t.secretaria_destino.nome,
                    "solicitante_nome": t.usuario_solicitante.nome,
                    "justificativa": t.justificativa,
                    "data_solicitacao": t.data_solicitacao.replace(tzinfo=timezone.utc)
                    .astimezone(SAO_PAULO_TZ)
                    .strftime("%d/%m/%Y %H:%M"),
                }
                for t in aguardando_aprovacao
            ],
            "solicitadas_por_mim": [
                {
                    "id": t.id,
                    "funcionario_nome": t.funcionario.nome,
                    "funcionario_matricula": t.funcionario.matricula,
                    "secretaria_destino_nome": t.secretaria_destino.nome,
                    "data_solicitacao": t.data_solicitacao.replace(tzinfo=timezone.utc)
                    .astimezone(SAO_PAULO_TZ)
                    .strftime("%d/%m/%Y %H:%M"),
                    "justificativa": t.justificativa,
                }
                for t in solicitadas_por_mim
            ],
        }
    )


# Rota para contar notificações
@transferencias_bp.route("/notificacoes", methods=["GET"])
@jwt_required()
def contar_notificacoes():
    query = db.session.query(func.count(TransferenciaFuncionario.id)).filter(
        TransferenciaFuncionario.status == "pendente"
    )

    # Admin e padrão veem todas; demais perfis veem apenas as da sua secretaria (origem ou destino)
    if current_user.perfil not in ("admin", "padrao"):
        query = query.filter(
            (TransferenciaFuncionario.secretaria_destino_id == current_user.secretaria_id) |
            (TransferenciaFuncionario.secretaria_origem_id == current_user.secretaria_id)
        )

    count = query.scalar()

    alerta_status = None
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

        if ultima_confirmacao:
            dias_desde_confirmacao = (datetime.utcnow() - ultima_confirmacao).days
            if dias_desde_confirmacao >= dias_alerta:
                alerta_status = f"Atenção: faz {dias_desde_confirmacao} dias que os status não são salvos!"
    except Exception as e:
        print(f"Erro ao verificar prazo de status: {e}")

    return jsonify({"count": count, "alerta_status": alerta_status})


# Rota para listar o histórico de transferências (não pendentes)
@transferencias_bp.route("/historico", methods=["GET"])
@jwt_required()
def listar_historico_transferencias():
    query_historico = TransferenciaFuncionario.query.filter(
        TransferenciaFuncionario.status != "pendente"
    )

    # Admin e padrão veem todo o histórico
    # Demais perfis veem apenas as transferências em que sua secretaria é origem ou destino
    if current_user.perfil not in ("admin", "padrao"):
        query_historico = query_historico.filter(
            (TransferenciaFuncionario.secretaria_origem_id == current_user.secretaria_id) |
            (TransferenciaFuncionario.secretaria_destino_id == current_user.secretaria_id)
        )

    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 15, type=int)

    pagination = query_historico.order_by(TransferenciaFuncionario.data_acao.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )
    historico = pagination.items

    return jsonify(
        {
            "historico": [
                {
                    "funcionario_nome": t.funcionario.nome,
                    "funcionario_matricula": t.funcionario.matricula,
                    "secretaria_origem_nome": t.secretaria_origem.nome,
                    "secretaria_destino_nome": t.secretaria_destino.nome,
                    "status": t.status.capitalize(),
                    "data_acao": (
                        t.data_acao.replace(tzinfo=timezone.utc)
                        .astimezone(SAO_PAULO_TZ)
                        .strftime("%d/%m/%Y %H:%M")
                        if t.data_acao
                        else "N/A"
                    ),
                    "motivo_rejeicao": t.motivo_rejeicao,
                    "justificativa": t.justificativa,
                }
                for t in historico
            ],
            "total_pages": pagination.pages,
            "current_page": page,
            "total_items": pagination.total
        }
    )


# Rota para aprovar uma transferência
@transferencias_bp.route("/<int:id>/aprovar", methods=["POST"])
@jwt_required()
def aprovar_transferencia(id):
    transferencia = TransferenciaFuncionario.query.get_or_404(id)

    if (
        current_user.perfil != "admin"
        and transferencia.secretaria_destino_id != current_user.secretaria_id
    ):
        return jsonify({"erro": "Ação não permitida."}), 403

    if transferencia.status != "pendente":
        return jsonify({"erro": "Esta transferência não está mais pendente."}), 400

    # Atualiza o funcionário
    funcionario = Funcionario.query.get(transferencia.funcionario_id)
    funcionario.secretaria_id = transferencia.secretaria_destino_id

    # Atualiza a transferência
    transferencia.status = "aprovada"
    transferencia.usuario_aprovador_id = current_user.id
    transferencia.data_acao = datetime.utcnow()

    registrar_log(
        acao="Aprovação de Transferência",
        usuario_id=current_user.id,
        entidade="Funcionario",
        entidade_id=funcionario.id,
        detalhes=f"Transferência do funcionário '{funcionario.nome}' para a secretaria '{funcionario.secretaria.nome}' foi aprovada.",
    )
    db.session.commit()
    return jsonify({"mensagem": "Transferência aprovada com sucesso."})


# Rota para rejeitar uma transferência
@transferencias_bp.route("/<int:id>/rejeitar", methods=["POST"])
@jwt_required()
def rejeitar_transferencia(id):
    transferencia = TransferenciaFuncionario.query.get_or_404(id)
    dados = request.get_json()
    motivo = dados.get("motivo", "Sem motivo especificado.")

    if (
        current_user.perfil not in ("admin", "aprovador")
        and transferencia.secretaria_destino_id != current_user.secretaria_id
    ):
        return jsonify({"erro": "Ação não permitida."}), 403

    if transferencia.status != "pendente":
        return jsonify({"erro": "Esta transferência não está mais pendente."}), 400

    transferencia.status = "rejeitada"
    transferencia.usuario_aprovador_id = current_user.id
    transferencia.data_acao = datetime.utcnow()
    transferencia.motivo_rejeicao = motivo

    registrar_log(
        acao="Rejeição de Transferência",
        usuario_id=current_user.id,
        entidade="Funcionario",
        entidade_id=transferencia.funcionario_id,
        detalhes=f"Transferência do funcionário '{transferencia.funcionario.nome}' foi rejeitada. Motivo: {motivo}",
    )
    db.session.commit()
    return jsonify({"mensagem": "Transferência rejeitada."})


# Rota para cancelar uma transferência solicitada
@transferencias_bp.route("/<int:id>/cancelar", methods=["POST"])
@jwt_required()
def cancelar_transferencia(id):
    transferencia = TransferenciaFuncionario.query.get_or_404(id)

    if transferencia.usuario_solicitante_id != current_user.id:
        return (
            jsonify(
                {"erro": "Ação não permitida. Você não solicitou esta transferência."}
            ),
            403,
        )

    if transferencia.status != "pendente":
        return jsonify({"erro": "Esta transferência não pode mais ser cancelada."}), 400

    transferencia.status = "cancelada"
    transferencia.data_acao = datetime.utcnow()

    registrar_log(
        acao="Cancelamento de Transferência",
        usuario_id=current_user.id,
        entidade="Funcionario",
        entidade_id=transferencia.funcionario_id,
        detalhes=f"Solicitação de transferência para o funcionário '{transferencia.funcionario.nome}' foi cancelada pelo solicitante.",
    )
    db.session.commit()
    return jsonify({"mensagem": "Solicitação de transferência cancelada."})