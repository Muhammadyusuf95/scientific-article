import os
import time
from flask import Flask, request, render_template, redirect, url_for, flash
from werkzeug.utils import secure_filename
from models import db, Article, Author
import firebase_admin
from firebase_admin import credentials, storage

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///scholar_db.sqlite')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.secret_key = 'super_maxfiy_kalit' 

FIREBASE_KEY_PATH = os.getenv('FIREBASE_KEY_PATH', 'firebase_key.json')
FIREBASE_BUCKET = 'scientific-article-22107.firebasestorage.app'

if not firebase_admin._apps:
    cred = credentials.Certificate(FIREBASE_KEY_PATH)
    firebase_admin.initialize_app(cred, {'storageBucket': FIREBASE_BUCKET})

db.init_app(app)

with app.app_context():
    db.create_all()

# Bosh sahifa (Maqolalar ro'yxati)
@app.route('/')
def index():
    articles = Article.query.all()
    return render_template('index.html', articles=articles)

# Alohida maqola sahifasi (Har gal ochilganda views_count 1 taga oshadi)
@app.route('/article/<int:article_id>')
def article_detail(article_id):
    article = Article.query.get_or_404(article_id)
    article.views_count += 1
    db.session.commit()
    return render_template('article.html', article=article)

# Maqolani yuklab olish sonini oshirib, Firebase havolasiga yo'naltiruvchi maxsus yo'l
@app.route('/download/<int:article_id>')
def download_article(article_id):
    article = Article.query.get_or_404(article_id)
    article.downloads_count += 1
    db.session.commit()
    return redirect(article.pdf_filename)

# Admin Panel (Yangi maqola qo'shish)
@app.route('/admin/add', methods=['GET', 'POST'])
def add_article():
    if request.method == 'POST':
        title = request.form.get('title')
        abstract = request.form.get('abstract')
        doi = request.form.get('doi')
        authors_input = request.form.get('authors')
        pdf_file = request.files.get('pdf_file')
        
        if pdf_file and pdf_file.filename != '':
            filename = f"{int(time.time())}_{secure_filename(pdf_file.filename)}"
            
            try:
                bucket = storage.bucket()
                blob = bucket.blob(f"articles/{filename}")
                
                blob.upload_from_string(
                    pdf_file.read(),
                    content_type='application/pdf'
                )
                
                blob.make_public()
                public_url = blob.public_url
                
                new_article = Article(title=title, abstract=abstract, doi=doi, pdf_filename=public_url)
                db.session.add(new_article)
                db.session.commit()
                
                if authors_input:
                    author_names = authors_input.split(',')
                    for idx, name in enumerate(author_names):
                        new_author = Author(
                            full_name=name.strip(), 
                            order_index=idx+1, 
                            article_id=new_article.id
                        )
                        db.session.add(new_author)
                    db.session.commit()
                
                flash("Maqola muvaffaqiyatli saqlandi!", "success")
                return redirect(url_for('add_article'))
                
            except Exception as e:
                flash(f"Xatolik yuz berdi: {str(e)}", "danger")
                return redirect(url_for('add_article'))
                
    return render_template('admin_add.html')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)