"""
relatorios.py
Rotas para geração de relatórios em Excel
"""

from flask import Blueprint, request, jsonify, send_file, current_app
from flask_jwt_extended import jwt_required, current_user
from extensions import db
from models import Candidato, AprovacaoCandidato, Empresa, Secretaria, Usuario
from services.log_service import registrar_log
from .usuarios import permission_required
from io import BytesIO
import pandas as pd
from datetime import datetime
from zoneinfo import ZoneInfo
import logging

SAO_PAULO_TZ = ZoneInfo("America/Sao_Paulo")
logger = logging.getLogger(__name__)

relatorios_bp = Blueprint("relatorios", __name__, url_prefix="/api/relatorios")

# ====== RELATÓRIO DE FUNCIONÁRIOS APROVADOS ======
@relatorios_bp.route("/candidatos/exportar-aprovados", methods=["GET"])
@jwt_required()
def exportar_candidatos_aprovados():
    """Gera um Excel de candidatos/funcionários aprovados com filtros."""
    if current_user.perfil == "ativador":
        return jsonify({"erro": "Acesso negado."}), 403
    try:
        empresa_id = request.args.get("empresa_id")
        secretaria_id = request.args.get("secretaria_id")
        status = request.args.get("status")

        query = (
            db.session.query(
                Candidato.nome.label("Nome"),
                Candidato.cpf.label("CPF"),
                Candidato.email.label("Email"),
                Candidato.telefone.label("Telefone"),
                Empresa.nome.label("Empresa"),
                Secretaria.nome.label("Secretaria"),
                Candidato.cargo.label("Cargo"),
                AprovacaoCandidato.acao.label("Status_Aprovacao"),
                AprovacaoCandidato.data_aprovacao.label("Data_Aprovacao")
            )
            .outerjoin(Empresa, Candidato.empresa_id == Empresa.id)
            .outerjoin(Secretaria, Candidato.secretaria_id == Secretaria.id)
            .outerjoin(AprovacaoCandidato, Candidato.id == AprovacaoCandidato.candidato_id)
        )

        # --- NOVO FILTRO APLICADO AQUI ---
        # Garante que só traz candidatos que já sofreram pelo menos 1 ação de aprovação/recusa
        query = query.filter(Candidato.aprovacoes.any())
        # ---------------------------------

        # Filtro de Perfil (admin e aprovador veem tudo, outros só a própria secretaria)
        if current_user.perfil not in ["admin", "aprovador"]:
            query = query.filter(Candidato.secretaria_id == current_user.secretaria_id)
        elif secretaria_id and secretaria_id not in ["todos", "undefined", "null", ""]:
            query = query.filter(Candidato.secretaria_id == int(secretaria_id))

        if empresa_id and empresa_id not in ["todos", "undefined", "null", ""]:
            query = query.filter(Candidato.empresa_id == int(empresa_id))

        if status and status not in ["todos", "undefined", "null", ""]:
            query = query.filter(AprovacaoCandidato.acao == status)

        df = pd.read_sql(query.statement, db.engine)

        if not df.empty and "Data_Aprovacao" in df.columns:
            df["Data_Aprovacao"] = pd.to_datetime(df["Data_Aprovacao"]).dt.tz_localize(None).dt.strftime('%d/%m/%Y %H:%M')

        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Candidatos Aprovados')
        output.seek(0)

        return send_file(
            output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            download_name=f"relatorio_candidatos_aprovados_{datetime.now().strftime('%d_%m_%Y')}.xlsx",
            as_attachment=True
        )
    except Exception as e:
        logger.error(f"Erro na exportação de candidatos aprovados: {str(e)}")
        return jsonify({"erro": str(e)}), 500

# ====== RELATÓRIO DE EMPRESAS ======
@relatorios_bp.route("/empresas/exportar", methods=["GET"])
@jwt_required()
def exportar_empresas():
    """Gera um Excel de empresas cadastradas."""
    try:
        query = db.session.query(
            Empresa.nome.label("Nome"),
            Empresa.cnpj.label("CNPJ"),
            Empresa.endereco.label("Endereco"),
            Empresa.telefone.label("Telefone"),
            Empresa.email.label("Email")
        )

        df = pd.read_sql(query.statement, db.engine)

        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Empresas')
        output.seek(0)

        return send_file(
            output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            download_name=f"relatorio_empresas_{datetime.now().strftime('%d_%m_%Y')}.xlsx",
            as_attachment=True
        )
    except Exception as e:
        logger.error(f"Erro na exportação de empresas: {str(e)}")
        return jsonify({"erro": str(e)}), 500

# ====== RELATÓRIO DE USUÁRIOS ======
@relatorios_bp.route("/usuarios/exportar", methods=["GET"])
@jwt_required()
def exportar_usuarios():
    """Gera um Excel de usuários do sistema."""
    if current_user.perfil == "ativador":
        return jsonify({"erro": "Acesso negado."}), 403
    try:
        perfil_filter = request.args.get("perfil")
        secretaria_id = request.args.get("secretaria_id")

        query = db.session.query(
            Usuario.nome.label("Nome"),
            Usuario.email.label("Email"),
            Usuario.matricula.label("Matricula"),
            Usuario.perfil.label("Perfil"),
            Secretaria.nome.label("Secretaria")
        ).outerjoin(Secretaria, Usuario.secretaria_id == Secretaria.id)

        # Filtro de perfil
        if perfil_filter and perfil_filter not in ["todos", "undefined", "null", ""]:
            query = query.filter(Usuario.perfil == perfil_filter)

        # Filtro de secretaria
        if secretaria_id and secretaria_id not in ["todos", "undefined", "null", ""]:
            query = query.filter(Usuario.secretaria_id == int(secretaria_id))

        df = pd.read_sql(query.statement, db.engine)

        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Usuarios')
        output.seek(0)

        return send_file(
            output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            download_name=f"relatorio_usuarios_{datetime.now().strftime('%d_%m_%Y')}.xlsx",
            as_attachment=True
        )
    except Exception as e:
        logger.error(f"Erro na exportação de usuários: {str(e)}")
        return jsonify({"erro": str(e)}), 500