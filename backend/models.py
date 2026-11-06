import bcrypt
from extensions import db
from datetime import datetime
import os
from sqlalchemy import Index


def _pode_ver_indicacao():
    """Import tardio para evitar import circular (decorators importa models)."""
    from decorators import usuario_atual_pode_ver_indicacao
    return usuario_atual_pode_ver_indicacao()


class Usuario(db.Model):
    __tablename__ = "usuarios"
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(100), nullable=False)
    matricula = db.Column(db.String(20), unique=True, nullable=False)
    email = db.Column(db.String(150), unique=True, nullable=False)
    senha_hash = db.Column(db.String(255), nullable=False)
    perfil = db.Column(db.String(20), nullable=False, default="padrao")
    secretaria_id = db.Column(
        db.Integer, db.ForeignKey("secretarias.id"), nullable=False
    )
    data_criacao = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    notificacao_desativacao_enviada_em = db.Column(
        db.DateTime, nullable=True
    )  # Flag para controlar o envio único do e-mail de desativação
    foto = db.Column(db.String(255), nullable=True)  # Campo para armazenar o caminho da foto
    nivel_aprovacao = db.Column(db.String(50), nullable=True)  # Para aprovadores: 'vice_prefeito', 'prefeito', 'planejamento'

    secretaria = db.relationship(
        "Secretaria", backref=db.backref("usuarios", lazy=True)
    )

    def set_password(self, senha):
        self.senha_hash = bcrypt.hashpw(senha.encode("utf-8"), bcrypt.gensalt()).decode(
            "utf-8"
        )

    def check_password(self, senha):
        if not self.senha_hash:
            return False
        return bcrypt.checkpw(senha.encode("utf-8"), self.senha_hash.encode("utf-8"))

    def get_permissoes(self):
        """Retorna as permissões associadas ao perfil do usuário."""
        return Permissao.query.filter_by(perfil=self.perfil).all()

    def to_dict(self):
        """Retorna uma representação do usuário em dicionário."""
        try:
            foto_path = self.foto
            foto_thumbnail_path = None
            if foto_path:
                base, ext = os.path.splitext(foto_path)
                foto_thumbnail_path = f"{base}_thumb.png"
            return {
                "id": self.id,
                "nome": self.nome,
                "matricula": self.matricula,
                "email": self.email,
                "perfil": self.perfil,
                "nivel_aprovacao": self.nivel_aprovacao,
                "secretaria_id": self.secretaria_id,
                "secretaria_nome": self.secretaria.nome if self.secretaria else None,
                "data_criacao": (
                    self.data_criacao.strftime("%Y-%m-%d %H:%M:%S")
                    if self.data_criacao
                    else None
                ),
                "foto": foto_path,
                "foto_thumbnail": foto_thumbnail_path,
            }
        except Exception as e:
            # Fallback para dados inconsistentes. Isso evita que a UI quebre.
            # O erro real será logado no console do servidor.
            print(f"ERRO CRÍTICO ao serializar usuário ID {self.id}: {e}")
            return {
                "id": self.id,
                "nome": f"{self.nome} (Erro nos dados)",
                "matricula": self.matricula,
                "email": self.email,
                "perfil": self.perfil,
                "secretaria_id": self.secretaria_id,
                "secretaria_nome": "[inválido]",
                "data_criacao": "[inválido]",
                "foto": self.foto,
                "foto_thumbnail": None,
                "erro_serializacao": str(e),
            }

    def __repr__(self):
        return f"<Usuario {self.nome} ({self.email})>"


class Empresa(db.Model):
    __tablename__ = "empresas"
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(150), nullable=False)
    cnpj = db.Column(db.String(18), unique=True, nullable=False)
    endereco = db.Column(db.String(255))
    telefone = db.Column(db.String(20))
    email = db.Column(db.String(100))

    def to_dict(self):
        """Retorna uma representação da empresa em dicionário."""
        return {
            "id": self.id,
            "nome": self.nome,
            "cnpj": self.cnpj,
            "endereco": self.endereco,
            "telefone": self.telefone,
            "email": self.email,
        }

    def __repr__(self):
        return f"<Empresa {self.nome}>"


