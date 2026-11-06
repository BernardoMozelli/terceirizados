import os
import re
import logging
from datetime import timezone, datetime
from zoneinfo import ZoneInfo
from io import BytesIO

import pandas as pd
from flask import Blueprint, request, jsonify, current_app, send_file
from flask_jwt_extended import jwt_required, current_user
from werkzeug.utils import secure_filename
from sqlalchemy import func, or_

from extensions import db
from models import Funcionario, TransferenciaFuncionario, Usuario, ConfirmacaoStatus, Empresa, Secretaria, Candidato, AprovacaoCandidato
from services.log_service import registrar_log
from services.image_service import create_thumbnail
from services.ad_service import ADService
from .usuarios import permission_required
from decorators import pode_ver_indicacao

# Configuração de fuso horário e logs
SAO_PAULO_TZ = ZoneInfo("America/Sao_Paulo")
logger = logging.getLogger(__name__)

funcionarios_bp = Blueprint("funcionarios", __name__)

# Inicialização do serviço AD
ad_service = ADService(
    server_uri=os.getenv('AD_SERVER'),
    admin_user=os.getenv('AD_USER'),
    admin_pass=os.getenv('AD_PASS'),
    base_dn=os.getenv('AD_BASE_DN')
)

def _filtro_nome_cpf_matricula(texto):
    """
    Busca por nome (sem acento), matrícula ou CPF. O CPF é achado com ou sem
    pontuação: "123.456.789-09", "12345678909" e "123456" encontram a mesma pessoa.
    """
    texto = (texto or "").strip()
    termo = f"%{texto}%"
    condicoes = [
        func.unaccent(Funcionario.nome).ilike(func.unaccent(termo)),
        Funcionario.matricula.ilike(termo),
        Funcionario.cpf.ilike(termo),
    ]
    digitos = "".join(c for c in texto if c.isdigit())
    if len(digitos) >= 3:
        cpf_limpo = func.replace(func.replace(func.replace(Funcionario.cpf, ".", ""), "-", ""), " ", "")
        condicoes.append(cpf_limpo.ilike(f"%{digitos}%"))
    return or_(*condicoes)


def limpar_cpf_para_ad(cpf):
    """Remove pontos e traços para bater com o employeeID no Samba AD."""
    if not cpf:
        return None
    return "".join(filter(str.isdigit, str(cpf)))

