# backend/cadastrar_funcionarios_planilha.py
"""
Cadastro em lote dos terceirizados que estão nas planilhas (INTS / SERV) mas
ainda não existem no sistema — por exemplo, quem não usa computador.

- NÃO cria conta no Active Directory (o sistema só desativa/reativa contas que já
  existem no AD, pelo CPF, quando alguém é desligado).
- Quem já existe no sistema (nome idêntico ou muito parecido) NÃO é cadastrado de
  novo: aparece no relatório para conferência.
- Preenche cargo, empresa, secretaria e setor (lotação) a partir da planilha, grava
  a indicação e, se houver, a foto da pasta de fotos.
- CPF e matrícula: usa as colunas da planilha quando existirem. Quando não
  existem, grava uma identificação provisória (PROV-00001, PROV-00002...) para
  ser trocada depois pelos dados reais.

Por padrão roda em SIMULAÇÃO e só gera o relatório. Para gravar: --aplicar

Uso (dentro do container do backend):
  docker exec -it pmsl_backend python cadastrar_funcionarios_planilha.py \\
      --planilha importacao/INTS.xlsx --planilha importacao/SERV.xlsx \\
      --fotos importacao/fotos

Desenvolvido por BeMo Sistemas — Bernardo Mozelli de Medeiros
"""

import argparse
import os
import re
import sys
from datetime import datetime
from difflib import SequenceMatcher

import pandas as pd

from app import app
from extensions import db
from models import Funcionario, Empresa, Secretaria, Usuario
from services.log_service import registrar_log
from importar_indicacoes_fotos import (
    IndiceFuncionarios, normalizar, so_digitos, formatar_indicacao,
    listar_fotos, nome_do_arquivo_para_busca, salvar_foto,
)

PALAVRAS_SECRETARIA = {"SECRETARIA", "SEC", "MUNICIPAL", "MUNICIPIO", "SMS", "PREFEITURA"}
RE_LOTACAO = re.compile(r"^\s*\d{3,5}\.\d{3,6}\s*\|")


# ----------------------------------------------------------------- utilidades
def titulo(texto):
    """'AUXILIAR DE FARMACIA' -> 'Auxiliar De Farmacia' (mesmo padrão dos cadastros atuais)."""
    texto = re.sub(r"\s+", " ", str(texto or "")).strip()
    return texto.title() if texto else ""


# Abreviações e variações usadas nos nomes das secretarias do sistema
SINONIMOS_SECRETARIA = {
    "DES": "DESENVOLVIMENTO", "DESENV": "DESENVOLVIMENTO", "DESENVOLV": "DESENVOLVIMENTO",
    "ESPORTES": "ESPORTE", "ADM": "ADMINISTRACAO", "SEG": "SEGURANCA", "PUB": "PUBLICA",
    "FINANCAS": "FINANCAS", "ECON": "ECONOMICO",
}


def chave_secretaria(nome):
    """'SECRETARIA DE SAUDE' e 'Sec. Saúde' -> 'SAUDE';  'Sec. Des. Urbano' -> 'DESENVOLVIMENTO URBANO'"""
    partes = [SINONIMOS_SECRETARIA.get(p, p) for p in normalizar(nome).split() if p not in PALAVRAS_SECRETARIA]
    return " ".join(partes)


def secretaria_da_lotacao(lotacao):
    """'0441.00097 | SECRETARIA DE SAUDE - HOSPITAL MUNICIPAL MADALENA' -> 'SECRETARIA DE SAUDE'"""
    if not lotacao or "|" not in lotacao:
        return ""
    depois = lotacao.split("|", 1)[1]
    return re.split(r"\s+-\s+|\s+-|-\s+", depois.strip(), maxsplit=1)[0].strip()


class Mapeador:
    """Acha Secretaria/Empresa do banco a partir do texto da planilha."""

    def __init__(self, modelos, chave):
        self.itens = [(m, chave(m.nome)) for m in modelos]
        self.chave = chave

    def achar(self, texto, limiar=0.84):
        alvo = self.chave(texto)
        if not alvo:
            return None
        exatos = [m for m, k in self.itens if k == alvo]
        if len(exatos) == 1:
            return exatos[0]
        contem = [m for m, k in self.itens if k and (alvo in k or k in alvo)]
        if len(contem) == 1:
            return contem[0]
        melhor = max(((SequenceMatcher(None, alvo, k).ratio(), m) for m, k in self.itens if k), default=(0, None), key=lambda x: x[0])
        return melhor[1] if melhor[0] >= limiar else None


