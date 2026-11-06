from flask import Blueprint, request, jsonify
from extensions import db
from models import Candidato, AprovacaoCandidato, Funcionario, Usuario
from datetime import datetime
from decorators import token_required, aprovador_required, permissao_required, get_usuario_autenticado, pode_ver_indicacao
from flask_jwt_extended import get_jwt_identity
import os
import time
from PIL import Image

candidatos_bp = Blueprint("candidatos", __name__, url_prefix="/api/candidatos")


def gerar_miniatura(caminho_original, largura=150, altura=150):
    """Gera uma miniatura redimensionada da foto original."""
    try:
        if not os.path.exists(caminho_original):
            return None

        img = Image.open(caminho_original)
        img.thumbnail((largura, altura), Image.Resampling.LANCZOS)

        base, ext = os.path.splitext(caminho_original)
        caminho_miniatura = f"{base}_thumb.png"
        img.save(caminho_miniatura, 'PNG')

        return caminho_miniatura
    except Exception as e:
        print(f"Erro ao gerar miniatura: {e}")
        return None


def parse_data(valor):
    """Converte string de data para objeto date. Retorna None se vazio ou inválido."""
    if not valor:
        return None
    try:
        return datetime.strptime(valor, '%Y-%m-%d').date()
    except (ValueError, TypeError):
        return None


def parse_int(valor):
    """Converte string para int. Retorna None se vazio ou inválido."""
    if valor is None or valor == '':
        return None
    try:
        return int(valor)
    except (ValueError, TypeError):
        return None


def candidato_em_fluxo_aprovacao(candidato):
    """Verifica se um candidato está em fluxo de aprovação (tem pelo menos uma aprovação registrada)."""
    return AprovacaoCandidato.query.filter_by(candidato_id=candidato.id).first() is not None


@candidatos_bp.route("/stats", methods=["GET"])
@token_required
def obter_stats():
    """Retorna contagens de candidatos agrupadas por status."""
    try:
        usuario = get_usuario_autenticado()
        query = Candidato.query

        # Ativador vê apenas sua secretaria
        if usuario and usuario.perfil == 'ativador':
            query = query.filter_by(secretaria_id=usuario.secretaria_id)

        # Contar candidatos em fluxo de aprovação (têm aprovações registradas ou status pendente)
        pendentes = 0
        for candidato in query.filter(Candidato.status == 'pendente').all():
            # Candidato está pendente se tem status 'pendente' (incluindo os em fluxo)
            pendentes += 1
        
        aprovados  = query.filter(Candidato.status == 'aprovado').count()
        recusados  = query.filter(Candidato.status == 'recusado').count()
        contratados = query.filter(Candidato.status == 'contratado').count()

        return jsonify({
            "pendentes": pendentes,
            "aprovados": aprovados,
            "recusados": recusados,
            "contratados": contratados,
        }), 200
    except Exception as e:
        import traceback
        print(f"Erro ao obter stats: {str(e)}")
        print(traceback.format_exc())
        return jsonify({"erro": str(e)}), 500


