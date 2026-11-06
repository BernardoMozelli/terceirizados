from flask import Blueprint, jsonify
from models import Candidato
from models import Usuario, Empresa, Funcionario, ConfirmacaoStatus, LogAtividade, Secretaria
from flask_jwt_extended import jwt_required, current_user
from sqlalchemy import func

dashboard_bp = Blueprint("dashboard", __name__)

@dashboard_bp.route("/metrics", methods=["GET"])
@jwt_required()
def dashboard_metrics():
    total_usuarios = Usuario.query.count()
    total_empresas = Empresa.query.count()
    total_funcionarios = Funcionario.query.count()
    total_confirmacoes = ConfirmacaoStatus.query.count()
    total_logs = LogAtividade.query.count()
    return jsonify({
        "total_usuarios": total_usuarios,
        "total_empresas": total_empresas,
        "total_funcionarios": total_funcionarios,
        "total_confirmacoes": total_confirmacoes,
        "total_logs": total_logs,
    })

@dashboard_bp.route("/terceirizados-por-empresa", methods=["GET"])
@jwt_required()
def terceirizados_por_empresa():
    """Retorna o total de terceirizados (funcionários) por empresa contratada."""
    dados = (
        Funcionario.query.with_entities(
            Empresa.nome.label("empresa"),
            func.count(Funcionario.id).label("total")
        )
        .join(Empresa)
        .group_by(Empresa.id, Empresa.nome)
        .order_by(func.count(Funcionario.id).desc())
        .all()
    )
    resultado = [
        {"empresa": item.empresa, "total": item.total}
        for item in dados
    ]
    return jsonify({"dados": resultado})

@dashboard_bp.route("/terceirizados-ativos", methods=["GET"])
@jwt_required()
def terceirizados_ativos():
    """Retorna o total de terceirizados ativos (status_contratual = 1)."""
    total_ativos = Funcionario.query.filter_by(status_contratual=1).count()
    total_inativos = Funcionario.query.filter_by(status_contratual=0).count()
    total_geral = Funcionario.query.count()
    return jsonify({
        "total_ativos": total_ativos,
        "total_inativos": total_inativos,
        "total_geral": total_geral,
        "percentual_ativos": round((total_ativos / total_geral * 100) if total_geral > 0 else 0, 2)
    })

@dashboard_bp.route("/funcionarios-por-cargo", methods=["GET"])
@jwt_required()
def funcionarios_por_cargo():
    """Retorna o total de funcionários por cargo, mostrando a empresa."""
    dados = (
        Funcionario.query.with_entities(
            Funcionario.cargo.label("cargo"),
            Empresa.nome.label("empresa"),
            func.count(Funcionario.id).label("total")
        )
        .join(Empresa)
        .group_by(Funcionario.cargo, Empresa.id, Empresa.nome)
        .order_by(func.count(Funcionario.id).desc())
        .all()
    )
    resultado = [
        {"cargo": item.cargo, "empresa": item.empresa, "total": item.total}
        for item in dados
    ]
    return jsonify({"dados": resultado})

@dashboard_bp.route("/funcionarios-por-secretaria", methods=["GET"])
@jwt_required()
def funcionarios_por_secretaria():
    """Retorna o total de funcionários por secretaria, mostrando a empresa."""
    dados = (
        Funcionario.query.with_entities(
            Secretaria.nome.label("secretaria"),
            Empresa.nome.label("empresa"),
            func.count(Funcionario.id).label("total")
        )
        .join(Secretaria)
        .join(Empresa)
        .group_by(Secretaria.id, Secretaria.nome, Empresa.id, Empresa.nome)
        .order_by(func.count(Funcionario.id).desc())
        .all()
    )
    resultado = [
        {"secretaria": item.secretaria, "empresa": item.empresa, "total": item.total}
        for item in dados
    ]
    return jsonify({"dados": resultado})

# ====== ROTAS DE APROVAÇÕES ======

