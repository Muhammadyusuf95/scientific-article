from datetime import datetime
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class Collection(db.Model):
    __tablename__ = 'collection'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False, unique=True)
    # articles bilan bog'liqlik backref orqali belgilanadi
    articles = db.relationship('Article', backref='collection', lazy=True)


class Article(db.Model):
    __tablename__ = 'article'
    id = db.Column(db.Integer, primary_key=True)
    title_uz = db.Column(db.String(500), nullable=False)
    title_en = db.Column(db.String(500))
    title_ru = db.Column(db.String(500))
    abstract_uz = db.Column(db.Text)
    keywords_uz = db.Column(db.String(255))
    year = db.Column(db.Integer, nullable=False)
    volume = db.Column(db.Integer, default=1)
    issue = db.Column(db.Integer, default=1)
    pages = db.Column(db.String(50))
    doi = db.Column(db.String(255))
    pdf_filename = db.Column(db.String(255))
    views_count = db.Column(db.Integer, default=0)
    downloads_count = db.Column(db.Integer, default=0)
    
    # MUHIM: Collection bilan bog'lovchi tashqi kalit (ForeignKey)
    collection_id = db.Column(db.Integer, db.ForeignKey('collection.id'), nullable=True)
# Modelga yangi ustunlar (agar hali qo'shilmagan bo'lsa)
class Article(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title_uz = db.Column(db.String(500), nullable=False)
    # ... boshqa maydonlar ...
    publisher = db.Column(db.String(255), default="Ilmiy Maqolalar Portali")  # Nashriyotchi
    institution = db.Column(db.String(255), default="O'zbek tilishunosligi kafedrasi")  # Muallif ish joyi (Universitet/Kafedra)
    issn = db.Column(db.String(50), default="0000-0000")  # Jurnal/To'plam ISSN yoki ISBN
    
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