# --- 1. EXPORTAÇÃO EXCEL COM FILTROS ---
@funcionarios_bp.route("/exportar-desligados", methods=["GET"])
@jwt_required()
def exportar_desligados():
    """Gera um Excel de inativos com filtros de data, empresa e secretaria."""
    try:
        data_inicio = request.args.get("data_inicio")
        data_fim = request.args.get("data_fim")
        empresa_id = request.args.get("empresa_id")
        secretaria_id = request.args.get("secretaria_id")

        subquery = (
            db.session.query(
                ConfirmacaoStatus.funcionario_id, 
                func.max(ConfirmacaoStatus.data_confirmacao).label("max_date")
            )
            .filter(ConfirmacaoStatus.status_confirmado == "0")
            .group_by(ConfirmacaoStatus.funcionario_id)
            .subquery()
        )

        query = (
            db.session.query(
                Funcionario.nome.label("Nome"),
                Funcionario.cpf.label("CPF"),
                Funcionario.matricula.label("Matricula"),
                Funcionario.cargo.label("Cargo"),
                Empresa.nome.label("Empresa"),
                Secretaria.nome.label("Secretaria"),
                Funcionario.setor.label("Setor"),
                Usuario.nome.label("Desligado_Por"),
                ConfirmacaoStatus.data_confirmacao.label("Data_Desligamento"),
                ConfirmacaoStatus.observacao.label("Motivo_Desligamento")
            )
            .join(Empresa, Funcionario.empresa_id == Empresa.id)
            .join(Secretaria, Funcionario.secretaria_id == Secretaria.id)
            .outerjoin(subquery, Funcionario.id == subquery.c.funcionario_id)
            .outerjoin(ConfirmacaoStatus, (ConfirmacaoStatus.funcionario_id == Funcionario.id) & 
                      (ConfirmacaoStatus.data_confirmacao == subquery.c.max_date))
            .outerjoin(Usuario, Usuario.id == ConfirmacaoStatus.usuario_id)
            .filter(Funcionario.status_contratual == 0)
        )

        # Filtro de Perfil (admin e aprovador veem tudo, outros só a própria secretaria)
        if current_user.perfil not in ["admin", "aprovador"]:
            query = query.filter(Funcionario.secretaria_id == current_user.secretaria_id)
        elif current_user.perfil == "aprovador" and secretaria_id and secretaria_id not in ["todos", "undefined", "null", ""]:
            query = query.filter(Funcionario.secretaria_id == int(secretaria_id))
        elif current_user.perfil == "admin" and secretaria_id and secretaria_id not in ["todos", "undefined", "null", ""]:
            query = query.filter(Funcionario.secretaria_id == int(secretaria_id))

        if data_inicio:
            query = query.filter(ConfirmacaoStatus.data_confirmacao >= f"{data_inicio} 00:00:00")
        if data_fim:
            query = query.filter(ConfirmacaoStatus.data_confirmacao <= f"{data_fim} 23:59:59")
        
        if empresa_id and empresa_id not in ["todos", "undefined", "null", ""]:
            query = query.filter(Funcionario.empresa_id == int(empresa_id))

        df = pd.read_sql(query.statement, db.engine)

        if not df.empty and "Data_Desligamento" in df.columns:
            df["Data_Desligamento"] = pd.to_datetime(df["Data_Desligamento"]).dt.tz_localize(None).dt.strftime('%d/%m/%Y %H:%M')

        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Desligados')
        output.seek(0)

        return send_file(
            output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            download_name=f"relatorio_desligados_{datetime.now().strftime('%d_%m_%Y')}.xlsx",
            as_attachment=True
        )
    except Exception as e:
        logger.error(f"Erro na exportação Excel: {str(e)}")
        return jsonify({"erro": str(e)}), 500

# --- 2. LISTAGEM DE INATIVOS ---
@funcionarios_bp.route("/inativos", methods=["GET"])
@jwt_required()
def listar_funcionarios_inativos():
    search = request.args.get('search', '').strip()
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 15, type=int)

    subquery = (
        db.session.query(ConfirmacaoStatus.funcionario_id, func.max(ConfirmacaoStatus.data_confirmacao).label("max_date"))
        .filter(ConfirmacaoStatus.status_confirmado == "0").group_by(ConfirmacaoStatus.funcionario_id).subquery()
    )

    query = (
        db.session.query(
            Funcionario, 
            Usuario.nome.label("u_nome"), 
            ConfirmacaoStatus.data_confirmacao.label("d_conf"),
            ConfirmacaoStatus.observacao.label("obs_desligamento"),
            Empresa.nome.label("emp_nome"),
            Secretaria.nome.label("sec_nome")
        )
        .join(Empresa, Funcionario.empresa_id == Empresa.id)
        .join(Secretaria, Funcionario.secretaria_id == Secretaria.id)
        .outerjoin(subquery, Funcionario.id == subquery.c.funcionario_id)
        .outerjoin(ConfirmacaoStatus, (ConfirmacaoStatus.funcionario_id == Funcionario.id) & 
                  (ConfirmacaoStatus.data_confirmacao == subquery.c.max_date))
        .outerjoin(Usuario, Usuario.id == ConfirmacaoStatus.usuario_id)
        .filter(Funcionario.status_contratual == 0)
    )

    # Filtro de Perfil (admin e aprovador veem tudo, outros só a própria secretaria)
    if current_user.perfil not in ["admin", "aprovador"]:
        query = query.filter(Funcionario.secretaria_id == current_user.secretaria_id)

    if search:
        query = query.filter(_filtro_nome_cpf_matricula(search))

    pagination = query.order_by(Funcionario.nome).paginate(page=page, per_page=per_page, error_out=False)

    funcionarios_lista = []
    for f, u_nome, d_conf, obs_desligamento, emp_nome, sec_nome in pagination.items:
        d = f.to_dict()
        d["usuario_desligamento_nome"] = u_nome or "Sistema"
        d["data_desligamento"] = d_conf.astimezone(SAO_PAULO_TZ).strftime("%d/%m/%Y %H:%M") if d_conf else "N/A"
        d["motivo_desligamento"] = obs_desligamento or ""
        d["empresa_nome"] = emp_nome
        d["secretaria_nome"] = sec_nome
        funcionarios_lista.append(d)

    return jsonify({
        "funcionarios": funcionarios_lista,
        "total_pages": pagination.pages,
        "current_page": page,
        "total_items": pagination.total
    })

