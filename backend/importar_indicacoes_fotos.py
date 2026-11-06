# backend/importar_indicacoes_fotos.py
"""
Importação em lote de INDICAÇÃO e FOTO dos funcionários terceirizados.

O que faz
---------
1) PLANILHAS (.xlsx / .xls / .csv): para cada linha, procura o funcionário no
   sistema (pelo CPF, se a planilha tiver CPF; senão pelo nome) e preenche o
   campo "Indicação" (Funcionario.observacao e, se existir, o Candidato de origem).
2) FOTOS (pasta com .jpg/.jpeg/.png/.webp): para cada arquivo, procura o
   funcionário pelo nome do arquivo (nome da pessoa OU CPF só com números),
   salva a foto em static/uploads/, gera a miniatura e grava no cadastro.

Segurança
---------
- Por padrão roda em SIMULAÇÃO: não altera nada, só gera o relatório.
- Só grava de verdade com --aplicar.
- Nomes parecidos (não idênticos) NÃO são gravados, a não ser com
  --aceitar-aproximados. Eles aparecem no relatório para conferência.
- Gera um relatório .xlsx com tudo que foi (ou seria) feito, incluindo a
  lista de pessoas da planilha que NÃO existem no sistema.

Uso (dentro do container do backend)
------------------------------------
  docker exec -it pmsl_backend python importar_indicacoes_fotos.py \
      --planilha importacao/INTS.xlsx --planilha importacao/SERV.xlsx \
      --fotos importacao/fotos

  # Conferiu o relatório? Rode de novo com --aplicar
  docker exec -it pmsl_backend python importar_indicacoes_fotos.py \
      --planilha importacao/INTS.xlsx --planilha importacao/SERV.xlsx \
      --fotos importacao/fotos --aplicar

Desenvolvido por BeMo Sistemas — Bernardo Mozelli de Medeiros
"""

import argparse
import os
import re
import sys
import time
import unicodedata
from datetime import datetime
from difflib import SequenceMatcher

import pandas as pd
from PIL import Image, ImageOps

from app import app
from extensions import db
from models import Funcionario, Candidato, Usuario
from services.image_service import create_thumbnail
from services.log_service import registrar_log

PREFIXO_INDICACAO = "Indicado por: "
EXTENSOES_FOTO = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".jfif"}
PARTICULAS = {"DE", "DA", "DO", "DAS", "DOS", "E", "D"}
TAMANHO_MAX_FOTO = 1024  # px (lado maior) — fotos de celular ficam leves


# =====================================================================
# Normalização e busca de nomes
# =====================================================================

def normalizar(texto):
    """'José  da Silva-Júnior' -> 'JOSE SILVA JUNIOR'"""
    if texto is None:
        return ""
    texto = str(texto)
    texto = unicodedata.normalize("NFKD", texto)
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    texto = re.sub(r"[^A-Za-z ]+", " ", texto).upper()
    partes = [p for p in texto.split() if p not in PARTICULAS]
    return " ".join(partes)


def so_digitos(texto):
    return re.sub(r"\D", "", str(texto or ""))


def nome_do_arquivo_para_busca(nome_arquivo):
    """'joao_da_silva (2).jpg' -> 'joao da silva'"""
    base = os.path.splitext(os.path.basename(nome_arquivo))[0]
    base = re.sub(r"\(\d+\)$", "", base.strip())       # "(2)" no final
    base = re.sub(r"[_\-.]+", " ", base)
    return base.strip()


