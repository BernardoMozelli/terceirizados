from flask import Blueprint, jsonify, request, current_app
from extensions import db
from flask_jwt_extended import jwt_required, current_user
from models import Configuracao, Usuario, Funcionario, ConfirmacaoStatus
from sqlalchemy.orm import joinedload
from sqlalchemy import func
from datetime import datetime, timedelta
from services.log_service import registrar_log
from services.email_service import send_email

cron_bp = Blueprint("cron", __name__)

def _enviar_emails_notificacao():
    """
    Verifica usuários com confirmação de status pendente e envia e-mails de alerta.
    A desativação automática foi removida por segurança, mantendo apenas o aviso.
    """
    config_alerta = Configuracao.query.filter_by(chave="dias_alerta_status").first()
    dias_alerta = int(config_alerta.valor) if config_alerta else 30
    limite_amarelo = dias_alerta * 0.75
    
    config_desativacao = Configuracao.query.filter_by(chave="dias_desativacao_automatica").first()
    dias_desativacao = int(config_desativacao.valor) if config_desativacao else 45

    # Subquery para a última confirmação de cada usuário
    subquery = (
        db.session.query(
            ConfirmacaoStatus.usuario_id,
            func.max(ConfirmacaoStatus.data_confirmacao).label("last_confirmation"),
        )
        .group_by(ConfirmacaoStatus.usuario_id)
        .subquery()
    )

    base_date_col = func.coalesce(
        subquery.c.last_confirmation, Usuario.data_criacao
    ).label("base_date")

    usuarios_para_notificar = (
        db.session.query(Usuario, base_date_col)
        .outerjoin(subquery, Usuario.id == subquery.c.usuario_id)
        .filter(Usuario.perfil == "padrao")
        .all()
    )

    emails_enviados = 0
    now_utc = datetime.utcnow()
    sender = current_app.config.get("MAIL_DEFAULT_SENDER")

    if not sender:
        current_app.logger.warning("MAIL_DEFAULT_SENDER não configurado.")
        return "E-mails não configurados."

    for usuario, data_base in usuarios_para_notificar:
        if not usuario.secretaria:
            continue

        dias_desde = (now_utc - data_base).days
        subject = None
        body = None

        # Alerta Crítico (Onde antes desativava, agora apenas avisa com insistência)
        if dias_desde >= dias_desativacao:
            subject = "CRÍTICO: Confirmação de funcionários pendente - Risco de Suspensão"
            body = f"""Olá {usuario.nome},

O prazo de {dias_desativacao} dias para confirmação dos funcionários da secretaria {usuario.secretaria.nome} expirou há {dias_desde - dias_desativacao} dias.

Embora a desativação automática esteja suspensa, a regularização manual é obrigatória para manter a conformidade do sistema. Por favor, acesse o painel e salve os status imediatamente.

Atenciosamente,
Gestão de Terceiros
"""
        elif dias_desde >= dias_alerta:
            # Alerta Vermelho
            subject = "URGENTE: Prazo para confirmação de status expirado"
            body = f"""Olá {usuario.nome},

O prazo de {dias_alerta} dias para a confirmação de status da secretaria {usuario.secretaria.nome} expirou.
Por favor, acesse o sistema e salve os status para evitar notificações críticas.

Atenciosamente,
Gestão de Terceiros
"""
        elif dias_desde >= limite_amarelo:
            # Alerta Amarelo
            dias_restantes = dias_alerta - dias_desde
            subject = "AVISO: Prazo para confirmação de status expirando"
            body = f"""Olá {usuario.nome},

Lembrete: faltam {max(0, dias_restantes)} dia(s) para o fim do prazo de confirmação de funcionários da secretaria {usuario.secretaria.nome}.

Atenciosamente,
Gestão de Terceiros
"""

        if subject and body:
            try:
                send_email(subject, sender, [usuario.email], body)
                emails_enviados += 1
            except Exception as e:
                current_app.logger.error(f"Erro ao enviar e-mail para {usuario.email}: {e}")

    return f"{emails_enviados} e-mails de notificação enviados."


@cron_bp.route("/run-daily-tasks", methods=["POST"])
def run_daily_tasks():
    if request.headers.get("X-Cron-Secret") != current_app.config.get("CRON_SECRET_KEY"):
        return jsonify({"erro": "Acesso não autorizado"}), 403

    try:
        # A desativação automática foi removida para evitar bloqueios indevidos no AD.
        # Agora o sistema apenas notifica os responsáveis.
        emails_msg = _enviar_emails_notificacao()

        db.session.commit()
        return jsonify({
            "desativacao": "Função desativada permanentemente por segurança (Regra de Negócio).",
            "notificacoes_email": emails_msg
        })
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Erro na execução das tarefas diárias (CRON): {e}")
        return jsonify({"erro": "Ocorreu um erro interno."}), 500


@cron_bp.route("/test-email", methods=["POST"])
@jwt_required()
def test_email_sending():
    if current_user.perfil != "admin":
        return jsonify({"erro": "Acesso não autorizado"}), 403

    recipient = request.json.get("email")
    if not recipient:
        return jsonify({"erro": "E-mail do destinatário não fornecido."}), 400

    sender = current_app.config.get("MAIL_DEFAULT_SENDER")
    subject = "E-mail de Teste - Sistema PMSL Terceiros"
    body = "Teste de configuração de e-mail OK."

    try:
        send_email(subject, sender, [recipient], body)
        return jsonify({"mensagem": f"E-mail de teste enviado para {recipient}."})
    except Exception as e:
        return jsonify({"erro": f"Falha ao enviar e-mail: {str(e)}"}), 500