# --- 3. LISTAGEM DE ATIVOS ---
@funcionarios_bp.route("", methods=["GET"])
@jwt_required()
def listar_funcionarios():
    filtro_geral = request.args.get("filtro_geral", "")
    query = Funcionario.query.filter_by(status_contratual=1)
    
    # Filtro de Perfil (admin e aprovador veem tudo, outros só a própria secretaria)
    if current_user.perfil not in ["admin", "aprovador"]:
        query = query.filter_by(secretaria_id=current_user.secretaria_id)

    if filtro_geral:
        query = query.filter(_filtro_nome_cpf_matricula(filtro_geral))

    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 15, type=int)
    pagination = query.order_by(Funcionario.nome).paginate(page=page, per_page=per_page, error_out=False)
    
    return jsonify({
        "funcionarios": [f.to_dict() for f in pagination.items],
        "total_pages": pagination.pages,
        "current_page": page,
        "total_items": pagination.total
    })

# --- 4. CRIAÇÃO E EDIÇÃO ---
@funcionarios_bp.route("", methods=["POST"])
@permission_required("criar_funcionario")
def criar_funcionario():
    dados = request.form.to_dict() if request.content_type.startswith('multipart/form-data') else request.get_json()
    
    # Lógica de Secretaria por Perfil
    sec_id = dados.get('secretaria_id') if current_user.perfil == 'admin' else current_user.secretaria_id

    novo_funcionario = Funcionario(
        nome=dados.get('nome'),
        matricula=dados.get('matricula'),
        cargo=dados.get('cargo'),
        cpf=dados.get('cpf'),
        empresa_id=dados.get('empresa_id'),
        setor=dados.get('setor'),
        secretaria_id=sec_id,
        observacao=dados.get('observacao', '') if pode_ver_indicacao(current_user) else None
    )

    # Upload de Foto
    foto_file = request.files.get('foto') if request.files else None
    if foto_file and foto_file.filename:
        upload_folder = os.path.join(current_app.root_path, 'static', 'uploads')
        os.makedirs(upload_folder, exist_ok=True)
        filename = secure_filename(f"{int(datetime.now().timestamp())}_{foto_file.filename}")
        filepath = os.path.join(upload_folder, filename)
        foto_file.save(filepath)
        create_thumbnail(filepath, os.path.join(upload_folder, f"{os.path.splitext(filename)[0]}_thumb.png"))
        novo_funcionario.foto = f"/static/uploads/{filename}"

    db.session.add(novo_funcionario)
    db.session.commit()

    # --- AJUSTE DO LOG PARA FRASE HUMANA ---
    # Pegamos a data e hora atual formatada
    agora = datetime.now(SAO_PAULO_TZ).strftime('%d/%m/%Y às %H:%M')
    
    # Montamos a frase detalhada exatamente como você pediu
    detalhes_humanos = (
        f"O usuário {current_user.nome} cadastrou o novo funcionário "
        f"{novo_funcionario.nome} no módulo Funcionários em {agora}."
    )

    # Chamada do log com a frase formatada
    registrar_log(
        acao="CADASTRO", # Usamos um nome curto para a Badge
        usuario_id=current_user.id, 
        entidade="Funcionarios", 
        entidade_id=novo_funcionario.id, 
        detalhes=detalhes_humanos
    )

    return jsonify(novo_funcionario.to_dict()), 201

