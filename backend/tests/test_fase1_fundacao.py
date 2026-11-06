"""
Testes para Fase 1 - Fundação

Testa:
- Modelos de Candidato e AprovacaoCandidato
- Decoradores de permissão
- Rota de login com perfil e permissões
- Rota /me para dados do usuário
"""

import pytest
import json
from datetime import datetime, date
from app import create_app
from extensions import db
from models import Usuario, Candidato, AprovacaoCandidato, Empresa, Secretaria, Permissao


@pytest.fixture
def app():
    """Criar aplicação de teste."""
    app = create_app()
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    
    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    """Criar cliente de teste."""
    return app.test_client()


@pytest.fixture
def setup_data(app):
    """Configurar dados de teste."""
    with app.app_context():
        # Criar secretaria
        secretaria = Secretaria(nome="Secretaria de Teste")
        db.session.add(secretaria)
        db.session.flush()
        
        # Criar empresa
        empresa = Empresa(
            nome="Empresa Teste",
            cnpj="12.345.678/0001-90"
        )
        db.session.add(empresa)
        db.session.flush()
        
        # Criar usuário aprovador
        usuario_aprovador = Usuario(
            nome="João Aprovador",
            matricula="APR001",
            email="aprovador@test.com",
            perfil="aprovador",
            nivel_aprovacao="vice_prefeito",
            secretaria_id=secretaria.id
        )
        usuario_aprovador.set_password("senha123")
        db.session.add(usuario_aprovador)
        db.session.flush()
        
        # Criar usuário solicitante
        usuario_solicitante = Usuario(
            nome="Maria Solicitante",
            matricula="SOL001",
            email="solicitante@test.com",
            perfil="usuario",
            secretaria_id=secretaria.id
        )
        usuario_solicitante.set_password("senha123")
        db.session.add(usuario_solicitante)
        db.session.flush()
        
        # Criar permissões
        permissoes = [
            Permissao(perfil="usuario", recurso="acessar_funcionarios", permitido=True),
            Permissao(perfil="aprovador", recurso="acessar_contratacao", permitido=True),
            Permissao(perfil="aprovador", recurso="aprovar_candidatos", permitido=True),
            Permissao(perfil="administrador", recurso="acessar_relatorios", permitido=True),
        ]
        for perm in permissoes:
            db.session.add(perm)
        
        db.session.commit()
        
        return {
            "secretaria": secretaria,
            "empresa": empresa,
            "usuario_aprovador": usuario_aprovador,
            "usuario_solicitante": usuario_solicitante
        }


class TestModelos:
    """Testes dos modelos de Candidato e AprovacaoCandidato."""
    
    def test_criar_candidato(self, app, setup_data):
        """Teste de criação de candidato."""
        with app.app_context():
            dados = setup_data
            
            candidato = Candidato(
                nome="João da Silva",
                email="joao@test.com",
                telefone="11999999999",
                cpf="123.456.789-00",
                empresa_id=dados["empresa"].id,
                secretaria_id=dados["secretaria"].id,
                cargo="Desenvolvedor",
                data_inicio_prevista=date(2026, 4, 1),
                status="pendente",
                usuario_solicitante_id=dados["usuario_solicitante"].id
            )
            
            db.session.add(candidato)
            db.session.commit()
            
            # Verificar se foi criado
            candidato_db = Candidato.query.filter_by(cpf="123.456.789-00").first()
            assert candidato_db is not None
            assert candidato_db.nome == "João da Silva"
            assert candidato_db.status == "pendente"
    
    def test_criar_aprovacao(self, app, setup_data):
        """Teste de criação de aprovação."""
        with app.app_context():
            dados = setup_data
            
            # Criar candidato
            candidato = Candidato(
                nome="João da Silva",
                email="joao@test.com",
                cpf="123.456.789-00",
                empresa_id=dados["empresa"].id,
                secretaria_id=dados["secretaria"].id,
                cargo="Desenvolvedor",
                data_inicio_prevista=date(2026, 4, 1),
                status="pendente",
                usuario_solicitante_id=dados["usuario_solicitante"].id
            )
            db.session.add(candidato)
            db.session.flush()
            
            # Criar aprovação
            aprovacao = AprovacaoCandidato(
                candidato_id=candidato.id,
                aprovador_id=dados["usuario_aprovador"].id,
                nivel_aprovacao="vice_prefeito",
                acao="aprovado",
                motivo="Candidato qualificado"
            )
            db.session.add(aprovacao)
            db.session.commit()
            
            # Verificar se foi criada
            aprovacao_db = AprovacaoCandidato.query.filter_by(candidato_id=candidato.id).first()
            assert aprovacao_db is not None
            assert aprovacao_db.acao == "aprovado"
            assert aprovacao_db.nivel_aprovacao == "vice_prefeito"