class IndiceFuncionarios:
    """Carrega os funcionários uma vez e responde buscas por CPF e por nome."""

    def __init__(self):
        self.funcionarios = Funcionario.query.all()
        self.por_cpf = {}
        self.por_nome = {}
        for f in self.funcionarios:
            cpf = so_digitos(f.cpf)
            if cpf:
                self.por_cpf.setdefault(cpf, []).append(f)
            self.por_nome.setdefault(normalizar(f.nome), []).append(f)

    @staticmethod
    def _preferir_ativos(lista):
        ativos = [f for f in lista if int(f.status_contratual or 0) == 1]
        return ativos or lista

    def buscar(self, nome=None, cpf=None, limiar=0.88):
        """
        Retorna (funcionario|None, tipo, score, observacao)
        tipo: 'CPF' | 'NOME EXATO' | 'APROXIMADO' | 'AMBIGUO' | 'NAO ENCONTRADO'
        """
        cpf = so_digitos(cpf)
        if len(cpf) == 11 and cpf in self.por_cpf:
            lista = self._preferir_ativos(self.por_cpf[cpf])
            return lista[0], "CPF", 1.0, ""

        alvo = normalizar(nome)
        if not alvo:
            return None, "NAO ENCONTRADO", 0.0, "Linha sem nome"

        if alvo in self.por_nome:
            lista = self._preferir_ativos(self.por_nome[alvo])
            if len(lista) == 1:
                return lista[0], "NOME EXATO", 1.0, ""
            ids = ", ".join(str(f.id) for f in lista)
            return None, "AMBIGUO", 1.0, f"Mais de um funcionário com esse nome (IDs {ids}). Use CPF na planilha."

        # Busca aproximada (erros de digitação, nome abreviado etc.)
        tokens_alvo = set(alvo.split())
        resultados = []
        for nome_norm, lista in self.por_nome.items():
            score = SequenceMatcher(None, alvo, nome_norm).ratio()
            tokens = set(nome_norm.split())
            # Planilha com nome mais curto contido no nome completo do sistema (ou vice-versa)
            if len(tokens_alvo) >= 2 and len(tokens) >= 2 and (tokens_alvo <= tokens or tokens <= tokens_alvo):
                score = max(score, 0.92)
            resultados.append((score, nome_norm, lista))
        resultados.sort(key=lambda r: r[0], reverse=True)

        if not resultados or resultados[0][0] < limiar:
            melhor = f"Mais parecido: {resultados[0][2][0].nome} ({resultados[0][0]:.0%})" if resultados else ""
            return None, "NAO ENCONTRADO", resultados[0][0] if resultados else 0.0, melhor

        score, _, lista = resultados[0]
        empatados = [r for r in resultados[1:] if r[0] >= score - 0.02]
        if len(lista) > 1 or empatados:
            nomes = "; ".join(r[2][0].nome for r in [resultados[0]] + empatados)
            return None, "AMBIGUO", score, f"Vários nomes parecidos: {nomes}"
        return self._preferir_ativos(lista)[0], "APROXIMADO", score, ""


# =====================================================================
# Leitura das planilhas
# =====================================================================

def _achar_coluna(colunas_norm, preferidas, contem, excluir=()):
    for c_orig, c_norm in colunas_norm:
        if c_norm in preferidas:
            return c_orig
    for c_orig, c_norm in colunas_norm:
        if any(t in c_norm for t in contem) and not any(e in c_norm for e in excluir):
            return c_orig
    return None