@funcionarios_bp.route("/<int:id>", methods=["PUT"])
@permission_required("editar_funcionario")
def atualizar_funcionario(id):
    funcionario = Funcionario.query.get_or_404(id)
    dados = request.form.to_dict() if request.content_type and request.content_type.startswith('multipart/form-data') else request.get_json()
    
    # Captura de Foto na Edição
    foto_file = request.files.get('foto') if request.files else None
    foto_atualizada = False
    if foto_file and foto_file.filename:
        upload_folder = os.path.join(current_app.root_path, 'static', 'uploads')
        os.makedirs(upload_folder, exist_ok=True)
        filename = secure_filename(f"{int(datetime.now().timestamp())}_{foto_file.filename}")
        filepath = os.path.join(upload_folder, filename)
        foto_file.save(filepath)
        create_thumbnail(filepath, os.path.join(upload_folder, f"{os.path.splitext(filename)[0]}_thumb.png"))
        funcionario.foto = f"/static/uploads/{filename}"
        foto_atualizada = True

    if dados:
        campos_permitidos = ['nome', 'cargo', 'setor', 'status_contratual']
        # Indicação só pode ser alterada por admin, Prefeito e Vice-Prefeito
        if pode_ver_indicacao(current_user):
            campos_permitidos.append('observacao')
        # Admin pode alterar a secretaria na edição também
        if current_user.perfil == 'admin':
            campos_permitidos.append('secretaria_id')

        # Bloqueia desligamento via PUT — o desligamento com operação AD
        # deve passar exclusivamente por /api/confirmacoes_status/confirmar_status
        status_anterior = int(funcionario.status_contratual)
        novo_status = int(dados.get('status_contratual', status_anterior))
        if status_anterior == 1 and novo_status == 0:
            return jsonify({
                "erro": "Para desligar um funcionário utilize o botão 'Desligar Funcionário' no Super Modal."
            }), 400

        for campo in campos_permitidos:
            if campo in dados:
                setattr(funcionario, campo, dados[campo])

    db.session.commit()
    
    # Sincronizar foto com o candidato de origem
    if foto_atualizada:
        try:
            candidato = Candidato.query.filter_by(funcionario_id=id).first()
            if candidato:
                # Normalizar o caminho da foto para evitar problemas de dupla barra
                foto_normalizada = funcionario.foto
                if foto_normalizada:
                    # Remove barras duplicadas
                    foto_normalizada = foto_normalizada.replace('//', '/')
                    # Remove /static/ se existir (candidato nao usa /static/)
                    if foto_normalizada.startswith('/static/'):
                        foto_normalizada = foto_normalizada.replace('/static/', '')
                
                print(f"[SYNC-FOTO] Foto original do funcionario: {funcionario.foto}")
                print(f"[SYNC-FOTO] Foto normalizada para candidato: {foto_normalizada}")
                
                candidato.foto = foto_normalizada
                candidato.data_atualizacao = datetime.now()
                db.session.commit()
                
                # Log de sincronização de foto
                agora = datetime.now(SAO_PAULO_TZ).strftime('%d/%m/%Y às %H:%M')
                detalhes_foto = f"A foto do funcionário {funcionario.nome} foi atualizada, sincronizando automaticamente com o candidato de origem em {agora}."
                registrar_log(
                    acao="SINCRONIZAÇÃO DE FOTO",
                    usuario_id=current_user.id,
                    entidade="Candidatos",
                    entidade_id=candidato.id,
                    detalhes=detalhes_foto
                )
                print(f"Foto sincronizada com sucesso para o candidato {candidato.id}: {candidato.foto}")
            else:
                print(f"Nenhum candidato encontrado para sincronizar foto do funcionario {id}")
        except Exception as e:
            print(f"Erro ao sincronizar foto com candidato: {e}")
            import traceback
            traceback.print_exc()
    
    registrar_log("Edição de Funcionário", current_user.id, "Funcionario", id, f"Atualizado: {funcionario.nome}")
    return jsonify({"mensagem": "Sucesso"}), 200

