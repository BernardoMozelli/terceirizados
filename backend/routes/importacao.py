from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, current_user
import csv
from models import Funcionario
from extensions import db
from services.log_service import registrar_log

# from app import db  # Ajuste conforme sua estrutura

importar_bp = Blueprint("importacao", __name__)


@importar_bp.route("/importar_funcionarios", methods=["POST"])
@jwt_required()
def importar_funcionarios():
    arquivo = request.files.get("arquivo")
    if not arquivo:
        return "Arquivo não enviado.", 400
    decoded = arquivo.read().decode("utf-8").splitlines()
    reader = csv.DictReader(decoded)
    secretaria_id = current_user.secretaria_id
    inseridos = 0
    for row in reader:
        if not all(
            [
                row.get("nome"),
                row.get("matricula"),
                row.get("cargo"),
                row.get("cpf"),
                row.get("empresa_id"),
            ]
        ):
            continue

        # Garante que o CPF tenha 11 dígitos, preenchendo com zeros à esquerda.
        cpf_formatado = str(row.get("cpf", "")).strip().zfill(11)

        dados_funcionario = {
            "nome": row["nome"],
            "matricula": row["matricula"],
            "cargo": row["cargo"],
            "cpf": cpf_formatado,
            "empresa_id": int(row["empresa_id"]),
            "secretaria_id": secretaria_id,
            "setor": row.get("setor"),
            "observacao": row.get("observacao"),
        }
        status_csv = row.get("status_contratual")
        if status_csv and status_csv.strip().isdigit():
            dados_funcionario["status_contratual"] = int(status_csv)

        novo = Funcionario(**dados_funcionario)
        db.session.add(novo)
        inseridos += 1

    if inseridos > 0:
        registrar_log(
            acao="Importação de Funcionários",
            usuario_id=current_user.id,
            detalhes=f"{inseridos} funcionário(s) importado(s) via arquivo CSV.",
        )
    db.session.commit()
    return jsonify({"mensagem": "Importação concluída", "inseridos": inseridos})