class Funcionario(db.Model):
    __tablename__ = "funcionarios"
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(100), nullable=False)
    matricula = db.Column(db.String(20), unique=True, nullable=False)
    cargo = db.Column(db.String(100), nullable=False)
    cpf = db.Column(db.String(14), unique=True, nullable=False)

    empresa_id = db.Column(db.Integer, db.ForeignKey("empresas.id"), nullable=False)
    empresa = db.relationship("Empresa", backref=db.backref("funcionarios", lazy=True))

    setor = db.Column(db.String(100))

    status_contratual = db.Column(db.Integer, nullable=False, default=1)

    observacao = db.Column(db.Text)

    secretaria_id = db.Column(
        db.Integer, db.ForeignKey("secretarias.id"), nullable=False
    )
    secretaria = db.relationship(
        "Secretaria", backref=db.backref("funcionarios", lazy=True)
    )

    foto = db.Column(db.String(255), nullable=True)  # Campo para armazenar o caminho da foto

    def to_dict(self):
        """Retorna uma representação do funcionário em dicionário."""
        foto_path = self.foto if self.foto and self.foto.lower() != 'foto' else None
        foto_thumbnail_path = None
        if foto_path:
            base, ext = os.path.splitext(foto_path)
            foto_thumbnail_path = f"{base}_thumb.png"

        return {
            "id": self.id,
            "nome": self.nome,
            "matricula": self.matricula,
            "cargo": self.cargo,
            "cpf": self.cpf,
            "empresa_id": self.empresa_id,
            "empresa_nome": self.empresa.nome if self.empresa else None,
            "setor": self.setor,
            "status_contratual": self.status_contratual,
            # Indicação: só para admin, Prefeito e Vice-Prefeito
            "observacao": self.observacao if _pode_ver_indicacao() else None,
            "secretaria_id": self.secretaria_id,
            "secretaria_nome": self.secretaria.nome if self.secretaria else None,
            "foto": foto_path,
            "foto_thumbnail": foto_thumbnail_path,
        }

    def __repr__(self):
        return f"<Funcionario {self.nome} ({self.cpf})>"


class TransferenciaFuncionario(db.Model):
    __tablename__ = "transferencias_funcionarios"
    id = db.Column(db.Integer, primary_key=True)
    funcionario_id = db.Column(
        db.Integer, db.ForeignKey("funcionarios.id"), nullable=False
    )
    secretaria_origem_id = db.Column(
        db.Integer, db.ForeignKey("secretarias.id"), nullable=False
    )
    secretaria_destino_id = db.Column(
        db.Integer, db.ForeignKey("secretarias.id"), nullable=False
    )
    usuario_solicitante_id = db.Column(
        db.Integer, db.ForeignKey("usuarios.id"), nullable=False
    )
    usuario_aprovador_id = db.Column(
        db.Integer, db.ForeignKey("usuarios.id"), nullable=True
    )
    status = db.Column(
        db.String(20), nullable=False, default="pendente"
    )  # pendente, aprovada, rejeitada, cancelada
    data_solicitacao = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    data_acao = db.Column(
        db.DateTime, nullable=True
    )  # Data da aprovação/rejeição/cancelamento
    motivo_rejeicao = db.Column(db.Text, nullable=True)
    justificativa = db.Column(db.Text, nullable=True)

    funcionario = db.relationship("Funcionario")
    secretaria_origem = db.relationship(
        "Secretaria", foreign_keys=[secretaria_origem_id]
    )
    secretaria_destino = db.relationship(
        "Secretaria", foreign_keys=[secretaria_destino_id]
    )
    usuario_solicitante = db.relationship(
        "Usuario", foreign_keys=[usuario_solicitante_id]
    )
    usuario_aprovador = db.relationship("Usuario", foreign_keys=[usuario_aprovador_id])

    def __repr__(self):
        return f"<Transferencia {self.id} func {self.funcionario_id} de {self.secretaria_origem_id} para {self.secretaria_destino_id}>"


class ConfirmacaoStatus(db.Model):
    __tablename__ = "confirmacoes_status"
    id = db.Column(db.Integer, primary_key=True)
    funcionario_id = db.Column(
        db.Integer, db.ForeignKey("funcionarios.id"), nullable=False
    )
    usuario_id = db.Column(
        db.Integer, db.ForeignKey("usuarios.id"), nullable=True
    )  # Permite nulo para ações do sistema
    data_confirmacao = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    status_confirmado = db.Column(db.String(50), nullable=False)
    observacao = db.Column(db.Text)

    funcionario = db.relationship(
        "Funcionario", backref=db.backref("confirmacoes", lazy=True)
    )
    usuario = db.relationship("Usuario", backref=db.backref("confirmacoes", lazy=True))

    def __repr__(self):
        return (
            f"<Confirmacao {self.id} func {self.funcionario_id} user {self.usuario_id}>"
        )


