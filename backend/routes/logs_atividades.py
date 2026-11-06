from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from models import LogAtividade, Usuario
from extensions import db
from sqlalchemy import desc
from datetime import datetime, timezone
import json
import re

logs_bp = Blueprint('logs_atividades_final', __name__)

@logs_bp.route('/', methods=['GET'], strict_slashes=False)
@jwt_required()
def get_logs():
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 15, type=int)

        acao_filtro = request.args.get('acao')
        detalhes_filtro = request.args.get('detalhes')

        query = LogAtividade.query
        if acao_filtro:
            query = query.filter(LogAtividade.acao == acao_filtro)
        if detalhes_filtro:
            query = query.filter(LogAtividade.detalhes.ilike(f"%{detalhes_filtro}%"))

        pagination = query.order_by(desc(LogAtividade.id)).paginate(page=page, per_page=per_page)

        resultado = []
        for log in pagination.items:
            usuario = Usuario.query.get(log.usuario_id)
            detalhes_estruturados = processar_detalhes(log.detalhes, log.acao)

            # ── Horário: garantir que a data é tratada como UTC ──
            # Se data_hora já tem tzinfo, converte para UTC e formata com Z.
            # Se não tem tzinfo (naive), assume UTC diretamente.
            data_hora_str = "N/A"
            if log.data_hora:
                dt = log.data_hora
                if dt.tzinfo is None:
                    # naive → assumimos que o banco guarda em UTC
                    dt = dt.replace(tzinfo=timezone.utc)
                else:
                    dt = dt.astimezone(timezone.utc)
                data_hora_str = dt.strftime('%Y-%m-%dT%H:%M:%SZ')

            resultado.append({
                "id": log.id,
                "usuario_id": log.usuario_id,
                "usuario_nome": usuario.nome if usuario else "Sistema",
                "usuario_email": usuario.email if usuario else None,
                "usuario_perfil": usuario.perfil if usuario else None,
                "acao": log.acao,
                "detalhes": log.detalhes,
                "detalhes_estruturados": detalhes_estruturados,
                "ip_origem": log.ip_origem,
                "data_hora": data_hora_str
            })

        return jsonify({
            "logs": resultado,
            "total_pages": pagination.pages,
            "current_page": pagination.page
        }), 200
    except Exception as e:
        return jsonify({"erro": str(e)}), 500