@candidatos_bp.route("", methods=["GET"])
@token_required
@permissao_required('candidatos')
def listar_candidatos():
    try:
        usuario = get_usuario_autenticado()
        pagina = request.args.get('pagina', 1, type=int)
        por_pagina = request.args.get('por_pagina', 10, type=int)
        filtro_status = request.args.get('status', '')
        filtro_empresa = request.args.get('empresa_id', '')
        filtro_secretaria = request.args.get('secretaria_id', '')
        busca = request.args.get('busca', '')
        indicacao = request.args.get('indicacao', '')

        query = Candidato.query

        if usuario and usuario.perfil == 'ativador':
            query = query.filter_by(secretaria_id=usuario.secretaria_id)

        # CORREÇÃO: Filtro de pendentes agora inclui candidatos em fluxo de aprovação
        if filtro_status:
            if filtro_status == 'pendente':
                # Mostrar candidatos com status 'pendente' (incluindo os em fluxo de aprovação)
                query = query.filter_by(status='pendente')
            else:
                query = query.filter_by(status=filtro_status)
        
        if filtro_empresa:
            query = query.filter_by(empresa_id=filtro_empresa)
        if filtro_secretaria:
            if usuario and usuario.perfil == 'ativador':
                pass
            else:
                query = query.filter_by(secretaria_id=filtro_secretaria)

        # Filtro por indicação só vale para quem pode ver a indicação
        if indicacao and pode_ver_indicacao(usuario):
            termo_indicacao = f"%{indicacao}%"
            query = query.filter(Candidato.observacoes.ilike(termo_indicacao))

        if busca:
            query = query.filter(
                (Candidato.nome.ilike(f"%{busca}%")) |
                (Candidato.cpf.ilike(f"%{busca}%"))
            )

        total = query.count()
        candidatos = query.paginate(page=pagina, per_page=por_pagina, error_out=False)

        return jsonify({
            "candidatos": [c.to_dict() for c in candidatos.items],
            "total": total,
            "paginas": candidatos.pages,
            "pagina_atual": pagina
        }), 200
    except Exception as e:
        import traceback
        print(f"Erro ao listar candidatos: {str(e)}")
        print(traceback.format_exc())
        return jsonify({"erro": str(e), "tipo_erro": type(e).__name__}), 500


@candidatos_bp.route("/<int:candidato_id>", methods=["GET"])
@token_required
@permissao_required('candidatos')
def obter_candidato(candidato_id):
    try:
        usuario = get_usuario_autenticado()
        candidato = db.session.get(Candidato, candidato_id)
        if not candidato:
            return jsonify({"erro": "Candidato não encontrado"}), 404

        if usuario and usuario.perfil == 'ativador' and candidato.secretaria_id != usuario.secretaria_id:
            return jsonify({"erro": "Acesso negado. Você só pode visualizar candidatos da sua secretaria."}), 403

        aprovacoes = AprovacaoCandidato.query.filter_by(candidato_id=candidato_id).all()

        return jsonify({
            "candidato": candidato.to_dict(),
            "aprovacoes": [a.to_dict() for a in aprovacoes]
        }), 200
    except Exception as e:
        import traceback
        print(f"Erro ao obter candidato: {str(e)}")
        print(traceback.format_exc())
        return jsonify({"erro": str(e)}), 500


@candidatos_bp.route("/verificar-cpf", methods=["GET"])
@token_required
def verificar_cpf():
    cpf_raw = request.args.get('cpf', '').strip()
    cpf = ''.join(filter(str.isdigit, cpf_raw))

    if len(cpf) != 11:
        return jsonify({"erro": "CPF inválido"}), 400

    resultado = {"encontrado": False, "origem": None, "detalhes": None}

    funcionario = Funcionario.query.filter(
        Funcionario.cpf.ilike(f"%{cpf}%"),
        Funcionario.status_contratual == 0
    ).first()

    if funcionario:
        resultado["encontrado"] = True
        resultado["origem"] = "desligado"
        resultado["detalhes"] = {
            "nome": funcionario.nome,
            "cargo": funcionario.cargo,
            "cpf": funcionario.cpf
        }
        return jsonify(resultado), 200

    candidato = Candidato.query.filter(
        Candidato.cpf.ilike(f"%{cpf}%"),
        Candidato.status.notin_(['recusado', 'desligado'])
    ).first()

    if candidato:
        resultado["encontrado"] = True
        resultado["origem"] = "candidato"
        resultado["detalhes"] = {
            "nome": candidato.nome,
            "cargo": candidato.cargo,
            "cpf": candidato.cpf,
            "status": candidato.status
        }
        return jsonify(resultado), 200

    return jsonify(resultado), 200