def ler_planilha(caminho, col_nome=None, col_indicacao=None, col_cpf=None):
    """Lê todas as abas e devolve uma lista de dicts {arquivo, aba, linha, nome, cpf, indicacao}."""
    linhas = []
    ext = os.path.splitext(caminho)[1].lower()
    if ext == ".csv":
        abas = {"CSV": pd.read_csv(caminho, header=None, dtype=str, sep=None, engine="python", encoding_errors="replace")}
    else:
        abas = pd.read_excel(caminho, header=None, dtype=str, sheet_name=None)

    for nome_aba, bruto in abas.items():
        bruto = bruto.fillna("")
        # Cabeçalho pode não estar na linha 1: procura nas 15 primeiras a linha com "NOME"
        linha_cab = None
        for i in range(min(15, len(bruto))):
            valores = [normalizar(v) for v in bruto.iloc[i].tolist()]
            if any(v.startswith("NOME") or v == "SERVIDOR" or v == "FUNCIONARIO" for v in valores):
                linha_cab = i
                if any("INDIC" in v for v in valores):
                    break
        if linha_cab is None:
            print(f"  [!] {os.path.basename(caminho)} / aba '{nome_aba}': não achei a coluna de NOME — aba ignorada.")
            continue

        cabecalho = [str(v).strip() or f"COL_{j}" for j, v in enumerate(bruto.iloc[linha_cab].tolist())]
        df = bruto.iloc[linha_cab + 1:].copy()
        df.columns = cabecalho
        colunas_norm = [(c, normalizar(c)) for c in cabecalho]

        c_nome = col_nome if col_nome in cabecalho else _achar_coluna(
            colunas_norm, {"NOME", "NOME COMPLETO", "SERVIDOR", "FUNCIONARIO", "COLABORADOR"},
            ["NOME"], excluir=["INDIC", "MAE", "PAI", "EMPRESA", "SECRETARIA", "SOCIAL", "CARGO"])
        c_ind = col_indicacao if col_indicacao in cabecalho else _achar_coluna(
            colunas_norm, {"INDICACAO", "INDICADO POR", "INDICADOR"}, ["INDIC"])
        c_cpf = col_cpf if col_cpf in cabecalho else _achar_coluna(colunas_norm, {"CPF"}, ["CPF"])

        if not c_nome or not c_ind:
            print(f"  [!] {os.path.basename(caminho)} / aba '{nome_aba}': colunas não identificadas "
                  f"(nome={c_nome}, indicação={c_ind}). Cabeçalho lido: {cabecalho}")
            print("      Use --coluna-nome e --coluna-indicacao para informar os nomes exatos.")
            continue

        print(f"  {os.path.basename(caminho)} / aba '{nome_aba}': nome='{c_nome}', indicação='{c_ind}'"
              + (f", cpf='{c_cpf}'" if c_cpf else ", sem CPF (busca por nome)"))

        for idx, row in df.iterrows():
            nome = str(row.get(c_nome, "")).strip()
            if not nome:
                continue
            linhas.append({
                "arquivo": os.path.basename(caminho),
                "aba": nome_aba,
                "linha": int(idx) + 1,  # número da linha como aparece no Excel
                "nome": nome,
                "cpf": str(row.get(c_cpf, "")).strip() if c_cpf else "",
                "indicacao": str(row.get(c_ind, "")).strip(),
            })
    return linhas


def formatar_indicacao(valor):
    valor = re.sub(r"\s+", " ", str(valor or "")).strip()
    valor = re.sub(r"^indicad[oa]\s+por\s*:?\s*", "", valor, flags=re.IGNORECASE)
    return f"{PREFIXO_INDICACAO}{valor}" if valor else ""


# =====================================================================
# Fotos
# =====================================================================

def salvar_foto(caminho_origem, funcionario):
    """Redimensiona, salva em static/uploads/ e gera a miniatura. Retorna o caminho web."""
    pasta = os.path.join(app.root_path, "static", "uploads")
    os.makedirs(pasta, exist_ok=True)
    nome = f"{int(time.time())}_func_{funcionario.id}_lote.jpg"
    destino = os.path.join(pasta, nome)

    img = Image.open(caminho_origem)
    img = ImageOps.exif_transpose(img)  # corrige foto "deitada" de celular
    img = img.convert("RGB")
    img.thumbnail((TAMANHO_MAX_FOTO, TAMANHO_MAX_FOTO))
    img.save(destino, "JPEG", quality=88)

    create_thumbnail(destino, os.path.join(pasta, f"{os.path.splitext(nome)[0]}_thumb.png"))
    return f"/static/uploads/{nome}"


def listar_fotos(pasta):
    fotos = []
    for raiz, _, arquivos in os.walk(pasta):
        for a in sorted(arquivos):
            if os.path.splitext(a)[1].lower() in EXTENSOES_FOTO and not a.startswith("."):
                fotos.append(os.path.join(raiz, a))
    return fotos


# =====================================================================
# Execução
# =====================================================================

