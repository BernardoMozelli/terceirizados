# backend/sync_funcionarios_para_candidatos.py
from app import app
from extensions import db
from models import Funcionario, Candidato, Usuario
from datetime import datetime

def sincronizar_retroativo():
    with app.app_context():
        # Pegamos o usuário admin padrão para registrar como solicitante destas fichas retroativas
        admin = Usuario.query.filter_by(perfil='admin').first()
        admin_id = admin.id if admin else 1

        funcionarios = Funcionario.query.all()
        cadastrados = 0

        for func in funcionarios:
            # Verifica se já existe um candidato vinculado a este funcionário (pelo ID ou CPF)
            candidato_existente = Candidato.query.filter(
                (Candidato.funcionario_id == func.id) | (Candidato.cpf == func.cpf)
            ).first()

            if not candidato_existente:
                # Trata a observação/indicação
                obs = func.observacao if func.observacao and func.observacao.strip() != "" else "Indicado por: Não informado"
                
                # Trata o status (se está ativo, já entra como contratado, senão desligado)
                status_cand = 'contratado' if func.status_contratual == 1 else 'desligado'

                novo_candidato = Candidato(
                    nome=func.nome,
                    email="nao_informado@sistema.com", # Campo obrigatório no banco
                    telefone="Não informado",
                    cpf=func.cpf,
                    empresa_id=func.empresa_id,
                    secretaria_id=func.secretaria_id,
                    cargo=func.cargo,
                    data_inicio_prevista=datetime.now().date(), # Campo obrigatório no banco
                    foto=func.foto,
                    observacoes=obs,
                    status=status_cand,
                    usuario_solicitante_id=admin_id,
                    funcionario_id=func.id
                )
                db.session.add(novo_candidato)
                cadastrados += 1

        try:
            db.session.commit()
            print(f"Sincronização concluída! {cadastrados} funcionários foram inseridos no módulo Aprovações.")
        except Exception as e:
            db.session.rollback()
            print(f"Erro ao sincronizar: {e}")

if __name__ == "__main__":
    sincronizar_retroativo()