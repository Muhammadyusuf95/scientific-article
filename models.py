from datetime import datetime
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class Collection(db.Model):
    __tablename__ = 'collection'
    __table_args__ = {'extend_existing': True}
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False, unique=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    articles = db.relationship('Article', backref='collection', lazy=True)


class Author(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(255), nullable=False)
    order_index = db.Column(db.Integer, default=1)  # <--- Shu qatorni qo'shing
    article_id = db.Column(db.Integer, db.ForeignKey('article.id'), nullable=False)


class Article(db.Model):
    __tablename__ = 'article'
    __table_args__ = {'extend_existing': True}
    
    id = db.Column(db.Integer, primary_key=True)
    
    # Ilmiy ish turi: 'jurnal', 'darslik', 'oquv_qollanma', 'konferensiya_maqola', 'konferensiya_tezis'
    item_type = db.Column(db.String(50), default='jurnal')
    
    title_uz = db.Column(db.String(500), nullable=False)
    title_en = db.Column(db.String(500))
    title_ru = db.Column(db.String(500))
    
    abstract_uz = db.Column(db.Text)
    abstract_en = db.Column(db.Text)
    abstract_ru = db.Column(db.Text)
    
    keywords_uz = db.Column(db.String(255))
    keywords_en = db.Column(db.String(255))
    keywords_ru = db.Column(db.String(255))
    
    # Yangi akademik va rasmiy rekvizitlar
    isbn = db.Column(db.String(50))
    issn = db.Column(db.String(50))  # Soxta 0000-0000 olib tashlandi, faqat haqiqiy bo'lsa kiritiladi
    bbk = db.Column(db.String(50))
    udk = db.Column(db.String(50))
    journal_name = db.Column(db.String(255))
    conference_org = db.Column(db.String(255))
    
    references = db.Column(db.Text)
    
    year = db.Column(db.Integer, nullable=False, default=2026)
    volume = db.Column(db.Integer, default=1)
    issue = db.Column(db.Integer, default=1)
    pages = db.Column(db.String(50))
    doi = db.Column(db.String(255))
    pdf_filename = db.Column(db.String(255))
    
    views_count = db.Column(db.Integer, default=0)
    downloads_count = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    publisher = db.Column(db.String(255), default="Ilmiy Maqolalar Portali")
    institution = db.Column(db.String(255), default="O'zbek tilshunosligi kafedrasi")
    
    # Tashqi kalitlar va munosabatlar
    collection_id = db.Column(db.Integer, db.ForeignKey('collection.id'), nullable=True)
    authors = db.relationship('Author', backref='article', cascade="all, delete-orphan", lazy=True)

# Yangi sana maydonlari (Kun.Oy.Yil shaklida saqlash yoki Date turi)
    pub_date = db.Column(db.String(50))         # Nashr etilgan sana (yoki konferensiya sanasi)
    uploaded_date = db.Column(db.String(50))    # Saytga joylangan sana


class User(db.Model):
    __tablename__ = 'user'
    __table_args__ = {'extend_existing': True}
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(100), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