@funcionarios_bp.route("/<int:id>/desligar-modal", methods=["POST"])
@permission_required("editar_funcionario")
def desligar_funcionario_modal(id):
    """
    Rota dedicada ao desligamento via Super Modal.
    Replica a lógica de desligamento do atualizar_funcionario,
    mas de forma isolada e segura — sem alterar outros campos.
    """
    funcionario = Funcionario.query.get_or_404(id)

    # Verificação: só desliga quem já está ativo
    if int(funcionario.status_contratual) != 1:
        return jsonify({"erro": "Este funcionário já está desligado."}), 400

    # Verificação de permissão de desligamento
    if current_user.perfil not in ('admin', 'ativador', 'aprovador'):
        return jsonify({"erro": "Acesso negado. Você não tem permissão para desligar funcionários."}), 403

    dados = request.get_json() or {}
    motivo = dados.get('motivo', 'Desligado através do módulo funcionários')

    try:
        # 1. Inativar no banco de dados
        funcionario.status_contratual = 0

        # 2. Inativar no Samba AD (bit 514 = conta desabilitada)
        if os.getenv('AD_ENABLED') == 'True':
            try:
                ad_service.desativar_usuario(
                    cpf=limpar_cpf_para_ad(funcionario.cpf),
                    matricula=funcionario.matricula
                )
                logger.info(f"[DESLIGAR-MODAL] AD: conta de {funcionario.nome} desativada com sucesso.")
            except Exception as e_ad:
                logger.error(f"[DESLIGAR-MODAL] Falha ao desativar no AD: {e_ad}")
                # Não interrompe — registra o erro mas prossegue com o DB

        # 4. Sincronizar desligamento com candidato de origem
        try:
            candidato = Candidato.query.filter_by(funcionario_id=id).first()
            if candidato:
                candidato.status = 'desligado'
                candidato.data_atualizacao = datetime.now()

                desligamento_cand = AprovacaoCandidato(
                    candidato_id=candidato.id,
                    aprovador_id=current_user.id,
                    nivel_aprovacao='desligamento',
                    acao='desligado',
                    motivo=motivo
                )
                db.session.add(desligamento_cand)

                agora_str = datetime.now(SAO_PAULO_TZ).strftime('%d/%m/%Y às %H:%M')
                registrar_log(
                    acao="SINCRONIZAÇÃO DE DESLIGAMENTO",
                    usuario_id=current_user.id,
                    entidade="Candidatos",
                    entidade_id=candidato.id,
                    detalhes=f"Funcionário {funcionario.nome} desligado através do módulo de funcionários em {agora_str}. Candidato sincronizado."
                )
        except Exception as e_sync:
            logger.error(f"[DESLIGAR-MODAL] Erro ao sincronizar candidato: {e_sync}")

        db.session.commit()

        # 5. Registrar log principal
        agora_str = datetime.now(SAO_PAULO_TZ).strftime('%d/%m/%Y às %H:%M')
        registrar_log(
            acao="DESLIGAMENTO",
            usuario_id=current_user.id,
            entidade="Funcionarios",
            entidade_id=id,
            detalhes=f"O usuário {current_user.nome} desligou {funcionario.nome} via Super Modal em {agora_str}. Motivo: {motivo}"
        )

        return jsonify({"mensagem": f"{funcionario.nome} desligado com sucesso."}), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"[DESLIGAR-MODAL] Erro crítico: {e}")
        return jsonify({"erro": "Falha interna ao processar o desligamento."}), 500