def processar_detalhes(detalhes_str, acao=None):
    """
    Processa a string de detalhes e extrai informações estruturadas para qualquer tipo de ação.
    Retorna um dicionário rico com todas as informações disponíveis.
    """
    resultado = {
        "tipo_acao": _classificar_acao(acao),
        "resumo": detalhes_str or "",
        "campos": {}
    }

    if not detalhes_str:
        return resultado

    # --- Tentativa 1: Parse JSON estruturado ---
    try:
        if detalhes_str.strip().startswith('{'):
            dados = json.loads(detalhes_str)
            resultado["campos"] = dados

            # Normaliza campos comuns independente do nome da chave
            resultado["funcionario"]    = dados.get('funcionario') or dados.get('nome') or dados.get('nome_funcionario')
            resultado["funcionario_id"] = dados.get('funcionario_id') or dados.get('id')
            resultado["campo_alterado"] = dados.get('campo') or dados.get('campo_alterado')
            resultado["valor_anterior"] = dados.get('valor_anterior') or dados.get('de') or dados.get('antes')
            resultado["valor_novo"]     = dados.get('valor_novo') or dados.get('para') or dados.get('depois')
            resultado["entidade"]       = dados.get('entidade') or dados.get('tipo')
            resultado["entidade_id"]    = dados.get('entidade_id')
            resultado["observacao"]     = dados.get('observacao') or dados.get('obs') or dados.get('motivo')
            resultado["email"]          = dados.get('email')
            resultado["perfil"]         = dados.get('perfil')
            resultado["secretaria"]     = dados.get('secretaria') or dados.get('secretaria_nome')
            resultado["matricula"]      = dados.get('matricula')
            resultado["departamento"]   = dados.get('departamento')
            resultado["cargo"]          = dados.get('cargo')
            resultado["situacao"]       = dados.get('situacao') or dados.get('status')

            # Campos extras: qualquer chave do JSON que não foi mapeada acima,
            # mas que tenha valor útil, vai para "campos_extras" para exibição genérica
            CHAVES_MAPEADAS = {
                'funcionario', 'funcionario_id', 'nome', 'nome_funcionario', 'id',
                'campo', 'campo_alterado', 'valor_anterior', 'de', 'antes',
                'valor_novo', 'para', 'depois', 'entidade', 'tipo', 'entidade_id',
                'observacao', 'obs', 'motivo', 'email', 'perfil', 'secretaria',
                'secretaria_nome', 'matricula', 'departamento', 'cargo', 'situacao', 'status'
            }
            resultado["campos_extras"] = {
                k: v for k, v in dados.items()
                if k not in CHAVES_MAPEADAS and v not in (None, '', 'N/A')
            }

            return resultado
    except Exception:
        pass

    # --- Tentativa 2: Parse por padrão "Chave: Valor | Chave: Valor" ---
    if '|' in detalhes_str:
        campos_extraidos = {}
        partes = detalhes_str.split('|')
        for parte in partes:
            parte = parte.strip()
            if ':' in parte:
                chave, valor = parte.split(':', 1)
                chave_norm = (chave.strip().lower()
                              .replace(' ', '_')
                              .replace('á','a').replace('ã','a')
                              .replace('é','e').replace('ê','e'))
                campos_extraidos[chave_norm] = valor.strip()

        if campos_extraidos:
            resultado["campos"] = campos_extraidos
            resultado["funcionario"]    = campos_extraidos.get('funcionario') or campos_extraidos.get('nome')
            resultado["campo_alterado"] = campos_extraidos.get('campo')
            resultado["valor_anterior"] = (campos_extraidos.get('de') or
                                           campos_extraidos.get('anterior') or
                                           campos_extraidos.get('valor_anterior'))
            resultado["valor_novo"]     = (campos_extraidos.get('para') or
                                           campos_extraidos.get('novo') or
                                           campos_extraidos.get('valor_novo'))
            resultado["observacao"]     = (campos_extraidos.get('motivo') or
                                           campos_extraidos.get('observacao') or
                                           campos_extraidos.get('obs'))
            return resultado

    # --- Tentativa 3: Extração de texto livre por regex ---
    resultado.update(_extrair_de_texto_livre(detalhes_str, acao))
    return resultado


def _classificar_acao(acao):
    """Classifica o tipo de ação para renderização visual no front-end."""
    if not acao:
        return "outro"
    a = acao.upper()
    if any(p in a for p in ['CRIAÇÃO', 'CRIOU', 'CRIADO', 'NOVO', 'ADICIONOU', 'INSERIU', 'CADASTRO']):
        return "criacao"
    if any(p in a for p in ['EDIÇÃO', 'EDITOU', 'ATUALIZ', 'ALTEROU', 'MODIFICOU', 'MUDOU', 'DADOS EM']):
        return "edicao"
    if any(p in a for p in ['EXCLUSÃO', 'EXCLUIU', 'DELETOU', 'REMOVEU', 'INATIVOU', 'DESATIVOU', 'DESLIGAMENTO']):
        return "exclusao"
    if any(p in a for p in ['LOGIN', 'ACESSO', 'ENTROU', 'AUTENTICOU']):
        return "acesso"
    if any(p in a for p in ['SENHA', 'PASSWORD', 'REDEFINIÇÃO']):
        return "senha"
    if any(p in a for p in ['EXPORT', 'RELATORIO', 'RELATÓRIO', 'DOWNLOAD']):
        return "exportacao"
    if any(p in a for p in ['APROVAÇÃO', 'APROVADO', 'APROVOU', 'RECUSOU', 'RECUSA']):
        return "aprovacao"
    if any(p in a for p in ['REATIVOU', 'REATIVAÇÃO', 'REATIVADO']):
        return "reativacao"
    if any(p in a for p in ['FOTO', 'IMAGEM', 'PERFIL']):
        return "foto"
    return "outro"


