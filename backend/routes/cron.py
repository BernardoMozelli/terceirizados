from flask import Blueprint, jsonify, request, current_app
from flask_jwt_extended import jwt_required, current_user
from services.email_service import send_email

# Blueprint para tarefas agendadas e utilitários de sistema
cron_bp = Blueprint("cron", __name__)

@cron_bp.route("/run-daily-tasks", methods=["POST"])
def run_daily_tasks():
    """
    Executa tarefas diárias de manutenção.
    
    NOTA: As regras de inativação automática de utilizadores e notificações 
    baseadas no 'Salvar Status' foram removidas permanentemente em 23/03/2026.
    A gestão agora é realizada individualmente através do Super Modal de Funcionários.
    """
    # Validação de segurança para chamadas externas (ex: PythonAnywhere ou Crontab)
    if request.headers.get("X-Cron-Secret") != current_app.config.get("CRON_SECRET_KEY"):
        return jsonify({"erro": "Acesso não autorizado"}), 403

    try:
        # Futuras tarefas automáticas (como limpeza de ficheiros temporários) 
        # podem ser adicionadas aqui.
        
        current_app.logger.info("Tarefas diárias executadas: Nenhuma ação pendente (Regras de status removidas).")
        
        return jsonify({
            "status": "sucesso",
            "mensagem": "Tarefas diárias processadas. Regras de inativação automática estão desativadas.",
            "data_execucao": str(request.date)
        })
    except Exception as e:
        current_app.logger.error(f"Erro na execução das tarefas diárias (CRON): {e}")
        return jsonify({"erro": "Ocorreu um erro interno ao processar tarefas diárias."}), 500


@cron_bp.route("/test-email", methods=["POST"])
@jwt_required()
def test_email_sending():
    """
    Rota utilitária para testar se o servidor de e-mail (SMTP) está configurado corretamente.
    Apenas acessível por Administradores.
    """
    if current_user.perfil != "admin":
        return jsonify({"erro": "Acesso não autorizado. Apenas administradores podem testar o envio de e-mail."}), 403

    dados = request.get_json()
    recipient = dados.get("email")
    
    if not recipient:
        return jsonify({"erro": "E-mail do destinatário não fornecido."}), 400

    sender = current_app.config.get("MAIL_DEFAULT_SENDER")
    subject = "E-mail de Teste - Sistema PMSL Terceiros"
    body = f"""
    Olá,
    
    Este é um e-mail de teste enviado pelo Sistema de Gestão de Terceiros (PMSL).
    Se recebeu esta mensagem, as configurações de SMTP estão a funcionar corretamente.
    
    Data/Hora do teste: {request.date}
    """

    try:
        send_email(subject, sender, [recipient], body)
        return jsonify({"mensagem": f"E-mail de teste enviado com sucesso para {recipient}."})
    except Exception as e:
        current_app.logger.error(f"Falha no teste de e-mail: {str(e)}")
        return jsonify({"erro": f"Falha ao enviar e-mail: {str(e)}"}), 500