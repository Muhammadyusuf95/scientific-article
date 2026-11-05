from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class Article(db.Model):
    __tablename__ = 'articles'
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    abstract = db.Column(db.Text, nullable=False)
    doi = db.Column(db.String(100))
    pdf_filename = db.Column(db.String(255))
    
    # Ko'rishlar va yuklab olishlar statistikasi uchun ustunlar:
    views_count = db.Column(db.Integer, default=0)
    downloads_count = db.Column(db.Integer, default=0)
    
    authors = db.relationship('Author', backref='article', lazy=True)

class Author(db.Model):
    __tablename__ = 'authors'
    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(150), nullable=False)
    order_index = db.Column(db.Integer)
    article_id = db.Column(db.Integer, db.ForeignKey('articles.id'), nullable=False)