import ssl
import logging
import os
import sys
from ldap3 import Server, Connection, ALL, Tls, MODIFY_REPLACE

# =========================================================
# CONFIGURAÇÃO DE LOGS PARA O DOCKER CAPTURAR
# Força o nível INFO e joga a saída direto no stdout do container
# =========================================================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - [%(levelname)s] - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[logging.StreamHandler(sys.stdout)]
)

logger = logging.getLogger(__name__)

class ADService:
    def __init__(self, server_uri, admin_user, admin_pass, base_dn):
        """
        Inicializa o serviço de AD.
        server_uri: IP do servidor (ex: 10.0.0.10)
        admin_user: utilizador com permissão (ex: usuario.servico@dominio.local)
        admin_pass: senha do utilizador
        base_dn: base de busca (ex: dc=dominio,dc=local)
        """
        # Limpa o URI de eventuais prefixos para garantir apenas o IP/Host
        self.server_ip = server_uri.replace('ldaps://', '').replace('ldap://', '').split(':')[0]
        self.admin_user = admin_user
        self.admin_pass = admin_pass
        self.base_dn = base_dn
        
        # Define a porta (636 por padrão para LDAPS)
        try:
            self.port = int(os.getenv('AD_PORT', 636))
        except:
            self.port = 636

        # Configuração TLS/SSL (Obrigatória para porta 636)
        # validate=ssl.CERT_NONE permite certificados auto-assinados da Prefeitura
        self.tls_config = Tls(validate=ssl.CERT_NONE, version=ssl.PROTOCOL_TLSv1_2)
        
        # Define o objeto Servidor
        self.server = Server(
            self.server_ip, 
            port=self.port, 
            use_ssl=True, 
            tls=self.tls_config, 
            get_info=ALL
        )
        
        logger.info(f"⚙️ AD Service inicializado para {self.server_ip}:{self.port}")

    def _get_connection(self):
        """Cria uma nova conexão para cada operação, garantindo estabilidade."""
        try:
            conn = Connection(
                self.server,
                user=self.admin_user,
                password=self.admin_pass,
                auto_bind=True,
                raise_exceptions=True,
                receive_timeout=15
            )
            return conn
        except Exception as e:
            logger.error(f"❌ [AD Service] Falha na conexão/autenticação: {str(e)}")
            return None

    def _buscar_dn_por_cpf(self, conn, cpf):
        """Localiza o Distinguished Name do utilizador via employeeID (CPF)."""
        if not cpf:
            return None
            
        filtro = f"(&(objectClass=user)(employeeID={cpf}))"
        try:
            conn.search(
                search_base=self.base_dn,
                search_filter=filtro,
                attributes=['distinguishedName']
            )
            
            if len(conn.entries) > 0:
                dn = conn.entries[0].distinguishedName.value
                logger.info(f"🔍 [AD Service] Utilizador encontrado: {dn}")
                return dn
            
            logger.warning(f"⚠️ [AD Service] CPF {cpf} não localizado no AD.")
            return None
        except Exception as e:
            logger.error(f"❌ [AD Service] Erro na pesquisa LDAP: {str(e)}")
            return None

    def desativar_usuario(self, cpf, matricula=None):
        """Desativa a conta (UserAccountControl = 514)."""
        conn = self._get_connection()
        if not conn:
            return False

        dn = self._buscar_dn_por_cpf(conn, cpf)
        if not dn:
            conn.unbind()
            return False

        try:
            # 514 = NORMAL_ACCOUNT (512) + ACCOUNTDISABLE (2)
            conn.modify(dn, {'userAccountControl': [(MODIFY_REPLACE, [514])]})
            logger.info(f"🚀 [AD Service] SUCESSO: Utilizador {dn} INATIVADO.")
            conn.unbind()
            return True
        except Exception as e:
            logger.error(f"❌ [AD Service] Erro ao desativar {dn}: {str(e)}")
            if conn: conn.unbind()
            return False

    def reativar_usuario(self, cpf, matricula=None):
        """Ativa a conta (UserAccountControl = 512)."""
        conn = self._get_connection()
        if not conn:
            return False

        dn = self._buscar_dn_por_cpf(conn, cpf)
        if not dn:
            conn.unbind()
            return False

        try:
            # 512 = NORMAL_ACCOUNT
            conn.modify(dn, {'userAccountControl': [(MODIFY_REPLACE, [512])]})
            logger.info(f"🚀 [AD Service] SUCESSO: Utilizador {dn} REATIVADO.")
            conn.unbind()
            return True
        except Exception as e:
            logger.error(f"❌ [AD Service] Erro ao reativar {dn}: {str(e)}")
            if conn: conn.unbind()
            return False