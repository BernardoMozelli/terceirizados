import os
import re
import logging
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, current_user
from models import ConfirmacaoStatus, Usuario, Funcionario, Candidato, AprovacaoCandidato
from extensions import db
from services.log_service import registrar_log
from services.ad_service import ADService

# Configuração de Logs
logger = logging.getLogger(__name__)

confirmacoes_bp = Blueprint("confirmacoes_status", __name__)

# Inicialização do serviço AD
# Os valores são puxados do arquivo .env ou do docker-compose.yml
ad_service = ADService(
    server_uri=os.getenv('AD_SERVER'),
    admin_user=os.getenv('AD_USER'),
    admin_pass=os.getenv('AD_PASS'),
    base_dn=os.getenv('AD_BASE_DN')
)

def limpar_cpf_para_ad(cpf):
    """Garante que o CPF enviado ao AD contenha apenas números."""
    if not cpf:
        return None
    return "".join(filter(str.isdigit, str(cpf)))

@confirmacoes_bp.route("/confirmar_status", methods=["POST"])
@jwt_required()
def confirmar_status():
    # Apenas ativador, admin e aprovador podem salvar status (que inclui desligar funcionários)
    perfil_atual = current_user.perfil if current_user else ''
    if perfil_atual not in ('admin', 'ativador', 'aprovador'):
        return jsonify({
            "erro": "Acesso negado. Apenas Ativadores, Administradores e Aprovadores podem salvar o status de funcionários.",
            "perfil_usuario": perfil_atual
        }), 403

    try:
        raw_data = request.get_json()

        # --- AJUSTE DE COMPATIBILIDADE ---
        # Se o frontend enviar apenas um objeto {...}, transformamos em lista [{...}]
        if isinstance(raw_data, list):
            data = raw_data
        else:
            data = [raw_data]

        if not data:
            return jsonify({"erro": "Nenhum dado enviado para processamento"}), 400
    except Exception as e:
        logger.error(f"[CONFIRMAÇÃO] Erro ao processar JSON: {str(e)}")
        return jsonify({"erro": f"Erro ao processar dados: {str(e)}"}), 400

    updates_count = 0
    ad_deactivations_count = 0
    ad_activations_count = 0
    ad_errors = [] # Armazena erros para o alerta na tela
    nomes_atualizados = [] # Lista para armazenar os nomes para o LOG

    user_id = current_user.id
    # Importante: AD_ENABLED precisa ser "True" no .env
    ad_enabled = os.getenv('AD_ENABLED') == 'True'
    
    logger.info(f"[CONFIRMAÇÃO] Iniciando processamento. AD_ENABLED: {ad_enabled}")

    # Coleta IDs de funcionários enviados na requisição
    funcionario_ids = []
    for item in data:
        f_id = item.get("funcionario_id")
        if f_id:
            funcionario_ids.append(int(f_id))

    if not funcionario_ids:
        logger.error("[CONFIRMAÇÃO] Erro: Nenhum funcionario_id válido recebido no JSON.")
        return jsonify({"erro": "ID do funcionário não identificado"}), 400

    # Busca em lote no banco de dados para evitar múltiplas queries
    funcionarios_map = {
        f.id: f for f in Funcionario.query.filter(Funcionario.id.in_(funcionario_ids)).all()
    }

    for item in data:
        funcionario_id = item.get("funcionario_id")
        status_confirmado = item.get("status_confirmado")

        if funcionario_id is None or status_confirmado is None:
            continue 

        funcionario = funcionarios_map.get(int(funcionario_id))
        
        if funcionario:
            # 1. INTEGRAÇÃO COM ACTIVE DIRECTORY (Windows Server)
            if ad_enabled:
                cpf_limpo = limpar_cpf_para_ad(funcionario.cpf)
                
                # A. Inativação (Status 0)
                if str(status_confirmado) == "0":
                    logger.info(f"AD: Tentando inativar {funcionario.nome} (CPF: {cpf_limpo})")
                    if ad_service.desativar_usuario(cpf=cpf_limpo, matricula=funcionario.matricula):
                        ad_deactivations_count += 1
                        logger.info(f"AD: {funcionario.nome} inativado com sucesso.")
                    else:
                        erro_msg = f"- <strong>{funcionario.nome}</strong>: Salvo no sistema, mas não localizado ou erro no AD."
                        logger.warning(f"AD Falha: {funcionario.nome}")
                        ad_errors.append(erro_msg)

            # 2. Atualiza o status do funcionário na tabela 'funcionarios' (SQL)
            status_anterior = int(funcionario.status_contratual)
            novo_status = int(status_confirmado)
            funcionario.status_contratual = novo_status

            # 3. Sincronização com o módulo de Aprovações (Candidatos)
            # Se o funcionário está sendo desligado (de 1 para 0)
            if status_anterior == 1 and novo_status == 0:
                try:
                    # Buscar o candidato que originou este funcionário
                    candidato = Candidato.query.filter_by(funcionario_id=funcionario.id).first()
                    if candidato:
                        candidato.status = 'desligado'
                        from datetime import datetime
                        candidato.data_atualizacao = datetime.now()
                        
                        # Registrar no histórico de aprovações do candidato
                        desligamento_aprov = AprovacaoCandidato(
                            candidato_id=candidato.id,
                            aprovador_id=user_id,
                            nivel_aprovacao='desligamento',
                            acao='desligado',
                            motivo=item.get('observacao', 'Desligado via módulo de confirmação de status')
                        )
                        db.session.add(desligamento_aprov)
                        
                        # Log de sincronização para o candidato
                        registrar_log(
                            acao="SINCRONIZAÇÃO DE DESLIGAMENTO",
                            usuario_id=user_id,
                            entidade="Candidatos",
                            entidade_id=candidato.id,
                            detalhes=f"O funcionário {funcionario.nome} foi desligado, sincronizando o candidato {candidato.nome} para status 'desligado'."
                        )
                except Exception as e:
                    logger.error(f"[SINCRONIZAÇÃO] Erro ao sincronizar desligamento para func {funcionario.id}: {str(e)}")

            # 4. Cria o registro de log da confirmação na tabela 'confirmacoes_status'
            nova_confirmacao = ConfirmacaoStatus(
                funcionario_id=int(funcionario_id),
                status_confirmado=str(status_confirmado),
                usuario_id=user_id,
                observacao=item.get('observacao')
            )
            db.session.add(nova_confirmacao)
            
            updates_count += 1
            nomes_atualizados.append(funcionario.nome) # Guarda o nome do funcionário para o log
        else:
            logger.error(f"[CONFIRMAÇÃO] Funcionário ID {funcionario_id} não encontrado no Banco de Dados.")

    if updates_count > 0:
        try:
            # Reseta o flag de notificação de desativação do usuário logado
            if current_user and current_user.notificacao_desativacao_enviada_em:
                current_user.notificacao_desativacao_enviada_em = None

            # Monta o texto detalhado do log incluindo os nomes separados por vírgula
            nomes_formatados = ", ".join(nomes_atualizados)
            mensagem_log = f"Confirmou o status de {updates_count} funcionário(s): {nomes_formatados}. AD Sinc: {ad_deactivations_count + ad_activations_count}."

            registrar_log(
                acao="CONFIRMAÇÃO DE STATUS",
                usuario_id=user_id,
                detalhes=mensagem_log,
            )
            
            db.session.commit()
            logger.info(f"[CONFIRMAÇÃO] Sucesso: {updates_count} registros atualizados.")
        except Exception as e:
            db.session.rollback()
            logger.error(f"[CONFIRMAÇÃO] Erro ao salvar no banco: {str(e)}")
            return jsonify({"erro": f"Erro ao salvar confirmação: {str(e)}"}), 500

    # --- MONTAGEM DA MENSAGEM DINÂMICA PARA O FRONTEND ---
    total_ad_sucesso = ad_deactivations_count + ad_activations_count
    mensagem_html = f"<strong>{updates_count}</strong> funcionário(s) atualizado(s) no sistema."
    
    if total_ad_sucesso > 0:
        mensagem_html += f"<br><br><span style='color: #198754;'><strong>Integração AD:</strong> {total_ad_sucesso} sincronizado(s) no Windows Server!</span>"

    if not ad_errors:
        return jsonify({
            "mensagem": mensagem_html,
            "ad_sync_count": total_ad_sucesso,
            "ad_errors": ad_errors
        }), 201
    else:
        return jsonify({
            "mensagem": mensagem_html,
            "ad_sync_count": total_ad_sucesso,
            "ad_errors": ad_errors,
            "aviso": "Alguns funcionários foram salvos no sistema, mas houve erros na sincronização com o AD."
        }), 200