# ----------------------------------------------------------------- leitura
def _achar_coluna(cols, nomes_exatos, contem, excluir=()):
    for c, n in cols:
        if n in nomes_exatos:
            return c
    for c, n in cols:
        if any(t in n for t in contem) and not any(e in n for e in excluir):
            return c
    return None


def ler_planilha(caminho):
    ext = os.path.splitext(caminho)[1].lower()
    abas = ({"CSV": pd.read_csv(caminho, header=None, dtype=str, sep=None, engine="python")}
            if ext == ".csv" else pd.read_excel(caminho, header=None, dtype=str, sheet_name=None))
    linhas = []
    for nome_aba, bruto in abas.items():
        bruto = bruto.fillna("")
        cab = None
        for i in range(min(15, len(bruto))):
            if any(normalizar(v).startswith("NOME") for v in bruto.iloc[i].tolist()):
                cab = i
                break
        if cab is None:
            print(f"  [!] {os.path.basename(caminho)} / '{nome_aba}': sem coluna NOME — aba ignorada")
            continue
        cabecalho = [str(v).strip() or f"COL_{j}" for j, v in enumerate(bruto.iloc[cab].tolist())]
        df = bruto.iloc[cab + 1:].copy()
        df.columns = cabecalho
        cols = [(c, normalizar(c)) for c in cabecalho]

        c_nome = _achar_coluna(cols, {"NOME", "NOME COMPLETO", "SERVIDOR", "FUNCIONARIO"}, ["NOME"],
                               excluir=["FUNC", "CARGO", "INDIC", "EMPRESA", "MAE", "PAI"])
        c_cargo = _achar_coluna(cols, {"CARGO", "FUNCAO", "NOME FUNCAO", "DESCRICAO CARGO"}, ["CARGO", "FUNCAO"])
        c_ind = _achar_coluna(cols, {"INDICACAO", "INDICADO POR"}, ["INDIC"])
        c_cpf = _achar_coluna(cols, {"CPF"}, ["CPF"])
        c_mat = _achar_coluna(cols, {"MATRICULA", "MAT"}, ["MATRIC"])
        c_emp = _achar_coluna(cols, {"EMPRESA"}, ["EMPRESA"])
        c_sec = _achar_coluna(cols, {"SECRETARIA"}, ["SECRETARIA"], excluir=["COL"])
        c_sit = _achar_coluna(cols, {"SITUACAO"}, ["SITUAC"])
        # Lotação ("0441.00097 | SECRETARIA ...") costuma vir numa coluna sem título
        c_lot = None
        for c in cabecalho:
            amostra = [v for v in df[c].tolist() if str(v).strip()][:30]
            if amostra and sum(bool(RE_LOTACAO.match(str(v))) for v in amostra) >= len(amostra) * 0.6:
                c_lot = c
                break

        print(f"  {os.path.basename(caminho)} / '{nome_aba}': nome='{c_nome}', cargo='{c_cargo}', indicação='{c_ind}', "
              f"lotação='{c_lot}', empresa='{c_emp}', secretaria='{c_sec}', cpf='{c_cpf}', matrícula='{c_mat}'")

        for idx, row in df.iterrows():
            nome = re.sub(r"\s+", " ", str(row.get(c_nome, ""))).strip()
            if not nome:
                continue
            g = lambda c: str(row.get(c, "")).strip() if c else ""
            linhas.append({
                "arquivo": os.path.basename(caminho), "aba": nome_aba, "linha": int(idx) + 1,
                "nome": nome, "cargo": g(c_cargo), "indicacao": g(c_ind), "lotacao": re.sub(r"\s+", " ", g(c_lot)),
                "empresa": g(c_emp), "secretaria": g(c_sec), "cpf": so_digitos(g(c_cpf)), "matricula": g(c_mat),
                "situacao": g(c_sit),
            })
    return linhas


