import logging
import traceback
from datetime import datetime, timezone
from flask import request, has_request_context
from extensions import db
from models import LogAtividade

logger = logging.getLogger(__name__)

def registrar_log(acao, usuario_id=None, entidade=None, entidade_id=None, detalhes=None):
    ip_origem = "Sistema"
    if has_request_context() and request.remote_addr:
        ip_origem = request.remote_addr

    try:
        # Tratamento rigoroso para os limites do PostgreSQL definidos no models.py
        # Se ultrapassar 1 char, o Postgres gera DataError e aborta o commit.
        
        texto_acao = str(acao)[:100] if acao else "Ação não especificada"
        texto_entidade = str(entidade)[:100] if entidade else None
        texto_ip = str(ip_origem)[:255]

        # Tratamento de FK e IDs numéricos
        u_id = int(usuario_id) if usuario_id else None
        e_id = int(entidade_id) if entidade_id else None

        log = LogAtividade(
            usuario_id=u_id,
            acao=texto_acao,
            entidade=texto_entidade,
            entidade_id=e_id,
            detalhes=str(detalhes) if detalhes else None,
            ip_origem=texto_ip,
            data_hora=datetime.now(timezone.utc)
        )
        
        db.session.add(log)
        db.session.commit()
        print(f">>> [LOG POSTGRES SUCESSO] {texto_acao} <<<")
        
    except Exception as e:
        db.session.rollback()
        print(f"\n>>> [ERRO CRÍTICO LOG POSTGRES] Falha ao gravar: {str(e)} <<<")
        traceback.print_exc()
        logger.error(f"Erro ao salvar log no Postgres: {str(e)}")