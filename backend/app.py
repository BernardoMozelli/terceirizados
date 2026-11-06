import os
from datetime import datetime
from flask import Flask, send_from_directory, jsonify, request
from flask_migrate import Migrate
from flask_jwt_extended import JWTManager, verify_jwt_in_request, get_jwt_identity
from flask_cors import CORS

from extensions import db, mail
from config import Config
import models  # importa modelos para registar no metadata
from services.log_service import registrar_log


def create_app():
    # Configuração da pasta static para apontar para o frontend
    static_folder_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../frontend'))
    
    app = Flask(
        __name__,
        static_folder=static_folder_path,
        static_url_path='/static'
    )
    
    CORS(app, supports_credentials=True)
    app.config.from_object(Config)

    # ==========================================================
    # CORREÇÃO DO ERRO 413: Aumenta o limite de upload para 16MB
    # ==========================================================
    app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

    db.init_app(app)
    mail.init_app(app)
    migrate = Migrate(app, db)
    jwt = JWTManager(app)

    # Callback para carregar o utilizador a partir do token JWT
    @jwt.user_lookup_loader
    def user_lookup_callback(_jwt_header, jwt_data):
        identity = jwt_data["sub"]
        from models import Usuario 
        return db.session.get(Usuario, identity)

    # Importa e regista blueprints
    from routes.usuarios import usuarios_bp
    from routes.empresas import empresas_bp
    from routes.auth import auth_bp
    from routes.funcionarios import funcionarios_bp
    from routes.confirmacoes_status import confirmacoes_bp
    from routes.logs_atividades import logs_bp
    from routes.dashboard import dashboard_bp
    from routes.importacao import importar_bp
    from routes.secretarias import secretarias_bp
    from routes.transferencias import transferencias_bp
    from routes.configuracoes import configuracoes_bp
    from routes.cron import cron_bp
    from routes.index import index_bp
    from routes.candidatos import candidatos_bp
    from routes.relatorios import relatorios_bp
    from routes.funcionarios_super_modal import funcionarios_super_modal_bp

    app.register_blueprint(usuarios_bp, url_prefix="/api/usuarios")
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(empresas_bp, url_prefix="/api/empresas")
    app.register_blueprint(funcionarios_bp, url_prefix="/api/funcionarios")
    app.register_blueprint(confirmacoes_bp, url_prefix="/api/confirmacoes_status")
    app.register_blueprint(logs_bp, url_prefix="/api/logs_atividades")
    app.register_blueprint(dashboard_bp, url_prefix="/api/dashboard")
    app.register_blueprint(importar_bp)
    app.register_blueprint(secretarias_bp, url_prefix="/api/secretarias")
    app.register_blueprint(transferencias_bp, url_prefix="/api/transferencias")
    app.register_blueprint(configuracoes_bp, url_prefix="/api/configuracoes")
    app.register_blueprint(candidatos_bp, url_prefix="/api/candidatos")
    app.register_blueprint(relatorios_bp)
    app.register_blueprint(funcionarios_super_modal_bp, url_prefix="/api/funcionarios")
    app.register_blueprint(cron_bp)

    # ==========================================================
    # 1. SOLUÇÃO DAS FOTOS (Obrigatório para manter as imagens)
    # ==========================================================
    @app.before_request
    def interceptador_de_fotos():
        if request.path.startswith('/static/uploads/'):
            filename = request.path.replace('/static/uploads/', '')
            pasta_antiga = os.path.join(app.root_path, 'static', 'uploads')
            if os.path.exists(os.path.join(pasta_antiga, filename)):
                resposta = send_from_directory(pasta_antiga, filename)
                resposta.headers.add('Access-Control-Allow-Origin', '*')
                return resposta

        if request.path.startswith('/uploads/'):
            filename = request.path.replace('/uploads/', '')
            pasta_nova = os.path.join(app.root_path, 'uploads')
            if os.path.exists(os.path.join(pasta_nova, filename)):
                resposta = send_from_directory(pasta_nova, filename)
                resposta.headers.add('Access-Control-Allow-Origin', '*')
                return resposta

    @app.route('/api/arquivos/<path:filepath>')
    def serve_arquivos_unificado(filepath):
        # Limpa o caminho para pegar apenas o que vem depois de 'uploads/'
        # Exemplo: 'static/uploads/foto.png' -> 'foto.png'
        # Exemplo: 'uploads/candidatos/foto.png' -> 'candidatos/foto.png'
        filename = filepath.split('uploads/')[-1] if 'uploads/' in filepath else filepath
        
        pasta_nova = os.path.join(app.root_path, 'uploads')
        pasta_antiga = os.path.join(app.root_path, 'static', 'uploads')
        
        # Tenta encontrar na pasta nova (uploads/)
        caminho_completo_novo = os.path.join(pasta_nova, filename)
        if os.path.exists(caminho_completo_novo):
            diretorio = os.path.dirname(caminho_completo_novo)
            nome_arquivo = os.path.basename(caminho_completo_novo)
            resposta = send_from_directory(diretorio, nome_arquivo)
            resposta.headers.add('Access-Control-Allow-Origin', '*')
            return resposta
            
        # Tenta encontrar na pasta antiga (static/uploads/)
        caminho_completo_antigo = os.path.join(pasta_antiga, filename)
        if os.path.exists(caminho_completo_antigo):
            diretorio = os.path.dirname(caminho_completo_antigo)
            nome_arquivo = os.path.basename(caminho_completo_antigo)
            resposta = send_from_directory(diretorio, nome_arquivo)
            resposta.headers.add('Access-Control-Allow-Origin', '*')
            return resposta
            
        return jsonify({"erro": "Foto não encontrada no servidor"}), 404


    # ==========================================================
    # 2. INTERCETOR DE LOGS GLOBAL (Grava tudo automaticamente)
    # ==========================================================
    @app.after_request
    def auditar_todas_requisicoes(response):
        if request.method in ['POST', 'PUT', 'DELETE', 'PATCH']:
            if '/api/auth' not in request.path and '/api/arquivos' not in request.path:
                if 200 <= response.status_code < 300:
                    try:
                        verify_jwt_in_request(optional=True)
                        usuario_id = get_jwt_identity()
                        
                        # Pegamos o nome do usuário atual para a frase
                        from models import Usuario
                        user_obj = db.session.get(Usuario, usuario_id) if usuario_id else None
                        nome_quem_fez = user_obj.nome if user_obj else "Um usuário"

                        if usuario_id:
                            partes = request.path.split('/')
                            modulo = partes[2].replace('_', ' ').capitalize() if len(partes) > 2 else "Sistema"
                            
                            # Mapeamento de verbos para frases
                            metodo_map = {
                                'POST': 'criou um novo registro',
                                'PUT': 'atualizou dados',
                                'PATCH': 'modificou parcialmente',
                                'DELETE': 'excluiu um registro'
                            }
                            
                            acao_resumida = f"{metodo_map.get(request.method, 'realizou ação')} em {modulo}"
                            
                            # Montando a frase que você pediu
                            data_formatada = datetime.now().strftime('%d/%m/%Y às %H:%M')
                            detalhes_humanos = f"O usuário {nome_quem_fez} {metodo_map.get(request.method)} no módulo {modulo} em {data_formatada}."

                            # Se for uma reativação específica (detectada pela URL)
                            if 'reativar' in request.path:
                                acao_resumida = "REATIVAÇÃO"
                                detalhes_humanos = f"{nome_quem_fez} reativou um registro no módulo {modulo}."

                            registrar_log(
                                acao=acao_resumida.upper(),
                                usuario_id=usuario_id,
                                entidade=modulo,
                                detalhes=detalhes_humanos
                            )
                    except Exception:
                        pass
        return response

    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=True)