class TestAutenticacao:
    """Testes de autenticação e JWT."""
    
    def test_login_com_perfil_e_permissoes(self, client, setup_data):
        """Teste de login retornando perfil e permissões."""
        response = client.post(
            '/api/auth/login',
            json={
                "email": "aprovador@test.com",
                "senha": "senha123"
            }
        )
        
        assert response.status_code == 200
        data = json.loads(response.data)
        
        # Verificar token
        assert "access_token" in data
        
        # Verificar dados do usuário
        assert "usuario" in data
        assert data["usuario"]["perfil"] == "aprovador"
        assert data["usuario"]["nivel_aprovacao"] == "vice_prefeito"
        assert "permissoes" in data["usuario"]
        assert "acessar_contratacao" in data["usuario"]["permissoes"]
    
    def test_rota_me(self, client, setup_data):
        """Teste da rota /me para obter dados do usuário autenticado."""
        # Fazer login
        login_response = client.post(
            '/api/auth/login',
            json={
                "email": "aprovador@test.com",
                "senha": "senha123"
            }
        )
        
        token = json.loads(login_response.data)["access_token"]
        
        # Chamar rota /me
        response = client.get(
            '/api/usuarios/me',
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200
        data = json.loads(response.data)
        
        assert data["nome"] == "João Aprovador"
        assert data["perfil"] == "aprovador"
        assert data["nivel_aprovacao"] == "vice_prefeito"
        assert "permissoes" in data


class TestDecoradores:
    """Testes dos decoradores de permissão."""
    
    def test_decorador_perfil_required(self, client, setup_data):
        """Teste do decorador @perfil_required."""
        # Login com usuário aprovador
        login_response = client.post(
            '/api/auth/login',
            json={
                "email": "aprovador@test.com",
                "senha": "senha123"
            }
        )
        
        token = json.loads(login_response.data)["access_token"]
        
        # Tentar acessar rota que requer aprovador
        # (Esta rota será criada na Fase 2)
        # Por enquanto, apenas verificamos que o token é válido
        assert token is not None
    
    def test_login_usuario_invalido(self, client):
        """Teste de login com credenciais inválidas."""
        response = client.post(
            '/api/auth/login',
            json={
                "email": "invalido@test.com",
                "senha": "senhaerrada"
            }
        )
        
        assert response.status_code == 401
        data = json.loads(response.data)
        assert "erro" in data


class TestPermissoes:
    """Testes de permissões."""
    
    def test_permissoes_por_perfil(self, app, setup_data):
        """Teste de permissões por perfil."""
        with app.app_context():
            # Verificar permissões do aprovador
            usuario = Usuario.query.filter_by(perfil="aprovador").first()
            permissoes = usuario.get_permissoes()
            permissoes_list = [p.recurso for p in permissoes if p.permitido]
            
            assert "acessar_contratacao" in permissoes_list
            assert "aprovar_candidatos" in permissoes_list


class TestMigracao:
    """Testes de migração do banco de dados."""
    
    def test_tabelas_criadas(self, app):
        """Teste se as tabelas foram criadas corretamente."""
        with app.app_context():
            # Verificar se tabelas existem
            inspector = db.inspect(db.engine)
            tabelas = inspector.get_table_names()
            
            assert "candidatos" in tabelas
            assert "aprovacoes_candidato" in tabelas
            
            # Verificar colunas da tabela candidatos
            colunas_candidatos = [col['name'] for col in inspector.get_columns('candidatos')]
            assert "id" in colunas_candidatos
            assert "nome" in colunas_candidatos
            assert "cpf" in colunas_candidatos
            assert "status" in colunas_candidatos
            assert "usuario_solicitante_id" in colunas_candidatos
            
            # Verificar colunas da tabela aprovacoes_candidato
            colunas_aprovacoes = [col['name'] for col in inspector.get_columns('aprovacoes_candidato')]
            assert "id" in colunas_aprovacoes
            assert "candidato_id" in colunas_aprovacoes
            assert "aprovador_id" in colunas_aprovacoes
            assert "nivel_aprovacao" in colunas_aprovacoes
            assert "acao" in colunas_aprovacoes
            
            # Verificar coluna nivel_aprovacao em usuarios
            colunas_usuarios = [col['name'] for col in inspector.get_columns('usuarios')]
            assert "nivel_aprovacao" in colunas_usuarios


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