class LogAtividade(db.Model):
    __tablename__ = "logs_atividades"
    id = db.Column(db.Integer, primary_key=True)
    usuario_id = db.Column(db.Integer, db.ForeignKey("usuarios.id"))
    acao = db.Column(db.String(100), nullable=False)
    entidade = db.Column(db.String(100))
    entidade_id = db.Column(db.Integer)
    detalhes = db.Column(db.Text)
    data_hora = db.Column(db.DateTime, default=datetime.utcnow)
    ip_origem = db.Column(db.String(255))

    usuario = db.relationship("Usuario", backref=db.backref("logs", lazy=True))

    def __repr__(self):
        return f"<Log {self.acao} por user {self.usuario_id} em {self.data_hora}>"


class Secretaria(db.Model):
    __tablename__ = "secretarias"
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(100), unique=True, nullable=False)

    def to_dict(self):
        """Retorna uma representação da secretaria em dicionário."""
        return {
            "id": self.id,
            "nome": self.nome,
        }

    def __repr__(self):
        return f"<Secretaria {self.nome}>"


class Configuracao(db.Model):
    __tablename__ = "configuracoes"
    id = db.Column(db.Integer, primary_key=True)
    chave = db.Column(db.String(50), unique=True, nullable=False)
    valor = db.Column(db.String(255), nullable=False)

    def __repr__(self):
        return f"<Configuracao {self.chave}={self.valor}>"


class Permissao(db.Model):
    __tablename__ = "permissoes"
    id = db.Column(db.Integer, primary_key=True)
    perfil = db.Column(db.String(50), nullable=False)  # 'admin', 'padrao', 'ativador', 'aprovador'
    recurso = db.Column(
        db.String(100), nullable=False
    )  # 'acessar_usuarios', 'criar_funcionario', etc.
    permitido = db.Column(db.Boolean, nullable=False, default=True)

    __table_args__ = (
        db.UniqueConstraint("perfil", "recurso", name="_perfil_recurso_uc"),
    )

    def __repr__(self):
        return f"<Permissao {self.perfil} -> {self.recurso} = {self.permitido}>"


