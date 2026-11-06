from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Collection(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False, unique=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    articles = db.relationship('Article', backref='collection', lazy=True)

class Article(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    collection_id = db.Column(db.Integer, db.ForeignKey('collection.id'), nullable=True)
    
    # Sarlavhalar
    title_uz = db.Column(db.String(500), nullable=False)
    title_en = db.Column(db.String(500), nullable=True)
    title_ru = db.Column(db.String(500), nullable=True)
    
    # Annotatsiyalar
    abstract_uz = db.Column(db.Text, nullable=False)
    abstract_en = db.Column(db.Text, nullable=True)
    abstract_ru = db.Column(db.Text, nullable=True)
    
    # Kalit so'zlar
    keywords_uz = db.Column(db.String(300), nullable=True)
    keywords_en = db.Column(db.String(300), nullable=True)
    keywords_ru = db.Column(db.String(300), nullable=True)
    
    # Bibliografik havolalar (References - Google Scholar talabi uchun)
    references = db.Column(db.Text, nullable=True)
    
    # Jurnal ma'lumotlari
    doi = db.Column(db.String(100), nullable=True)
    year = db.Column(db.Integer, default=2026)
    volume = db.Column(db.Integer, default=1)
    issue = db.Column(db.Integer, default=1)
    pages = db.Column(db.String(50), nullable=True)
    pdf_filename = db.Column(db.String(500), nullable=False)
    
    # Statistika va vaqt
    views_count = db.Column(db.Integer, default=0)
    downloads_count = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    authors = db.relationship('Author', backref='article', cascade="all, delete-orphan", lazy=True)

class Author(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(200), nullable=False)
    order_index = db.Column(db.Integer, default=1)
    article_id = db.Column(db.Integer, db.ForeignKey('article.id', ondelete="CASCADE"), nullable=False)