def _extrair_de_texto_livre(texto, acao):
    """Tenta extrair campos relevantes de uma string de texto livre usando regex."""
    resultado = {}

    # Nomes entre aspas simples
    padroes_nome = [
        r"usuário\s+'([^']+)'",
        r"funcionário\s+'([^']+)'",
        r"funcionário\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)",
        r"'([^']+)'\s+foi\s+",
    ]
    for padrao in padroes_nome:
        match = re.search(padrao, texto, re.IGNORECASE)
        if match:
            resultado["funcionario"] = match.group(1)
            break

    # Email
    email_match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', texto)
    if email_match:
        resultado["email"] = email_match.group(0)

    # Perfil
    for perfil in ['admin', 'aprovador', 'ativador', 'padrão', 'padrao']:
        if perfil in texto.lower():
            resultado["perfil"] = perfil
            break

    # Padrão "de 'X' para 'Y'"
    de_para = re.search(r"de\s+'?([^']+?)'?\s+para\s+'?([^']+?)'?\s*[.\n]", texto, re.IGNORECASE)
    if de_para:
        resultado["valor_anterior"] = de_para.group(1).strip()
        resultado["valor_novo"]     = de_para.group(2).strip()

    return resultado


@logs_bp.route('/acoes', methods=['GET'], strict_slashes=False)
@jwt_required()
def get_acoes():
    try:
        acoes = db.session.query(LogAtividade.acao).distinct().all()
        lista_acoes = [a[0] for a in acoes if a[0]]
        return jsonify(lista_acoes), 200
    except Exception as e:
        return jsonify([]), 200


# ============================================================================
# FUNÇÕES AUXILIARES PARA REGISTRAR LOGS DESCRITIVOS
# ============================================================================

def _agora_utc():
    """Retorna datetime atual em UTC (com tzinfo). Use em todos os logs."""
    return datetime.now(timezone.utc)


def registrar_log_alteracao(usuario_id, funcionario_id, funcionario_nome, campo_alterado,
                            valor_anterior, valor_novo, ip_origem=None):
    """Registra um log de alteração de campo específico num funcionário."""
    try:
        detalhes = json.dumps({
            "funcionario_id": funcionario_id,
            "funcionario": funcionario_nome,
            "campo": campo_alterado,
            "valor_anterior": str(valor_anterior) if valor_anterior is not None else "Vazio",
            "valor_novo": str(valor_novo) if valor_novo is not None else "Vazio"
        }, ensure_ascii=False)

        db.session.commit()
        return True
    except Exception as e:
        print(f"Erro ao registrar log: {str(e)}")
        db.session.rollback()
        return False


def registrar_log_criacao(usuario_id, entidade, entidade_id, dados_criados, ip_origem=None):
    """
    Registra um log detalhado de criação de qualquer entidade.

    Exemplo:
        registrar_log_criacao(
            usuario_id=current_user.id,
            entidade="Funcionário",
            entidade_id=novo.id,
            dados_criados={
                "nome": novo.nome,
                "matricula": novo.matricula,
                "cargo": novo.cargo,
                "departamento": novo.departamento,
            },
            ip_origem=request.remote_addr
        )
    """
    try:
        payload = {"entidade": entidade, "entidade_id": entidade_id}
        payload.update(dados_criados)
        detalhes = json.dumps(payload, ensure_ascii=False, default=str)

        log = LogAtividade(
            usuario_id=usuario_id,
            acao=f"Criação de {entidade}",
            detalhes=detalhes,
            ip_origem=ip_origem,
            data_hora=_agora_utc()   # ← garante UTC explicitamente
        )
        db.session.add(log)
        db.session.commit()
        return True
    except Exception as e:
        print(f"Erro ao registrar log de criação: {str(e)}")
        db.session.rollback()
        return False


def registrar_log_exclusao(usuario_id, entidade, entidade_id, dados_excluidos,
                            motivo=None, ip_origem=None):
    """
    Registra um log detalhado de exclusão/inativação de qualquer entidade.

    Exemplo:
        registrar_log_exclusao(
            usuario_id=current_user.id,
            entidade="Funcionário",
            entidade_id=func.id,
            dados_excluidos={"nome": func.nome, "matricula": func.matricula},
            motivo="Desligamento voluntário",
            ip_origem=request.remote_addr
        )
    """
    try:
        payload = {"entidade": entidade, "entidade_id": entidade_id}
        if motivo:
            payload["motivo"] = motivo
        payload.update(dados_excluidos)
        detalhes = json.dumps(payload, ensure_ascii=False, default=str)

        log = LogAtividade(
            usuario_id=usuario_id,
            acao=f"Exclusão de {entidade}",
            detalhes=detalhes,
            ip_origem=ip_origem,
            data_hora=_agora_utc()   # ← garante UTC explicitamente
        )
        db.session.add(log)
        db.session.commit()
        return True
    except Exception as e:
        print(f"Erro ao registrar log de exclusão: {str(e)}")
        db.session.rollback()
        return False