# ----------------------------------------------------------------- principal
def main():
    ap = argparse.ArgumentParser(description="Cadastra em lote quem está na planilha e não existe no sistema.")
    ap.add_argument("--planilha", action="append", default=[], required=True)
    ap.add_argument("--fotos", help="Pasta de fotos (nome do arquivo = nome da pessoa ou CPF)")
    ap.add_argument("--aplicar", action="store_true", help="Grava no banco. Sem isso é só simulação.")
    ap.add_argument("--secretaria-padrao", help="Secretaria para quem a planilha não informa (ex.: \"Sec. Obras\")")
    ap.add_argument("--empresa-padrao", help="Empresa para quem a planilha não informa")
    ap.add_argument("--limiar-duplicado", type=float, default=0.88,
                    help="Semelhança de nome a partir da qual a pessoa é tratada como possível duplicado")
    ap.add_argument("--relatorio-dir", default="importacao")
    args = ap.parse_args()

    modo = "APLICANDO NO BANCO" if args.aplicar else "SIMULAÇÃO (nada será gravado)"
    print(f"\n=== Cadastro em lote de funcionários — {modo} ===\n")
    resultados = []

    with app.app_context():
        admin = Usuario.query.filter_by(perfil="admin").order_by(Usuario.id).first()
        admin_id = admin.id if admin else None
        indice = IndiceFuncionarios()
        secretarias = Mapeador(Secretaria.query.all(), chave_secretaria)
        empresas = Mapeador(Empresa.query.all(), lambda n: normalizar(n))
        sec_padrao = secretarias.achar(args.secretaria_padrao) if args.secretaria_padrao else None
        emp_padrao = empresas.achar(args.empresa_padrao) if args.empresa_padrao else None
        if args.secretaria_padrao and not sec_padrao:
            print(f"[!] Secretaria padrão '{args.secretaria_padrao}' não encontrada no sistema.")
        if args.empresa_padrao and not emp_padrao:
            print(f"[!] Empresa padrão '{args.empresa_padrao}' não encontrada no sistema.")

        # Próximo número provisório (continua de onde parou, se o script já rodou antes)
        usados = [int(m.group(1)) for (v,) in db.session.query(Funcionario.matricula).filter(Funcionario.matricula.like("PROV-%"))
                  for m in [re.match(r"PROV-(\d+)$", v or "")] if m]
        prox_prov = (max(usados) + 1) if usados else 1
        cpfs_existentes = {so_digitos(c) for (c,) in db.session.query(Funcionario.cpf) if c}
        mats_existentes = {str(m) for (m,) in db.session.query(Funcionario.matricula) if m}

        fotos = {}
        if args.fotos and os.path.isdir(args.fotos):
            for f in listar_fotos(args.fotos):
                base = nome_do_arquivo_para_busca(f)
                fotos.setdefault(so_digitos(base) if len(so_digitos(base)) == 11 else normalizar(base), f)

        print("Lendo planilhas...")
        linhas = []
        for p in args.planilha:
            if os.path.exists(p):
                linhas += ler_planilha(p)
            else:
                print(f"  [!] Arquivo não encontrado: {p}")

        vistos = set()
        for ln in linhas:
            r = {"Arquivo": ln["arquivo"], "Linha": ln["linha"], "Nome": ln["nome"], "Cargo": titulo(ln["cargo"]),
                 "Situação na planilha": ln["situacao"], "Lotação/Setor": titulo(ln["lotacao"]),
                 "Empresa": "", "Secretaria": "", "CPF gravado": "", "Matrícula gravada": "",
                 "Indicação": formatar_indicacao(ln["indicacao"]), "Foto": "", "Resultado": "", "Observação": ""}
            chave = normalizar(ln["nome"])

            # 1) Já existe no sistema?
            func, tipo, score, obs = indice.buscar(ln["nome"], ln["cpf"], args.limiar_duplicado)
            if func or tipo == "AMBIGUO":
                r["Resultado"] = "JÁ EXISTE" if tipo in ("CPF", "NOME EXATO") else "CONFERIR (possível duplicado)"
                r["Observação"] = (f"No sistema: {func.nome} (ID {func.id}, {tipo}, {score:.0%})" if func else obs)
                resultados.append(r)
                continue
            if chave in vistos:
                r["Resultado"], r["Observação"] = "IGNORADO", "Repetido nas planilhas"
                resultados.append(r)
                continue
            vistos.add(chave)

            # 2) Empresa e secretaria
            emp = empresas.achar(ln["empresa"]) if ln["empresa"] else None
            if not emp:
                emp = empresas.achar(os.path.splitext(ln["arquivo"])[0]) or emp_padrao
            sec_texto = ln["secretaria"] or secretaria_da_lotacao(ln["lotacao"])
            sec = (secretarias.achar(sec_texto) if sec_texto else None) or sec_padrao
            r["Empresa"] = emp.nome if emp else f"NÃO ENCONTRADA ({ln['empresa'] or ln['arquivo']})"
            r["Secretaria"] = sec.nome if sec else f"NÃO ENCONTRADA ({sec_texto or 'planilha não informa'})"
            faltas = []
            if not emp:
                faltas.append("empresa")
            if not sec:
                faltas.append("secretaria")
            if not r["Cargo"]:
                faltas.append("cargo")
            if faltas:
                r["Resultado"] = "PENDENTE"
                r["Observação"] = "Falta " + ", ".join(faltas) + ". Use --secretaria-padrao/--empresa-padrao ou corrija a planilha."
                resultados.append(r)
                continue

            # 3) CPF e matrícula (reais, se vierem; senão provisórios)
            cpf = ln["cpf"] if len(ln["cpf"]) == 11 and ln["cpf"] not in cpfs_existentes else ""
            mat = ln["matricula"] if ln["matricula"] and ln["matricula"] not in mats_existentes else ""
            prov = f"PROV-{prox_prov:05d}"
            if not cpf or not mat:
                prox_prov += 1
            cpf = cpf or prov
            mat = mat or prov
            cpfs_existentes.add(so_digitos(cpf)); mats_existentes.add(mat)
            r["CPF gravado"], r["Matrícula gravada"] = cpf, mat

            foto_arq = fotos.get(ln["cpf"]) or fotos.get(chave)
            r["Foto"] = os.path.basename(foto_arq) if foto_arq else ""
            r["Resultado"] = "CADASTRADO" if args.aplicar else "SERÁ CADASTRADO"

            if args.aplicar:
                try:
                    f = Funcionario(
                        nome=titulo(ln["nome"]), cargo=r["Cargo"][:100], cpf=cpf[:14], matricula=mat[:20],
                        empresa_id=emp.id, secretaria_id=sec.id, setor=r["Lotação/Setor"][:100] or None,
                        status_contratual=1, observacao=r["Indicação"] or None,
                    )
                    db.session.add(f)
                    db.session.flush()
                    if foto_arq:
                        f.foto = salvar_foto(foto_arq, f)
                    db.session.commit()
                    registrar_log(
                        acao="CADASTRO EM LOTE", usuario_id=admin_id, entidade="Funcionarios", entidade_id=f.id,
                        detalhes=f"Funcionário {f.nome} cadastrado em lote (sem conta no AD) a partir de "
                                 f"{ln['arquivo']} linha {ln['linha']}. CPF/matrícula: {cpf}/{mat}.")
                except Exception as e:
                    db.session.rollback()
                    r["Resultado"], r["Observação"] = "ERRO", str(e)[:300]
            resultados.append(r)

    # ----------------------------------------------------------------- relatório
    os.makedirs(args.relatorio_dir, exist_ok=True)
    sufixo = "APLICADO" if args.aplicar else "SIMULACAO"
    rel = os.path.join(args.relatorio_dir, f"relatorio_cadastro_{datetime.now():%Y%m%d_%H%M%S}_{sufixo}.xlsx")
    df = pd.DataFrame(resultados or [{"Resultado": "Nada processado"}])
    with pd.ExcelWriter(rel, engine="openpyxl") as w:
        novos = df[df["Resultado"].isin(["CADASTRADO", "SERÁ CADASTRADO"])] if "Resultado" in df else df
        novos.to_excel(w, index=False, sheet_name="Novos cadastros")
        for nome_aba, filtro in [("Pendentes", ["PENDENTE", "ERRO"]), ("Conferir duplicados", ["CONFERIR (possível duplicado)"]),
                                 ("Já existem", ["JÁ EXISTE"])]:
            df[df["Resultado"].isin(filtro)].to_excel(w, index=False, sheet_name=nome_aba)
        df.to_excel(w, index=False, sheet_name="Tudo")
        for ws in w.book.worksheets:
            for col in ws.columns:
                ws.column_dimensions[col[0].column_letter].width = min(max(12, max(len(str(c.value or "")) for c in col) + 2), 60)
            ws.freeze_panes = "A2"

    cont = df["Resultado"].value_counts().to_dict() if "Resultado" in df else {}
    print("\n=== RESUMO ===")
    for k, v in sorted(cont.items()):
        print(f"  {k}: {v}")
    print(f"\nRelatório: {rel}")
    if not args.aplicar:
        print("Nada foi gravado. Confira o relatório e rode novamente com --aplicar.\n")


if __name__ == "__main__":
    sys.exit(main())