@candidatos_bp.route("", methods=["POST"])
@token_required
@permissao_required('criar_candidato')
def criar_candidato():
    try:
        usuario = get_usuario_autenticado()
        if not usuario:
            return jsonify({"erro": "Usuário não autenticado"}), 401

        if request.is_json:
            dados = request.get_json()
        else:
            dados = request.form.to_dict()

        sec_id = parse_int(dados.get('secretaria_id'))
        if usuario.perfil == 'ativador':
            sec_id = usuario.secretaria_id

        empresa_id = parse_int(dados.get('empresa_id'))
        data_inicio_prevista = parse_data(dados.get('data_inicio_prevista'))

        candidato = Candidato(
            nome=dados.get('nome'),
            email=dados.get('email'),
            cpf=dados.get('cpf'),
            telefone=dados.get('telefone'),
            cargo=dados.get('cargo'),
            setor=dados.get('setor'),
            empresa_id=empresa_id,
            secretaria_id=sec_id,
            data_inicio_prevista=data_inicio_prevista,
            # Indicação só é gravada se o usuário puder ver/editar esse campo
            observacoes=dados.get('observacoes') if pode_ver_indicacao(usuario) else None,
            status='pendente',
            usuario_solicitante_id=usuario.id
        )

        if 'foto' in request.files:
            file = request.files['foto']
            if file and file.filename:
                filename = f"candidato_{int(time.time())}_{usuario.id}.png"
                upload_dir = os.path.join(os.path.dirname(__file__), '..', 'uploads', 'candidatos')
                os.makedirs(upload_dir, exist_ok=True)
                caminho_completo = os.path.join(upload_dir, filename)
                file.save(caminho_completo)
                # CORREÇÃO: Salvando no banco de dados referenciando a nova pasta
                candidato.foto = f"/uploads/candidatos/{filename}"
                gerar_miniatura(caminho_completo)

        db.session.add(candidato)
        db.session.commit()

        return jsonify({"mensagem": "Candidato criado com sucesso!", "candidato": candidato.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        import traceback
        print(f"Erro ao criar candidato: {str(e)}")
        print(traceback.format_exc())
        return jsonify({"erro": str(e), "tipo_erro": type(e).__name__}), 500


@candidatos_bp.route("/<int:candidato_id>", methods=["PUT"])
@token_required
@permissao_required('editar_candidato')
def editar_candidato(candidato_id):
    try:
        usuario = get_usuario_autenticado()
        if not usuario:
            return jsonify({"erro": "Usuário não autenticado"}), 401

        candidato = db.session.get(Candidato, candidato_id)
        if not candidato:
            return jsonify({"erro": "Candidato não encontrado"}), 404

        if usuario and usuario.perfil == 'ativador' and candidato.secretaria_id != usuario.secretaria_id:
            return jsonify({"erro": "Acesso negado. Você só pode editar candidatos da sua secretaria."}), 403

        if request.is_json:
            dados = request.get_json()
        else:
            dados = request.form.to_dict()
            if 'empresa_id' in dados and dados['empresa_id']:
                dados['empresa_id'] = parse_int(dados['empresa_id'])
            if 'secretaria_id' in dados and dados['secretaria_id']:
                dados['secretaria_id'] = parse_int(dados['secretaria_id'])

        alteracoes = []

        if 'nome' in dados and candidato.nome != dados['nome']:
            alteracoes.append("Nome alterado")
            candidato.nome = dados['nome']
        if 'email' in dados and candidato.email != dados['email']:
            alteracoes.append("Email alterado")
            candidato.email = dados['email']
        if 'cpf' in dados and candidato.cpf != dados['cpf']:
            alteracoes.append("CPF alterado")
            candidato.cpf = dados['cpf']
        if 'telefone' in dados and candidato.telefone != dados['telefone']:
            alteracoes.append("Telefone alterado")
            candidato.telefone = dados['telefone']
        if 'cargo' in dados and candidato.cargo != dados['cargo']:
            alteracoes.append("Cargo alterado")
            candidato.cargo = dados['cargo']
        if 'setor' in dados and candidato.setor != dados['setor']:
            alteracoes.append("Setor alterado")
            candidato.setor = dados['setor']
        if 'empresa_id' in dados and candidato.empresa_id != dados['empresa_id']:
            alteracoes.append("Empresa alterada")
            candidato.empresa_id = dados['empresa_id']
        if 'secretaria_id' in dados and candidato.secretaria_id != dados['secretaria_id']:
            if usuario.perfil == 'ativador':
                return jsonify({"erro": "Ativadores não podem alterar a secretaria do candidato."}), 403
            alteracoes.append("Secretaria alterada")
            candidato.secretaria_id = dados['secretaria_id']
        if 'data_inicio_prevista' in dados:
            nova_data = parse_data(dados['data_inicio_prevista'])
            if candidato.data_inicio_prevista != nova_data:
                alteracoes.append("Data de início prevista alterada")
                candidato.data_inicio_prevista = nova_data
        if 'observacoes' in dados and pode_ver_indicacao(usuario) and candidato.observacoes != dados['observacoes']:
            alteracoes.append("Observações alteradas")
            candidato.observacoes = dados['observacoes']

        if 'foto' in request.files:
            file = request.files['foto']
            if file and file.filename:
                filename = f"candidato_{int(time.time())}_{usuario.id}.png"
                upload_dir = os.path.join(os.path.dirname(__file__), '..', 'uploads', 'candidatos')
                os.makedirs(upload_dir, exist_ok=True)
                caminho_completo = os.path.join(upload_dir, filename)
                file.save(caminho_completo)
                # CORREÇÃO: Salvando no banco de dados referenciando a nova pasta
                candidato.foto = f"/uploads/candidatos/{filename}"
                gerar_miniatura(caminho_completo)
                alteracoes.append("Foto atualizada")

        if alteracoes:
            from services.log_service import registrar_log
            registrar_log(
                acao="Edição de Candidato",
                usuario_id=usuario.id,
                entidade="Candidato",
                entidade_id=candidato.id,
                detalhes=f"Candidato '{candidato.nome}' editado: {'; '.join(alteracoes)}."
            )

        candidato.data_atualizacao = datetime.now()
        db.session.commit()

        if 'foto' in request.files and candidato.funcionario_id:
            try:
                funcionario = db.session.get(Funcionario, candidato.funcionario_id)
                if funcionario:
                    foto_normalizada = candidato.foto
                    if foto_normalizada:
                        foto_normalizada = foto_normalizada.replace('//', '/')
                        # CORREÇÃO: Padronizando para a pasta nova, limpando qualquer sujeira de 'static/'
                        if foto_normalizada.startswith('/static/uploads/'):
                            foto_normalizada = foto_normalizada.replace('/static/uploads/', '/uploads/')

                    funcionario.foto = foto_normalizada
                    funcionario.data_atualizacao = datetime.now()
                    db.session.commit()
            except Exception as e:
                pass

        return jsonify({"mensagem": "Candidato atualizado com sucesso!", "candidato": candidato.to_dict()}), 200
    except Exception as e:
        db.session.rollback()
        import traceback
        print(f"Erro ao editar candidato: {str(e)}")
        print(traceback.format_exc())
        return jsonify({"erro": str(e)}), 500


@candidatos_bp.route("/<int:candidato_id>", methods=["DELETE"])
@token_required
@permissao_required('excluir_candidato')
def deletar_candidato(candidato_id):
    try:
        usuario = get_usuario_autenticado()
        candidato = db.session.get(Candidato, candidato_id)
        if not candidato:
            return jsonify({"erro": "Candidato não encontrado"}), 404

        if usuario and usuario.perfil == 'ativador' and candidato.secretaria_id != usuario.secretaria_id:
            return jsonify({"erro": "Acesso negado."}), 403

        aprovacoes_existentes = AprovacaoCandidato.query.filter_by(candidato_id=candidato_id).first()

        if aprovacoes_existentes and usuario.perfil not in ['aprovador', 'admin']:
            return jsonify({
                "erro": "Não é possível deletar este candidato. O processo de aprovação já foi iniciado. Apenas edição é permitida.",
                "status": "processo_iniciado"
            }), 409

        from services.log_service import registrar_log
        registrar_log(
            acao="Exclusão de Candidato",
            usuario_id=usuario.id if usuario else None,
            entidade="Candidato",
            entidade_id=candidato.id,
            detalhes=f"Candidato '{candidato.nome}' (CPF: {candidato.cpf}) foi deletado."
        )

        db.session.delete(candidato)
        db.session.commit()

        return jsonify({"mensagem": "Candidato deletado com sucesso!"}), 200
    except Exception as e:
        db.session.rollback()
        import traceback
        print(f"Erro ao deletar candidato: {str(e)}")
        print(traceback.format_exc())
        return jsonify({"erro": str(e)}), 500


@candidatos_bp.route("/<int:candidato_id>/aprovar", methods=["POST"])
@token_required
@aprovador_required
def aprovar_candidato(candidato_id):
    """
    LÓGICA CORRIGIDA:
    - Todos os 3 níveis devem aprovar para o candidato ser contratado
    - Se qualquer nível recusa, o candidato é recusado imediatamente
    - Enquanto não todos votarem, o status permanece 'pendente'
    """
    try:
        usuario = get_usuario_autenticado()
        if not usuario:
            return jsonify({"erro": "Usuário não autenticado"}), 401

        candidato = db.session.get(Candidato, candidato_id)
        if not candidato:
            return jsonify({"erro": "Candidato não encontrado"}), 404

        nivel_usuario = usuario.nivel_aprovacao
        if not nivel_usuario:
            return jsonify({"erro": "Usuário não tem nível de aprovação definido"}), 400

        # CORREÇÃO: Implementar ordem sequencial de aprovação
        # Ordem: Vice-Prefeito → Prefeito → Planejamento
        ordem_niveis = ['vice_prefeito', 'prefeito', 'planejamento']
        
        # Verifica se este nível já votou
        voto_existente = AprovacaoCandidato.query.filter_by(
            candidato_id=candidato_id, nivel_aprovacao=nivel_usuario
        ).first()

        if voto_existente:
            return jsonify({"erro": f"O nível '{nivel_usuario}' já registrou um voto."}), 400

        # Se já há uma recusa, não permite mais aprovações
        recusa_existente = AprovacaoCandidato.query.filter_by(
            candidato_id=candidato_id, acao='recusado'
        ).first()

        if recusa_existente:
            return jsonify({"erro": "Candidato recusado por outro aprovador. A aprovação/recusa só ocorrerá se todos os aprovadores estiverem de acordo."}), 400

        # Verifica a ordem sequencial
        todas_aprovacoes = AprovacaoCandidato.query.filter_by(candidato_id=candidato_id).all()
        niveis_votados = [a.nivel_aprovacao for a in todas_aprovacoes]
        indice_usuario = ordem_niveis.index(nivel_usuario) if nivel_usuario in ordem_niveis else -1
        
        if indice_usuario > 0:
            # Verifica se o nível anterior já votou
            nivel_anterior = ordem_niveis[indice_usuario - 1]
            if nivel_anterior not in niveis_votados:
                return jsonify({"erro": f"O {nivel_anterior.replace('_', ' ').title()} deve aprovar primeiro."}), 400

        dados = request.get_json(silent=True) or request.form.to_dict() or {}
        motivo = dados.get('motivo', '')

        aprovacao = AprovacaoCandidato(
            candidato_id=candidato_id,
            aprovador_id=usuario.id,
            nivel_aprovacao=nivel_usuario,
            acao='aprovado',
            motivo=motivo
        )
        db.session.add(aprovacao)
        db.session.flush()

        from services.log_service import registrar_log
        niveis_nomes = {'vice_prefeito': 'Vice-Prefeito', 'prefeito': 'Prefeito', 'planejamento': 'Planejamento'}

        registrar_log(
            acao="Aprovação de Candidato",
            usuario_id=usuario.id,
            entidade="Candidato",
            entidade_id=candidato.id,
            detalhes=f"Candidato '{candidato.nome}' aprovado no nível {niveis_nomes.get(nivel_usuario, nivel_usuario)}."
        )

        # Avaliar o status global
        niveis_necessarios = {'vice_prefeito', 'prefeito', 'planejamento'}
        todas_aprovacoes = AprovacaoCandidato.query.filter_by(candidato_id=candidato_id).all()
        votos_por_nivel = {a.nivel_aprovacao: a.acao for a in todas_aprovacoes}

        mensagem = f"Aprovação registrada pelo {niveis_nomes.get(nivel_usuario, nivel_usuario)}. Status permanece Pendente até todos votarem."

        # CORREÇÃO: Nova lógica - Os 3 DEVEM APROVAR para contratar, Os 3 DEVEM RECUSAR para recusar
        # Se TODOS os 3 níveis necessários já votaram
        if set(votos_por_nivel.keys()).issuperset(niveis_necessarios):
            # Se TODOS aprovaram, candidato é CONTRATADO
            if all(acao == 'aprovado' for acao in votos_por_nivel.values()):
                candidato.status = 'contratado'
                mensagem = "Todos aprovaram! Candidato CONTRATADO com sucesso."

                # Normalizar caminho da foto para garantir que o funcionario receba
                # o mesmo padrao de caminho utilizado pelo modulo de funcionarios
                foto_funcionario = None
                if candidato.foto:
                    foto_norm = candidato.foto.replace('\\', '/').strip()
                    while '//' in foto_norm:
                        foto_norm = foto_norm.replace('//', '/')
                    if not foto_norm.startswith('/'):
                        foto_norm = '/' + foto_norm
                        
                    # CORREÇÃO: Se a foto antiga ainda tiver '/static/uploads', nós limpamos para virar apenas '/uploads'
                    if foto_norm.startswith('/static/uploads/'):
                        foto_norm = foto_norm.replace('/static/uploads/', '/uploads/')
                        
                    foto_funcionario = foto_norm

                # Repassar as observacoes do candidato (campo "indicacao") diretamente
                # sem misturar com outros dados, para que o supermodal exiba corretamente
                indicacao_funcionario = candidato.observacoes.strip() if candidato.observacoes and candidato.observacoes.strip() else None

                novo_funcionario = Funcionario(
                    nome=candidato.nome,
                    matricula=f"CAND_{candidato.id}",
                    cargo=candidato.cargo,
                    setor=candidato.setor,
                    cpf=candidato.cpf,
                    empresa_id=candidato.empresa_id,
                    secretaria_id=candidato.secretaria_id,
                    foto=foto_funcionario,
                    status_contratual=1,
                    observacao=indicacao_funcionario
                )
                db.session.add(novo_funcionario)
                db.session.flush()
                candidato.funcionario_id = novo_funcionario.id

                registrar_log(
                    acao="Contratação de Candidato",
                    usuario_id=usuario.id,
                    entidade="Candidato",
                    entidade_id=candidato.id,
                    detalhes=f"Candidato '{candidato.nome}' foi contratado após aprovação unânime."
                )
            # Se TODOS recusaram, candidato é RECUSADO
            elif all(acao == 'recusado' for acao in votos_por_nivel.values()):
                candidato.status = 'recusado'
                mensagem = "Todos recusaram! Candidato RECUSADO."
            else:
                # Votos mistos (nem todos aprovam, nem todos recusam)
                candidato.status = 'pendente'
                mensagem = "Todos votaram, mas não há unanimidade. Status permanece Pendente."
        else:
            # Ainda não todos votaram
            candidato.status = 'pendente'

        candidato.data_atualizacao = datetime.now()
        db.session.commit()
        return jsonify({"mensagem": mensagem}), 200
    except Exception as e:
        db.session.rollback()
        import traceback
        print(f"Erro ao aprovar candidato: {str(e)}")
        print(traceback.format_exc())
        return jsonify({"erro": str(e)}), 500


@candidatos_bp.route("/<int:candidato_id>/recusar", methods=["POST"])
@token_required
@aprovador_required
def recusar_candidato(candidato_id):
    """
    LÓGICA CORRIGIDA:
    - Uma recusa de qualquer nível resulta em candidato RECUSADO imediatamente
    - Não permite mais aprovações após uma recusa
    """
    try:
        usuario = get_usuario_autenticado()
        if not usuario:
            return jsonify({"erro": "Usuário não autenticado"}), 401

        candidato = db.session.get(Candidato, candidato_id)
        if not candidato:
            return jsonify({"erro": "Candidato não encontrado"}), 404

        nivel_usuario = usuario.nivel_aprovacao
        if not nivel_usuario:
            return jsonify({"erro": "Usuário não tem nível de aprovação."}), 400

        # CORREÇÃO: Implementar ordem sequencial de aprovação
        # Ordem: Vice-Prefeito → Prefeito → Planejamento
        ordem_niveis = ['vice_prefeito', 'prefeito', 'planejamento']

        # Verifica se já votou
        voto_existente = AprovacaoCandidato.query.filter_by(
            candidato_id=candidato_id, nivel_aprovacao=nivel_usuario
        ).first()

        if voto_existente:
            return jsonify({"erro": f"O nível '{nivel_usuario}' já registrou um voto."}), 400

        # Verifica a ordem sequencial
        todas_aprovacoes = AprovacaoCandidato.query.filter_by(candidato_id=candidato_id).all()
        niveis_votados = [a.nivel_aprovacao for a in todas_aprovacoes]
        indice_usuario = ordem_niveis.index(nivel_usuario) if nivel_usuario in ordem_niveis else -1
        
        if indice_usuario > 0:
            # Verifica se o nível anterior já votou
            nivel_anterior = ordem_niveis[indice_usuario - 1]
            if nivel_anterior not in niveis_votados:
                return jsonify({"erro": f"O {nivel_anterior.replace('_', ' ').title()} deve aprovar/recusar primeiro."}), 400

        dados = request.get_json(silent=True) or request.form.to_dict() or {}
        motivo = dados.get('motivo')

        if not motivo:
            return jsonify({"erro": "O motivo da recusa é obrigatório."}), 400

        aprovacao = AprovacaoCandidato(
            candidato_id=candidato_id,
            aprovador_id=usuario.id,
            nivel_aprovacao=nivel_usuario,
            acao='recusado',
            motivo=motivo
        )
        db.session.add(aprovacao)
        db.session.flush()

        from services.log_service import registrar_log
        niveis_nomes = {'vice_prefeito': 'Vice-Prefeito', 'prefeito': 'Prefeito', 'planejamento': 'Planejamento'}
        registrar_log(
            acao="Recusa de Candidato",
            usuario_id=usuario.id,
            entidade="Candidato",
            entidade_id=candidato.id,
            detalhes=f"Candidato '{candidato.nome}' recusado no nível {niveis_nomes.get(nivel_usuario, nivel_usuario)}. Motivo: {motivo}"
        )

        # CORREÇÃO: Nova lógica - Os 3 DEVEM RECUSAR para recusar o candidato
        # Avaliar o status global
        niveis_necessarios = {'vice_prefeito', 'prefeito', 'planejamento'}
        todas_aprovacoes = AprovacaoCandidato.query.filter_by(candidato_id=candidato_id).all()
        votos_por_nivel = {a.nivel_aprovacao: a.acao for a in todas_aprovacoes}

        mensagem = f"Recusa registrada pelo {niveis_nomes.get(nivel_usuario, nivel_usuario)}. Status permanece Pendente até todos votarem."

        # Se TODOS os 3 níveis necessários já votaram
        if set(votos_por_nivel.keys()).issuperset(niveis_necessarios):
            # Se TODOS recusaram, candidato é RECUSADO
            if all(acao == 'recusado' for acao in votos_por_nivel.values()):
                candidato.status = 'recusado'
                mensagem = "Todos recusaram! Candidato RECUSADO."
            else:
                # Votos mistos (nem todos recusam)
                candidato.status = 'pendente'
                mensagem = "Todos votaram, mas não há unanimidade na recusa. Status permanece Pendente."
        else:
            # Ainda não todos votaram
            candidato.status = 'pendente'

        candidato.data_atualizacao = datetime.now()
        db.session.commit()

        return jsonify({"mensagem": mensagem}), 200
    except Exception as e:
        db.session.rollback()
        import traceback
        print(f"Erro ao recusar candidato: {str(e)}")
        print(traceback.format_exc())
        return jsonify({"erro": str(e)}), 500


@candidatos_bp.route("/sincronizar-desligamento/<int:funcionario_id>", methods=["POST"])
@token_required
def sincronizar_desligamento(funcionario_id):
    try:
        usuario = get_usuario_autenticado()
        if not usuario:
            return jsonify({"erro": "Usuário não autenticado"}), 401

        dados = request.get_json(silent=True) or request.form.to_dict() or {}

        candidato = Candidato.query.filter_by(funcionario_id=funcionario_id).first()

        if candidato:
            candidato.status = 'desligado'
            candidato.data_atualizacao = datetime.now()

            desligamento = AprovacaoCandidato(
                candidato_id=candidato.id,
                aprovador_id=usuario.id,
                nivel_aprovacao='desligamento',
                acao='desligado',
                motivo=dados.get('motivo', 'Desligado do painel de funcionários')
            )
            db.session.add(desligamento)
            db.session.commit()

            return jsonify({"mensagem": "Desligamento sincronizado com sucesso!"}), 200

        return jsonify({"mensagem": "Candidato não encontrado, mas desligamento registrado."}), 200
    except Exception as e:
        db.session.rollback()
        import traceback
        print(f"Erro ao sincronizar desligamento: {str(e)}")
        print(traceback.format_exc())
        return jsonify({"erro": str(e)}), 500


@candidatos_bp.route("/<int:candidato_id>/reiniciar-fluxo", methods=["POST"])
@token_required
@aprovador_required
def reiniciar_fluxo_candidato(candidato_id):
    """
    Permite que um aprovador reinicie seu voto.
    Remove o voto anterior e permite votar novamente.
    """
    try:
        usuario = get_usuario_autenticado()
        if not usuario:
            return jsonify({"erro": "Usuario nao autenticado"}), 401

        candidato = db.session.get(Candidato, candidato_id)
        if not candidato:
            return jsonify({"erro": "Candidato nao encontrado"}), 404

        nivel_usuario = usuario.nivel_aprovacao
        if not nivel_usuario:
            return jsonify({"erro": "Usuario nao tem nivel de aprovacao definido"}), 400

        # Verifica se este nivel ja votou
        voto_existente = AprovacaoCandidato.query.filter_by(
            candidato_id=candidato_id, nivel_aprovacao=nivel_usuario
        ).first()

        if not voto_existente:
            return jsonify({"erro": "Voce ainda nao votou neste candidato."}), 400

        # Remove o voto anterior
        from services.log_service import registrar_log
        niveis_nomes = {'vice_prefeito': 'Vice-Prefeito', 'prefeito': 'Prefeito', 'planejamento': 'Planejamento'}
        
        voto_anterior = voto_existente.acao
        db.session.delete(voto_existente)
        db.session.flush()

        # Registra a acao de reinicializacao
        registrar_log(
            acao="Reinicio de Fluxo de Candidato",
            usuario_id=usuario.id,
            entidade="Candidato",
            entidade_id=candidato.id,
            detalhes=f"Candidato '{candidato.nome}' teve seu voto reiniciado pelo {niveis_nomes.get(nivel_usuario, nivel_usuario)}. Voto anterior: {voto_anterior}."
        )

        # Retorna o candidato para status pendente
        candidato.status = 'pendente'
        candidato.data_atualizacao = datetime.now()
        db.session.commit()

        return jsonify({
            "mensagem": f"Fluxo reiniciado com sucesso. Seu voto anterior ({voto_anterior}) foi removido. Voce pode votar novamente."
        }), 200
    except Exception as e:
        db.session.rollback()
        import traceback
        print(f"Erro ao reiniciar fluxo: {str(e)}")
        print(traceback.format_exc())
        return jsonify({"erro": str(e)}), 500