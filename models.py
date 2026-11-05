from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class Article(db.Model):
    id = db.Model.id if hasattr(db.Model, 'id') else db.Column(db.Integer, primary_key=True)
    # Sarlavhalar (3 tilda)
    title_uz = db.Column(db.String(300), nullable=False)
    title_en = db.Column(db.String(300), nullable=True)
    title_ru = db.Column(db.String(300), nullable=True)
    
    # Annotatsiyalar (3 tilda)
    abstract_uz = db.Column(db.Text, nullable=False)
    abstract_en = db.Column(db.Text, nullable=True)
    abstract_ru = db.Column(db.Text, nullable=True)
    
    # Kalit so'zlar (3 tilda)
    keywords_uz = db.Column(db.String(250), nullable=True)
    keywords_en = db.Column(db.String(250), nullable=True)
    keywords_ru = db.Column(db.String(250), nullable=True)
    
    doi = db.Column(db.String(100), nullable=True)
    pdf_filename = db.Column(db.String(500), nullable=False)
    views_count = db.Column(db.Integer, default=0)
    downloads_count = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    authors = db.relationship('Author', backref='article', lazy=True, cascade="all, delete-orphan")

class Author(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(150), nullable=False)
    order_index = db.Column(db.Integer, default=1)
    article_id = db.Column(db.Integer, db.ForeignKey('article.id'), nullable=False)
