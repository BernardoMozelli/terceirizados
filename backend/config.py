import os
from dotenv import load_dotenv
from datetime import timedelta

load_dotenv()


class Config:
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=15)

    # Configurações de E-mail
    MAIL_SERVER = os.getenv("MAIL_SERVER")
    MAIL_PORT = int(os.getenv("MAIL_PORT", 587))
    MAIL_USE_TLS = os.getenv("MAIL_USE_TLS", "true").lower() in ["true", "1", "t"]
    MAIL_USE_SSL = os.getenv("MAIL_USE_SSL", "false").lower() in ["true", "1", "t"]
    MAIL_USERNAME = os.getenv("MAIL_USERNAME")
    MAIL_PASSWORD = os.getenv("MAIL_PASSWORD")
    MAIL_DEFAULT_SENDER = os.getenv("MAIL_DEFAULT_SENDER")
    CRON_SECRET_KEY = os.getenv("CRON_SECRET_KEY")

    # Configuraçes do AD
    AD_ENABLED = os.getenv("AD_ENABLED", "False").lower() in ["true", "1", "t"]
    AD_SERVER = os.getenv("AD_SERVER")
    AD_USER = os.getenv("AD_USER")
    AD_PASS = os.getenv("AD_PASS")
    AD_BASE_DN = os.getenv("AD_BASE_DN")