@funcionarios_bp.route("/<int:id>/reativar", methods=["POST"])
@jwt_required()
def reativar_funcionario(id):
    # Verificação de segurança simplificada baseada no perfil
    if current_user.perfil not in ['admin', 'ativador', 'aprovador']:
        return jsonify({"erro": "Acesso negado. Você não tem permissão para reativar funcionários."}), 403

    funcionario = Funcionario.query.get_or_404(id)
    funcionario.status_contratual = 1
    
    # Montando a frase detalhada
    agora = datetime.now(SAO_PAULO_TZ).strftime('%d/%m/%Y às %H:%M')
    detalhes = f"O usuário {current_user.nome} reativou o funcionário {funcionario.nome} no módulo Funcionários em {agora}."
    
    db.session.commit()
    
    # Sincronizar reativação com o candidato de origem
    try:
        candidato = Candidato.query.filter_by(funcionario_id=id).first()
        if candidato:
            candidato.status = 'contratado'
            candidato.data_atualizacao = datetime.now()
            
            # Registrar no histórico de aprovações
            reativacao = AprovacaoCandidato(
                candidato_id=candidato.id,
                aprovador_id=current_user.id,
                nivel_aprovacao='reativacao',
                acao='reativado',
                motivo='Funcionário reativado no painel de funcionários'
            )
            db.session.add(reativacao)
            db.session.commit()
            
            # Log de sincronização
            detalhes_sync = f"O funcionário {funcionario.nome} foi reativado, sincronizando o candidato {candidato.nome} para status 'contratado' em {agora}."
            registrar_log(
                acao="SINCRONIZAÇÃO DE REATIVAÇÃO",
                usuario_id=current_user.id,
                entidade="Candidatos",
                entidade_id=candidato.id,
                detalhes=detalhes_sync
            )
    except Exception as e:
        print(f"Erro ao sincronizar reativação: {e}")

    # Enviamos a frase detalhada para o registrar_log
    registrar_log(
        acao="REATIVAÇÃO", 
        usuario_id=current_user.id, 
        entidade="Funcionarios", 
        entidade_id=id, 
        detalhes=detalhes
    )
    
    return jsonify({"mensagem": "Reativado com sucesso"})

# --- EXPORTAÇÃO EXCEL DE FUNCIONÁRIOS ATIVOS COM FILTROS ---
@funcionarios_bp.route("/exportar-ativos", methods=["GET"])
@jwt_required()
def exportar_ativos():
    """Gera um Excel de funcionários ativos com filtros de data, empresa e secretaria."""
    try:
        data_inicio = request.args.get("data_inicio")
        data_fim = request.args.get("data_fim")
        empresa_id = request.args.get("empresa_id")
        secretaria_id = request.args.get("secretaria_id")

        query = (
            db.session.query(
                Funcionario.nome.label("Nome"),
                Funcionario.cpf.label("CPF"),
                Funcionario.matricula.label("Matricula"),
                Funcionario.cargo.label("Cargo"),
                Empresa.nome.label("Empresa"),
                Secretaria.nome.label("Secretaria"),
                Funcionario.setor.label("Setor")
            )
            .join(Empresa, Funcionario.empresa_id == Empresa.id)
            .join(Secretaria, Funcionario.secretaria_id == Secretaria.id)
            .filter(Funcionario.status_contratual == 1)  # Apenas ativos
        )

        # Filtro de Perfil (admin e aprovador veem tudo, ativador e outros só a própria secretaria)
        if current_user.perfil not in ["admin", "aprovador"]:
            query = query.filter(Funcionario.secretaria_id == current_user.secretaria_id)
        elif current_user.perfil == "aprovador" and secretaria_id and secretaria_id not in ["todos", "undefined", "null", ""]:
            query = query.filter(Funcionario.secretaria_id == int(secretaria_id))
        elif current_user.perfil == "admin" and secretaria_id and secretaria_id not in ["todos", "undefined", "null", ""]:
            query = query.filter(Funcionario.secretaria_id == int(secretaria_id))

        if empresa_id and empresa_id not in ["todos", "undefined", "null", ""]:
            query = query.filter(Funcionario.empresa_id == int(empresa_id))

        df = pd.read_sql(query.statement, db.engine)

        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Funcionarios Ativos')
        output.seek(0)

        return send_file(
            output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            download_name=f"relatorio_funcionarios_ativos_{datetime.now().strftime('%d_%m_%Y')}.xlsx",
            as_attachment=True
        )
    except Exception as e:
        logger.error(f"Erro na exportação Excel de ativos: {str(e)}")
        return jsonify({"erro": str(e)}), 500