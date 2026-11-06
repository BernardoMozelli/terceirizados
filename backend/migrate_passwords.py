from extensions import db
from models import Usuario
import bcrypt
from app import create_app

app = create_app()

with app.app_context():
    usuarios = Usuario.query.all()
    for usuario in usuarios:
        senha_atual = usuario.senha_hash

        # Se já for bytes e tamanho correto de hash, pula
        if isinstance(senha_atual, bytes) and len(senha_atual) == 60:
            print(f"Usuário {usuario.email} já tem senha em hash. Pulando.")
            continue

        # Se for string, converte para bytes para processar
        if isinstance(senha_atual, str):
            senha_bytes = senha_atual.encode("utf-8")
        else:
            print(
                f"Formato inesperado para senha do usuário {usuario.email}: {type(senha_atual)}"
            )
            continue

        print(f"Atualizando senha do usuário {usuario.email}")
        hash_novo = bcrypt.hashpw(senha_bytes, bcrypt.gensalt())
        usuario.senha_hash = hash_novo.decode("utf-8")

    db.session.commit()
    print("Migração concluída com sucesso.")