def main():
    ap = argparse.ArgumentParser(description="Importa indicação e fotos dos funcionários terceirizados.")
    ap.add_argument("--planilha", action="append", default=[], help="Planilha .xlsx/.csv (pode repetir)")
    ap.add_argument("--fotos", help="Pasta com as fotos (nome do arquivo = nome da pessoa ou CPF)")
    ap.add_argument("--aplicar", action="store_true", help="Grava no banco. Sem isso é só simulação.")
    ap.add_argument("--aceitar-aproximados", action="store_true",
                    help="Também grava os casos de nome APROXIMADO (confira o relatório antes!)")
    ap.add_argument("--manter-indicacao-existente", action="store_true",
                    help="Não sobrescreve quem já tem indicação preenchida")
    ap.add_argument("--manter-foto-existente", action="store_true",
                    help="Não troca a foto de quem já tem foto")
    ap.add_argument("--limiar", type=float, default=0.88, help="Semelhança mínima p/ nome aproximado (0 a 1)")
    ap.add_argument("--coluna-nome")
    ap.add_argument("--coluna-indicacao")
    ap.add_argument("--coluna-cpf")
    ap.add_argument("--relatorio-dir", default="importacao", help="Onde salvar o relatório")
    args = ap.parse_args()

    if not args.planilha and not args.fotos:
        ap.error("Informe ao menos --planilha ou --fotos")

    tipos_gravaveis = {"CPF", "NOME EXATO"} | ({"APROXIMADO"} if args.aceitar_aproximados else set())
    modo = "APLICANDO NO BANCO" if args.aplicar else "SIMULAÇÃO (nada será gravado)"
    print(f"\n=== Importação de indicação e fotos — {modo} ===\n")

    res_indicacao, res_fotos = [], []

    with app.app_context():
        admin = Usuario.query.filter_by(perfil="admin").order_by(Usuario.id).first()
        admin_id = admin.id if admin else None
        indice = IndiceFuncionarios()
        print(f"Funcionários no sistema: {len(indice.funcionarios)}\n")

        # ------------------------------------------------- 1) Indicações
        if args.planilha:
            print("Lendo planilhas...")
            linhas = []
            for p in args.planilha:
                if not os.path.exists(p):
                    print(f"  [!] Arquivo não encontrado: {p}")
                    continue
                linhas += ler_planilha(p, args.coluna_nome, args.coluna_indicacao, args.coluna_cpf)

            for ln in linhas:
                func, tipo, score, obs = indice.buscar(ln["nome"], ln["cpf"], args.limiar)
                nova = formatar_indicacao(ln["indicacao"])
                antiga = func.observacao if func else None
                acao = ""
                if not func:
                    acao = "PRECISA CONFERIR" if tipo == "AMBIGUO" else "IGNORADO"
                elif not nova:
                    acao = "IGNORADO"; obs = obs or "Indicação vazia na planilha"
                elif (antiga or "").strip() == nova:
                    acao = "SEM ALTERAÇÃO"
                elif args.manter_indicacao_existente and (antiga or "").strip() not in ("", PREFIXO_INDICACAO.strip()):
                    acao = "MANTIDO (já tinha)"
                elif tipo not in tipos_gravaveis:
                    acao = "PRECISA CONFERIR"
                else:
                    acao = "ATUALIZADO" if args.aplicar else "SERÁ ATUALIZADO"
                    if args.aplicar:
                        func.observacao = nova
                        cand = Candidato.query.filter_by(funcionario_id=func.id).first()
                        if cand:
                            cand.observacoes = nova
                        db.session.commit()
                        registrar_log(
                            acao="IMPORTAÇÃO DE INDICAÇÃO", usuario_id=admin_id, entidade="Funcionarios",
                            entidade_id=func.id,
                            detalhes=f"Indicação de {func.nome} atualizada em lote pela planilha "
                                     f"{ln['arquivo']} (linha {ln['linha']}): '{antiga or ''}' → '{nova}'.")
                res_indicacao.append({
                    "Arquivo": ln["arquivo"], "Aba": ln["aba"], "Linha": ln["linha"],
                    "Nome na planilha": ln["nome"], "CPF na planilha": ln["cpf"],
                    "Encontrado no sistema": func.nome if func else "",
                    "ID funcionário": func.id if func else "",
                    "Situação": ("Ativo" if func and int(func.status_contratual or 0) == 1 else "Desligado") if func else "",
                    "Como achou": tipo, "Semelhança": f"{score:.0%}",
                    "Indicação atual": antiga or "", "Indicação nova": nova,
                    "Resultado": acao, "Observação": obs,
                })

        # ------------------------------------------------- 2) Fotos
        if args.fotos:
            if not os.path.isdir(args.fotos):
                print(f"[!] Pasta de fotos não encontrada: {args.fotos}")
            else:
                fotos = listar_fotos(args.fotos)
                print(f"\nFotos encontradas na pasta: {len(fotos)}")
                ja_usados = {}
                for caminho in fotos:
                    base = nome_do_arquivo_para_busca(caminho)
                    cpf = so_digitos(base) if len(so_digitos(base)) == 11 else ""
                    func, tipo, score, obs = indice.buscar(base, cpf, args.limiar)
                    acao = ""
                    if func and func.id in ja_usados:
                        acao, obs = "IGNORADO", f"Mesma pessoa da foto {ja_usados[func.id]}"
                    elif not func:
                        acao = "PRECISA CONFERIR" if tipo == "AMBIGUO" else "IGNORADO"
                    elif args.manter_foto_existente and func.foto:
                        acao = "MANTIDO (já tinha)"
                    elif tipo not in tipos_gravaveis:
                        acao = "PRECISA CONFERIR"
                    else:
                        ja_usados[func.id] = os.path.basename(caminho)
                        acao = "ATUALIZADO" if args.aplicar else "SERÁ ATUALIZADO"
                        if args.aplicar:
                            try:
                                web = salvar_foto(caminho, func)
                                func.foto = web
                                cand = Candidato.query.filter_by(funcionario_id=func.id).first()
                                if cand:
                                    # mesmo padrão do PUT /api/funcionarios/<id>
                                    cand.foto = web.replace("/static/", "", 1)
                                db.session.commit()
                                registrar_log(
                                    acao="IMPORTAÇÃO DE FOTO", usuario_id=admin_id, entidade="Funcionarios",
                                    entidade_id=func.id,
                                    detalhes=f"Foto de {func.nome} cadastrada em lote a partir do arquivo "
                                             f"{os.path.basename(caminho)}.")
                            except Exception as e:
                                db.session.rollback()
                                acao, obs = "ERRO", f"Falha ao processar imagem: {e}"
                    res_fotos.append({
                        "Arquivo da foto": os.path.relpath(caminho, args.fotos),
                        "Nome lido do arquivo": base,
                        "Encontrado no sistema": func.nome if func else "",
                        "ID funcionário": func.id if func else "",
                        "Como achou": tipo, "Semelhança": f"{score:.0%}",
                        "Tinha foto?": ("Sim" if func and func.foto else "Não") if func else "",
                        "Resultado": acao, "Observação": obs,
                    })

    # ------------------------------------------------- Relatório
    os.makedirs(args.relatorio_dir, exist_ok=True)
    carimbo = datetime.now().strftime("%Y%m%d_%H%M%S")
    sufixo = "APLICADO" if args.aplicar else "SIMULACAO"
    rel = os.path.join(args.relatorio_dir, f"relatorio_importacao_{carimbo}_{sufixo}.xlsx")
    with pd.ExcelWriter(rel, engine="openpyxl") as w:
        if res_indicacao:
            df = pd.DataFrame(res_indicacao)
            df.to_excel(w, index=False, sheet_name="Indicações")
            nao = df[df["Como achou"] == "NAO ENCONTRADO"][["Arquivo", "Aba", "Linha", "Nome na planilha",
                                                            "CPF na planilha", "Indicação nova", "Observação"]]
            nao.to_excel(w, index=False, sheet_name="Não estão no sistema")
            conf = df[df["Resultado"] == "PRECISA CONFERIR"]
            conf.to_excel(w, index=False, sheet_name="Conferir nomes")
        if res_fotos:
            pd.DataFrame(res_fotos).to_excel(w, index=False, sheet_name="Fotos")
        if not res_indicacao and not res_fotos:
            pd.DataFrame([{"Aviso": "Nada processado"}]).to_excel(w, index=False, sheet_name="Resumo")
        for ws in w.book.worksheets:
            for col in ws.columns:
                largura = max(len(str(c.value or "")) for c in col)
                ws.column_dimensions[col[0].column_letter].width = min(max(12, largura + 2), 60)
            ws.freeze_panes = "A2"

    # ------------------------------------------------- Resumo no terminal
    def contar(lista):
        out = {}
        for r in lista:
            out[r["Resultado"]] = out.get(r["Resultado"], 0) + 1
        return ", ".join(f"{k}: {v}" for k, v in sorted(out.items())) or "nada"

    print("\n=== RESUMO ===")
    if args.planilha:
        print(f"Indicações ({len(res_indicacao)} linhas) -> {contar(res_indicacao)}")
    if args.fotos:
        print(f"Fotos ({len(res_fotos)} arquivos)   -> {contar(res_fotos)}")
    print(f"\nRelatório: {rel}")
    if not args.aplicar:
        print("Nada foi gravado. Confira o relatório e rode novamente com --aplicar.\n")


if __name__ == "__main__":
    sys.exit(main())
