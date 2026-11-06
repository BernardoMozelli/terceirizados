from flask_mail import Message
from extensions import mail
from flask import current_app
from threading import Thread


def _send_async_email(app, msg):
    """Função auxiliar para envio assíncrono em uma thread."""
    with app.app_context():
        try:
            mail.send(msg)
        except Exception as e:
            app.logger.error(f"Falha ao enviar e-mail para {msg.recipients}: {e}")


def send_email(subject, sender, recipients, text_body):
    """Cria e despacha uma thread para enviar um e-mail sem bloquear a execução."""
    app = current_app._get_current_object()
    msg = Message(subject, sender=sender, recipients=recipients, body=text_body)
    Thread(target=_send_async_email, args=(app, msg)).start()