@dashboard_bp.route("/candidatos-pendentes", methods=["GET"])
@jwt_required()
def candidatos_pendentes():
    """Retorna o total de candidatos efetivamente pendentes de aprovação."""
    
    # Filtra apenas registros onde o status é exatamente 'pendente'
    query = Candidato.query.filter_by(status='pendente')
    
    # Restrição de Segurança: Ativadores veem apenas pendentes da sua secretaria
    if current_user.perfil == 'ativador':
        query = query.filter_by(secretaria_id=current_user.secretaria_id)
    
    total_pendentes = query.count()
    
    return jsonify({"total": total_pendentes})

@dashboard_bp.route("/aprovacoes-por-periodo", methods=["GET"])
@jwt_required()
def aprovacoes_por_periodo():
    """Retorna o total de contratações agrupadas por período (mês) - apenas candidatos com histórico de aprovações."""
    from models import AprovacaoCandidato, Candidato
    from sqlalchemy import extract, distinct
    
    # Contar candidatos contratados que tém histórico de aprovações
    dados = (
        AprovacaoCandidato.query.with_entities(
            extract('year', AprovacaoCandidato.data_aprovacao).label("ano"),
            extract('month', AprovacaoCandidato.data_aprovacao).label("mes"),
            func.count(distinct(AprovacaoCandidato.candidato_id)).label("total")
        )
        .join(Candidato, AprovacaoCandidato.candidato_id == Candidato.id)
        .filter(AprovacaoCandidato.data_aprovacao != None)
        .filter(Candidato.status == 'contratado')
        .group_by("ano", "mes")
        .order_by("ano", "mes")
        .all()
    )
    
    meses_nomes = {
        1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril',
        5: 'Maio', 6: 'Junho', 7: 'Julho', 8: 'Agosto',
        9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro'
    }
    
    resultado = [
        {
            "periodo": f"{meses_nomes.get(int(item.mes), 'N/A')} {int(item.ano)}",
            "mes": int(item.mes),
            "ano": int(item.ano),
            "total": item.total
        }
        for item in dados
    ]
    
    return jsonify({"dados": resultado})

@dashboard_bp.route("/aprovacoes-por-empresa", methods=["GET"])
@jwt_required()
def aprovacoes_por_empresa():
    """Retorna o total de contratações por empresa - apenas candidatos com histórico de aprovações."""
    from models import AprovacaoCandidato, Candidato
    from sqlalchemy import distinct
    
    # Contar candidatos contratados que tém histórico de aprovações
    dados = (
        AprovacaoCandidato.query.with_entities(
            Empresa.nome.label("empresa"),
            func.count(distinct(AprovacaoCandidato.candidato_id)).label("total")
        )
        .join(Candidato, AprovacaoCandidato.candidato_id == Candidato.id)
        .join(Empresa, Candidato.empresa_id == Empresa.id)
        .filter(AprovacaoCandidato.data_aprovacao != None)
        .filter(Candidato.status == 'contratado')
        .group_by(Empresa.id, Empresa.nome)
        .order_by(func.count(distinct(AprovacaoCandidato.candidato_id)).desc())
        .all()
    )
    
    resultado = [
        {"empresa": item.empresa, "total": item.total}
        for item in dados
    ]
    
    return jsonify({"dados": resultado})

@dashboard_bp.route("/aprovacoes-por-secretaria", methods=["GET"])
@jwt_required()
def aprovacoes_por_secretaria():
    """Retorna o total de contratações por secretaria - apenas candidatos com histórico de aprovações."""
    from models import AprovacaoCandidato, Candidato
    from sqlalchemy import distinct
    
    # Contar candidatos contratados que tém histórico de aprovações
    dados = (
        AprovacaoCandidato.query.with_entities(
            Secretaria.nome.label("secretaria"),
            func.count(distinct(AprovacaoCandidato.candidato_id)).label("total")
        )
        .join(Candidato, AprovacaoCandidato.candidato_id == Candidato.id)
        .join(Secretaria, Candidato.secretaria_id == Secretaria.id)
        .filter(AprovacaoCandidato.data_aprovacao != None)
        .filter(Candidato.status == 'contratado')
        .group_by(Secretaria.id, Secretaria.nome)
        .order_by(func.count(distinct(AprovacaoCandidato.candidato_id)).desc())
        .all()
    )
    
    resultado = [
        {"secretaria": item.secretaria, "total": item.total}
        for item in dados
    ]
    
    return jsonify({"dados": resultado})
