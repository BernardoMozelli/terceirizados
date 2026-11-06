 # Rota para servir index.html do frontend
import os
from flask import Blueprint, app, request, jsonify, send_from_directory


index_bp = Blueprint("index", __name__)


@index_bp.route("/", methods=["GET"])
def index():
    # Usa apenas app.static_folder, que já é absoluto
    from flask import current_app
    print(current_app.static_folder)
    print('passei aqui')
    return send_from_directory(current_app.static_folder, "index.html")