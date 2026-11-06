from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from models import LogAtividade, Usuario
from extensions import db
from sqlalchemy import desc

# Certifique-se de que o nome do blueprint é o mesmo que está no seu app.py
logs_bp = Blueprint('logs_atividades_final', __name__)

@logs_bp.route('/', methods=['GET'], strict_slashes=False)
@jwt_required()
def get_logs():
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 15, type=int)
        
        # Filtros enviados pelo Frontend
        acao_filtro = request.args.get('acao')
        detalhes_filtro = request.args.get('detalhes')

        query = LogAtividade.query
        if acao_filtro:
            query = query.filter(LogAtividade.acao == acao_filtro)
        if detalhes_filtro:
            query = query.filter(LogAtividade.detalhes.ilike(f"%{detalhes_filtro}%"))

        # Paginação
        pagination = query.order_by(desc(LogAtividade.id)).paginate(page=page, per_page=per_page)
        
        resultado = []
        for log in pagination.items:
            usuario = Usuario.query.get(log.usuario_id)
            resultado.append({
                "id": log.id,
                "usuario_nome": usuario.nome if usuario else "Sistema",
                "acao": log.acao,
                "detalhes": log.detalhes,
                "ip_origem": log.ip_origem,
                # --- CORREÇÃO AQUI: Enviar no formato ISO 8601 com 'Z' (UTC) ---
                # Isso permite que o JavaScript do frontend faça a conversão do fuso horário (-3h)
                "data_hora": log.data_hora.strftime('%Y-%m-%dT%H:%M:%SZ') if log.data_hora else "N/A"
            })
        
        return jsonify({
            "logs": resultado,
            "total_pages": pagination.pages,
            "current_page": pagination.page
        }), 200
    except Exception as e:
        return jsonify({"erro": str(e)}), 500

# --- ESTA É A ROTA QUE ESTÁ A FALTAR E CAUSA O 404 ---
@logs_bp.route('/acoes', methods=['GET'], strict_slashes=False)
@jwt_required()
def get_acoes():
    try:
        # Busca todas as ações diferentes já registadas no banco para preencher o filtro
        acoes = db.session.query(LogAtividade.acao).distinct().all()
        # Converte a lista de tuplas em lista simples: ['Criação', 'Edição', ...]
        lista_acoes = [a[0] for a in acoes if a[0]]
        return jsonify(lista_acoes), 200
    except Exception as e:
        return jsonify([]), 200 # Retorna vazio em caso de erro para não travar o front