class Candidato(db.Model):
    """Modelo para armazenar candidatos em processo de contratação."""
    __tablename__ = "candidatos"
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(255), nullable=False)
    telefone = db.Column(db.String(20), nullable=True)
    cpf = db.Column(db.String(14), unique=True, nullable=False)
    
    empresa_id = db.Column(db.Integer, db.ForeignKey("empresas.id"), nullable=False)
    empresa = db.relationship("Empresa", backref=db.backref("candidatos", lazy=True))
    
    secretaria_id = db.Column(db.Integer, db.ForeignKey("secretarias.id"), nullable=False)
    secretaria = db.relationship("Secretaria", foreign_keys=[secretaria_id], backref=db.backref("candidatos", lazy=True))
    
    cargo = db.Column(db.String(255), nullable=False)
    setor = db.Column(db.String(100), nullable=True)
    data_inicio_prevista = db.Column(db.Date, nullable=False)
    foto = db.Column(db.String(500), nullable=True)
    observacoes = db.Column(db.Text, nullable=True)
    
    status = db.Column(db.String(50), nullable=False, default="pendente")
    # Valores: 'pendente', 'contratado', 'recusado', 'desligado'
    
    # Rastreabilidade: Quem solicitou o cadastro
    usuario_solicitante_id = db.Column(db.Integer, db.ForeignKey("usuarios.id"), nullable=False)
    usuario_solicitante = db.relationship("Usuario", foreign_keys=[usuario_solicitante_id], backref=db.backref("candidatos_solicitados", lazy=True))
    
    data_criacao = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    data_atualizacao = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relacionamento com o funcionário criado após a contratação
    funcionario_id = db.Column(db.Integer, db.ForeignKey("funcionarios.id"), nullable=True)
    funcionario = db.relationship("Funcionario", foreign_keys=[funcionario_id], backref=db.backref("candidato_origem", uselist=False))
    
    __table_args__ = (
        db.Index('idx_candidatos_status', 'status'),
        db.Index('idx_candidatos_empresa', 'empresa_id'),
        db.Index('idx_candidatos_secretaria', 'secretaria_id'),
    )
    
    def to_dict(self):
        """Retorna uma representação do candidato em dicionário."""
        try:
            foto_path = self.foto if self.foto else None
            foto_thumbnail_path = None
            if foto_path:
                base, ext = os.path.splitext(foto_path)
                foto_thumbnail_path = f"{base}_thumb.png"
            
            return {
                "id": self.id,
                "nome": self.nome,
                "email": self.email,
                "telefone": self.telefone,
                "cpf": self.cpf,
                "empresa_id": self.empresa_id,
                "empresa_nome": self.empresa.nome if self.empresa else None,
                "secretaria_id": self.secretaria_id,
                "secretaria_nome": self.secretaria.nome if self.secretaria else None,
                "cargo": self.cargo,
                "setor": self.setor,
                "data_inicio_prevista": self.data_inicio_prevista.strftime("%Y-%m-%d") if self.data_inicio_prevista else None,
                "foto": foto_path,
                "foto_thumbnail": foto_thumbnail_path,
                # Indicação: só para admin, Prefeito e Vice-Prefeito
                "observacoes": self.observacoes if _pode_ver_indicacao() else None,
                "status": self.status,
                "usuario_solicitante_id": self.usuario_solicitante_id,
                "usuario_solicitante_nome": self.usuario_solicitante.nome if self.usuario_solicitante else None,
                "usuario_solicitante_matricula": self.usuario_solicitante.matricula if self.usuario_solicitante else None,
                "data_criacao": self.data_criacao.strftime("%Y-%m-%d %H:%M:%S") if self.data_criacao else None,
                "data_atualizacao": self.data_atualizacao.strftime("%Y-%m-%d %H:%M:%S") if self.data_atualizacao else None,
                "rastreabilidade": {
                    "usuario_solicitante_id": self.usuario_solicitante_id,
                    "usuario_solicitante_nome": self.usuario_solicitante.nome if self.usuario_solicitante else None,
                    "usuario_solicitante_matricula": self.usuario_solicitante.matricula if self.usuario_solicitante else None,
                    "secretaria_solicitante_id": self.usuario_solicitante.secretaria_id if self.usuario_solicitante else None,
                    "secretaria_solicitante_nome": self.usuario_solicitante.secretaria.nome if (self.usuario_solicitante and self.usuario_solicitante.secretaria) else None,
                    "data_criacao_formatada": self.data_criacao.strftime("%d/%m/%Y às %H:%M:%S") if self.data_criacao else None,
                },
            }
        except Exception as e:
            print(f"Erro ao serializar candidato ID {self.id}: {e}")
            return {
                "id": self.id,
                "nome": self.nome,
                "cpf": self.cpf,
                "status": self.status,
                "erro_serializacao": str(e)
            }
    
    def __repr__(self):
        return f"<Candidato {self.nome} ({self.cpf}) - Status: {self.status}>"


class AprovacaoCandidato(db.Model):
    """Modelo para registrar aprovações/recusas de candidatos."""
    __tablename__ = "aprovacoes_candidato"
    id = db.Column(db.Integer, primary_key=True)
    
    candidato_id = db.Column(db.Integer, db.ForeignKey("candidatos.id"), nullable=False)
    candidato = db.relationship("Candidato", backref=db.backref("aprovacoes", lazy=True, cascade="all, delete-orphan"))
    
    aprovador_id = db.Column(db.Integer, db.ForeignKey("usuarios.id"), nullable=False)
    aprovador = db.relationship("Usuario", backref=db.backref("aprovacoes_realizadas", lazy=True))
    
    nivel_aprovacao = db.Column(db.String(50), nullable=False)
    # Valores: 'vice_prefeito', 'prefeito', 'planejamento'
    
    acao = db.Column(db.String(50), nullable=False)
    # Valores: 'aprovado', 'recusado'
    
    motivo = db.Column(db.Text, nullable=True)
    data_aprovacao = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    
    __table_args__ = (
        db.Index('idx_aprovacoes_candidato', 'candidato_id'),
        db.Index('idx_aprovacoes_nivel', 'nivel_aprovacao'),
    )
    
    def to_dict(self):
        """Retorna uma representação da aprovação em dicionário."""
        return {
            "id": self.id,
            "candidato_id": self.candidato_id,
            "aprovador_id": self.aprovador_id,
            "aprovador_nome": self.aprovador.nome if self.aprovador else None,
            "nivel_aprovacao": self.nivel_aprovacao,
            "acao": self.acao,
            "motivo": self.motivo,
            "data_aprovacao": self.data_aprovacao.strftime("%Y-%m-%d %H:%M:%S") if self.data_aprovacao else None,
        }
    
    def __repr__(self):
        return f"<Aprovacao Candidato {self.candidato_id} - {self.acao} por {self.aprovador_id}>"